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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function safeDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = typeof value === "number"
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(secret: Uint8Array, message: string) {
  const key = await crypto.subtle.importKey(
    "raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function decodeBase64(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyResend(req: Request, rawBody: string, secret: string) {
  const id = req.headers.get("svix-id") ?? "";
  const timestamp = req.headers.get("svix-timestamp") ?? "";
  const signatures = req.headers.get("svix-signature") ?? "";
  if (!id || !timestamp || !signatures || !secret.startsWith("whsec_")) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;

  let key: Uint8Array;
  try { key = decodeBase64(secret.slice("whsec_".length)); }
  catch { return false; }

  const expected = btoa(String.fromCharCode(...await hmacSha256(key, id + "." + timestamp + "." + rawBody)));
  return signatures.split(/\s+/).some((part) => {
    const comma = part.indexOf(",");
    return comma > 0 && part.slice(0, comma) === "v1" && constantTimeEqual(part.slice(comma + 1), expected);
  });
}

async function verifyMeta(req: Request, rawBody: string, secret: string) {
  const header = req.headers.get("x-hub-signature-256") ?? "";
  if (!header.startsWith("sha256=") || !secret) return false;
  const expected = bytesToHex(await hmacSha256(new TextEncoder().encode(secret), rawBody));
  return constantTimeEqual(header.slice(7).toLowerCase(), expected);
}

function resendStatus(type: string): string | null {
  const map: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.opened": "delivered",
    "email.clicked": "delivered"
  };
  return map[type] ?? null;
}

function shouldApplyStatus(current: string, incoming: string) {
  if (current === "complained" && incoming !== "complained") return false;
  if (current === "bounced" && !["bounced", "complained"].includes(incoming)) return false;
  if (current === "delivered" && ["queued", "sent", "delayed", "failed"].includes(incoming)) return false;
  if (current === "failed" && ["queued", "sent", "delayed"].includes(incoming)) return false;
  if (incoming === "queued" || incoming === "skipped") return false;
  return true;
}

async function findDelivery(provider: "resend" | "meta-whatsapp", providerMessageId: string) {
  if (!providerMessageId) return null;
  // A webhook can arrive while the sending function is saving the provider's message ID.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db.from("admin_message_deliveries")
      .select("id,status")
      .eq("provider", provider)
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    if (error) throw new Error("Could not look up the delivery record");
    if (data) return data;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  return null;
}

async function recordStatus(input: {
  provider: "resend" | "meta-whatsapp";
  providerMessageId: string;
  providerEventId: string;
  eventType: string;
  occurredAt: string | null;
  nextStatus: string | null;
  failureCode?: string | null;
  reason?: string | null;
}) {
  const delivery = await findDelivery(input.provider, input.providerMessageId);
  if (!delivery) return { matched: false };

  const summary: Record<string, unknown> = {};
  if (input.nextStatus) summary.status = input.nextStatus;
  if (input.failureCode) summary.failure_code = clean(input.failureCode, 80);
  if (input.reason) summary.reason = clean(input.reason, 240);

  // Upsert makes retries idempotent. Status updates are safe to repeat if a provider retries.
  const { error: eventError } = await db.from("admin_message_delivery_events").upsert({
    delivery_id: delivery.id,
    provider: input.provider,
    provider_event_id: clean(input.providerEventId, 255),
    provider_message_id: clean(input.providerMessageId, 255),
    event_type: clean(input.eventType, 100),
    occurred_at: input.occurredAt,
    summary
  }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });
  if (eventError) throw new Error("Could not record the provider event");

  const patch: Record<string, unknown> = {
    provider_event_type: clean(input.eventType, 100),
    provider_event_at: input.occurredAt,
    status_updated_at: new Date().toISOString()
  };

  const incoming = input.nextStatus;
  if (incoming && shouldApplyStatus(String(delivery.status || "queued"), incoming)) {
    patch.status = incoming;
    if (incoming === "sent" && !["sent", "delivered"].includes(String(delivery.status))) {
      patch.sent_at = input.occurredAt ?? new Date().toISOString();
    }
    if (incoming === "delivered") {
      patch.delivered_at = input.occurredAt ?? new Date().toISOString();
      patch.error_message = null;
      patch.failure_code = null;
    } else if (["bounced", "complained", "failed"].includes(incoming)) {
      patch.error_message = clean(input.reason || input.eventType, 1000) || input.eventType;
      patch.failure_code = clean(input.failureCode, 80) || null;
    } else if (incoming === "delayed") {
      patch.error_message = clean(input.reason, 1000) || "Provider reports temporary delivery delay";
      patch.failure_code = clean(input.failureCode, 80) || null;
    }
  }

  const { error: updateError } = await db.from("admin_message_deliveries")
    .update(patch)
    .eq("id", delivery.id);
  if (updateError) throw new Error("Could not update the delivery status");
  return { matched: true, deliveryId: delivery.id };
}

async function handleResend(req: Request, rawBody: string) {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  if (!secret) return json({ ok: false, error: "Resend webhook secret is not configured" }, 503);
  if (!(await verifyResend(req, rawBody, secret))) return json({ ok: false, error: "Invalid Resend signature" }, 401);

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const type = clean(event?.type, 100);
  const data = event?.data ?? {};
  const providerMessageId = clean(data?.email_id ?? data?.id, 255);
  if (!type || !providerMessageId) return json({ ok: true, ignored: true });

  const status = resendStatus(type);
  if (!status && !/^email\.(opened|clicked|sent|delivered|bounced|complained|failed|delivery_delayed)$/.test(type)) {
    return json({ ok: true, ignored: true });
  }

  const eventId = clean(event?.id || req.headers.get("svix-id"), 255);
  if (!eventId) return json({ ok: false, error: "Missing provider event ID" }, 400);
  const occurredAt = safeDate(event?.created_at);
  const reason = clean(
    data?.bounce?.message ??
    data?.reason ??
    data?.message ??
    data?.error?.message ??
    "",
    1000
  );
  const failureCode = clean(data?.bounce?.type ?? data?.error?.code ?? data?.code ?? "", 80);

  const result = await recordStatus({
    provider: "resend",
    providerMessageId,
    providerEventId: eventId,
    eventType: type,
    occurredAt,
    nextStatus: status,
    failureCode: failureCode || null,
    reason: reason || null
  });
  // Other non-YYC messages can share the same Resend account; acknowledge them without storing them.
  return json({ ok: true, ...result });
}

function metaTimestamp(value: unknown) {
  return safeDate(value);
}

async function handleMeta(req: Request, rawBody: string) {
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
  if (!appSecret) return json({ ok: false, error: "WhatsApp app secret is not configured" }, 503);
  if (!(await verifyMeta(req, rawBody, appSecret))) return json({ ok: false, error: "Invalid WhatsApp signature" }, 401);

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  let processed = 0;
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change?.field !== "messages") continue;
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const item of statuses) {
        const providerMessageId = clean(item?.id, 255);
        const rawStatus = clean(item?.status, 40).toLowerCase();
        if (!providerMessageId || !["sent", "delivered", "read", "failed"].includes(rawStatus)) continue;

        const nextStatus = rawStatus === "read" || rawStatus === "delivered" ? "delivered" : rawStatus;
        const error = Array.isArray(item?.errors) ? item.errors[0] : null;
        const failureCode = clean(error?.code ?? error?.title ?? "", 80);
        const reason = clean(error?.error_data?.details ?? error?.message ?? "", 1000);
        const timestamp = metaTimestamp(item?.timestamp);
        const eventId = providerMessageId + ":" + rawStatus + ":" + clean(item?.timestamp, 40);
        const result = await recordStatus({
          provider: "meta-whatsapp",
          providerMessageId,
          providerEventId: eventId,
          eventType: "whatsapp." + rawStatus,
          occurredAt: timestamp,
          nextStatus,
          failureCode: failureCode || null,
          reason: reason || null
        });
        if (result.matched) processed++;
      }
    }
  }
  return json({ ok: true, processed });
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode") ?? "";
      const token = url.searchParams.get("hub.verify_token") ?? "";
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      const expected = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? "";
      if (!expected) return new Response("WhatsApp webhook verify token is not configured", { status: 503 });
      if (mode !== "subscribe" || !challenge || !constantTimeEqual(token, expected)) {
        return new Response("Webhook verification failed", { status: 403 });
      }
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
    if (!SUPABASE_URL || !SUPABASE_KEY) return json({ ok: false, error: "Delivery database connection is not configured" }, 503);

    const rawBody = await req.text();
    if (req.headers.has("svix-id") || req.headers.has("svix-signature")) {
      return await handleResend(req, rawBody);
    }
    if (req.headers.has("x-hub-signature-256")) {
      return await handleMeta(req, rawBody);
    }
    return json({ ok: false, error: "Unsupported or unsigned provider webhook" }, 401);
  } catch (error) {
    // Do not log raw payloads or provider credentials; providers can safely retry on 500.
    return json({ ok: false, error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
