import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SECRET_KEYS=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");}catch{return {};}})();
const SUPABASE_KEY=SECRET_KEYS.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const allowed=[
  "https://www.yuvakesariyouthclub.in",
  "https://yuvakesariyouthclub.in",
  "https://officiallxshh.github.io"
];

function headers(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":allowed.includes(origin)?origin:"https://www.yuvakesariyouthclub.in",
    "access-control-allow-methods":"GET,OPTIONS",
    "access-control-allow-headers":"content-type",
    "cache-control":"no-store"
  };
}
function response(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:headers(req)});
}
function clean(value:unknown,max=200){return String(value??"").trim().slice(0,max);}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:headers(req)});
  if(req.method!=="GET") return response(req,{ok:false,error:"GET is required"},405);
  try{
    const url=new URL(req.url);
    const token=clean(url.searchParams.get("token"),80);
    if(!/^[0-9a-f-]{36}$/i.test(token)) return response(req,{ok:false,error:"Invalid certificate link"},400);

    const {data:cert,error}=await db.from("certificates")
      .select("certificate_no,certificate_code,certificate_token,recipient_name,event_title,event_date,location,status,storage_path")
      .eq("certificate_token",token)
      .maybeSingle();

    if(error||!cert) return response(req,{ok:false,error:"Certificate not found"},404);
    if(!["generated","emailed"].includes(String(cert.status||"").toLowerCase()) || !cert.storage_path){
      return response(req,{ok:false,error:"Certificate is not published yet"},404);
    }

    const {data:signed,error:signedError}=await db.storage.from("yyc-certificates").createSignedUrl(cert.storage_path,900);
    if(signedError||!signed?.signedUrl) return response(req,{ok:false,error:"Certificate download is temporarily unavailable"},503);

    return response(req,{
      ok:true,
      certificate:{
        certificate_no:cert.certificate_no,
        certificate_no_display:String(cert.certificate_no).padStart(2,"0"),
        certificate_code:cert.certificate_code,
        recipient_name:cert.recipient_name,
        event_title:cert.event_title,
        event_date:cert.event_date,
        location:cert.location,
        status:cert.status
      },
      download_url:signed.signedUrl
    });
  }catch(error){
    return response(req,{ok:false,error:error instanceof Error?error.message:"Certificate lookup failed"},500);
  }
});