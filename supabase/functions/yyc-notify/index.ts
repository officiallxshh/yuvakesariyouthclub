import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET_KEYS = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); }
  catch { return {}; }
})();
const SUPABASE_KEY = SECRET_KEYS.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{autoRefreshToken:false,persistSession:false} });

function cors(req:Request) {
  const origin=req.headers.get("origin") || "";
  const allowed=[
    "https://www.yuvakesariyouthclub.in",
    "https://yuvakesariyouthclub.in",
    "https://officiallxshh.github.io"
  ];
  const allow=allowed.includes(origin) ? origin : "https://www.yuvakesariyouthclub.in";
  return {
    "content-type":"application/json; charset=utf-8",
    "access-control-allow-origin":allow,
    "vary":"Origin",
    "access-control-allow-headers":"authorization,apikey,content-type,x-yyc-session",
    "access-control-allow-methods":"POST,OPTIONS"
  };
}
function out(req:Request,body:unknown,status=200) {
  return new Response(JSON.stringify(body),{status,headers:cors(req)});
}
function clean(v:unknown,max=2000) {
  return String(v ?? "").trim().slice(0,max);
}
function escHtml(v:unknown) {
  return clean(v,12000).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c] ?? c));
}
function normalizePhone(value:string) {
  let raw=clean(value,40);
  if(!raw) return "";
  let digits=raw.replace(/\D/g,"");
  if(raw.startsWith("+") && digits.length>=8) return "+"+digits;
  if(digits.length===10) return "+91"+digits;
  if(digits.length===11 && digits.startsWith("0")) return "+91"+digits.slice(1);
  if(digits.length===12 && digits.startsWith("91")) return "+"+digits;
  return "";
}
function maskContact(v:string,kind:"email"|"phone") {
  if(kind==="email") {
    const [a,b]=v.split("@");
    if(!a || !b) return "";
    return (a.length<=2?a[0]||"*":a.slice(0,2)+"***")+"@"+b;
  }
  const p=normalizePhone(v);
  return p ? p.slice(0,3)+"****"+p.slice(-2) : "";
}
async function adminOK(token:string) {
  if(!token) return false;
  const {data,error}=await db.rpc("_admin_ok",{p_token:token});
  return !error && data===true;
}
async function memberFromSession(token:string) {
  if(!token) return null;
  const {data:mid,error:midError}=await db.rpc("_member_id",{p_token:token});
  if(midError || !mid) return null;
  const {data,error}=await db.from("members").select("id,name,email,phone,role_number,status,approved").eq("id",mid).maybeSingle();
  if(error || !data || String(data.status||"").toLowerCase()!=="approved") return null;
  return data;
}
async function leaderFromSession(token:string) {
  if(!token) return null;
  const {data:lid,error:lidError}=await db.rpc("_leader_id",{p_token:token});
  if(lidError || !lid) return null;
  const {data,error}=await db.from("leaders").select("id,name,email,phone,role_number,role,status").eq("id",lid).maybeSingle();
  if(error || !data || String(data.status||"active").toLowerCase()==="inactive") return null;
  return data;
}
async function targetById(kind:"member"|"leader",id:string) {
  if(!id) return null;
  if(kind==="member"){
    const {data,error}=await db.from("members").select("id,name,email,phone,role_number,status,approved,dob,position").eq("id",id).maybeSingle();
    if(error || !data || String(data.status||"pending").toLowerCase()!=="approved") return null;
    return data;
  }
  const {data,error}=await db.from("leaders").select("id,name,email,phone,role_number,role,status").eq("id",id).maybeSingle();
  if(error || !data || String(data.status||"active").toLowerCase()==="inactive") return null;
  return data;
}
async function sendEmail(to:string,subject:string,html:string,attachments:any[] = []) {
  const key=Deno.env.get("RESEND_API_KEY") ?? "";
  const from=Deno.env.get("RESEND_FROM_EMAIL") ?? "";
  if(!key || !from) return {status:"skipped",reason:"email provider is not configured"};
  const payload:any={from,to:[to],subject,html};
  if(attachments.length) payload.attachments=attachments;
  const r=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify(payload)
  });
  const text=await r.text();
  if(!r.ok) return {status:"failed",reason:(()=>{try{return JSON.parse(text)?.message || "Email provider rejected the request";}catch{return "Email provider rejected the request";}})()};
  let data:any=null;
  try{data=JSON.parse(text);}catch{}
  return {status:"sent",id:data?.id||null};
}
async function sendWhatsApp(to:string,target:any,title:string,body:string,link:string) {
  const token=Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const graphVersion=Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v26.0";
  const templateName=Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "";
  const templateLanguage=Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en_US";
  const allowText=String(Deno.env.get("WHATSAPP_ALLOW_TEXT") ?? "").toLowerCase()==="true";
  if(!token || !phoneNumberId) return {status:"skipped",reason:"WhatsApp Cloud API is not configured"};
  const recipient=to.replace(/\D/g,"");
  if(!recipient) return {status:"skipped",reason:"No usable WhatsApp number"};

  let payload:any;
  if(templateName){
    payload={
      messaging_product:"whatsapp",
      to:recipient,
      type:"template",
      template:{
        name:templateName,
        language:{code:templateLanguage},
        components:[{
          type:"body",
          parameters:[
            {type:"text",text:clean(target?.name||"YYC Member",120)},
            {type:"text",text:clean(title,160)},
            {type:"text",text:clean(body,900)},
            {type:"text",text:clean(link||"No link",500)}
          ]
        }]
      }
    };
  }else if(allowText){
    payload={
      messaging_product:"whatsapp",
      to:recipient,
      type:"text",
      text:{
        preview_url:false,
        body:clean("YYC · "+title+"\n\n"+body+(link?"\n\n"+link:""),4096)
      }
    };
  }else{
    return {status:"skipped",reason:"WhatsApp template is not configured"};
  }

  const response=await fetch("https://graph.facebook.com/"+encodeURIComponent(graphVersion)+"/"+encodeURIComponent(phoneNumberId)+"/messages",{
    method:"POST",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  const responseText=await response.text();
  if(!response.ok){
    let reason="WhatsApp provider rejected the request";
    try{
      const x=JSON.parse(responseText);
      reason=x?.error?.message||x?.message||reason;
    }catch{}
    return {status:"failed",reason};
  }
  let data:any=null;
  try{data=JSON.parse(responseText);}catch{}
  return {status:"sent",id:data?.messages?.[0]?.id||null};
}

async function sendSms(to:string,body:string) {
  const sid=Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const auth=Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const from=Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
  const messaging=Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? "";
  if(!sid || !auth || (!from && !messaging)) return {status:"skipped",reason:"SMS provider is not configured"};
  const params=new URLSearchParams();
  params.set("To",to);
  params.set("Body",body.slice(0,1500));
  if(messaging) params.set("MessagingServiceSid",messaging);
  else params.set("From",from);
  const basic=btoa(sid+":"+auth);
  const r=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{
    method:"POST",
    headers:{"Authorization":"Basic "+basic,"Content-Type":"application/x-www-form-urlencoded"},
    body:params.toString()
  });
  const text=await r.text();
  if(!r.ok){
    let reason="SMS provider rejected the request";
    try{const x=JSON.parse(text); reason=x?.message||reason;}catch{}
    return {status:"failed",reason};
  }
  let data:any=null;
  try{data=JSON.parse(text);}catch{}
  return {status:"sent",id:data?.sid||null};
}
function emailHtml(target:any,subject:string,body:string,meta:string,link:string) {
  const safeBody=escHtml(body).replace(/\r?\n/g,"<br>");
  const safeMeta=escHtml(meta);
  const safeSubject=escHtml(subject);
  const safeLink=clean(link,500);
  return `<!doctype html><html><body style="margin:0;background:#070b0f;color:#eae3d7;font-family:Arial,sans-serif">
  <div style="max-width:620px;margin:30px auto;padding:28px;background:#0b1117;border:1px solid #2b3135;border-radius:18px">
    <div style="font-size:11px;letter-spacing:.18em;color:#c9a85c;font-weight:700">YUVAKESARI YOUTH CLUB</div>
    <h2 style="margin:12px 0;color:#f1d28e;font-size:25px">${safeSubject}</h2>
    <p style="color:#aab2af;font-size:13px;line-height:1.7">${safeBody}</p>
    <div style="margin-top:18px;padding:12px 14px;background:#11181d;border-radius:12px;color:#8f9995;font-size:11px">${safeMeta}</div>
    ${safeLink?`<p style="margin-top:20px"><a href="${escHtml(safeLink)}" style="color:#f0d28f">Open YYC link ↗</a></p>`:""}
  </div></body></html>`;
}
function approvalEmailHtml(target:any,loginUrl:string,idCardUrl:string,verifyUrl:string) {
  const name=escHtml(target?.name||"YYC Member");
  const role=escHtml(target?.role_number||"YYC MEMBER");
  const position=escHtml(target?.position||"MEMBER");
  const dob=escHtml(target?.dob||"Not provided");
  const safeLogin=escHtml(loginUrl);
  const safeCard=escHtml(idCardUrl);
  const safeVerify=escHtml(verifyUrl);
  const approvedDate=escHtml(new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Kolkata"}));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>YYC Membership Accepted</title>
<style>
  @media only screen and (max-width:680px){
    .email-shell{width:100%!important}
    .email-pad{padding:24px 18px!important}
    .hero-title{font-size:28px!important}
    .cta{display:block!important;width:auto!important;text-align:center!important}
    .cta-cell{display:block!important;padding:0 0 10px!important}
    .detail-value{text-align:left!important;padding-top:2px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#05080b;color:#e9e1d2;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">
    Your YYC membership application has been accepted. Your official member ID and secure portal are ready.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#05080b">
    <tr><td align="center" style="padding:26px 12px">

      <table role="presentation" class="email-shell" width="680" cellpadding="0" cellspacing="0" border="0"
        style="width:680px;max-width:680px;background:#0a1015;border:1px solid #252e33;border-radius:24px;overflow:hidden">

        <!-- Brand header -->
        <tr><td class="email-pad" style="padding:24px 28px;background:#0b1218;border-bottom:1px solid #20292d">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td width="58" valign="middle">
                <img src="https://www.yuvakesariyouthclub.in/assets/yyc-logo-clean.webp"
                     alt="YYC" width="50" height="50"
                     style="display:block;border-radius:14px;border:1px solid #4b4029;background:#080d11">
              </td>
              <td valign="middle" style="padding-left:13px">
                <div style="font-size:11px;font-weight:800;letter-spacing:2.7px;color:#d7b66d">YUVAKESARI YOUTH CLUB</div>
                <div style="margin-top:5px;font-size:11px;letter-spacing:1.1px;color:#7d8986">SUBRAHMANYA · KARNATAKA</div>
              </td>
              <td align="right" valign="middle">
                <span style="display:inline-block;padding:7px 10px;border:1px solid #315641;border-radius:999px;background:#0c1d14;color:#8fd0a7;font-size:9px;font-weight:800;letter-spacing:1.2px">ACTIVE MEMBER</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Main content -->
        <tr><td class="email-pad" style="padding:34px 28px 30px">

          <div style="font-size:10px;font-weight:800;letter-spacing:2px;color:#8fd0a7">MEMBERSHIP APPLICATION · APPROVED</div>
          <h1 class="hero-title" style="margin:12px 0 10px;font-size:34px;line-height:1.12;color:#f0d18a;font-weight:800">Welcome to YYC, ${name}.</h1>
          <p style="margin:0;color:#aab3b0;font-size:14px;line-height:1.75">
            We are pleased to let you know that your membership application has been <strong style="color:#e6decf">officially accepted</strong> by the Yuvakesari Youth Club administration.
          </p>

          <!-- Member ID highlight -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
            <tr><td style="padding:1px">
              <div style="padding:19px 20px;border-radius:18px;background:linear-gradient(135deg,#141d22,#0d1419);border:1px solid #55472b">
                <div style="font-size:9px;font-weight:800;letter-spacing:1.9px;color:#7f8a87">YOUR OFFICIAL YYC MEMBER ID</div>
                <div style="margin-top:8px;font-size:25px;line-height:1.1;font-weight:900;letter-spacing:1.6px;color:#f1cc77">${role}</div>
                <div style="margin-top:7px;font-size:10px;color:#78837f">Keep this ID for future YYC membership verification.</div>
              </div>
            </td></tr>
          </table>

          <!-- Details -->
          <div style="margin-top:18px;padding:18px 20px;background:#0e151b;border:1px solid #222b30;border-radius:18px">
            <div style="font-size:10px;font-weight:800;letter-spacing:1.7px;color:#808b88">MEMBERSHIP DETAILS</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:9px">
              <tr>
                <td class="detail-value" style="padding:7px 0;color:#727d79;font-size:10px;font-weight:700;letter-spacing:.5px">NAME</td>
                <td class="detail-value" align="right" style="padding:7px 0;color:#e7ddca;font-size:12px;font-weight:700">${name}</td>
              </tr>
              <tr>
                <td class="detail-value" style="padding:7px 0;color:#727d79;font-size:10px;font-weight:700;letter-spacing:.5px">POSITION</td>
                <td class="detail-value" align="right" style="padding:7px 0;color:#e7ddca;font-size:12px;font-weight:700">${position}</td>
              </tr>
              <tr>
                <td class="detail-value" style="padding:7px 0;color:#727d79;font-size:10px;font-weight:700;letter-spacing:.5px">DATE OF BIRTH</td>
                <td class="detail-value" align="right" style="padding:7px 0;color:#e7ddca;font-size:12px;font-weight:700">${dob}</td>
              </tr>
              <tr>
                <td class="detail-value" style="padding:7px 0;color:#727d79;font-size:10px;font-weight:700;letter-spacing:.5px">APPROVED ON</td>
                <td class="detail-value" align="right" style="padding:7px 0;color:#e7ddca;font-size:12px;font-weight:700">${approvedDate}</td>
              </tr>
              <tr>
                <td class="detail-value" style="padding:7px 0;color:#727d79;font-size:10px;font-weight:700;letter-spacing:.5px">STATUS</td>
                <td class="detail-value" align="right" style="padding:7px 0;color:#8fd0a7;font-size:12px;font-weight:800">APPROVED · ACTIVE</td>
              </tr>
            </table>
          </div>

          <!-- CTA -->
          <div style="margin-top:26px">
            <div style="font-size:12px;font-weight:800;color:#dfd6c5">Your YYC member access is ready.</div>
            <div style="margin-top:5px;font-size:11px;line-height:1.65;color:#7e8986">Sign in to manage your membership, view notifications and access your digital ID card.</div>
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px">
            <tr>
              <td class="cta-cell" width="50%" style="padding-right:7px">
                <a class="cta" href="${safeLogin}"
                   style="display:block;text-align:center;padding:14px 12px;border-radius:13px;background:#d7b66d;color:#080b0d;text-decoration:none;font-size:10px;font-weight:900;letter-spacing:1.2px">LOGIN TO MEMBER PORTAL →</a>
              </td>
              <td class="cta-cell" width="50%" style="padding-left:7px">
                <a class="cta" href="${safeCard}"
                   style="display:block;text-align:center;padding:14px 12px;border-radius:13px;background:#121b21;border:1px solid #55482d;color:#ead7ae;text-decoration:none;font-size:10px;font-weight:900;letter-spacing:1.1px">LOGIN &amp; DOWNLOAD ID ↘</a>
              </td>
            </tr>
          </table>

          <!-- Verify -->
          <div style="margin-top:15px;text-align:center">
            <a href="${safeVerify}" style="color:#d5b268;text-decoration:none;font-size:10px;font-weight:800;letter-spacing:1px">VIEW / VERIFY OFFICIAL YYC ID ↗</a>
          </div>

          <!-- Next steps -->
          <div style="margin-top:25px;padding:16px 17px;border-radius:15px;background:#0b1217;border:1px solid #202a2f">
            <div style="font-size:10px;font-weight:800;letter-spacing:1.4px;color:#c7a963">WHAT'S NEXT</div>
            <div style="margin-top:10px;font-size:11px;line-height:1.8;color:#818c88">
              <span style="color:#d8c494;font-weight:700">01</span> Log in using your registered email or phone.<br>
              <span style="color:#d8c494;font-weight:700">02</span> Open your digital ID and keep your member ID saved.<br>
              <span style="color:#d8c494;font-weight:700">03</span> Use the official verification link whenever required.
            </div>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td class="email-pad" style="padding:21px 28px 24px;background:#080d11;border-top:1px solid #20292d">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td valign="top">
                <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#c5a763">ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩</div>
                <div style="margin-top:7px;font-size:10px;line-height:1.7;color:#66716f">Official automated membership communication from Yuvakesari Youth Club.</div>
              </td>
              <td align="right" valign="top" style="font-size:9px;line-height:1.7;color:#5c6764">
                YYC<br>SUBRAHMANYA<br>KARNATAKA
              </td>
            </tr>
          </table>
        </td></tr>

      </table>

      <div style="max-width:680px;padding:12px 12px 0;color:#4f5957;font-size:9px;line-height:1.6;text-align:center">
        Please keep your account credentials private. This email contains membership information intended for the registered member.
      </div>

    </td></tr>
  </table>
</body>
</html>`;
}



async function logDelivery(input:any) {
  const {data,error}=await db.from("admin_message_deliveries").insert({
    batch_id:input.batch_id||null,
    recipient_kind:input.recipient_kind,
    recipient_id:input.recipient_id,
    recipient_name:clean(input.recipient_name,180),
    channel:input.channel,
    message_type:input.message_type||"general",
    subject:clean(input.subject,200)||null,
    title:clean(input.title,160),
    body:clean(input.body,2000),
    link:clean(input.link,500)||null,
    status:input.status||"queued",
    provider:input.provider||null,
    provider_message_id:input.provider_message_id||null,
    recipient_address:input.recipient_address||null,
    error_message:clean(input.error_message,1000)||null,
    metadata:input.metadata||{}
  }).select("id").maybeSingle();
  return error ? null : data?.id||null;
}
async function finishDelivery(id:string,status:string,result:any) {
  if(!id) return;
  const patch:any={
    status,
    provider_message_id:result?.id||null,
    error_message:clean(result?.reason,1000)||null
  };
  if(status==="sent"||status==="delivered") patch.sent_at=new Date().toISOString();
  if(status==="delivered") patch.delivered_at=new Date().toISOString();
  await db.from("admin_message_deliveries").update(patch).eq("id",id);
}
async function deliverApproval(target:any,subject:string,body:string,meta:string,loginUrl:string,idCardUrl:string,verifyUrl:string,channels:string[],batchId:string) {
  const requested=new Set((channels||["email","whatsapp"]).filter(x=>x==="email"||x==="whatsapp"));
  const output:any={};
  const tasks:any[]=[];

  if(target?.email && requested.has("email")){
    tasks.push((async()=>{
      const id=await logDelivery({
        batch_id:batchId,
        recipient_kind:"member",
        recipient_id:target.id,
        recipient_name:target.name,
        channel:"email",
        message_type:"membership",
        subject,
        title:subject,
        body,
        link:verifyUrl,
        status:"queued",
        provider:"resend",
        recipient_address:maskContact(String(target.email),"email")
      });
      const result=await sendEmail(
        String(target.email),
        subject,
        approvalEmailHtml(target,loginUrl,idCardUrl,verifyUrl)
      );
      await finishDelivery(id,result.status,result);
      output.email={...result,recipient:maskContact(String(target.email),"email"),delivery_id:id};
    })());
  }else{
    output.email={status:"skipped",reason:target?.email?"channel not selected":"no email on record"};
  }

  const normalized=normalizePhone(String(target?.phone||""));
  if(normalized && requested.has("whatsapp")){
    tasks.push((async()=>{
      const id=await logDelivery({
        batch_id:batchId,
        recipient_kind:"member",
        recipient_id:target.id,
        recipient_name:target.name,
        channel:"whatsapp",
        message_type:"membership",
        subject,
        title:subject,
        body,
        link:verifyUrl,
        status:"queued",
        provider:"meta-whatsapp",
        recipient_address:maskContact(normalized,"phone")
      });
      const result=await sendWhatsApp(normalized,target,subject,body,verifyUrl);
      await finishDelivery(id,result.status,result);
      output.whatsapp={...result,recipient:maskContact(normalized,"phone"),delivery_id:id};
    })());
  }else{
    output.whatsapp={
      status:"skipped",
      reason:normalized?(requested.has("whatsapp")?"":"channel not selected"):"no usable phone on record"
    };
  }

  await Promise.all(tasks);
  const selected=Array.from(requested);
  output.all_selected_sent=selected.length>0 && selected.every(x=>output[x]?.status==="sent");
  output.any_sent=selected.some(x=>output[x]?.status==="sent");
  return output;
}

function isSwachathaCertificateEvent(title:string) {
  const t=clean(title,200).toLowerCase().replace(/[^a-z0-9]/g,"");
  return t.includes("yycswachathaabhiyaan") || t.includes("swachathaabhiyaan") || t.includes("swachhataabhiyaan");
}

function swachathaCertificatePrompt(target:any,eventTitle:string,eventDate:string,location:string) {
  const name=clean(target?.name,160)||"MEMBER NAME";
  const uid=clean(target?.role_number,80)||"YYC ID";
  const role=clean(target?.role||target?.position,120)||(String(target?.kind||"member").toLowerCase()==="leader"?"LEADER":"MEMBER");
  const kind=String(target?.kind||"member").toLowerCase()==="leader" ? "LEADER" : "MEMBER";
  return [
    "Create one official YYC personalized Certificate of Participation using the YYC clean-event certificate reference/design.",
    "",
    "IMPORTANT: This certificate is for one specific YYC recipient. Keep every personalized identity field below EXACTLY as provided. Do not alter, abbreviate, stylize, replace, or invent these values.",
    "",
    "RECIPIENT",
    "Name: "+name,
    "Unique ID: "+uid,
    "Role: "+role,
    "Recipient Type: "+kind,
    "",
    "EVENT",
    "Event Name: YYC SWACHATHA ABHIYAAN",
    "Certificate Type: CERTIFICATE OF PARTICIPATION",
    "Date: 10 October 2026",
    "Day: SATURDAY",
    "Location: KUKKE SUBRAHMANYA",
    "Region: DAKSHINA KANNADA, KARNATAKA",
    "",
    "DESIGN — MATCH THE PROVIDED YYC CLEAN-EVENT CERTIFICATE REFERENCE",
    "• Premium landscape certificate composition.",
    "• Cream/warm-paper background with deep forest-green and warm-gold accents.",
    "• YYC lion emblem/logo at upper left and YUVAKESARI YOUTH CLUB wordmark prominently across the top.",
    "• Show SUBRAHMANYA | KUKKE REGION | KARNATAKA under the main club name.",
    "• Show tm_wxriorz association branding at the upper right.",
    "• Botanical leafy border/corner framing and premium gold ornamental lines.",
    "• Kukke Shri Subrahmanya Temple visual on the left and clean-environment / earth visual on the right.",
    "• Central hierarchy: CERTIFICATE → OF PARTICIPATION → THIS CERTIFICATE IS PROUDLY PRESENTED TO → recipient name.",
    "• Recipient name is the visual focus and uses an elegant handwritten/script style similar to the reference.",
    "• Show the active-participation statement and event name below the recipient name.",
    "• Keep the date/location area with calendar and location icons.",
    "• Reproduce the bottom signature section with these exact names and roles:",
    "  Ashwin Y — PRESIDENT",
    "  Bhavish A T — VICE PRESIDENT",
    "  Lathesh M — CHAIRMAN / DEVELOPER & TECHNICAL TEAM",
    "  Preetham K P — GENERAL SECRETARY",
    "  Lekhan — SECRETARY",
    "  Akash N S — TREASURER",
    "  Puneeth P V — TECHNICAL TEAM",
    "  Sampath B — PHOTOGRAPHY / VIDEOGRAPHY & EDITING TEAM",
    "  Sandesh M T — ASS. EDITING TEAM",
    "• Footer: CLEAN ENVIRONMENT | HEALTHY COMMUNITIES | GREENER TOMORROW.",
    "• Premium, realistic, high-resolution, print-ready and professionally balanced.",
    "",
    "STRICT DATA RULES",
    "1. Do not change the recipient name, unique ID, role, event name, date, day, location, or signature names/roles.",
    "2. Do not add extra people, certificates, QR codes, random IDs, seals, organizations, or logos.",
    "3. Do not change this from a Certificate of Participation.",
    "4. Generate exactly one certificate for the recipient identified above.",
    "",
    "Return the finished certificate as a single clean landscape image suitable for digital sharing and printing."
  ].join("\n");
}

function certificatePromptEmailHtml(target:any,attendanceSubject:string,attendanceBody:string,meta:string,prompt:string) {
  const name=escHtml(target?.name||"YYC Member");
  const safeSubject=escHtml(attendanceSubject);
  const safeBody=escHtml(attendanceBody).replace(/\r?\n/g,"<br>");
  const safeMeta=escHtml(meta);
  const safePrompt=escHtml(prompt);
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"+safeSubject+"</title><style>@media only screen and (max-width:680px){.shell{width:100%!important}.pad{padding:24px 18px!important}}</style></head><body style=\"margin:0;padding:0;background:#05080b;color:#e9e1d2;font-family:Arial,Helvetica,sans-serif\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"background:#05080b\"><tr><td align=\"center\" style=\"padding:24px 10px\"><table role=\"presentation\" class=\"shell\" width=\"680\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:680px;max-width:680px;background:#0a1015;border:1px solid #252e33;border-radius:24px;overflow:hidden\"><tr><td class=\"pad\" style=\"padding:24px 28px;background:#0b1218;border-bottom:1px solid #20292d\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr><td width=\"58\"><img src=\"https://www.yuvakesariyouthclub.in/assets/yyc-logo-clean.webp\" alt=\"YYC\" width=\"50\" height=\"50\" style=\"display:block;border-radius:14px;border:1px solid #4b4029;background:#080d11\"></td><td style=\"padding-left:13px\"><div style=\"font-size:11px;font-weight:800;letter-spacing:2.5px;color:#d7b66d\">YUVAKESARI YOUTH CLUB</div><div style=\"margin-top:5px;font-size:11px;letter-spacing:1.1px;color:#7d8986\">SUBRAHMANYA · KARNATAKA</div></td><td align=\"right\"><span style=\"display:inline-block;padding:7px 10px;border:1px solid #315641;border-radius:999px;background:#0c1d14;color:#8fd0a7;font-size:9px;font-weight:800;letter-spacing:1px\">PRESENT</span></td></tr></table></td></tr><tr><td class=\"pad\" style=\"padding:32px 28px\"><div style=\"font-size:10px;font-weight:800;letter-spacing:2px;color:#8fd0a7\">ATTENDANCE CONFIRMED</div><h1 style=\"margin:12px 0 8px;font-size:30px;line-height:1.15;color:#f0d18a\">Your certificate prompt is ready, "+name+".</h1><p style=\"margin:0;color:#aab3b0;font-size:14px;line-height:1.75\">"+safeBody+"</p><div style=\"margin-top:18px;padding:14px 16px;background:#0e151b;border:1px solid #252e33;border-radius:14px;color:#9da7a4;font-size:11px;line-height:1.7\">"+safeMeta+"</div><div style=\"margin-top:26px;font-size:11px;font-weight:900;letter-spacing:1.6px;color:#c8aa69\">COPY THIS PROMPT INTO CHATGPT</div><div style=\"margin-top:7px;font-size:11px;color:#77817e;line-height:1.6\">This prompt is personalized for your YYC attendance record. Keep the supplied identity and event details unchanged.</div><pre style=\"margin:14px 0 0;padding:18px;white-space:pre-wrap;word-break:break-word;background:#070b0f;border:1px solid #344047;border-radius:16px;color:#e8e0d1;font:12px/1.65 Consolas,Monaco,monospace\">"+safePrompt+"</pre><div style=\"margin-top:18px;padding:15px 16px;background:#111920;border-left:3px solid #c8aa69;border-radius:10px;color:#9aa4a1;font-size:10px;line-height:1.7\">Paste the complete prompt into ChatGPT and use your YYC certificate reference image as the design reference. The identity values above are the official YYC attendance-issued details for this recipient.</div><div style=\"margin-top:24px;text-align:center\"><a href=\"https://www.yuvakesariyouthclub.in/\" style=\"color:#d5b268;text-decoration:none;font-size:10px;font-weight:800;letter-spacing:1px\">OPEN OFFICIAL YYC WEBSITE ↗</a></div></td></tr><tr><td class=\"pad\" style=\"padding:20px 28px 24px;background:#080d11;border-top:1px solid #20292d\"><div style=\"font-size:11px;font-weight:800;letter-spacing:1.2px;color:#c5a763\">ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩</div><div style=\"margin-top:7px;font-size:10px;line-height:1.7;color:#66716f\">Official automated attendance and certificate-prompt communication from Yuvakesari Youth Club.</div></td></tr></table></td></tr></table></body></html>";
}

async function deliver(target:any,subject:string,body:string,meta:string,link:string,channels:string[],messageType="general",batchId:string|null=null,customHtml:string="") {
  const requested=new Set((channels||["email","whatsapp"]).filter(x=>x==="email"||x==="whatsapp"||x==="sms"));
  const output:any={};
  const tasks:any[]=[];

  if(target?.email && requested.has("email")){
    tasks.push((async()=>{
      const id=await logDelivery({
        batch_id:batchId,
        recipient_kind:target.kind||"member",
        recipient_id:target.id,
        recipient_name:target.name,
        channel:"email",
        message_type:messageType,
        subject,
        title:subject,
        body,
        link,
        status:"queued",
        provider:"resend",
        recipient_address:maskContact(String(target.email),"email")
      });
      const result=await sendEmail(String(target.email),subject,customHtml||emailHtml(target,subject,body,meta,link));
      await finishDelivery(id,result.status,result);
      output.email={...result,recipient:maskContact(String(target.email),"email"),delivery_id:id};
    })());
  }else{
    output.email={status:"skipped",reason:target?.email?"channel not selected":"no email on record"};
  }

  const normalized=normalizePhone(String(target?.phone||""));
  if(normalized && requested.has("whatsapp")){
    tasks.push((async()=>{
      const id=await logDelivery({
        batch_id:batchId,
        recipient_kind:target.kind||"member",
        recipient_id:target.id,
        recipient_name:target.name,
        channel:"whatsapp",
        message_type:messageType,
        subject,
        title:subject,
        body,
        link,
        status:"queued",
        provider:"meta-whatsapp",
        recipient_address:maskContact(normalized,"phone")
      });
      const result=await sendWhatsApp(normalized,target,subject,body,link);
      await finishDelivery(id,result.status,result);
      output.whatsapp={...result,recipient:maskContact(normalized,"phone"),delivery_id:id};
    })());
  }else{
    output.whatsapp={
      status:"skipped",
      reason:normalized?(requested.has("whatsapp")?"":"channel not selected"):"no usable phone on record"
    };
  }

  await Promise.all(tasks);
  const selected=Array.from(requested).filter(x=>x==="email"||x==="whatsapp");
  output.all_selected_sent=selected.length>0 && selected.every(x=>output[x]?.status==="sent");
  output.any_sent=selected.some(x=>output[x]?.status==="sent");
  return output;
}
async function insertMemberInApp(adminToken:string,memberId:string,title:string,body:string,type:string,link:string) {
  const {data,error}=await db.rpc("admin_portal",{p_token:adminToken,p_action:"send_notification",p_payload:{member_id:memberId,title,body,type,link}});
  return !error && !!data?.ok;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return out(req,{ok:true});
  if(req.method!=="POST") return out(req,{ok:false,error:"POST required"},405);
  let b:any;
  try{b=await req.json();}catch{return out(req,{ok:false,error:"Invalid JSON"},400);}

  const event=clean(b?.event,30);
  const channels=Array.isArray(b?.channels)?b.channels:["email","sms"];

  try{
    if(event==="config"){
      const adminToken=clean(b?.admin_token,500);
      if(!(await adminOK(adminToken))) return out(req,{ok:false,error:"Unauthorized"},401);
      const emailConfigured=!!(Deno.env.get("RESEND_API_KEY")&&Deno.env.get("RESEND_FROM_EMAIL"));
      const whatsappConfigured=!!(
        Deno.env.get("WHATSAPP_ACCESS_TOKEN") &&
        Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") &&
        (Deno.env.get("WHATSAPP_TEMPLATE_NAME") || String(Deno.env.get("WHATSAPP_ALLOW_TEXT")??"").toLowerCase()==="true")
      );
      return out(req,{
        ok:true,
        email:{configured:emailConfigured},
        whatsapp:{
          configured:whatsappConfigured,
          mode:Deno.env.get("WHATSAPP_TEMPLATE_NAME")?"template":"text-window"
        }
      });
    }

    if(event==="login"){
      const kind=clean(b?.kind,20);
      const token=clean(b?.session_token,500);
      let target:any=null;
      if(kind==="member") target=await memberFromSession(token);
      else if(kind==="leader") target=await leaderFromSession(token);
      else return out(req,{ok:false,error:"Invalid login alert type"},400);
      if(!target) return out(req,{ok:false,error:"Active account session could not be verified"},401);

      const device=clean(b?.device_name,120)||"Unknown device";
      const subject="New YYC login alert";
      const body="A new login to your YYC "+(kind==="leader"?"leader":"member")+" account was detected.";
      const meta=(target.role_number?"Account ID: "+target.role_number+" · ":"")+"Device: "+device+" · "+new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"});
      target.kind=kind;
      const delivery=await deliver(target,subject,body,meta,"",channels,"system",null);
      return out(req,{ok:true,event:"login",delivery});
    }

    if(event==="approval"){
      const adminToken=clean(b?.admin_token,500);
      if(!(await adminOK(adminToken))) return out(req,{ok:false,error:"Unauthorized"},401);
      const kind=clean(b?.target_kind,20);
      const id=clean(b?.target_id,100);
      if(kind!=="member" || !id) return out(req,{ok:false,error:"Approved member target is required"},400);
      const target=await targetById("member",id);
      if(!target) return out(req,{ok:false,error:"Approved member not found"},404);

      const loginUrl="https://www.yuvakesariyouthclub.in/?yyc_access=member-login";
      const idCardUrl="https://www.yuvakesariyouthclub.in/?yyc_access=member-login&yyc_action=id-card";
      const verifyUrl=target.role_number
        ? "https://www.yuvakesariyouthclub.in/verify.html?uid="+encodeURIComponent(String(target.role_number))
        : "https://www.yuvakesariyouthclub.in/";

      const subject="YYC Membership Accepted — Welcome to Yuvakesari Youth Club";
      const body="Your Yuvakesari Youth Club membership application has been accepted.";
      const meta="Membership ID: "+clean((target as any).role_number,80)+" · Position: "+clean((target as any).position,80);

      const inApp=await insertMemberInApp(adminToken,id,"Membership application accepted",body,"membership",idCardUrl);
      target.kind="member";
      const batchId=crypto.randomUUID();
      const approvalDelivery=await deliverApproval(
        target,
        subject,
        body,
        meta,
        loginUrl,
        idCardUrl,
        verifyUrl,
        Array.isArray(b?.channels)?b.channels:["email","whatsapp"],
        batchId
      );

      return out(req,{ok:true,event:"approval",in_app:inApp,delivery:approvalDelivery});
    }

    if(event==="attendance"){
      const adminToken=clean(b?.admin_token,500);
      if(!(await adminOK(adminToken))) return out(req,{ok:false,error:"Unauthorized"},401);
      const kind=clean(b?.target_kind,20), id=clean(b?.target_id,100), eventId=clean(b?.event_id,100);
      if(!["member","leader"].includes(kind) || !id || !eventId) return out(req,{ok:false,error:"Member/leader and event are required"},400);
      const target=await targetById(kind as "member"|"leader",id);
      if(!target) return out(req,{ok:false,error:"Active attendance target not found"},404);
      target.kind=kind;
      const {data:eventRow,error:eventError}=await db.from("events").select("id,title,event_date,location,status").eq("id",eventId).maybeSingle();
      if(eventError || !eventRow) return out(req,{ok:false,error:"Event not found"},404);
      const eventTitle=clean(eventRow.title,180)||"YYC event";
      const eventDate=eventRow.event_date ? new Date(String(eventRow.event_date)+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Kolkata"}) : "Date not specified";
      const location=clean(eventRow.location,180)||"Location not specified";
      const cleanEvent=isSwachathaCertificateEvent(eventTitle);
      const attendanceSubject=cleanEvent
        ? "Attendance confirmed + Certificate Prompt — "+eventTitle
        : "Attendance confirmed — "+eventTitle;
      const attendanceBody="Hello "+clean(target.name,120)+", your attendance has been recorded as PRESENT for the YYC event “"+eventTitle+"”."+
        (cleanEvent ? " Your personalized YYC certificate-generation prompt is included below." : "");
      const attendanceMeta="Event: "+eventTitle+" · Date: "+eventDate+" · Location: "+location+" · Attendance status: PRESENT";
      const certificatePrompt=cleanEvent ? swachathaCertificatePrompt(target,eventTitle,eventDate,location) : "";
      const customHtml=cleanEvent ? certificatePromptEmailHtml(target,attendanceSubject,attendanceBody,attendanceMeta,certificatePrompt) : "";
      const batchId=crypto.randomUUID();
      const attendanceDelivery=await deliver(target,attendanceSubject,attendanceBody,attendanceMeta,"https://www.yuvakesariyouthclub.in/",["email"],"event",batchId,customHtml);
      return out(req,{ok:true,event:"attendance",target_kind:kind,event_id:eventId,certificate_prompt_sent:cleanEvent,delivery:{attendance:attendanceDelivery,total_sent:(attendanceDelivery?.email?.status==="sent"?1:0)}});
    }

    if(event==="notification"){
      const adminToken=clean(b?.admin_token,500);
      if(!(await adminOK(adminToken))) return out(req,{ok:false,error:"Unauthorized"},401);

      const kind=clean(b?.target_kind,20);
      const id=clean(b?.target_id,100);
      const title=clean(b?.title,160);
      const body=clean(b?.body,2000);
      const type=clean(b?.type,30)||"general";
      const link=clean(b?.link,500);
      if(!["member","leader"].includes(kind) || !id || !title) return out(req,{ok:false,error:"Recipient and notification title are required"},400);

      const target=await targetById(kind as "member"|"leader",id);
      if(!target) return out(req,{ok:false,error:"Active recipient not found"},404);
      target.kind=kind;

      let inApp=false;
      if(kind==="member") inApp=await insertMemberInApp(adminToken,id,title,body,type,link);
      const delivery=await deliver(target,"YYC Notification: "+title,body,
        (target.role_number?"Account ID: "+target.role_number+" · ":"")+"Sent by YYC administration · "+new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}),
        link,channels);
      return out(req,{ok:true,event:"notification",target_kind:kind,in_app:inApp,delivery});
    }

    return out(req,{ok:false,error:"Unknown notification event"},400);
  }catch(e){
    return out(req,{ok:false,error:e instanceof Error?e.message:"Notification delivery failed"},500);
  }
});