import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SERVICE_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_URL = "https://www.yuvakesariyouthclub.in";
const VERIFY_PATH = "/certificate-verify.html";
const MANUAL_CERTIFICATE_BUCKET = "yyc-certificates";
const MAX_MANUAL_CERTIFICATE_BYTES = 10 * 1024 * 1024;
const CERTIFICATE_TITLES: Record<string, string> = {
  participation: "CERTIFICATE OF PARTICIPATION",
  appreciation: "CERTIFICATE OF APPRECIATION",
  volunteer_service: "VOLUNTEER SERVICE CERTIFICATE"
};

function clean(value: unknown, max = 2000): string {
  return String(value ?? "").trim().slice(0, max);
}
function escapeHtml(value: unknown): string {
  return clean(value, 12000).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[c] ?? c));
}
function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = [
    "https://www.yuvakesariyouthclub.in",
    "https://yuvakesariyouthclub.in",
    "https://officiallxshh.github.io",
    "http://127.0.0.1:4173",
    "http://localhost:4173"
  ];
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": allowed.includes(origin) ? origin : "https://www.yuvakesariyouthclub.in",
    "vary": "Origin",
    "access-control-allow-headers": "authorization,apikey,content-type,x-yyc-session,cache-control",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  };
}
function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: cors(req) });
}
async function readBody(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
async function adminOK(token: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await db.rpc("_admin_ok", { p_token: token });
  return !error && data === true;
}
async function resolveRecipient(kind: string, token: string): Promise<any | null> {
  if (!token || !["member", "leader"].includes(kind)) return null;
  const functionName = kind === "member" ? "_member_id" : "_leader_id";
  const { data: id, error: idError } = await db.rpc(functionName, { p_token: token });
  if (idError || !id) return null;
  if (kind === "member") {
    const { data, error } = await db.from("members")
      .select("id,name,email,role_number,status,approved,duplicate_of")
      .eq("id", id).maybeSingle();
    if (error || !data || data.approved !== true ||
        String(data.status || "").toLowerCase() !== "approved" || data.duplicate_of) return null;
    return data;
  }
  const { data, error } = await db.from("leaders")
    .select("id,name,email,role_number,role,status")
    .eq("id", id).maybeSingle();
  if (error || !data || String(data.status || "active").toLowerCase() === "inactive") return null;
  return data;
}
function verifyUrl(issue: any): string {
  return SITE_URL + VERIFY_PATH + "?code=" + encodeURIComponent(String(issue.verification_code || ""));
}
function dateLabel(value: unknown): string {
  const raw = clean(value, 30);
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 1)) return "Date not specified";
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
    .toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}
function wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
  const words = clean(text, 300).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
function drawCentered(page: any, text: string, y: number, size: number, font: any, color: any, maxWidth = 730, lineGap = 5) {
  const lines = wrapText(text, maxWidth, font, size);
  lines.forEach((line, index) => {
    const width = font.widthOfTextAtSize(line, size);
    page.drawText(line, { x: (842 - width) / 2, y: y - index * (size + lineGap), size, font, color });
  });
  return y - lines.length * (size + lineGap);
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  }
  return btoa(binary);
}
async function generateCertificatePdf(issue: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(CERTIFICATE_TITLES[String(issue.certificate_type)] || CERTIFICATE_TITLES.participation);
  pdf.setAuthor("Yuvakesari Youth Club");
  pdf.setSubject(clean(issue.event_title, 180));
  pdf.setKeywords(["YYC", "Yuvakesari Youth Club", "certificate", clean(issue.certificate_number, 80)]);

  const page = pdf.addPage([842, 595]);
  const gold = rgb(0.82, 0.67, 0.36);
  const paleGold = rgb(0.94, 0.84, 0.62);
  const ink = rgb(0.12, 0.14, 0.15);
  const muted = rgb(0.35, 0.38, 0.37);
  const cream = rgb(0.985, 0.975, 0.945);
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: cream });
  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: gold, borderWidth: 2.1 });
  page.drawRectangle({ x: 29, y: 29, width: 784, height: 537, borderColor: paleGold, borderWidth: 0.65 });

  const roman = await pdf.embedFont(StandardFonts.TimesRoman);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const romanBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  drawCentered(page, "YUVAKESARI YOUTH CLUB", 532, 13, sansBold, gold);
  drawCentered(page, "SUBRAHMANYA · KARNATAKA", 512, 8.5, sans, muted);
  page.drawLine({ start: { x: 235, y: 492 }, end: { x: 607, y: 492 }, color: gold, thickness: 0.9 });
  const type = CERTIFICATE_TITLES[String(issue.certificate_type)] || CERTIFICATE_TITLES.participation;
  drawCentered(page, type, 456, type.length > 29 ? 24 : 28, romanBold, ink);
  drawCentered(page, "This certificate is proudly presented to", 414, 13, italic, muted);
  const name = clean(issue.recipient_name, 120) || "YYC Participant";
  const nameSize = name.length > 32 ? 25 : name.length > 23 ? 29 : 34;
  const afterName = drawCentered(page, name, 368, nameSize, romanBold, ink, 720, 3);
  page.drawLine({ start: { x: 195, y: afterName - 2 }, end: { x: 647, y: afterName - 2 }, color: paleGold, thickness: 1.1 });
  drawCentered(page, "in recognition of active participation in", afterName - 31, 12, italic, muted);
  drawCentered(page, clean(issue.event_title, 180) || "YYC Community Event", afterName - 67, 20, romanBold, ink, 700, 3);
  const eventMeta = [
    issue.event_date ? dateLabel(issue.event_date) : "",
    clean(issue.event_location, 180)
  ].filter(Boolean).join(" · ");
  drawCentered(page, eventMeta || "Yuvakesari Youth Club", afterName - 97, 10.5, sans, muted, 700, 2);

  page.drawLine({ start: { x: 66, y: 88 }, end: { x: 247, y: 88 }, color: gold, thickness: 0.8 });
  page.drawText("YYC Administration", { x: 77, y: 70, size: 9, font: sansBold, color: ink });
  page.drawText("Authorised by Yuvakesari Youth Club", { x: 77, y: 55, size: 7.5, font: sans, color: muted });
  page.drawText("CERTIFICATE ID", { x: 283, y: 88, size: 7.2, font: sansBold, color: muted });
  page.drawText(clean(issue.certificate_number, 80), { x: 283, y: 72, size: 10, font: sansBold, color: ink });
  page.drawText("Verify authenticity using the QR code", { x: 283, y: 54, size: 7.2, font: sans, color: muted });

  const url = verifyUrl(issue);
  const qrDataUrl = await QRCode.toDataURL(url, { width: 260, margin: 1, errorCorrectionLevel: "M" });
  const qrBase64 = qrDataUrl.slice(qrDataUrl.indexOf(",") + 1);
  const qrBinary = atob(qrBase64);
  const qrBytes = new Uint8Array(qrBinary.length);
  for (let i = 0; i < qrBinary.length; i++) qrBytes[i] = qrBinary.charCodeAt(i);
  const qrImage = await pdf.embedPng(qrBytes);
  page.drawImage(qrImage, { x: 720, y: 45, width: 80, height: 80 });
  return await pdf.save();
}
function emailHtml(issue: any): string {
  const title = CERTIFICATE_TITLES[String(issue.certificate_type)] || CERTIFICATE_TITLES.participation;
  const link = verifyUrl(issue);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:26px;background:#05080b;color:#eee8dc;font-family:Arial,Helvetica,sans-serif">
    <main style="max-width:620px;margin:0 auto;padding:28px;background:#0c1318;border:1px solid #57482b;border-radius:18px">
      <div style="font-size:10px;letter-spacing:2px;font-weight:800;color:#d8b66e">YUVAKESARI YOUTH CLUB · SUBRAHMANYA</div>
      <h1 style="margin:18px 0 8px;font-size:24px;color:#f0d18a">Your YYC certificate is ready.</h1>
      <p style="font-size:14px;line-height:1.7;color:#c5c9c4">Hello ${escapeHtml(issue.recipient_name)}, your certificate for <strong>${escapeHtml(issue.event_title)}</strong> is attached as a PDF.</p>
      <div style="padding:14px 16px;background:#121b20;border-radius:12px;margin:18px 0">
        <div style="font-size:10px;color:#909b95;letter-spacing:1px">CERTIFICATE ID</div>
        <strong style="display:block;margin-top:6px;font-size:17px;color:#e8c77d">${escapeHtml(issue.certificate_number)}</strong>
        <div style="margin-top:8px;font-size:12px;color:#aab2ad">${escapeHtml(dateLabel(issue.event_date))}${issue.event_location ? " · " + escapeHtml(issue.event_location) : ""}</div>
      </div>
      <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 18px;background:#d8b66e;color:#0a0c0d;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:1px;border-radius:10px">VERIFY CERTIFICATE ↗</a></p>
      <p style="font-size:11px;line-height:1.6;color:#818d87">The attached PDF can be saved or printed. Keep the certificate ID for future verification.</p>
    </main>
  </body></html>`;
}
async function markDelivery(issueId: string, status: string, details: { id?: string | null; error?: string }) {
  const patch: Record<string, any> = {
    email_status: status,
    email_error: clean(details.error, 1000) || null,
    updated_at: new Date().toISOString()
  };
  if (details.id) patch.email_provider_message_id = details.id;
  if (status === "sent") patch.email_sent_at = new Date().toISOString();
  const { error } = await db.from("yyc_certificates").update(patch).eq("id", issueId);
  if (error) console.error("Could not persist certificate delivery status", issueId, error.message);
}
async function sendCertificateEmail(issue: any): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  if (!apiKey || !from) {
    await markDelivery(issue.id, "failed", { error: "Resend is not configured in Supabase secrets." });
    return;
  }
  const email = clean(issue.recipient_email, 320);
  if (!EMAIL_PATTERN.test(email)) {
    await markDelivery(issue.id, "skipped", { error: "No valid email address on record. Certificate remains downloadable from the member portal." });
    return;
  }
  try {
    const pdfBytes = await generateCertificatePdf(issue);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "yyc-certificate-" + String(issue.id)
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your YYC certificate · " + clean(issue.event_title, 140),
        html: emailHtml(issue),
        text: "Hello " + clean(issue.recipient_name, 120) + ", your YYC certificate for " +
          clean(issue.event_title, 180) + " is attached as a PDF. Certificate ID: " +
          clean(issue.certificate_number, 80) + ". Verify: " + verifyUrl(issue),
        attachments: [{
          filename: clean(issue.certificate_number, 80) + ".pdf",
          content: bytesToBase64(pdfBytes)
        }]
      })
    });
    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) {
      await markDelivery(issue.id, "failed", {
        error: clean(data?.message || data?.error?.message || "Email provider rejected the certificate email.", 1000)
      });
      return;
    }
    if (!data?.id) {
      await markDelivery(issue.id, "failed", { error: "Email provider accepted the request without returning a message ID." });
      return;
    }
    await markDelivery(issue.id, "sent", { id: String(data.id) });
  } catch (error) {
    await markDelivery(issue.id, "failed", {
      error: clean(error instanceof Error ? error.message : "Certificate delivery failed.", 1000)
    });
  }
}
async function resolveAdminRecipient(kind: string, id: string): Promise<any | null> {
  if (!id || !["member", "leader"].includes(kind)) return null;
  if (kind === "member") {
    const { data, error } = await db.from("members")
      .select("id,name,email,role_number,status,approved,duplicate_of")
      .eq("id", id).maybeSingle();
    if (error || !data || data.approved !== true ||
        String(data.status || "").toLowerCase() !== "approved" || data.duplicate_of) return null;
    return data;
  }
  const { data, error } = await db.from("leaders")
    .select("id,name,email,role_number,role,status")
    .eq("id", id).maybeSingle();
  if (error || !data || String(data.status || "active").trim().toLowerCase() !== "active") return null;
  return data;
}
async function sendManualCertificateEmail(issue: any, recipient: any, pdfBytes: Uint8Array): Promise<{ status: string; reason?: string; id?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  const email = clean(recipient?.email, 320);
  if (!EMAIL_PATTERN.test(email)) {
    const reason = "No valid email address on record. The uploaded certificate remains available in the portal.";
    await db.from("yyc_manual_certificates").update({
      email_status: "skipped", email_error: reason, updated_at: new Date().toISOString()
    }).eq("id", issue.id);
    return { status: "skipped", reason };
  }
  if (!apiKey || !from) {
    const reason = "Resend email is not configured in Supabase.";
    await db.from("yyc_manual_certificates").update({
      email_status: "failed", email_error: reason, updated_at: new Date().toISOString()
    }).eq("id", issue.id);
    return { status: "failed", reason };
  }
  const title = clean(issue.title, 160);
  const eventTitle = clean(issue.event_title, 180);
  const loginUrl = SITE_URL + "/";
  const subject = "New YYC certificate available · " + title;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#05080b;color:#e9e1d2;font-family:Arial,Helvetica,sans-serif">
    <main style="max-width:620px;margin:28px auto;padding:30px;background:#0a1015;border:1px solid #302b20;border-radius:20px">
      <div style="font-size:10px;font-weight:800;letter-spacing:2.5px;color:#d7b66d">YUVAKESARI YOUTH CLUB 🚩</div>
      <h1 style="margin:18px 0 10px;font-size:27px;line-height:1.2;color:#f0d18a">Your certificate is ready.</h1>
      <p style="font-size:14px;line-height:1.7;color:#b3bcb7">Hello ${escapeHtml(recipient.name || "YYC participant")}, YYC administration uploaded a certificate for you. The PDF is attached to this email.</p>
      <div style="margin:18px 0;padding:15px;background:#11191f;border:1px solid #252f32;border-radius:12px">
        <div style="font-size:9px;letter-spacing:1.5px;color:#8e9a94">CERTIFICATE</div>
        <strong style="display:block;margin-top:7px;font-size:18px;color:#e7c77f">${escapeHtml(title)}</strong>
        ${eventTitle ? `<div style="margin-top:7px;font-size:11px;color:#a5b0aa">Event / occasion: ${escapeHtml(eventTitle)}</div>` : ""}
      </div>
      <p style="font-size:12px;line-height:1.7;color:#aab2ad">You can also sign in to your YYC ${issue.recipient_kind === "leader" ? "Leader" : "Member"} Panel and open <strong>My certificates</strong> to download it again.</p>
      <p style="margin:24px 0"><a href="${loginUrl}" style="display:inline-block;padding:13px 18px;background:#d8b66e;color:#0a0c0d;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:1px;border-radius:10px">OPEN YYC WEBSITE ↗</a></p>
      <p style="font-size:10px;color:#7d8983">This is an official message from YYC administration. Keep your personal certificate private.</p>
    </main></body></html>`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "yyc-manual-certificate-" + String(issue.id)
      },
      body: JSON.stringify({
        from, to: [email], subject, html,
        text: "Hello " + clean(recipient.name, 120) + ", YYC administration uploaded a certificate for you: " + title +
          (eventTitle ? " · Event/occasion: " + eventTitle : "") +
          ". The PDF is attached. You can also sign in at " + loginUrl + " and open My certificates.",
        attachments: [{
          filename: clean(issue.original_file_name, 180).replace(/[\\/\r\n"]/g, "_") || "YYC-certificate.pdf",
          content: bytesToBase64(pdfBytes)
        }]
      })
    });
    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok || !data?.id) {
      const reason = clean(data?.message || data?.error?.message || "Email provider rejected the certificate notification.", 1000);
      await db.from("yyc_manual_certificates").update({
        email_status: "failed", email_error: reason, updated_at: new Date().toISOString()
      }).eq("id", issue.id);
      return { status: "failed", reason };
    }
    await db.from("yyc_manual_certificates").update({
      email_status: "sent", email_provider_message_id: String(data.id),
      email_sent_at: new Date().toISOString(), email_error: null, updated_at: new Date().toISOString()
    }).eq("id", issue.id);
    return { status: "sent", id: String(data.id) };
  } catch (error) {
    const reason = clean(error instanceof Error ? error.message : "Certificate notification could not be sent.", 1000);
    await db.from("yyc_manual_certificates").update({
      email_status: "failed", email_error: reason, updated_at: new Date().toISOString()
    }).eq("id", issue.id);
    return { status: "failed", reason };
  }
}
async function processQueued(eventId: string | null): Promise<void> {
  const started = Date.now();
  let processed = 0;
  const maxPerRun = 250;
  while (processed < maxPerRun && Date.now() - started < 100000) {
    const { data, error } = await db.rpc("yyc_claim_certificate_email_batch", {
      p_limit: 5,
      p_event_id: eventId
    });
    if (error) {
      console.error("Could not claim certificate email queue", error.message);
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return;
    processed += rows.length;
    for (let index = 0; index < rows.length; index += 2) {
      await Promise.all(rows.slice(index, index + 2).map((row: any) => sendCertificateEmail(row)));
    }
  }
  console.log("Certificate worker stopped at its per-run safety budget; remaining queued jobs can be resumed.", processed);
}
function startWorker(eventId: string | null): boolean {
  try {
    const runtime = (globalThis as any).EdgeRuntime;
    if (!runtime || typeof runtime.waitUntil !== "function") {
      console.error("EdgeRuntime.waitUntil is unavailable; queued email remains available for manual resume.");
      return false;
    }
    runtime.waitUntil(processQueued(eventId).catch((error) => {
      console.error("Certificate background worker failed", error);
    }));
    return true;
  } catch (error) {
    console.error("Background worker could not be scheduled", error);
    return false;
  }
}
async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("action") !== "verify") return json(req, { ok: false, error: "Unknown certificate action" }, 400);
  const code = clean(url.searchParams.get("code"), 80);
  if (!code) return json(req, { ok: false, error: "Certificate code is required" }, 400);
  const { data, error } = await db.from("yyc_certificates")
    .select("certificate_number,verification_code,recipient_name,recipient_kind,certificate_type,event_title,event_date,event_location,issued_at,revoked_at")
    .eq("verification_code", code).maybeSingle();
  if (error || !data) return json(req, { ok: false, error: "Certificate not found" }, 404);
  if (data.revoked_at) return json(req, { ok: false, error: "This certificate is no longer valid", certificate_number: data.certificate_number }, 410);
  return json(req, {
    ok: true,
    certificate: {
      certificate_number: data.certificate_number,
      recipient_name: data.recipient_name,
      recipient_kind: data.recipient_kind,
      certificate_type: data.certificate_type,
      event_title: data.event_title,
      event_date: data.event_date,
      event_location: data.event_location,
      issued_at: data.issued_at,
      status: "valid"
    }
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(JSON.stringify({ ok: true }), { headers: cors(req) });
  try {
    if (req.method === "GET") return await handleGet(req);
    if (req.method !== "POST") return json(req, { ok: false, error: "Use GET or POST" }, 405);
    if (!SUPABASE_URL || !SERVICE_KEY) return json(req, { ok: false, error: "Certificate service is not configured" }, 503);

    const requestContentType = (req.headers.get("content-type") || "").toLowerCase();
    const isMultipart = requestContentType.includes("multipart/form-data");
    const headerSessionToken = clean(req.headers.get("x-yyc-session"), 500);
    let multipartAdminAuthorized = false;
    let body: Record<string, any> = {};
    let manualFile: File | null = null;
    if (isMultipart) {
      /* Authenticate before parsing/allocating the uploaded body. Multipart is reserved for Admin PDF uploads. */
      const contentLengthHeader = req.headers.get("content-length");
      if (contentLengthHeader !== null) {
        const requestLength = Number(contentLengthHeader);
        if (!Number.isFinite(requestLength) || requestLength < 0 ||
            requestLength > MAX_MANUAL_CERTIFICATE_BYTES + 1024 * 1024) {
          return json(req, { ok: false, error: "Certificate upload request is too large." }, 413);
        }
      }
      if (!headerSessionToken || !(await adminOK(headerSessionToken))) {
        return json(req, { ok: false, error: "Unauthorized" }, 401);
      }
      multipartAdminAuthorized = true;
      const form = await req.formData();
      for (const [key, value] of form.entries()) {
        if (key === "file" && value instanceof File) manualFile = value;
        else if (typeof value === "string") body[key] = value;
      }
    } else {
      body = await readBody(req);
    }
    const action = clean(body.action, 40);
    const adminToken = headerSessionToken || clean(body.admin_token, 500);

    if (action === "upload_manual") {
      if (!multipartAdminAuthorized && !(await adminOK(adminToken))) {
        return json(req, { ok: false, error: "Unauthorized" }, 401);
      }
      const kind = clean(body.target_kind, 20);
      const targetId = clean(body.target_id, 80);
      const title = clean(body.title, 160);
      const eventTitle = clean(body.event_title, 180);
      if (!title || title.length < 2) return json(req, { ok: false, error: "Enter a certificate title." }, 400);
      if (!manualFile) return json(req, { ok: false, error: "Choose a PDF certificate to upload." }, 400);
      if (manualFile.size < 1 || manualFile.size > MAX_MANUAL_CERTIFICATE_BYTES) {
        return json(req, { ok: false, error: "Certificate PDF must be smaller than 10 MB." }, 413);
      }
      const originalName = clean(manualFile.name, 180).replace(/[\\/\r\n"]/g, "_") || "YYC-certificate.pdf";
      if (!/\.pdf$/i.test(originalName)) return json(req, { ok: false, error: "Only PDF certificates are supported." }, 415);
      if (manualFile.type && manualFile.type.toLowerCase() !== "application/pdf") {
        return json(req, { ok: false, error: "The selected file must be a PDF." }, 415);
      }
      const recipient = await resolveAdminRecipient(kind, targetId);
      if (!recipient) return json(req, { ok: false, error: "Choose an approved member or active leader." }, 404);
      const pdfBytes = new Uint8Array(await manualFile.arrayBuffer());
      if (pdfBytes.byteLength < 5 || String.fromCharCode(...pdfBytes.slice(0, 5)) !== "%PDF-") {
        return json(req, { ok: false, error: "The uploaded file does not contain a valid PDF header." }, 415);
      }

      const certificateId = crypto.randomUUID();
      const storagePath = "manual/" + kind + "/" + recipient.id + "/" + certificateId + ".pdf";
      const { error: storageError } = await db.storage.from(MANUAL_CERTIFICATE_BUCKET).upload(
        storagePath, pdfBytes, { contentType: "application/pdf", upsert: false, cacheControl: "3600" }
      );
      if (storageError) return json(req, { ok: false, error: "Private certificate storage is unavailable. Please contact the administrator." }, 503);

      const initialEmailStatus = EMAIL_PATTERN.test(clean(recipient.email, 320)) ? "queued" : "skipped";
      const { data: issue, error: insertError } = await db.from("yyc_manual_certificates").insert({
        id: certificateId,
        recipient_kind: kind,
        recipient_id: recipient.id,
        title,
        event_title: eventTitle,
        original_file_name: originalName,
        storage_path: storagePath,
        content_type: "application/pdf",
        file_size: pdfBytes.byteLength,
        email_status: initialEmailStatus,
        email_error: initialEmailStatus === "skipped" ? "No valid email address on record. Certificate remains available in My certificates." : null,
        uploaded_by: "Admin"
      }).select("*").single();

      if (insertError || !issue) {
        await db.storage.from(MANUAL_CERTIFICATE_BUCKET).remove([storagePath]);
        console.error("Could not record uploaded YYC certificate", insertError?.message || "No row returned");
        return json(req, { ok: false, error: "The certificate could not be recorded. Please try again." }, 500);
      }

      let inAppNotification = false;
      if (kind === "member") {
        const { error: notificationError } = await db.from("member_notifications").insert({
          member_id: recipient.id,
          title: "New YYC certificate available",
          body: "YYC administration uploaded “" + title + "”. Open My certificates in your Member Panel to view or download it.",
          type: "system",
          link: SITE_URL + "/"
        });
        inAppNotification = !notificationError;
        if (notificationError) console.error("Member certificate prompt could not be added", notificationError.message);
      }

      const delivery = await sendManualCertificateEmail(issue, recipient, pdfBytes);
      return json(req, {
        ok: true,
        portal_prompt: true,
        in_app_notification: inAppNotification,
        email_status: delivery.status,
        email_reason: delivery.reason || null,
        certificate: {
          id: issue.id, title: issue.title, event_title: issue.event_title,
          recipient_kind: kind, recipient_name: clean(recipient.name, 120),
          file_name: issue.original_file_name, created_at: issue.created_at
        }
      }, 201);
    }

    if (action === "preview") {
      if (!(await adminOK(adminToken))) return json(req, { ok: false, error: "Unauthorized" }, 401);
      const { data, error } = await db.rpc("admin_certificate_preview", {
        p_token: adminToken,
        p_event_id: clean(body.event_id, 80)
      });
      if (error) return json(req, { ok: false, error: "Unable to preview certificates" }, 500);
      return json(req, data ?? { ok: false, error: "No preview available" });
    }

    if (action === "finalize") {
      if (!(await adminOK(adminToken))) return json(req, { ok: false, error: "Unauthorized" }, 401);
      const eventId = clean(body.event_id, 80);
      const { data, error } = await db.rpc("admin_certificate_finalize", {
        p_token: adminToken,
        p_event_id: eventId,
        p_certificate_type: clean(body.certificate_type, 40) || "participation"
      });
      if (error) return json(req, { ok: false, error: "Unable to finalize certificates" }, 500);
      if (!data?.ok) return json(req, data ?? { ok: false, error: "Unable to finalize certificates" }, 400);
      const workerStarted = startWorker(eventId);
      return json(req, { ...data, worker_started: workerStarted, background: true }, 202);
    }

    if (action === "status" || action === "retry" || action === "process") {
      if (!(await adminOK(adminToken))) return json(req, { ok: false, error: "Unauthorized" }, 401);
      const eventId = clean(body.event_id, 80);
      if (action === "status") {
        const { data, error } = await db.rpc("admin_certificate_queue_status", {
          p_token: adminToken,
          p_event_id: eventId
        });
        if (error) return json(req, { ok: false, error: "Unable to load certificate status" }, 500);
        return json(req, data ?? { ok: false, error: "No certificate status available" });
      }
      if (action === "retry") {
        const { data, error } = await db.rpc("admin_certificate_retry", {
          p_token: adminToken,
          p_event_id: eventId
        });
        if (error) return json(req, { ok: false, error: "Unable to retry certificate emails" }, 500);
        if (!data?.ok) return json(req, data ?? { ok: false, error: "Unable to retry certificate emails" }, 400);
        const workerStarted = Number(data.queued_count) > 0 ? startWorker(eventId) : false;
        return json(req, { ...data, worker_started: workerStarted, background: true }, 202);
      }
      const workerStarted = startWorker(eventId);
      return json(req, { ok: workerStarted, worker_started: workerStarted, background: true }, workerStarted ? 202 : 503);
    }

    if (action === "list") {
      const kind = clean(body.target_kind, 20);
      const token = clean(kind === "leader" ? body.leader_token : body.member_token, 500);
      const recipient = await resolveRecipient(kind, token);
      if (!recipient) return json(req, { ok: false, error: "Please sign in to view your certificates" }, 401);
      const { data, error } = await db.from("yyc_certificates")
        .select("id,certificate_number,verification_code,certificate_type,event_title,event_date,event_location,issued_at,email_status,email_sent_at,email_error,revoked_at")
        .eq("recipient_kind", kind).eq("recipient_id", recipient.id).is("revoked_at", null)
        .order("issued_at", { ascending: false }).limit(100);
      if (error) return json(req, { ok: false, error: "Your certificate list is temporarily unavailable" }, 500);
      const { data: manualItems, error: manualError } = await db.from("yyc_manual_certificates")
        .select("id,title,event_title,original_file_name,created_at,email_status,email_sent_at,email_error,viewed_at,revoked_at")
        .eq("recipient_kind", kind).eq("recipient_id", recipient.id).is("revoked_at", null)
        .order("created_at", { ascending: false }).limit(100);
      if (manualError) return json(req, { ok: false, error: "Your uploaded certificate list is temporarily unavailable" }, 500);
      const unseenIds = (manualItems || []).filter((item: any) => !item.viewed_at).map((item: any) => item.id);
      if (unseenIds.length) {
        const { error: viewedError } = await db.from("yyc_manual_certificates")
          .update({ viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", unseenIds);
        if (viewedError) console.error("Could not mark manual certificates as viewed", viewedError.message);
      }
      const issued = (data || []).map((item: any) => ({ ...item, source: "issued", is_new: false, verify_url: verifyUrl(item) }));
      const uploaded = (manualItems || []).map((item: any) => ({
        id: item.id,
        certificate_number: "",
        certificate_type: "manual_upload",
        event_title: item.event_title || item.title,
        event_date: null,
        event_location: "",
        issued_at: item.created_at,
        email_status: item.email_status,
        email_sent_at: item.email_sent_at,
        email_error: item.email_error,
        revoked_at: item.revoked_at,
        verify_url: "",
        source: "manual_upload",
        manual_certificate_title: item.title,
        file_name: item.original_file_name,
        is_new: !item.viewed_at
      }));
      const certificates = issued.concat(uploaded).sort((a: any, b: any) =>
        new Date(b.issued_at || 0).getTime() - new Date(a.issued_at || 0).getTime()
      ).slice(0, 150);
      return json(req, { ok: true, certificates });
    }

    if (action === "download") {
      const kind = clean(body.target_kind, 20);
      const token = clean(kind === "leader" ? body.leader_token : body.member_token, 500);
      const recipient = await resolveRecipient(kind, token);
      if (!recipient) return json(req, { ok: false, error: "Please sign in again before downloading" }, 401);
      if (clean(body.certificate_source, 40) === "manual_upload") {
        const { data: manualIssue, error: manualIssueError } = await db.from("yyc_manual_certificates")
          .select("id,original_file_name,storage_path,content_type")
          .eq("id", clean(body.certificate_id, 80))
          .eq("recipient_kind", kind).eq("recipient_id", recipient.id)
          .is("revoked_at", null).maybeSingle();
        if (manualIssueError || !manualIssue) {
          return json(req, { ok: false, error: "Uploaded certificate was not found for this account" }, 404);
        }
        const { data: privatePdf, error: downloadError } = await db.storage
          .from(MANUAL_CERTIFICATE_BUCKET).download(manualIssue.storage_path);
        if (downloadError || !privatePdf) {
          return json(req, { ok: false, error: "The private certificate file is temporarily unavailable" }, 503);
        }
        const bytes = new Uint8Array(await privatePdf.arrayBuffer());
        const pdfBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(pdfBuffer).set(bytes);
        await db.from("yyc_manual_certificates")
          .update({ viewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", manualIssue.id);
        const filename = clean(manualIssue.original_file_name, 180).replace(/[\\/\r\n"]/g, "_") || "YYC-certificate.pdf";
        return new Response(pdfBuffer, {
          status: 200,
          headers: {
            ...cors(req),
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename=\"" + filename + "\"",
            "cache-control": "private, no-store"
          }
        });
      }
      const { data: issue, error } = await db.from("yyc_certificates")
        .select("*")
        .eq("id", clean(body.certificate_id, 80))
        .eq("recipient_kind", kind).eq("recipient_id", recipient.id)
        .is("revoked_at", null).maybeSingle();
      if (error || !issue) return json(req, { ok: false, error: "Certificate was not found for this account" }, 404);
      const pdf = await generateCertificatePdf(issue);
      const pdfBuffer = new ArrayBuffer(pdf.byteLength);
      new Uint8Array(pdfBuffer).set(pdf);
      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          ...cors(req),
          "content-type": "application/pdf",
          "content-disposition": "attachment; filename=\"" + clean(issue.certificate_number, 80) + ".pdf\"",
          "cache-control": "private, no-store"
        }
      });
    }

    return json(req, { ok: false, error: "Unknown certificate workflow action" }, 400);
  } catch (error) {
    console.error("YYC certificate workflow request failed", error);
    return json(req, { ok: false, error: "Certificate workflow request failed. Please try again." }, 500);
  }
});
