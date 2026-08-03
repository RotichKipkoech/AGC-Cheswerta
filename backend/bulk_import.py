import csv
import io
import json

MAX_BULK_ROWS = 2000


class BulkImportError(Exception):
    """Raised for problems with the upload itself (bad file, no rows found) —
    as opposed to a problem with one row, which is reported per-row instead."""


def parse_upload_rows(request):
    """
    Extract a list of row-dicts from the incoming request.

    Accepts EITHER:
      - multipart/form-data with a "file" field (.csv or .json)
      - a JSON body: a top-level array, or an object with the records under
        one of a few common keys ("data", "rows", "records", "items")

    Raises BulkImportError with a user-facing message on bad input.
    """
    if "file" in request.files and request.files["file"].filename:
        f = request.files["file"]
        filename = f.filename.lower()
        raw = f.read()

        if filename.endswith(".json"):
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except Exception:
                raise BulkImportError("Could not parse file as JSON.")
            rows = _rows_from_json(parsed)

        elif filename.endswith(".csv"):
            try:
                text = raw.decode("utf-8-sig")  # handles BOM from Excel exports
            except UnicodeDecodeError:
                text = raw.decode("latin-1")
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)

        else:
            raise BulkImportError("File must be a .csv or .json file.")

    else:
        body = request.get_json(silent=True)
        if body is None:
            raise BulkImportError("Attach a .csv/.json file, or send a JSON body of records.")
        rows = _rows_from_json(body)

    if not rows:
        raise BulkImportError("No records found in the upload.")
    if len(rows) > MAX_BULK_ROWS:
        raise BulkImportError(f"Too many rows ({len(rows)}). Max {MAX_BULK_ROWS} per upload — split into batches.")
    return rows


def _rows_from_json(parsed):
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("data", "rows", "records", "items", "members", "departments"):
            if isinstance(parsed.get(key), list):
                return parsed[key]
    raise BulkImportError("Expected a JSON array of records (or an object with a 'data' array).")


def _normalize_key(k) -> str:
    return str(k).strip().lower().replace(" ", "_").replace("-", "_")


def normalize_row(raw_row, aliases: dict) -> dict:
    """Map a raw row's keys (any case/spacing, e.g. 'Full Name' or 'phone number')
    onto canonical field names via `aliases`, trimming string values.
    Unrecognised columns are silently dropped."""
    if not isinstance(raw_row, dict):
        return {}
    out = {}
    for k, v in raw_row.items():
        if k is None:
            continue
        field = aliases.get(_normalize_key(k))
        if not field:
            continue
        out[field] = v.strip() if isinstance(v, str) else v
    return out