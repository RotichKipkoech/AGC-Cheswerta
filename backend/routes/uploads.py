"""File uploads — local disk storage.

Endpoints:
  POST /api/uploads/<bucket>       original path
  POST /api/storage/upload         path used by frontend (FormData with bucket field)
"""
import os, uuid
from werkzeug.utils import secure_filename
from flask import Blueprint, request, jsonify, current_app, url_for
from security import require_auth
from supabase_client import supabase


bp = Blueprint("uploads", __name__)
ALLOWED = {"png", "jpg", "jpeg", "gif", "webp", "svg", "ico"}


def _handle(bucket: str):
    if bucket not in ("avatars", "branding"):
        return jsonify({"error": "Invalid bucket"}), 400

    f = request.files.get("file") or (
        list(request.files.values())[0] if request.files else None
    )

    if not f or not f.filename:
        return jsonify({"error": "No file uploaded"}), 400

    ext = (
        f.filename.rsplit(".", 1)[-1].lower()
        if "." in f.filename
        else ""
    )

    if ext not in ALLOWED:
        return jsonify({"error": "Invalid file type"}), 400

    suggested = (request.form.get("path") or "").strip().lstrip("/")

    rel = (
        secure_filename(suggested.replace("/", "__"))
        if suggested
        else f"{uuid.uuid4()}.{ext}"
    )

    file_bytes = f.read()

    supabase.storage.from_(bucket).upload(
        path=rel,
        file=file_bytes,
        file_options={
            "content-type": f.content_type,
            "upsert": "true"
        }
    )

    url = supabase.storage.from_(bucket).get_public_url(rel)

    return jsonify({
        "url": url,
        "path": rel
    }), 201


@bp.post("/api/uploads/<bucket>")
@require_auth
def upload_bucket(bucket):
    return _handle(bucket)


@bp.post("/api/storage/upload")
@require_auth
def storage_upload():
    bucket = (request.form.get("bucket") or "avatars").strip()
    return _handle(bucket)
