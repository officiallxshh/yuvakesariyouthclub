"""Small deterministic test for the isolated YYC card renderer."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from renderer import render_id_card, normalize_member


class RendererTests(unittest.TestCase):
    def test_render_preserves_template_dimensions_and_exact_data_flow(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            template = root / "template.png"
            photo = root / "member.png"
            data = root / "member.json"
            output = root / "result.png"

            Image.new("RGBA", (900, 524), (11, 16, 20, 255)).save(template)
            Image.new("RGB", (600, 600), (120, 120, 120)).save(photo)
            data.write_text(
                json.dumps(
                    {
                        "name": "YYC Test Member",
                        "position": "MEMBER",
                        "role_number": "YYC-TEST-001",
                        "phone": "9000000000",
                        "email": "test@example.invalid",
                    }
                ),
                encoding="utf-8",
            )

            member = normalize_member(json.loads(data.read_text(encoding="utf-8")))
            self.assertEqual(member.name, "YYC Test Member")
            self.assertEqual(member.role_number, "YYC-TEST-001")

            render_id_card(
                template_path=template,
                photo_path=photo,
                output_path=output,
                member=member,
                verify_url="https://www.yuvakesariyouthclub.in/verify.html?uid=YYC-TEST-001",
            )

            with Image.open(output) as result:
                self.assertEqual(result.size, (900, 524))
                self.assertEqual(result.format, "PNG")


if __name__ == "__main__":
    unittest.main()
