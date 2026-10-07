import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:fontkit@2.0.4";
import QRCode from "npm:qrcode@1.5.4";

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



const CERTIFICATE_BUCKET="yyc-certificates";
const CERTIFICATE_FONT_URL=Deno.env.get("YYC_KANNADA_FONT_URL") ||
  "https://raw.githubusercontent.com/openmaptiles/fonts/master/noto-sans/NotoSansKannada-Regular.ttf";
const CERTIFICATE_PAGE_BASE="https://www.yuvakesariyouthclub.in/certificate.html";

function bytesToBase64(bytes:Uint8Array) {
  let binary="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}
function certificateDate(value:any) {
  const raw=String(value||"").slice(0,10);
  if(!raw) return "Date not specified";
  const d=new Date(raw+"T00:00:00Z");
  if(Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"});
}
function certificatePageUrl(token:any) {
  return CERTIFICATE_PAGE_BASE+"?token="+encodeURIComponent(String(token||""));
}
function wrapPdfText(text:string,font:any,size:number,maxWidth:number) {
  const words=String(text||"").trim().split(/\s+/).filter(Boolean);
  const lines:string[]=[];
  let line="";
  for(const word of words){
    const candidate=line?line+" "+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=maxWidth) line=candidate;
    else { if(line) lines.push(line); line=word; }
  }
  if(line) lines.push(line);
  return lines;
}
async function fetchPng(url:string){
  const cleanUrl=String(url||"").trim();
  if(!cleanUrl) return null;
  if(!/^https:\/\//i.test(cleanUrl)) return null;
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),8000);
    const response=await fetch(cleanUrl,{signal:controller.signal});
    clearTimeout(timeout);
    if(!response.ok) return null;
    const type=response.headers.get("content-type")||"";
    if(!/^image\/(png|jpeg|jpg|webp)/i.test(type)) return null;
    return new Uint8Array(await response.arrayBuffer());
  }catch(_){ return null; }
}

async function buildCertificatePdf(cert:any) {
  const pdf=await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const page=pdf.addPage([842,595]);
  const W=842,H=595;
  const cream=rgb(0.96,0.94,0.88);
  const forest=rgb(0.07,0.19,0.13);
  const forest2=rgb(0.11,0.28,0.19);
  const gold=rgb(0.72,0.56,0.26);
  const soft=rgb(0.37,0.40,0.37);
  const lightGold=rgb(0.90,0.82,0.61);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  let kannada=regular;

  page.drawRectangle({x:0,y:0,width:W,height:H,color:cream});

  /* AI supplies the visual master artwork. Official variable data is always
     overlaid by this deterministic renderer, never generated as image text. */
  const designBytes=await fetchPng(cert.design_url||"");
  if(designBytes){
    try{
      let designImage;
      const signature=String.fromCharCode(designBytes[0]||0,designBytes[1]||0,designBytes[2]||0,designBytes[3]||0);
      if(signature==="\x89PNG"){
        designImage=await pdf.embedPng(designBytes);
      }else{
        designImage=await pdf.embedJpg(designBytes);
      }
      page.drawImage(designImage,{x:0,y:0,width:W,height:H});
    }catch(_){
      page.drawRectangle({x:0,y:0,width:W,height:H,color:cream});
    }
  }else{
    page.drawRectangle({x:0,y:H-34,width:W,height:34,color:forest});
    page.drawRectangle({x:0,y:0,width:W,height:25,color:forest});
    page.drawRectangle({x:18,y:18,width:W-36,height:H-36,borderColor:gold,borderWidth:2});
    page.drawRectangle({x:27,y:27,width:W-54,height:H-54,borderColor:forest2,borderWidth:1});
    page.drawCircle({x:74,y:H-78,size:28,color:forest2,borderColor:gold,borderWidth:2});
    page.drawText("YYC",{x:53,y:H-84,size:14,font:bold,color:lightGold});
  }

  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7000);
    const response=await fetch(CERTIFICATE_FONT_URL,{signal:controller.signal});
    clearTimeout(timeout);
    if(response.ok) kannada=await pdf.embedFont(new Uint8Array(await response.arrayBuffer()),{subset:true});
  }catch(_){}

  /* Deterministic content layer: exact official text only. */
  page.drawText("YUVAKESARI YOUTH CLUB",{x:112,y:H-77,size:11,font:bold,color:forest});
  page.drawText("SUBRAHMANYA · KARNATAKA",{x:112,y:H-93,size:8,font:regular,color:soft});
  const title="CERTIFICATE OF PARTICIPATION";
  page.drawText(title,{x:(W-bold.widthOfTextAtSize(title,25))/2,y:450,size:25,font:bold,color:forest});
  const slogan="Together For Better Tommorrow";
  page.drawText(slogan,{x:(W-regular.widthOfTextAtSize(slogan,11))/2,y:425,size:11,font:regular,color:gold});
  const intro="This certificate is proudly presented to";
  page.drawText(intro,{x:(W-regular.widthOfTextAtSize(intro,12))/2,y:383,size:12,font:regular,color:soft});

  const recipient=String(cert.recipient_name||"YYC Participant").slice(0,120);
  const nameSize=Math.min(30,Math.max(20,recipient.length<24?30:24));
  page.drawText(recipient,{x:(W-bold.widthOfTextAtSize(recipient,nameSize))/2,y:335,size:nameSize,font:bold,color:forest});

  const sentence="for active participation in “"+String(cert.event_title||"YYC Event").slice(0,180)+"”";
  const lines=wrapPdfText(sentence,regular,13,620);
  lines.forEach((line,index)=>page.drawText(line,{x:(W-regular.widthOfTextAtSize(line,13))/2,y:294-index*18,size:13,font:regular,color:soft}));
  const detail="held on "+certificateDate(cert.event_date)+" at "+String(cert.location||"YYC").slice(0,140)+".";
  page.drawText(detail,{x:(W-regular.widthOfTextAtSize(detail,11))/2,y:260-(lines.length-1)*18,size:11,font:regular,color:soft});
  page.drawLine({start:{x:92,y:218},end:{x:750,y:218},thickness:1,color:rgb(0.80,0.73,0.58)});

  const motto="ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ";
  page.drawText(motto,{x:92,y:173,size:15,font:kannada,color:forest});
  page.drawText("CERTIFICATE NO",{x:92,y:143,size:8,font:bold,color:soft});
  page.drawText(String(cert.certificate_no_display||cert.certificate_no||"01"),{x:92,y:120,size:25,font:bold,color:forest});
  page.drawText(String(cert.certificate_code||"YYC-CERT"),{x:92,y:104,size:8,font:regular,color:soft});

  page.drawLine({start:{x:310,y:142},end:{x:455,y:142},thickness:1,color:soft});
  page.drawText("PRESIDENT",{x:347,y:127,size:8,font:bold,color:forest});
  page.drawLine({start:{x:500,y:142},end:{x:645,y:142},thickness:1,color:soft});
  page.drawText("GENERAL SECRETARY",{x:520,y:127,size:8,font:bold,color:forest});

  const verifyUrl=certificatePageUrl(cert.certificate_token);
  try{
    const qrData=await QRCode.toDataURL(verifyUrl,{errorCorrectionLevel:"M",margin:1,width:150});
    const qrBytes=Uint8Array.from(atob(qrData.split(",")[1]),c=>c.charCodeAt(0));
    const qr=await pdf.embedPng(qrBytes);
    page.drawImage(qr,{x:678,y:72,width:90,height:90});
    page.drawText("SCAN TO VERIFY",{x:679,y:59,size:7,font:bold,color:forest});
  }catch(_){
    page.drawRectangle({x:678,y:72,width:90,height:90,borderColor:gold,borderWidth:1});
    page.drawText("VERIFY",{x:701,y:114,size:11,font:bold,color:forest});
  }
  page.drawText("Official YYC participation certificate · digitally issued",{x:92,y:67,size:7,font:regular,color:soft});
  return await pdf.save();
}

function certificateEmailHtml(target:any,cert:any,publicUrl:string) {
  const name=escHtml(cert.recipient_name||target?.name||"YYC Participant");
  const eventTitle=escHtml(cert.event_title||"YYC Event");
  const date=escHtml(certificateDate(cert.event_date));
  const location=escHtml(cert.location||"YYC");
  const number=escHtml(cert.certificate_no_display||String(cert.certificate_no||"01"));
  const code=escHtml(cert.certificate_code||"YYC-CERT");
  const link=escHtml(publicUrl);
  return `<!doctype html><html><body style="margin:0;background:#05080b;color:#e9e1d2;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:680px;margin:28px auto;padding:1px;background:linear-gradient(135deg,#7b6031,#202b23);border-radius:24px">
    <div style="background:#0a1015;border-radius:23px;overflow:hidden">
      <div style="padding:24px 28px;border-bottom:1px solid #252e33">
        <div style="font-size:11px;letter-spacing:2.4px;font-weight:800;color:#d7b66d">YUVAKESARI YOUTH CLUB</div>
        <div style="margin-top:7px;font-size:10px;letter-spacing:1.4px;color:#77837e">OFFICIAL CERTIFICATE DELIVERY</div>
      </div>
      <div style="padding:32px 28px">
        <div style="display:inline-block;padding:7px 10px;border-radius:999px;background:#0c1d14;border:1px solid #315641;color:#8fd0a7;font-size:9px;font-weight:800;letter-spacing:1px">CERTIFICATE READY</div>
        <h1 style="margin:16px 0 8px;color:#f0d18a;font-size:31px;line-height:1.12">Your certificate is ready, ${name}.</h1>
        <p style="margin:0;color:#aab3b0;font-size:14px;line-height:1.7">Thank you for participating in <strong style="color:#e8dfcf">${eventTitle}</strong>. Your official YYC Certificate of Participation has been generated with a unique certificate number.</p>
        <div style="margin-top:22px;padding:18px 20px;border-radius:17px;background:#10181d;border:1px solid #3c3729">
          <div style="font-size:9px;letter-spacing:1.6px;color:#808b88;font-weight:800">CERTIFICATE NUMBER</div>
          <div style="margin-top:6px;font-size:30px;color:#f1cc77;font-weight:900">${number}</div>
          <div style="margin-top:3px;font-size:10px;color:#727d79">${code}</div>
        </div>
        <div style="margin-top:16px;padding:17px 20px;border-radius:17px;background:#0d151a;border:1px solid #222b30">
          <div style="font-size:10px;font-weight:800;letter-spacing:1.4px;color:#7f8a87">EVENT DETAILS</div>
          <div style="margin-top:10px;color:#e6dece;font-size:13px;line-height:1.85">${eventTitle}<br>${date} · ${location}</div>
        </div>
        <div style="margin-top:22px">
          <a href="${link}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d7b66d;color:#080b0d;text-decoration:none;font-size:10px;font-weight:900;letter-spacing:1px">VIEW / VERIFY CERTIFICATE →</a>
        </div>
        <p style="margin:18px 0 0;color:#75817d;font-size:10px;line-height:1.7">The same certificate PDF is attached to this email. Keep the certificate number for future YYC verification.</p>
        <div style="margin-top:22px;color:#c6a763;font-size:12px;font-weight:800">ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩</div>
      </div>
    </div>
  </div>
  </body></html>`;
}

async function prepareAndSendCertificate(cert:any,batchId:string,target:any = null) {
  const existingStatus=String(cert?.status||"pending").toLowerCase();
  if(existingStatus==="emailed"){
    return {ok:true,already_sent:true,certificate_no:cert.certificate_no,certificate_no_display:cert.certificate_no_display||String(cert.certificate_no),certificate_code:cert.certificate_code,public_url:certificatePageUrl(cert.certificate_token),email:{status:"skipped",reason:"Certificate email already sent"}};
  }

  const publicUrl=certificatePageUrl(cert.certificate_token);
  const storagePath=cert.storage_path || ("certificates/"+String(cert.certificate_code||("YYC-CERT-"+cert.certificate_no))+".pdf");
  let deliveryId:string|null=null;
  try{
    if(!cert.design_url && cert.design_id){
      const {data:design}=await db.from("yyc_certificate_designs").select("public_url").eq("id",cert.design_id).maybeSingle();
      if(design?.public_url) cert={...cert,design_url:design.public_url};
    }
    deliveryId=await logDelivery({
      batch_id:batchId,recipient_kind:cert.recipient_kind,recipient_id:cert.recipient_id,
      recipient_name:cert.recipient_name,channel:"email",message_type:"certificate",
      subject:"Participation Certificate — "+cert.event_title,
      title:"Participation certificate ready",
      body:"Certificate "+String(cert.certificate_no_display||cert.certificate_no)+" for "+String(cert.event_title||"YYC Event"),
      link:publicUrl,status:"queued",provider:"resend",recipient_address:cert.recipient_email
    });
    const pdfBytes=await buildCertificatePdf(cert);
    const {error:uploadError}=await db.storage.from(CERTIFICATE_BUCKET).upload(storagePath,pdfBytes,{
      contentType:"application/pdf",upsert:true,cacheControl:"31536000"
    });
    if(uploadError) throw new Error("Certificate storage failed: "+uploadError.message);

    await db.from("certificates").update({
      status:"generated",storage_path:storagePath,public_url:publicUrl,
      generated_at:new Date().toISOString(),updated_at:new Date().toISOString(),error_message:null
    }).eq("id",cert.certificate_id||cert.id);

    const result=await sendEmail(
      cert.recipient_email,
      "Participation Certificate — "+String(cert.event_title||"YYC Event"),
      certificateEmailHtml(target||{},cert,publicUrl),
      [{filename:String(cert.certificate_code||"YYC-Certificate")+".pdf",content:bytesToBase64(pdfBytes)}]
    );
    await finishDelivery(deliveryId,result.status==="sent"?"sent":result.status==="skipped"?"skipped":"failed",result);

    const finalStatus=result.status==="sent"?"emailed":result.status==="skipped"?"generated":"failed";
    await db.from("certificates").update({
      status:finalStatus,emailed_at:result.status==="sent"?new Date().toISOString():null,
      error_message:result.status==="sent"||result.status==="skipped"?null:clean(result.reason,1000),
      updated_at:new Date().toISOString()
    }).eq("id",cert.certificate_id||cert.id);

    return {
      ok:true,certificate_id:cert.certificate_id||cert.id,certificate_no:cert.certificate_no,
      certificate_no_display:cert.certificate_no_display||String(cert.certificate_no),
      certificate_code:cert.certificate_code,public_url:publicUrl,email:result
    };
  }catch(error){
    const reason=error instanceof Error?error.message:String(error);
    if(deliveryId) await finishDelivery(deliveryId,"failed",{reason});
    await db.from("certificates").update({
      status:"failed",error_message:clean(reason,1000),updated_at:new Date().toISOString()
    }).eq("id",cert.certificate_id||cert.id);
    return {
      ok:false,certificate_id:cert.certificate_id||cert.id,certificate_no:cert.certificate_no,
      certificate_no_display:cert.certificate_no_display||String(cert.certificate_no),
      certificate_code:cert.certificate_code,public_url:publicUrl,email:{status:"failed",reason}
    };
  }
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

async function deliver(target:any,subject:string,body:string,meta:string,link:string,channels:string[],messageType="general",batchId:string|null=null) {
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
      const result=await sendEmail(String(target.email),subject,emailHtml(target,subject,body,meta,link));
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

      const kind=clean(b?.target_kind,20);
      const id=clean(b?.target_id,100);
      const eventId=clean(b?.event_id,100);
      if(!["member","leader"].includes(kind) || !id || !eventId){
        return out(req,{ok:false,error:"Member/leader and event are required"},400);
      }

      const target=await targetById(kind as "member"|"leader",id);
      if(!target) return out(req,{ok:false,error:"Active attendance target not found"},404);
      target.kind=kind;

      const {data:eventRow,error:eventError}=await db.from("events")
        .select("id,title,event_date,location,status").eq("id",eventId).maybeSingle();
      if(eventError || !eventRow) return out(req,{ok:false,error:"Event not found"},404);

      const eventTitle=clean(eventRow.title,180)||"YYC event";
      const eventDate=eventRow.event_date
        ? new Date(String(eventRow.event_date)+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Kolkata"})
        : "Date not specified";
      const location=clean(eventRow.location,180)||"Location not specified";
      const attendanceSubject="Attendance confirmed — "+eventTitle;
      const attendanceBody="Hello "+clean(target.name,120)+", your attendance has been recorded as PRESENT for the YYC event “"+eventTitle+"”.";
      const attendanceMeta="Event: "+eventTitle+" · Date: "+eventDate+" · Location: "+location+" · Attendance status: PRESENT";
      const batchId=crypto.randomUUID();

      const attendanceDelivery=await deliver(target,attendanceSubject,attendanceBody,attendanceMeta,
        "https://www.yuvakesariyouthclub.in/",["email"],"event",batchId);

      const {data:certificate,error:certificateError}=await db.rpc("admin_issue_certificate",{
        p_token:adminToken,p_target_kind:kind,p_target_id:id,p_event_id:eventId
      });

      if(certificateError || !certificate?.ok){
        return out(req,{
          ok:true,event:"attendance",target_kind:kind,event_id:eventId,
          delivery:{
            attendance:attendanceDelivery,
            certificate:{email:{status:"failed",reason:certificateError?.message||certificate?.error||"Certificate could not be issued"}},
            certificate_number:null,
            total_sent:(attendanceDelivery?.email?.status==="sent"?1:0)
          }
        });
      }

      const certificateResult=await prepareAndSendCertificate(certificate,batchId,target);
      return out(req,{
        ok:true,event:"attendance",target_kind:kind,event_id:eventId,
        delivery:{
          attendance:attendanceDelivery,
          certificate:{
            email:certificateResult.email,
            certificate_id:certificateResult.certificate_id||certificate.certificate_id,
            certificate_no:certificateResult.certificate_no||certificate.certificate_no,
            certificate_no_display:certificateResult.certificate_no_display||certificate.certificate_no_display,
            certificate_code:certificateResult.certificate_code||certificate.certificate_code,
            public_url:certificateResult.public_url||certificate.public_url
          },
          total_sent:(attendanceDelivery?.email?.status==="sent"?1:0)+(certificateResult?.email?.status==="sent"?1:0)
        }
      });
    }

    if(event==="certificate_retry"){
      const adminToken=clean(b?.admin_token,500);
      if(!(await adminOK(adminToken))) return out(req,{ok:false,error:"Unauthorized"},401);
      const certificateId=clean(b?.certificate_id,100);
      if(!certificateId) return out(req,{ok:false,error:"Certificate id is required"},400);
      const {data:cert,error:certError}=await db.from("certificates").select("*").eq("id",certificateId).maybeSingle();
      if(certError || !cert) return out(req,{ok:false,error:"Certificate not found"},404);
      const batchId=crypto.randomUUID();
      const result=await prepareAndSendCertificate({...cert,certificate_id:cert.id,certificate_no_display:String(cert.certificate_no)},batchId);
      return out(req,{ok:!!result.ok,event:"certificate_retry",certificate:result},result.ok?200:500);
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