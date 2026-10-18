const SUPABASE_URL = "https://vrllozfzheikjbhxvpkx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt";
const ALLOWED_ORIGIN = "https://officiallxshh.github.io";
const TOKEN_LIFETIME_SECONDS = 10 * 60;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
  };
}

function respond(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8Bytes(pem: string): Uint8Array {
  const match = pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (!match) throw new Error("KEY_FORMAT");
  const binary = atob(match[1].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signJaasJwt(
  appId: string,
  keyId: string,
  privateKeyPem: string,
  roomName: string,
  actorName: string,
  actorId: string,
  moderator: boolean,
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Bytes(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: keyId, typ: "JWT" };
  const payload = {
    aud: "jitsi",
    iss: "chat",
    sub: appId,
    room: roomName,
    nbf: now - 5,
    exp: now + TOKEN_LIFETIME_SECONDS,
    context: {
      user: {
        id: actorId,
        name: actorName,
        avatar: "",
        email: "",
        moderator: moderator ? "true" : "false",
      },
      features: {
        recording: false,
        livestreaming: false,
        transcription: false,
        "inbound-call": false,
        "outbound-call": false,
        "sip-inbound-call": false,
        "sip-outbound-call": false,
      },
      room: { regex: false },
    },
  };

  const signingInput = encodeJson(header) + "." + encodeJson(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + "." + base64Url(new Uint8Array(signature));
}

async function rpc(name: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data: any = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error("YYC backend validation failed.");
  return data;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== "POST") return respond({ ok: false, message: "Use POST for meeting access." }, 405);

  const appId = Deno.env.get("JAAS_APP_ID")?.trim() || "";
  const keyId = Deno.env.get("JAAS_KEY_ID")?.trim() || "";
  const privateKeyPem = Deno.env.get("JAAS_PRIVATE_KEY_PKCS8") || "";
  if (!appId || !keyId || !privateKeyPem) {
    return respond({
      ok: false,
      error: "JAAS_NOT_CONFIGURED",
      message: "YYC Meet’s secure conference service is not configured yet. The administrator must finish the JaaS setup in Supabase before calls can start.",
    }, 503);
  }
  if (!keyId.startsWith(appId + "/")) {
    return respond({
      ok: false,
      error: "JAAS_KEY_ID_INVALID",
      message: "The JaaS API Key ID must include the App ID prefix shown in the JaaS console.",
    }, 503);
  }

  let body: any;
  try { body = await request.json(); }
  catch { return respond({ ok: false, error: "INVALID_JSON", message: "Could not read the meeting request." }, 400); }

  const inviteCode = String(body?.invite_code || "").toUpperCase().replace(/[^A-F0-9]/g, "");
  if (!/^[A-F0-9]{32}$/.test(inviteCode)) {
    return respond({ ok: false, error: "INVALID_INVITE", message: "Use the full private YYC Meet invite code." }, 400);
  }

  try {
    const lookup = await rpc("yyc_meet_lookup", { p_invite_code: inviteCode });
    if (!lookup?.ok || !lookup?.meeting || lookup.meeting.status !== "live" || !lookup.meeting.room_name) {
      return respond({
        ok: false,
        error: "MEETING_NOT_LIVE",
        message: lookup?.message || "The YYC Admin must start this meeting before anyone can join.",
      }, 403);
    }

    let actor: any = null;
    const yycToken = typeof body?.yyc_token === "string" ? body.yyc_token.trim() : "";
    if (yycToken) {
      if (yycToken.length > 4096) {
        return respond({ ok: false, error: "INVALID_SESSION", message: "Please sign in to YYC again, then retry." }, 401);
      }
      const session = await rpc("yyc_meet_portal", {
        p_token: yycToken,
        p_action: "me",
        p_payload: {},
      });
      if (!session?.ok || !session?.actor?.kind) {
        return respond({ ok: false, error: "INVALID_SESSION", message: "Your YYC session could not be verified. Sign in again, or open the invite as a guest." }, 401);
      }
      actor = session.actor;
    }

    const moderator = actor?.kind === "admin";
    const suppliedName = typeof body?.display_name === "string"
      ? body.display_name.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 80)
      : "";
    const actorName = moderator ? "YYC Admin" : suppliedName || String(actor?.name || "YYC Guest").slice(0, 80);
    const actorId = actor?.id ? String(actor.id) : crypto.randomUUID();
    const jwt = await signJaasJwt(appId, keyId, privateKeyPem, String(lookup.meeting.room_name), actorName, actorId, moderator);

    return respond({
      ok: true,
      domain: "8x8.vc",
      app_id: appId,
      room_name: appId + "/" + String(lookup.meeting.room_name),
      jwt,
      display_name: actorName,
      moderator,
      expires_in: TOKEN_LIFETIME_SECONDS,
      meeting: {
        title: String(lookup.meeting.title || "YYC Meeting"),
        description: String(lookup.meeting.description || ""),
        status: "live",
        starts_at: lookup.meeting.starts_at || null,
        duration_minutes: Number(lookup.meeting.duration_minutes || 60),
        waiting_room: !!lookup.meeting.waiting_room,
        host_name: String(lookup.meeting.host_name || "YYC Host"),
        invite_code: inviteCode,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "KEY_FORMAT") {
      return respond({
        ok: false,
        error: "JAAS_PRIVATE_KEY_FORMAT",
        message: "The JaaS private key must be unencrypted PKCS#8 PEM (BEGIN PRIVATE KEY). Convert the key as described in the YYC JaaS setup guide.",
      }, 503);
    }
    return respond({ ok: false, error: "TOKEN_ISSUE_FAILED", message: "YYC could not authorize this conference. Check the meeting invite and JaaS configuration, then retry." }, 502);
  }
});
