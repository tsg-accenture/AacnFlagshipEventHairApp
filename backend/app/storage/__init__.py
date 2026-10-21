"""Private photo storage.

v1-base ships the local-disk backend for development: files live under backend/var/photos,
outside any web root, and are only ever served through the owner-checked /photos/{id} route.
Production needs private, encrypted, UK-region object storage (plan: Security controls);
add an S3-compatible backend here before real users.
"""
from __future__ import annotations

import io
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from app.core.config import get_settings

MAX_EDGE = 1600
MAX_PIXELS = 40_000_000  # well above any phone camera; blocks decompression bombs
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


class BadImage(ValueError):
    pass


def reencode(raw: bytes) -> tuple[bytes, int, int]:
    """Accept PNG, JPEG or WEBP only; re-encode as JPEG, dropping EXIF and location; cap the long edge."""
    try:
        img = Image.open(io.BytesIO(raw))  # reads the header only
        fmt = img.format
    except Exception as e:  # noqa: BLE001
        raise BadImage("That file isn't a photo we can read. Use a JPEG, PNG or WEBP.") from e
    if fmt not in ALLOWED_FORMATS:
        raise BadImage("Use a JPEG, PNG or WEBP photo.")
    # Check the size before decoding, so a small file can't expand into a huge image in memory.
    if img.width * img.height > MAX_PIXELS:
        raise BadImage("That photo is too large. Use one under 40 megapixels.")
    try:
        img.load()
    except Exception as e:  # noqa: BLE001
        raise BadImage("That file isn't a photo we can read. Use a JPEG, PNG or WEBP.") from e
    img = ImageOps.exif_transpose(img)  # keep the orientation, then drop all metadata
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((MAX_EDGE, MAX_EDGE))
    clean = Image.new(img.mode, img.size)
    clean.paste(img)
    out = io.BytesIO()
    clean.save(out, format="JPEG", quality=85, optimize=True)
    return out.getvalue(), clean.width, clean.height


def _root() -> Path:
    root = Path(get_settings().STORAGE_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save(user_id: uuid.UUID, data: bytes) -> str:
    key = f"{user_id}/{uuid.uuid4()}.jpg"
    path = _root() / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key


def load(key: str) -> bytes:
    return (_root() / key).read_bytes()


def delete(key: str | None) -> None:
    if key:
        (_root() / key).unlink(missing_ok=True)


def delete_user_dir(user_id: uuid.UUID) -> None:
    d = _root() / str(user_id)
    if d.exists():
        for f in d.iterdir():
            f.unlink(missing_ok=True)
        d.rmdir()
