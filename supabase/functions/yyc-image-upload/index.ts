import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const KEY = SECRET.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "yyc-media";
const MAX = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp"]);
const admin = createClient(URL, KEY, { auth:{autoRefreshToken:false,persistSession:false} });

function hdr(req:Request) {
  const o = req.headers.get("origin") || "";
  const a = ["https://www.yuvakesariyouthclub.in","https://yuvakesariyouthclub.in","https://officiallxshh.github.io"];
  const allow = a.includes(o) ? o : "https://www.yuvakesariyouthclub.in";
  return {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":allow,
    "vary":"Origin",
    "access-control-allow-headers":"authorization,apikey,content-type,x-yyc-session",
    "access-control-allow-methods":"POST,OPTIONS"
  };
}

const out = (req:Request,b:unknown,s=200) =>
  new Response(JSON.stringify(b),{status:s,headers:hdr(req)});

const token = (req:Request,b:any) =>
  (req.headers.get("x-yyc-session") || b?.token || "").trim();

function decode(v:string) {
  const m = String(v || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/=\s]+)$/i);
  if(!m) throw new Error("Invalid image data");
  const mime = m[1].toLowerCase();
  if(!ALLOWED.has(mime)) throw new Error("Only JPG, PNG and WebP images are allowed");
  const raw = m[2].replace(/\s/g,"");
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  if(bytes.byteLength>MAX) throw new Error("Image is too large. Maximum upload size is 6 MB.");
  return {mime,bytes};
}

async function adminOK(t:string) {
  if(!t) return false;
  const {data,error} = await admin.rpc("_admin_ok",{p_token:t});
  return !error && data===true;
}
async function memberId(t:string) {
  if(!t) return null;
  const {data,error} = await admin.rpc("_member_id",{p_token:t});
  return error ? null : (data || null);
}
async function leaderId(t:string) {
  if(!t) return null;
  const {data,error} = await admin.rpc("_leader_id",{p_token:t});
  return error ? null : (data || null);
}
function ext(m:string) {
  return m==="image/png" ? "png" : m==="image/webp" ? "webp" : "jpg";
}
function oldPath(u:string) {
  if(!u) return "";
  const mark = "/storage/v1/object/public/"+BUCKET+"/";
  const pos = u.indexOf(mark);
  if(pos<0) return "";
  const p = decodeURIComponent(u.slice(pos+mark.length).split("?")[0]);
  return ["members/","leaders/","announcements/","gallery/","events/","swags/"].some(x=>p.startsWith(x)) ? p : "";
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return out(req,{ok:true});
  if(req.method!=="POST") return out(req,{ok:false,error:"Method not allowed"},405);

  let b:any;
  try { b=await req.json(); }
  catch { return out(req,{ok:false,error:"Invalid JSON"},400); }

  const type = String(b?.type || "");
  const t = token(req,b);
  const data = b?.data_url || b?.image_data || "";
  const old = String(b?.old_url || "").trim();
  const record = String(b?.record_id || "").trim();

  const admins = new Set(["member","leader","announcement","gallery","event","swag","achievement"]);
  const reg = type==="member-registration";
  const mem = type==="member-profile";
  const lead = type==="leader-profile";

  if(!reg && !mem && !lead && !admins.has(type))
    return out(req,{ok:false,error:"Invalid upload type"},400);

  let sessionRecord = "";
  if(mem) {
    sessionRecord = await memberId(t) || "";
    if(!sessionRecord) return out(req,{ok:false,error:"Member session expired"},401);
    if(record && record!==sessionRecord) return out(req,{ok:false,error:"Member photo record mismatch"},403);
  } else if(lead) {
    sessionRecord = await leaderId(t) || "";
    if(!sessionRecord) return out(req,{ok:false,error:"Leader session expired"},401);
    if(record && record!==sessionRecord) return out(req,{ok:false,error:"Leader photo record mismatch"},403);
  } else if(!reg && !await adminOK(t)) {
    return out(req,{ok:false,error:"Unauthorized"},401);
  }

  if(!data) return out(req,{ok:false,error:"Image is required"},400);

  let d;
  try { d=decode(data); }
  catch(e) { return out(req,{ok:false,error:e instanceof Error?e.message:"Invalid image"},400); }

  const id = record || crypto.randomUUID();
  const folder:any = {
    "member-registration":"members/pending",
    "member-profile":"members",
    "leader-profile":"leaders",
    "member":"members",
    "leader":"leaders",
    "announcement":"announcements",
    "gallery":"gallery",
    "event":"events",
    "swag":"swags",
    "achievement":"achievements"
  }[type];

  // Use a new storage object for every replacement so browser/CDN caches cannot
  // keep serving the previous image at the same URL.
  const version = Date.now()+"-"+crypto.randomUUID();
  const path = folder+"/"+id+"-"+version+"."+ext(d.mime);

  const {data:u,error} = await admin.storage.from(BUCKET).upload(path,d.bytes,{
    contentType:d.mime,
    cacheControl:"31536000",
    upsert:false
  });
  if(error) return out(req,{ok:false,error:error.message},500);

  const {data:pub} = admin.storage.from(BUCKET).getPublicUrl(u.path);
  const op = oldPath(old);
  if(op && op!==u.path) {
    try { await admin.storage.from(BUCKET).remove([op]); } catch {}
  }

  const freshUrl = pub.publicUrl + "?v=" + Date.now();
  return out(req,{ok:true,path:u.path,public_url:freshUrl,size:d.bytes.byteLength,content_type:d.mime});
});