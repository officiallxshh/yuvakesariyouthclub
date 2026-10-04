import http from "node:http";
import { URL } from "node:url";
import sharp from "sharp";
import QRCode from "qrcode";

const PORT = Number(process.env.PORT || 10000);
const MAX_BODY = 256 * 1024;
const MAX_REMOTE = 12 * 1024 * 1024;
const CORS = new Set([
  "https://yuvakesariyouthclub.in",
  "https://www.yuvakesariyouthclub.in"
]);

function send(res, status, body, type = "application/json") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store");
  if (type === "application/json") {
    res.end(JSON.stringify(body));
  } else {
    res.end(body);
  }
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function fetchImageBuffer(value) {
  if (!value || typeof value !== "string") throw new Error("Missing image URL");
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol)) throw new Error("Unsupported image URL");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(u, { signal: controller.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > MAX_REMOTE) throw new Error("Remote image too large");
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_REMOTE) throw new Error("Remote image too large");
    return Buffer.from(ab);
  } finally {
    clearTimeout(timeout);
  }
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgText({ width, height, x, y, text, size = 36, weight = 700, fill = "#f0e0bd", anchor = "start" }) {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
}

async function renderSide(templateUrl, photoUrl, qrData, fields = {}, layout = {}) {
  const template = await fetchImageBuffer(templateUrl);
  const meta = await sharp(template).metadata();
  const width = meta.width || 1060;
  const height = meta.height || 670;

  const base = sharp(template).png();

  const photoW = Number(layout.photoW || 260);
  const photoH = Number(layout.photoH || 300);
  const photoX = Number(layout.photoX || 70);
  const photoY = Number(layout.photoY || 190);

  const qrSize = Number(layout.qrSize || 170);
  const qrX = Number(layout.qrX ?? width - qrSize - 70);
  const qrY = Number(layout.qrY ?? height - qrSize - 70);

  const composites = [];
  if (photoUrl) {
    const photo = await fetchImageBuffer(photoUrl);
    const framed = await sharp(photo)
      .resize(photoW, photoH, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    composites.push({ input: framed, left: photoX, top: photoY });
  }

  if (qrData) {
    const qr = await QRCode.toBuffer(String(qrData), {
      type: "png",
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: "M"
    });
    composites.push({ input: qr, left: qrX, top: qrY });
  }

  // Text is added only through transparent SVG, so the master template itself is never modified.
  const textSvg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${fields.name ? svgText({width,height,x:Number(layout.nameX||390),y:Number(layout.nameY||220),text:fields.name,size:Number(layout.nameSize||38)}) : ""}
    ${fields.role ? svgText({width,height,x:Number(layout.roleX||390),y:Number(layout.roleY||270),text:fields.role,size:Number(layout.roleSize||22),weight:700,fill:"#d5b16b"}) : ""}
    ${fields.roleNumber ? svgText({width,height,x:Number(layout.roleNoX||390),y:Number(layout.roleNoY||320),text:fields.roleNumber,size:Number(layout.roleNoSize||24)}) : ""}
    ${fields.email ? svgText({width,height,x:Number(layout.emailX||70),y:Number(layout.emailY||390),text:fields.email,size:Number(layout.emailSize||22)}) : ""}
    ${fields.phone ? svgText({width,height,x:Number(layout.phoneX||70),y:Number(layout.phoneY||440),text:fields.phone,size:Number(layout.phoneSize||22)}) : ""}
    ${fields.dob ? svgText({width,height,x:Number(layout.dobX||70),y:Number(layout.dobY||490),text:fields.dob,size:Number(layout.dobSize||22)}) : ""}
    ${fields.authorized ? svgText({width,height,x:Number(layout.authorizedX||0),y:Number(layout.authorizedY||0),text:fields.authorized,size:Number(layout.authorizedSize||18),weight:700,anchor:"middle"}) : ""}
  </svg>`;
  composites.push({ input: Buffer.from(textSvg), left: 0, top: 0 });

  return await base.composite(composites).png().toBuffer();
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return send(res, 204, "");
  
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, {
        ok: true,
        service: "yyc-render-processor",
        node: process.version,
        uptime: Math.round(process.uptime())
      });
    }

    if (req.method === "POST" && url.pathname === "/api/id-card/render") {
      const body = await readBody(req);
      const { templateUrl, photoUrl, qrData, fields = {}, layout = {} } = body;
      if (!templateUrl) return send(res, 400, { ok: false, error: "templateUrl is required" });
      
      const output = await renderSide(templateUrl, photoUrl, qrData, fields, layout);
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, no-store");
      return res.end(output);
    }

    return send(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    return send(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : "Processing failed"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`YYC render processor listening on ${PORT}`);
});
