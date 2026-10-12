import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "yyc-reels";
const ALLOWED_ORIGINS = new Set([
  "https://www.yuvakesariyouthclub.in",
  "https://yuvakesariyouthclub.in",
  "https://officiallxshh.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5500"
]);
const ALLOWED_THUMBNAILS = new Set(["image/jpeg", "image/png", "image/webp"]);
function headersFor(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function reply(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {status,headers:{...headersFor(origin),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
}
function cleanExtension(fileName: string, kind: string) {
  const match=String(fileName||"").toLowerCase().match(/\\.([a-z0-9]{1,8})$/);
  const ext=match?.[1]||"";
  if(kind==="thumbnail")return ["jpg","jpeg","png","webp"].includes(ext)?(ext==="jpeg"?"jpg":ext):"jpg";
  return ext||"video";
}
function validPath(value: unknown) {
  return typeof value==="string"&&value.startsWith("reels/")&&!value.includes("..")&&!value.startsWith("/");
}
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin")??"";
  if(req.method==="OPTIONS"){
    if(!ALLOWED_ORIGINS.has(origin))return new Response("Origin not allowed",{status:403,headers:headersFor(origin)});
    return new Response("ok",{status:204,headers:headersFor(origin)});
  }
  if(req.method!=="POST")return reply(origin,{ok:false,error:"Method not allowed."},405);
  if(!ALLOWED_ORIGINS.has(origin))return reply(origin,{ok:false,error:"Origin not allowed."},403);
  if(!SUPABASE_URL||!SERVICE_ROLE_KEY)return reply(origin,{ok:false,error:"Storage service is not configured."},500);
  let input:Record<string,unknown>;
  try{input=await req.json();}catch{return reply(origin,{ok:false,error:"Invalid request body."},400);}
  const token=typeof input.token==="string"?input.token.trim():"";
  if(!token)return reply(origin,{ok:false,error:"Admin session is missing. Please log in again."},401);
  const supabase=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:authData,error:authError}=await supabase.rpc("yyc_reels_admin_authorized",{p_token:token});
  if(authError||authData?.ok!==true)return reply(origin,{ok:false,error:"Admin session is not valid."},401);
  const action=String(input.action||"");
  if(action==="sign-upload"){
    const kind=String(input.kind||"");
    const contentType=String(input.contentType||"").toLowerCase().split(";")[0].trim();
    const fileName=String(input.fileName||"");
    const size=Number(input.size||0);
    if(kind!=="video"&&kind!=="thumbnail")return reply(origin,{ok:false,error:"Unknown upload type."},400);
    // No application-level size cap; the project-wide Supabase Storage settings remain authoritative.
    if(!Number.isFinite(size)||size<1)return reply(origin,{ok:false,error:"The file is empty or its size could not be read."},400);
    const validType=kind==="video"?/^video\\/[a-z0-9.+-]+$/i.test(contentType):ALLOWED_THUMBNAILS.has(contentType);
    if(!validType)return reply(origin,{ok:false,error:kind==="video"?"Choose a video file. MP4 is recommended for smooth playback.":"Use a JPG, PNG or WebP thumbnail."},415);
    const path="reels/"+kind+"/"+crypto.randomUUID()+"."+cleanExtension(fileName,kind);
    const {data,error}=await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if(error||!data?.token)return reply(origin,{ok:false,error:error?.message||"Could not prepare the upload."},500);
    const publicUrl=supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return reply(origin,{ok:true,path,token:data.token,publicUrl});
  }
  if(action==="delete-files"){
    const rawPaths=Array.isArray(input.paths)?input.paths:[];
    const paths=rawPaths.filter(validPath).slice(0,2) as string[];
    if(rawPaths.some(p=>!validPath(p)))return reply(origin,{ok:false,error:"Invalid storage path."},400);
    if(!paths.length)return reply(origin,{ok:true});
    const {error}=await supabase.storage.from(BUCKET).remove(paths);
    if(error)return reply(origin,{ok:false,error:"The REEL was removed, but media cleanup failed: "+error.message},500);
    return reply(origin,{ok:true});
  }
  return reply(origin,{ok:false,error:"Unknown action."},400);
});
