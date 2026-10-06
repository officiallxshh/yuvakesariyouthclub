"""Deterministic YYC ID-card compositor.

The live website is not imported or modified by this module.
It composites a supplied master card image, original member photo,
exact member data, and a generated QR code without AI image regeneration.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import qrcode
from PIL import Image, ImageDraw, ImageFont, ImageOps


@dataclass(frozen=True)
class MemberData:
    name: str
    position: str
    role_number: str
    phone: str = ""
    email: str = ""


def _clean_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def normalize_member(data: dict[str, Any]) -> MemberData:
    """Normalize display values without rewriting their semantic content."""
    return MemberData(
        name=_clean_text(data.get("name"), "YYC Member"),
        position=_clean_text(data.get("position"), "MEMBER"),
        role_number=_clean_text(data.get("role_number"), "PENDING"),
        phone=_clean_text(data.get("phone")),
        email=_clean_text(data.get("email")),
    )


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    return cleaned.strip(".-") or "yyc-id-card"


def load_font(font_path: str | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if font_path:
        return ImageFont.truetype(font_path, size=size)
    return ImageFont.load_default()


def fit_photo(photo: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Crop/resize only. The source pixels are not face-regenerated or beautified."""
    x, y, width, height = box
    fitted = ImageOps.fit(
        photo.convert("RGB"),
        (max(1, width), max(1, height)),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    return fitted


def make_qr(value: str, size: int = 320) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(value)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    return image.resize((size, size), Image.Resampling.NEAREST)


def render_id_card(
    *,
    template_path: Path,
    photo_path: Path | None,
    output_path: Path,
    member: MemberData,
    verify_url: str,
    photo_box: tuple[int, int, int, int] | None = None,
    name_xy: tuple[int, int] | None = None,
    position_xy: tuple[int, int] | None = None,
    role_xy: tuple[int, int] | None = None,
    phone_xy: tuple[int, int] | None = None,
    email_xy: tuple[int, int] | None = None,
    qr_xy: tuple[int, int] | None = None,
    font_path: str | None = None,
) -> None:
    """Render one card from a supplied master template.

    Coordinates are explicit so the master artwork remains pixel-stable.
    No network calls are made by this function.
    """
    if not template_path.is_file():
        raise FileNotFoundError(f"Master template not found: {template_path}")
    if photo_path is not None and not photo_path.is_file():
        raise FileNotFoundError(f"Member photo not found: {photo_path}")

    card = Image.open(template_path).convert("RGBA")
    draw = ImageDraw.Draw(card)

    # Default positions are intentionally conservative and can be changed once
    # the final master template dimensions are supplied.
    w, h = card.size
    photo_box = photo_box or (int(w * 0.07), int(h * 0.22), int(w * 0.23), int(h * 0.43))
    name_xy = name_xy or (int(w * 0.34), int(h * 0.28))
    position_xy = position_xy or (int(w * 0.34), int(h * 0.38))
    role_xy = role_xy or (int(w * 0.34), int(h * 0.48))
    phone_xy = phone_xy or (int(w * 0.34), int(h * 0.56))
    email_xy = email_xy or (int(w * 0.34), int(h * 0.63))
    qr_xy = qr_xy or (int(w * 0.72), int(h * 0.63))

    if photo_path is not None:
        with Image.open(photo_path) as source:
            photo = fit_photo(source, photo_box)
        px, py, _, _ = photo_box
        card.alpha_composite(photo.convert("RGBA"), (px, py))

    regular_font = load_font(font_path, max(12, int(h * 0.026)))
    small_font = load_font(font_path, max(10, int(h * 0.020)))

    def label(xy: tuple[int, int], text: str, font: ImageFont.ImageFont) -> None:
        draw.text(xy, text, font=font, fill=(31, 31, 31, 255))

    label(name_xy, member.name, regular_font)
    label(position_xy, member.position, small_font)
    label(role_xy, member.role_number, small_font)

    if member.phone:
        label(phone_xy, member.phone, small_font)
    if member.email:
        label(email_xy, member.email, small_font)

    qr = make_qr(verify_url, size=max(160, int(min(w, h) * 0.16)))
    card.alpha_composite(qr.convert("RGBA"), qr_xy)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    card.save(output_path, format="PNG", optimize=True)


def _parse_box(value: str) -> tuple[int, int, int, int]:
    parts = [int(part.strip()) for part in value.split(",")]
    if len(parts) != 4 or any(part < 0 for part in parts):
        raise ValueError("Box must be x,y,width,height with non-negative integers.")
    if parts[2] == 0 or parts[3] == 0:
        raise ValueError("Box width and height must be greater than zero.")
    return parts[0], parts[1], parts[2], parts[3]


def main() -> int:
    parser = argparse.ArgumentParser(description="Render one YYC ID card from a master template.")
    parser.add_argument("--template", required=True, help="Path to the clean master ID-card PNG/JPG.")
    parser.add_argument("--photo", help="Path to the original member photo.")
    parser.add_argument("--output", required=True, help="Output PNG path.")
    parser.add_argument("--data", required=True, help="JSON file containing exact member fields.")
    parser.add_argument("--verify-url", required=True, help="Exact verification URL encoded into the QR.")
    parser.add_argument("--photo-box", help="Optional x,y,width,height override.")
    parser.add_argument("--font", help="Optional .ttf/.otf font path.")

    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.is_file():
        raise FileNotFoundError(f"Member data file not found: {data_path}")

    data = json.loads(data_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Member data JSON must contain an object.")

    member = normalize_member(data)
    output = Path(args.output)

    render_id_card(
        template_path=Path(args.template),
        photo_path=Path(args.photo) if args.photo else None,
        output_path=output,
        member=member,
        verify_url=args.verify_url,
        photo_box=_parse_box(args.photo_box) if args.photo_box else None,
        font_path=args.font,
    )

    print(f"Rendered: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
