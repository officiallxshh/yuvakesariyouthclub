import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SUPABASE_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const SITE_URL = "https://www.yuvakesariyouthclub.in/";

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = [
    "https://www.yuvakesariyouthclub.in",
    "https://yuvakesariyouthclub.in",
    "https://officiallxshh.github.io"
  ];
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": allowed.includes(origin) ? origin : "https://www.yuvakesariyouthclub.in",
    "access-control-allow-headers": "authorization,apikey,content-type",
    "access-control-allow-methods": "POST,OPTIONS",
    "vary": "Origin"
  };
}
function out(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
function clean(value: unknown, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}
function escapeHtml(value: unknown, max = 4000) {
  return clean(value, max).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[c] ?? c));
}
function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!name || !domain) return "";
  return (name.length < 3 ? name[0] + "***" : name.slice(0, 2) + "***") + "@" + domain;
}
function emailShell(title: string, name: string, body: string, detail = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title, 180)}</title></head>
  <body style="margin:0;padding:0;background:#05080b;color:#e9e1d2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;padding:26px 22px;background:#0b1117;border:1px solid #2b3135;border-radius:20px">
    <div style="font-size:11px;letter-spacing:2px;color:#d7b66d;font-weight:800">YUVAKESARI YOUTH CLUB</div>
    <div style="margin:8px 0 24px;color:#7d8986;font-size:11px;letter-spacing:1px">SUBRAHMANYA · KARNATAKA</div>
    <h1 style="margin:0 0 15px;font-size:25px;line-height:1.2;color:#f1d28e">${escapeHtml(title, 180)}</h1>
    <p style="color:#c7ceca;font-size:14px;line-height:1.8">Hello ${escapeHtml(name, 120)},</p>
    <div style="color:#aab2af;font-size:14px;line-height:1.8">${body}</div>
    ${detail ? `<div style="margin-top:19px;padding:14px;border-radius:12px;background:#11181d;border:1px solid #242d32;color:#c3c9c5;font-size:12px;line-height:1.8">${detail}</div>` : ""}
    <p style="margin-top:25px"><a href="${SITE_URL}" style="color:#f0d28f;font-weight:700">Visit the official YYC website ↗</a></p>
    <p style="margin-top:26px;padding-top:17px;border-top:1px solid #252d31;color:#747f7b;font-size:10px;line-height:1.7">This is an automated message from Yuvakesari Youth Club. Please do not reply directly to this email.</p>
  </div></body></html>`;
}
async function sendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  if (!key || !from) return { status: "skipped", reason: "Email provider is not configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  const responseText = await response.text();
  let result: any = null;
  try { result = responseText ? JSON.parse(responseText) : null; } catch { /* handled below */ }
  if (!response.ok) {
    return { status: "failed", reason: clean(result?.message || "Email provider rejected the request", 300) };
  }
  return { status: "sent", id: clean(result?.id || "", 200) || null };
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function adminOK(token: string) {
  if (!token) return false;
  const { data, error } = await db.rpc("_admin_ok", { p_token: token });
  return !error && data === true;
}
type EmailField = "application_email_status" | "admin_alert_email_status" | "decision_email_status";
type SentAtField = "application_email_sent_at" | "admin_alert_email_sent_at" | "decision_email_sent_at";
type ErrorField = "application_email_error" | "admin_alert_email_error" | "decision_email_error";

async function claimVolunteerEmail(id: string, statusField: EmailField, sentAtField: SentAtField, errorField: ErrorField, expectedStatus?: string) {
  const update: Record<string, unknown> = {
    [statusField]: "sending",
    [sentAtField]: null,
    [errorField]: null
  };
  let query = db.from("volunteers").update(update).eq("id", id).in(statusField, ["pending", "failed"]);
  if (expectedStatus) query = query.eq("status", expectedStatus);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error("Could not reserve the volunteer email notification");
  return !!data;
}
async function finishVolunteerEmail(id: string, statusField: EmailField, sentAtField: SentAtField, errorField: ErrorField, result: {status: string; reason?: string}) {
  const status = ["sent", "failed", "skipped"].includes(result.status) ? result.status : "failed";
  const patch: Record<string, unknown> = {
    [statusField]: status,
    [sentAtField]: status === "sent" ? new Date().toISOString() : null,
    [errorField]: status === "failed" ? clean(result.reason || "Email send failed", 300) : null
  };
  const { error } = await db.from("volunteers").update(patch).eq("id", id);
  if (error) throw new Error("Email status could not be saved");
  return { status, reason: result.reason };
}
async function sendTrackedVolunteerEmail(args: {
  id: string;
  statusField: EmailField;
  sentAtField: SentAtField;
  errorField: ErrorField;
  to: string;
  subject: string;
  html: string;
  expectedStatus?: string;
}) {
  const { id, statusField, sentAtField, errorField, to, subject, html, expectedStatus } = args;
  if (!validEmail(to)) {
    await db.from("volunteers").update({ [statusField]: "skipped", [errorField]: null }).eq("id", id);
    return { status: "skipped", reason: "No valid email address is configured" };
  }
  const claimed = await claimVolunteerEmail(id, statusField, sentAtField, errorField, expectedStatus);
  if (!claimed) {
    const { data } = await db.from("volunteers")
      .select(statusField + "," + sentAtField)
      .eq("id", id).maybeSingle();
    const status = (data as Record<string, unknown> | null)?.[statusField];
    if (status === "sent") return { status: "sent", already_sent: true };
    if (status === "sending") return { status: "sending", already_processing: true };
    return { status: String(status || "skipped"), already_processing: false };
  }
  const result = await sendEmail(to, subject, html);
  return await finishVolunteerEmail(id, statusField, sentAtField, errorField, result);
}
async function getVolunteer(id: string) {
  const { data, error } = await db.from("volunteers")
    .select("id,name,phone,email,area,skills,availability,message,status,source,created_at,application_email_status,admin_alert_email_status,decision_email_status,decision_email_for_status")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("Could not load volunteer application");
  return data;
}
async function sendApplicationEmails(id: string) {
  const volunteer = await getVolunteer(id);
  if (!volunteer) return { ok: false, error: "Volunteer application not found" };
  if (String(volunteer.source || "") !== "website" || String(volunteer.status || "") !== "pending") {
    return { ok: false, error: "This application is not eligible for first-submission emails" };
  }
  const createdAt = new Date(String(volunteer.created_at)).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 30 * 60 * 1000 || createdAt > Date.now() + 60 * 1000) {
    return { ok: false, error: "First-submission email window has expired" };
  }

  const name = clean(volunteer.name || "Volunteer", 120);
  const applicationBody = "Thank you for registering your interest in volunteering with Yuvakesari Youth Club. Your application has been saved successfully and is now <strong style=\"color:#f1d28e\">pending admin review</strong>. The team will contact you after reviewing your details.";
  const applicationDetail = [
    "<strong>Application status:</strong> Pending review",
    volunteer.area ? "<strong>Area:</strong> " + escapeHtml(volunteer.area, 120) : "",
    volunteer.skills ? "<strong>Skills / interests:</strong> " + escapeHtml(volunteer.skills, 240) : "",
    volunteer.availability ? "<strong>Availability:</strong> " + escapeHtml(volunteer.availability, 120) : ""
  ].filter(Boolean).join("<br>");
  const applicantEmail = await sendTrackedVolunteerEmail({
    id, statusField: "application_email_status", sentAtField: "application_email_sent_at", errorField: "application_email_error",
    to: clean(volunteer.email, 320), subject: "YYC Volunteer Application Received",
    html: emailShell("We received your volunteer application", name, applicationBody, applicationDetail),
    expectedStatus: "pending"
  });

  const { data: settings, error: settingsError } = await db.from("site_settings")
    .select("contact_email").eq("id", true).maybeSingle();
  const adminEmail = clean(settings?.contact_email, 320);
  let adminAlert: {status: string; reason?: string};
  if (settingsError || !validEmail(adminEmail)) {
    await db.from("volunteers").update({ admin_alert_email_status: "skipped", admin_alert_email_error: null }).eq("id", id);
    adminAlert = { status: "skipped", reason: "No valid YYC contact email is configured in Site Settings" };
  } else {
    const adminDetail = [
      "<strong>Applicant:</strong> " + escapeHtml(name, 120),
      "<strong>Email:</strong> " + escapeHtml(volunteer.email || "Not provided", 320),
      "<strong>Phone:</strong> " + escapeHtml(volunteer.phone || "Not provided", 80),
      "<strong>Area:</strong> " + escapeHtml(volunteer.area || "Not provided", 120),
      "<strong>Skills:</strong> " + escapeHtml(volunteer.skills || "Not provided", 240),
      "<strong>Availability:</strong> " + escapeHtml(volunteer.availability || "Not provided", 120),
      "<strong>Message:</strong> " + escapeHtml(volunteer.message || "Not provided", 1000)
    ].join("<br>");
    adminAlert = await sendTrackedVolunteerEmail({
      id, statusField: "admin_alert_email_status", sentAtField: "admin_alert_email_sent_at", errorField: "admin_alert_email_error",
      to: adminEmail, subject: "New YYC Volunteer Application — " + name,
      html: emailShell("A new volunteer application arrived", "YYC Admin Team", "A new volunteer application has been submitted and is waiting for review.", adminDetail),
      expectedStatus: "pending"
    });
  }
  return { ok: true, event: "application", email: applicantEmail, admin_alert: adminAlert };
}
async function sendDecisionEmail(id: string, token: string, decision: "approved" | "denied") {
  if (!(await adminOK(token))) return { ok: false, error: "Unauthorized" };
  const volunteer = await getVolunteer(id);
  if (!volunteer) return { ok: false, error: "Volunteer application not found" };
  if (String(volunteer.status || "").toLowerCase() !== decision) {
    return { ok: false, error: "Volunteer status changed before the email could be sent" };
  }
  const email = clean(volunteer.email, 320);
  const name = clean(volunteer.name || "Volunteer", 120);
  if (!validEmail(email)) {
    await db.from("volunteers").update({ decision_email_status: "skipped", decision_email_for_status: decision, decision_email_error: null }).eq("id", id);
    return { ok: true, event: "decision", email: { status: "skipped", reason: "No valid email on record" } };
  }
  const { data: current } = await db.from("volunteers").select("decision_email_status,decision_email_for_status").eq("id", id).maybeSingle();
  if (current?.decision_email_status === "sent" && current?.decision_email_for_status === decision) {
    return { ok: true, event: "decision", email: { status: "sent", already_sent: true } };
  }
  const claimed = await claimVolunteerEmail(id, "decision_email_status", "decision_email_sent_at", "decision_email_error", decision);
  if (!claimed) {
    const { data: latest } = await db.from("volunteers").select("decision_email_status,decision_email_for_status").eq("id", id).maybeSingle();
    if (latest?.decision_email_status === "sending") return { ok: true, event: "decision", email: { status: "sending", already_processing: true } };
    return { ok: false, error: "Decision email is already sent or currently unavailable for retry" };
  }
  const approved = decision === "approved";
  const body = approved
    ? "Your volunteer application has been <strong style=\"color:#91d8ac\">approved</strong> by the Yuvakesari Youth Club administration. Thank you for offering your time and skills to support the community. The team will contact you with any next steps."
    : "Your volunteer application has been reviewed by the Yuvakesari Youth Club administration and was not approved at this time. Thank you for your interest and for taking the time to apply.";
  const html = emailShell(
    approved ? "Your volunteer application is approved" : "Update on your volunteer application",
    name,
    body,
    "<strong>Application status:</strong> " + (approved ? "Approved" : "Not approved")
  );
  const result = await sendEmail(email, "YYC Volunteer Application " + (approved ? "Approved" : "Update"), html);
  const finished = await finishVolunteerEmail(id, "decision_email_status", "decision_email_sent_at", "decision_email_error", result);
  await db.from("volunteers").update({ decision_email_for_status: decision }).eq("id", id);
  return { ok: true, event: "decision", email: finished };
}


async function sendAdminTestEmail(token: string) {
  if (!(await adminOK(token))) return { ok: false, error: "Unauthorized" };
  const { data: settings, error } = await db.from("site_settings")
    .select("contact_email").eq("id", true).maybeSingle();
  const recipient = clean(settings?.contact_email, 320);
  if (error || !validEmail(recipient)) {
    return { ok: false, error: "Configure a valid Site Settings contact email before testing notifications" };
  }
  const result = await sendEmail(
    recipient,
    "YYC Email Configuration Test",
    emailShell(
      "Email configuration test",
      "YYC Admin Team",
      "This test message confirms that the YYC notification function received an authorized test request and the email provider accepted the message request.",
      "<strong>Result:</strong> Provider accepted the test request"
    )
  );
  if (result.status !== "sent") {
    return { ok: false, error: result.reason || "Email provider is not configured or rejected the test", email: { status: result.status } };
  }
  return { ok: true, event: "admin_test", email: { status: "sent", recipient: maskEmail(recipient) } };
}

async function retryVolunteerEmail(id: string, token: string, kind: string) {
  if (!(await adminOK(token))) return { ok: false, error: "Unauthorized" };
  const volunteer = await getVolunteer(id);
  if (!volunteer) return { ok: false, error: "Volunteer application not found" };
  const source = String(volunteer.source || "");
  const status = String(volunteer.status || "pending").toLowerCase();
  const name = clean(volunteer.name || "Volunteer", 120);

  if (kind === "application") {
    if (source !== "website" || status !== "pending" || volunteer.application_email_status !== "failed") {
      return { ok: false, error: "Applicant confirmation can only be retried after a failed email for a pending website application" };
    }
    const details = [
      "<strong>Application status:</strong> Pending review",
      volunteer.area ? "<strong>Area:</strong> " + escapeHtml(volunteer.area, 120) : "",
      volunteer.skills ? "<strong>Skills / interests:</strong> " + escapeHtml(volunteer.skills, 240) : "",
      volunteer.availability ? "<strong>Availability:</strong> " + escapeHtml(volunteer.availability, 120) : ""
    ].filter(Boolean).join("<br>");
    const email = await sendTrackedVolunteerEmail({
      id, statusField: "application_email_status", sentAtField: "application_email_sent_at", errorField: "application_email_error",
      to: clean(volunteer.email, 320), subject: "YYC Volunteer Application Received",
      html: emailShell("We received your volunteer application", name,
        "Thank you for registering your interest in volunteering with Yuvakesari Youth Club. Your application has been saved successfully and is pending admin review. The team will contact you after reviewing your details.",
        details),
      expectedStatus: "pending"
    });
    return { ok: true, event: "retry", kind, email };
  }

  if (kind === "admin_alert") {
    if (source !== "website" || status === "archived" || volunteer.admin_alert_email_status !== "failed") {
      return { ok: false, error: "Only a failed admin alert for an active website application can be retried" };
    }
    const { data: settings, error } = await db.from("site_settings")
      .select("contact_email").eq("id", true).maybeSingle();
    const recipient = clean(settings?.contact_email, 320);
    if (error || !validEmail(recipient)) {
      return { ok: false, error: "Configure a valid Site Settings contact email before retrying the admin alert" };
    }
    const details = [
      "<strong>Applicant:</strong> " + escapeHtml(name, 120),
      "<strong>Email:</strong> " + escapeHtml(volunteer.email || "Not provided", 320),
      "<strong>Phone:</strong> " + escapeHtml(volunteer.phone || "Not provided", 80),
      "<strong>Area:</strong> " + escapeHtml(volunteer.area || "Not provided", 120),
      "<strong>Skills:</strong> " + escapeHtml(volunteer.skills || "Not provided", 240),
      "<strong>Availability:</strong> " + escapeHtml(volunteer.availability || "Not provided", 120),
      "<strong>Message:</strong> " + escapeHtml(volunteer.message || "Not provided", 1000),
      "<strong>Current application status:</strong> " + escapeHtml(status, 30)
    ].join("<br>");
    const email = await sendTrackedVolunteerEmail({
      id, statusField: "admin_alert_email_status", sentAtField: "admin_alert_email_sent_at", errorField: "admin_alert_email_error",
      to: recipient, subject: "YYC Volunteer Application Notification Retry — " + name,
      html: emailShell("Retried volunteer application notification", "YYC Admin Team",
        "This is a retry of an earlier notification that was not sent successfully.", details)
    });
    return { ok: true, event: "retry", kind, email, recipient: maskEmail(recipient) };
  }

  if (kind === "decision") {
    const decision = String(volunteer.decision_email_for_status || "").toLowerCase();
    if (volunteer.decision_email_status !== "failed" || !["approved", "denied"].includes(decision) || status !== decision) {
      return { ok: false, error: "Only the failed email matching the application's current decision can be retried" };
    }
    return await sendDecisionEmail(id, token, decision as "approved" | "denied");
  }

  return { ok: false, error: "Unknown volunteer email retry type" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return out(req, { ok: true });
  if (req.method !== "POST") return out(req, { ok: false, error: "POST required" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return out(req, { ok: false, error: "Invalid JSON" }, 400); }

  const event = clean(body?.event, 40);
  try {
    if (event === "admin_test") {
      const token = clean(body?.admin_token, 500);
      const result = await sendAdminTestEmail(token);
      return out(req, result, result.ok ? 200 : result.error === "Unauthorized" ? 401 : 400);
    }
    if (event === "retry") {
      const id = clean(body?.volunteer_id, 80);
      const token = clean(body?.admin_token, 500);
      const kind = clean(body?.kind, 40);
      if (!isUuid(id) || !["application", "admin_alert", "decision"].includes(kind)) {
        return out(req, { ok: false, error: "A volunteer application and valid retry type are required" }, 400);
      }
      const result = await retryVolunteerEmail(id, token, kind);
      return out(req, result, result.ok ? 200 : result.error === "Unauthorized" ? 401 : 400);
    }
    if (event === "application") {
      const id = clean(body?.volunteer_id, 80);
      if (!isUuid(id)) return out(req, { ok: false, error: "Volunteer application ID is required" }, 400);
      const result = await sendApplicationEmails(id);
      return out(req, result, result.ok ? 200 : 400);
    }
    if (event === "decision") {
      const id = clean(body?.volunteer_id, 80);
      const token = clean(body?.admin_token, 500);
      const decision = clean(body?.decision, 20).toLowerCase();
      if (!isUuid(id) || !["approved", "denied"].includes(decision)) {
        return out(req, { ok: false, error: "A volunteer application and valid decision are required" }, 400);
      }
      const result = await sendDecisionEmail(id, token, decision as "approved" | "denied");
      return out(req, result, result.ok ? 200 : result.error === "Unauthorized" ? 401 : 400);
    }
    return out(req, { ok: false, error: "Unknown volunteer notification event" }, 400);
  } catch (error) {
    return out(req, { ok: false, error: error instanceof Error ? clean(error.message, 250) : "Volunteer notification failed" }, 500);
  }
});
