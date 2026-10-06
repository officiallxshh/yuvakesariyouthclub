"""Validate YYC raster assets with Pillow.

This is a read-only repository audit: it opens supported image assets,
verifies that the files are decodable, and reports their dimensions and
format. It never rewrites an asset.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
EXCLUDED_DIRS = {".git", "node_modules", ".venv"}


def iter_images() -> list[Path]:
    paths: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        if any(part in EXCLUDED_DIRS for part in path.parts):
            continue
        paths.append(path)
    return sorted(paths)


def check(path: Path) -> tuple[bool, str]:
    relative = path.relative_to(ROOT).as_posix()
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            width, height = image.size
            image.load()
        if width <= 0 or height <= 0:
            return False, f"{relative}: invalid dimensions {width}x{height}"
        return True, f"{relative}: {width}x{height} {image.format or path.suffix.upper().lstrip('.')}"
    except (UnidentifiedImageError, OSError) as exc:
        return False, f"{relative}: unreadable image ({exc})"


def main() -> int:
    images = iter_images()
    failures = 0
    print(f"YYC IMAGE AUDIT | {len(images)} raster assets")
    for path in images:
        ok, message = check(path)
        print(("OK   " if ok else "FAIL ")+message)
        failures += int(not ok)
    if failures:
        print(f"FAILED: {failures} image asset(s) could not be validated.", file=sys.stderr)
        return 1
    print("PASS: all raster assets are decodable and have valid dimensions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
