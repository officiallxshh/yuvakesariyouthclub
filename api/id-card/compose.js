import sharp from "sharp";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 2200;
const MAX_OUTPUT_PIXELS = 12_000_000;

function setCors(res, origin) {
  const allowed = new Set([
    "https://yuvakesariyouthclub.in",
    "https://www.yuvakesariyouthclub.in"
  ]);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

function dataUrlBuffer(value, label) {
  if (typeof value !== "string" || !value.startsWith("data:image/")) {
    throw new Error(label + " must be an image data URL");
  }
  const comma = value.indexOf(",");
  if (comma < 0) throw new Error("Invalid " + label);
  const header = value.slice(0, comma).toLowerCase();
  const base64 = value.slice(comma + 1).replace(/\s/g, "");
  if (!/;base64$/.test(header)) throw new Error("Invalid " + label + " encoding");
  if (!/^[a-z0-9+/]+={0,2}$/i.test(base64)) throw new Error("Invalid " + label + " payload");
  const buf = Buffer.from(base64, "base64");
  if (!buf.length || buf.length > MAX_INPUT_BYTES) {
    throw new Error(label + " is too large");
  }
  return buf;
}

function int(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export default async function handler(req, res) {
  setCors(res, req.headers.origin);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST,OPTIONS");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const front = dataUrlBuffer(body.frontDataUrl, "frontDataUrl");
    const back = dataUrlBuffer(body.backDataUrl, "backDataUrl");

    const gap = int(body.gap, 28, 0, 120);
    const padding = int(body.padding, 24, 0, 120);

    const frontMeta = await sharp(front, { limitInputPixels: MAX_OUTPUT_PIXELS }).metadata();
    const backMeta = await sharp(back, { limitInputPixels: MAX_OUTPUT_PIXELS }).metadata();

    const frontW = Math.min(MAX_SIDE, Number(frontMeta.width || 1));
    const frontH = Math.min(MAX_SIDE, Number(frontMeta.height || 1));
    const backW = Math.min(MAX_SIDE, Number(backMeta.width || 1));
    const backH = Math.min(MAX_SIDE, Number(backMeta.height || 1));

    const width = Math.max(frontW, backW) + padding * 2;
    const height = frontH + gap + backH + padding * 2;

    if (width * height > MAX_OUTPUT_PIXELS) {
      return json(res, 413, { ok: false, error: "ID-card output is too large" });
    }

    const base = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    });

    const output = await base
      .composite([
        { input: front, left: Math.round((width - frontW) / 2), top: padding },
        { input: back, left: Math.round((width - backW) / 2), top: padding + frontH + gap }
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    if (output.length > 4_000_000) {
      const compact = await base
        .composite([
          { input: front, left: Math.round((width - frontW) / 2), top: padding },
          { input: back, left: Math.round((width - backW) / 2), top: padding + frontH + gap }
        ])
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();

      if (compact.length > 4_400_000) {
        return json(res, 413, { ok: false, error: "Generated ID card is too large for the Vercel response limit" });
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Length", String(compact.length));
      return res.end(compact);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(output.length));
    return res.end(output);
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "ID-card composition failed"
    });
  }
}
