"""File uploads — local disk storage.

Endpoints:
  POST /api/uploads/<bucket>       original path
  POST /api/storage/upload         path used by frontend (FormData with bucket field)
"""
import os, uuid
from werkzeug.utils import secure_filename
from flask import Blueprint, request, jsonify, current_app, url_for
from security import require_auth

bp = Blueprint("uploads", __name__)
ALLOWED = {"png", "jpg", "jpeg", "gif", "webp", "svg", "ico"}


def _handle(bucket: str):
    if bucket not in ("avatars", "branding"):
        return jsonify({"error": "Invalid bucket. Use 'avatars' or 'branding'"}), 400
    # Works for both multipart/form-data AND raw file in request.files
    f = request.files.get("file") or (list(request.files.values())[0] if request.files else None)
    if not f or not f.filename:
        return jsonify({"error": "No file field in request"}), 400
    ext = (f.filename.rsplit(".", 1)[-1] if "." in f.filename else "").lower()
    if ext not in ALLOWED:
        return jsonify({"error": f"File type '.{ext}' not allowed"}), 400
    suggested = (request.form.get("path") or "").strip().lstrip("/")
    rel = secure_filename(suggested.replace("/", "__")) if suggested else f"{uuid.uuid4()}.{ext}"
    folder = os.path.join(current_app.config["UPLOAD_DIR"], bucket)
    os.makedirs(folder, exist_ok=True)
    f.save(os.path.join(folder, rel))
    url = url_for("serve_upload", filename=f"{bucket}/{rel}", _external=True)
    return jsonify({"url": url, "path": f"{bucket}/{rel}"}), 201


@bp.post("/api/uploads/<bucket>")
@require_auth
def upload_bucket(bucket):
    return _handle(bucket)


@bp.post("/api/storage/upload")
@require_auth
def storage_upload():
    bucket = (request.form.get("bucket") or "avatars").strip()
    return _handle(bucket)
