import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const URL=Deno.env.get("SUPABASE_URL")||"";
const SECRET=(()=>{try{return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");}catch{return {};}})();
const KEY=SECRET.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OPENAI_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const IMAGE_MODEL=Deno.env.get("OPENAI_CERTIFICATE_IMAGE_MODEL")||"gpt-image-2";
const ORCHESTRATOR_MODEL=Deno.env.get("OPENAI_CERTIFICATE_ORCHESTRATOR_MODEL")||"gpt-5";
const db=createClient(URL,KEY,{auth:{autoRefreshToken:false,persistSession:false}});

function headers(req:Request){
  const origin=req.headers.get("origin")||"";
  const allowed=["https://www.yuvakesariyouthclub.in","https://yuvakesariyouthclub.in","https://officiallxshh.github.io"];
  return {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":allowed.includes(origin)?origin:"https://www.yuvakesariyouthclub.in",
    "vary":"Origin",
    "access-control-allow-headers":"authorization,apikey,content-type,x-yyc-session",
    "access-control-allow-methods":"POST,OPTIONS"
  };
}
function out(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)});}
function clean(v:unknown,max=2000){return String(v??"").trim().slice(0,max);}
async function adminOK(token:string){
  if(!token)return false;
  const {data,error}=await db.rpc("_admin_ok",{p_token:token});
  return !error&&data===true;
}
function basePrompt(event:any,extra:string){
  return [
    "Create a premium landscape Certificate of Participation master artwork for Yuvakesari Youth Club.",
    "Use the supplied reference image as the strongest visual reference for composition, hierarchy, ornamental framing, typography mood, tropical/coastal Karnataka and Kukke/Subrahmanya atmosphere, cream forest-green gold palette, temple/nature/community imagery, and premium print finish.",
    "The reference may contain old event details and a sample recipient. Treat those as visual reference only.",
    "This output is a reusable BLANK MASTER ARTWORK. Do not render or invent any recipient name, certificate number, certificate ID, event title, event date, location, body paragraph, QR code, or variable membership data.",
    "Keep generous clean areas where official YYC text will later be placed by a deterministic renderer.",
    "Do not add fake QR codes. Do not add random logos. Preserve the visual position and general appearance of the supplied YYC branding/signature areas when possible without changing their identity.",
    "Do not make the final artwork look like a generic stock certificate. Match the supplied reference closely while improving polish, balance, print-readiness and legibility.",
    "Preferred output: 3:2 landscape, 1536x1024, high-detail premium certificate artwork.",
    "Event context for atmosphere only: "+clean(event?.title,"180")+" · "+clean(event?.location,"180"),
    extra ? "Additional art direction: "+clean(extra,1200) : ""
  ].filter(Boolean).join("\\n");
}

async function generateWithOpenAI(prompt:string,reference:string){
  if(!OPENAI_KEY)throw new Error("OPENAI_API_KEY is not configured in Supabase Secrets");

  const input:any[]=[{
    role:"user",
    content:[
      {type:"input_text",text:prompt},
      ...(reference?[{type:"input_image",image_url:reference,detail:"high"}]:[])
    ]
  }];

  const tools:any=[{
    type:"image_generation",
    action:reference?"edit":"generate",
    model:IMAGE_MODEL,
    size:"1536x1024",
    output_format:"png",
    background:"opaque"
  }];

  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+OPENAI_KEY},
    body:JSON.stringify({
      model:ORCHESTRATOR_MODEL,
      input,
      tools,
      tool_choice:{type:"allowed_tools",mode:"required",tools:[{type:"image_generation"}]}
    })
  });
  const text=await response.text();
  if(!response.ok){
    let reason="OpenAI certificate design generation failed";
    try{const x=JSON.parse(text);reason=x?.error?.message||reason;}catch{}
    throw new Error(reason);
  }
  let data:any;
  try{data=JSON.parse(text);}catch{throw new Error("OpenAI returned invalid JSON");}
  const call=(data.output||[]).find((x:any)=>x?.type==="image_generation_call"&&x?.result);
  if(!call?.result)throw new Error("OpenAI completed without a generated certificate image");
  const binary=atob(call.result);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {bytes,usage:data.usage||null};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return out(req,{ok:true});
  if(req.method!=="POST")return out(req,{ok:false,error:"Method not allowed"},405);

  let body:any;
  try{body=await req.json();}catch{return out(req,{ok:false,error:"Invalid JSON"},400);}
  const token=clean(body?.admin_token,500);
  if(!(await adminOK(token)))return out(req,{ok:false,error:"Unauthorized"},401);

  const eventId=clean(body?.event_id,100);
  if(!eventId)return out(req,{ok:false,error:"Event is required"},400);
  const {data:event,error:eventError}=await db.from("events")
    .select("id,title,description,event_date,location,image_url,status").eq("id",eventId).maybeSingle();
  if(eventError||!event)return out(req,{ok:false,error:"Event not found"},404);
  if(String(event.status||"published").toLowerCase()==="cancelled")return out(req,{ok:false,error:"Cannot design a certificate for a cancelled event"},400);

  const referenceUrl=clean(body?.reference_image_url||event.image_url,500);
  const referenceData=clean(body?.reference_image_data,8500000);
  if(referenceData && !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(referenceData))
    return out(req,{ok:false,error:"Reference image data is invalid"},400);
  if(referenceData && referenceData.length>8500000)
    return out(req,{ok:false,error:"Reference image is too large"},400);
  if(!referenceData && referenceUrl && !/^https:\\/\\//i.test(referenceUrl))
    return out(req,{ok:false,error:"Reference image URL must be HTTPS"},400);
  const reference=referenceData||referenceUrl;
  const extra=clean(body?.instructions,1200);
  const prompt=basePrompt(event,extra);

  const {data:latest,error:latestError}=await db.from("yyc_certificate_designs")
    .select("version").eq("event_id",eventId).order("version",{ascending:false}).limit(1).maybeSingle();
  const version=Number(latest?.version||0)+1;
  const designId=crypto.randomUUID();
  const outputPath="certificate-designs/"+eventId+"/v"+version+"-"+designId+".png";

  const inserted=await db.from("yyc_certificate_designs").insert({
    id:designId,event_id:eventId,version,provider:"openai",
    model:IMAGE_MODEL,reference_image_url:referenceData?null:(referenceUrl||null),prompt,
    output_path:outputPath,status:"pending",is_active:false
  });
  if(inserted.error)return out(req,{ok:false,error:"Could not create certificate design job: "+inserted.error.message},500);

  try{
    const generated=await generateWithOpenAI(prompt,reference);
    const {error:uploadError}=await db.storage.from("yyc-media").upload(outputPath,generated.bytes,{
      contentType:"image/png",cacheControl:"31536000",upsert:false
    });
    if(uploadError)throw new Error("Generated design storage failed: "+uploadError.message);

    const {data:pub}=db.storage.from("yyc-media").getPublicUrl(outputPath);
    const publicUrl=pub?.publicUrl||"";
    await db.from("yyc_certificate_designs").update({
      status:"generated",is_active:true,public_url:publicUrl,
      updated_at:new Date().toISOString(),error_message:null,
      metadata:{usage:generated.usage||null}
    }).eq("id",designId);
    await db.from("yyc_certificate_designs").update({is_active:false}).eq("event_id",eventId).neq("id",designId);

    return out(req,{
      ok:true,design:{
        id:designId,event_id:eventId,version,
        provider:"openai",model:IMAGE_MODEL,
        reference_image_url:referenceData?null:(referenceUrl||null),
        public_url:publicUrl,status:"generated",is_active:true
      }
    });
  }catch(error){
    const reason=error instanceof Error?error.message:String(error);
    await db.from("yyc_certificate_designs").update({
      status:"failed",error_message:reason,updated_at:new Date().toISOString()
    }).eq("id",designId);
    return out(req,{ok:false,error:reason,design_id:designId,status:"failed"},500);
  }
});