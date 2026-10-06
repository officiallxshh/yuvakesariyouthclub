# YYC Python ID Card Renderer

This is an **isolated** Python utility for the future YYC premium ID-card pipeline.

## Safety boundary

- It is not imported by `index.html`, `app.js`, or the existing browser code.
- It does not replace the current ID-card implementation.
- It never uses AI image generation to redraw a member's face.
- The original member photo is only cropped/resized.
- Member text is taken from the supplied JSON and rendered exactly as data.
- The QR is generated deterministically from the supplied verification URL.
- It makes no network request while rendering.

## Install

```bash
python -m venv .venv
# Windows PowerShell:
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
```

## Render

```bash
python renderer.py ^
  --template ..\\..\\assets\\yyc-id-card-master.png ^
  --photo member.jpg ^
  --data member.json ^
  --verify-url "https://www.yuvakesariyouthclub.in/verify.html?uid=YYC-001" ^
  --output output\\YYC-001.png
```

The final template filename/path is intentionally supplied at runtime because the clean master artwork should remain a separate asset.

## Future integration

The safe next step is to expose this renderer behind a server-side endpoint (for example on Render) and connect it to the existing approval flow only after the renderer has been tested with the final master-card dimensions.

Go/Rust are deliberately **not** wired into the live project yet. They are future backend options, not dependencies of this renderer.
