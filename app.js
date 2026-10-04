'use strict';

var YYC_APP_BUILD='20261004-03';
try{window.__YYC_APP_BUILD=YYC_APP_BUILD;}catch(e){}

var YYC_CONFIG = {
  supabaseUrl: 'https://vrllozfzheikjbhxvpkx.supabase.co',
  supabaseKey: 'sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt'
};

var ADMIN_TOKEN_KEY = 'yyc_admin_session_v1';
var MEMBER_TOKEN_KEY = 'yyc_member_session_v1';
var LEADER_TOKEN_KEY = 'yyc_leader_session_v1';
function yycSafeGet(store,key){
  try{return store.getItem(key)||'';}catch(e){return '';}
}
function yycSafeSet(store,key,value){
  try{store.setItem(key,value);}catch(e){}
}
function yycSafeRemove(store,key){
  try{store.removeItem(key);}catch(e){}
}
var adminToken = yycSafeGet(localStorage,ADMIN_TOKEN_KEY);
var memberToken = yycSafeGet(localStorage,MEMBER_TOKEN_KEY);
var leaderToken = yycSafeGet(localStorage,LEADER_TOKEN_KEY);
var publicData = null;
var adminData = null;
var yycMemberRsvpMap={};
var yycMemberNotificationCache=[];

var $ = function(s){ return document.querySelector(s); };
var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };

/* Export the portal entry points immediately.
   Function declarations are hoisted, so login buttons can use these even if a
   non-essential startup enhancement fails later in this file. */
window.YYC = {
  memberLogin: function(){ return memberLogin(); },
  memberRegister: function(){ return memberRegister(); },
  leaderLogin: function(){ return leaderLogin(); },
  leaderDashboard: function(data){ return leaderDashboard(data); },
  adminLogin: function(){ return adminLogin(); },
  adminPanel: function(tab,forceRefresh){ return adminPanel(tab,forceRefresh); },
  submitUpdate: function(){ return submitUpdate(); },
  submitGallery: function(){ return submitGallery(); }
};

/* Premium membership-card interaction: delegated so member and leader cards both flip reliably. */
document.addEventListener('click',function(e){
  var card=e.target.closest && e.target.closest('.yyc-digital-card');
  if(card) card.classList.toggle('flipped');
});
document.addEventListener('keydown',function(e){
  if((e.key==='Enter'||e.key===' ') && document.activeElement && document.activeElement.classList.contains('yyc-digital-card')){
    document.activeElement.classList.toggle('flipped');
    e.preventDefault();
  }
});

function esc(v){
  return String(v == null ? '' : v).replace(/[&<>'"]/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
  });
}
function toast(msg){
  var t=$('#toast'); if(!t) return;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(window.__yycToast);
  window.__yycToast=setTimeout(function(){t.classList.remove('show');},2600);
}

function yycDeviceLabel(){
  var ua=String(navigator.userAgent||'');
  var platform='';
  try{platform=String(navigator.userAgentData&&navigator.userAgentData.platform||navigator.platform||'');}catch(e){}
  var os='Device';
  if(/Android/i.test(ua)||/Android/i.test(platform)) os='Android';
  else if(/iPhone|iPad|iPod/i.test(ua)) os='iPhone/iPad';
  else if(/Windows/i.test(ua)||/Win/i.test(platform)) os='Windows PC';
  else if(/Mac OS|Macintosh|MacIntel|MacPPC/i.test(ua)||/Mac/i.test(platform)) os='macOS';
  else if(/Linux/i.test(ua)||/Linux/i.test(platform)) os='Linux';
  var browser='Browser';
  if(/Edg\//i.test(ua)) browser='Edge';
  else if(/OPR\//i.test(ua)) browser='Opera';
  else if(/Firefox\//i.test(ua)) browser='Firefox';
  else if(/Chrome\//i.test(ua)) browser='Chrome';
  else if(/Safari\//i.test(ua)) browser='Safari';
  return os+' · '+browser;
}

function yycFormatSessionTime(value){
  if(!value) return '—';
  var d=new Date(value);
  if(isNaN(d)) return '—';
  return d.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function yycSessionSection(kind,sessions){
  var current=(sessions||[]).filter(function(s){return s.current;});
  var rows=(sessions||[]).map(function(s){
    var isCurrent=!!s.current;
    return '<div class="yyc-session-row '+(isCurrent?'is-current':'')+'">'+
      '<div class="yyc-session-device"><span class="yyc-session-icon">'+(isCurrent?'✓':'⌂')+'</span><div><b>'+esc(s.device_name||'Unknown device')+'</b><small>'+(
        isCurrent?'THIS DEVICE · ACTIVE':'LAST ACTIVE · '+esc(yycFormatSessionTime(s.last_seen_at||s.created_at))
      )+'</small></div></div>'+
      '<div class="yyc-session-meta"><span>LOGIN · '+esc(yycFormatSessionTime(s.created_at))+'</span>'+
      (isCurrent?'<span class="yyc-session-current">CURRENT</span>':'<button type="button" class="mini-btn yyc-revoke-session" data-session-kind="'+kind+'" data-session-id="'+esc(s.id)+'">LOG OUT DEVICE</button>')+
      '</div></div>';
  }).join('');
  if(!rows) rows='<div class="yyc-session-empty">No active login sessions found.</div>';
  return '<section class="yyc-session-panel" id="yycSessions-'+kind+'">'+
    '<div class="yyc-session-head"><div><span class="portal-profile-kicker">ACCOUNT SECURITY</span><h3>Logged-in devices</h3><p>Review recent sessions and remotely log out a device you no longer use.</p></div>'+
    '<span class="yyc-session-count">'+esc((sessions||[]).length)+' ACTIVE</span></div>'+
    '<div class="yyc-session-list">'+rows+'</div>'+
    '<div class="yyc-session-note">Device name is a browser-provided label such as Windows PC · Chrome or Android · Chrome. Exact hardware model is not exposed by the browser.</div>'+
  '</section>';
}

async function yycLoadDeviceSessions(kind){
  var token=kind==='member'?memberToken:leaderToken;
  var fn=kind==='member'?'member_sessions_list':'leader_sessions_list';
  var host=$('#yycSessions-'+kind);
  if(!host||!token)return;
  host.querySelector('.yyc-session-list').innerHTML='<div class="yyc-session-empty">Loading logged-in devices…</div>';
  try{
    var r=await rpc(fn,{p_token:token});
    if(!r||!r.ok)throw new Error(r&&r.error||'Could not load active sessions');
    host.outerHTML=yycSessionSection(kind,r.sessions||[]);
    bindDeviceSessionActions(kind);
  }catch(e){
    host.querySelector('.yyc-session-list').innerHTML='<div class="yyc-session-empty">'+esc(e.message||'Could not load active sessions')+'</div>';
  }
}

function bindDeviceSessionActions(kind){
  qa('.yyc-revoke-session[data-session-kind="'+kind+'"]').forEach(function(btn){
    if(btn.getAttribute('data-bound')==='1')return;
    btn.setAttribute('data-bound','1');
    btn.addEventListener('click',async function(){
      var id=btn.getAttribute('data-session-id');
      if(!id)return;
      if(!confirm('Log out this device? It will lose access immediately.'))return;
      btn.disabled=true;btn.textContent='LOGGING OUT…';
      try{
        var token=kind==='member'?memberToken:leaderToken;
        var fn=kind==='member'?'member_session_revoke':'leader_session_revoke';
        var r=await rpc(fn,{p_token:token,p_session_id:id});
        if(!r||!r.ok)throw new Error(r&&r.error||'Could not log out device');
        toast('Device logged out');
        await yycLoadDeviceSessions(kind);
      }catch(e){
        btn.disabled=false;btn.textContent='LOG OUT DEVICE';
        toast(e.message||'Could not log out device');
      }
    });
  });
}

/* Admin data export — CSV only; intentionally excludes passwords, session tokens and raw photo URLs. */
function downloadYYCAdminCSV(filename,headers,rows){
  function csv(v){
    var s=String(v==null?'':v).replace(/\r?\n/g,' ');
    return /[",]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }
  var text=headers.map(csv).join(',')+'\n'+rows.map(function(row){return headers.map(function(h){return csv(row[h]);}).join(',');}).join('\n');
  var blob=new Blob([text],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(function(){URL.revokeObjectURL(url);},1000);
}

function exportYYCMembersCSV(members){
  var headers=['Name','Date of Birth','Phone','Email','Role Number','Club Name','Position','Status','Approved','Created At'];
  var rows=(members||[]).map(function(m){return {
    'Name':m.name,'Date of Birth':m.dob,'Phone':m.phone,'Email':m.email,
    'Role Number':m.role_number,'Club Name':m.club_name,'Position':m.position,
    'Status':m.status,'Approved':m.approved?'Approved':'Pending','Created At':m.created_at
  };});
  downloadYYCAdminCSV('yyc-members-export.csv',headers,rows);
  toast((rows.length||0)+' member record'+(rows.length===1?'':'s')+' exported');
}

function exportYYCLeadersCSV(leaders){
  var headers=['Name','Role Number','Role','Line','Phone','Email','Status','Login Enabled','Created At'];
  var rows=(leaders||[]).map(function(l){return {
    'Name':l.name,'Role Number':l.role_number,'Role':l.role,'Line':l.line,
    'Phone':l.phone,'Email':l.email,'Status':l.status,'Login Enabled':l.login_enabled?'Enabled':'Disabled','Created At':l.created_at
  };});
  downloadYYCAdminCSV('yyc-leaders-export.csv',headers,rows);
  toast((rows.length||0)+' leader record'+(rows.length===1?'':'s')+' exported');
}
function exportYYCReportCSV(cards,approvalRate){
  var rows=(cards||[]).map(function(x){return {'Metric':x[0],'Value':x[1]};});
  rows.push({'Metric':'Member approval rate','Value':String(approvalRate||0)+'%'});
  downloadYYCAdminCSV('yyc-report-'+today()+'.csv',['Metric','Value'],rows);
  toast('YYC report exported');
}

function exportYYCStorageCSV(s){
  var headers=['Record Type','ID','Name','Role Number','Role','Status','Approved','Date of Birth','Phone','Email','Club Name','Title','Message','Caption','Event Date','Location','Description','Image Format','Area','Price','Sizes','Category','Order Link','Created At','Published At'];
  var rows=[];
  (s.members||[]).forEach(function(m){rows.push({'Record Type':'Member','ID':m.id,'Name':m.name,'Role Number':m.role_number,'Status':m.status,'Approved':m.approved?'Approved':'Pending','Date of Birth':m.dob,'Phone':m.phone,'Email':m.email,'Club Name':m.club_name,'Role':m.position,'Created At':m.created_at});});
  (s.leaders||[]).forEach(function(l){rows.push({'Record Type':'Leader','ID':l.id,'Name':l.name,'Role':l.role,'Status':l.status,'Phone':l.phone,'Email':l.email,'Created At':l.created_at});});
  (s.announcements||[]).forEach(function(x){rows.push({'Record Type':'Announcement','ID':x.id,'Title':x.title,'Message':x.body,'Image Format':x.image_format,'Status':x.status,'Published At':x.published_at,'Created At':x.created_at});});
  (s.gallery||[]).forEach(function(x){rows.push({'Record Type':'Gallery','ID':x.id,'Title':x.title,'Caption':x.caption,'Image Format':x.image_format,'Status':x.status,'Created At':x.created_at});});
  (s.events||[]).forEach(function(x){rows.push({'Record Type':'Event','ID':x.id,'Title':x.title,'Event Date':x.event_date,'Location':x.location,'Description':x.description,'Image Format':x.image_format,'Status':x.status,'Created At':x.created_at});});
  (s.volunteers||[]).forEach(function(x){rows.push({'Record Type':'Volunteer','ID':x.id,'Name':x.name,'Area':x.area,'Approved':x.approved?'Approved':'Pending','Created At':x.created_at});});
  (s.swags||[]).forEach(function(x){rows.push({'Record Type':'Swag','ID':x.id,'Title':x.title,'Category':x.category,'Price':x.price,'Sizes':x.sizes,'Description':x.description,'Status':x.status,'Order Link':x.order_url,'Created At':x.created_at});});
  downloadYYCAdminCSV('yyc-data-export.csv',headers,rows);
  toast((rows.length||0)+' records exported');
}

function openModal(html){
  var modal=$('#modal');
  var content=$('#modalContent');
  if(!modal||!content) return;
  if(window.__yycModalCloseTimer){clearTimeout(window.__yycModalCloseTimer);window.__yycModalCloseTimer=null;}
  content.classList.remove('yyc-panel-swap-in','yyc-panel-swap-out');
  modal.classList.remove('yyc-modal-closing');
  content.innerHTML=html;
  void content.offsetWidth;
  content.classList.add('yyc-panel-swap-in');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  window.setTimeout(function(){content.classList.remove('yyc-panel-swap-in');},520);
}
function closeModal(){
  var modal=$('#modal');
  var content=$('#modalContent');
  if(!modal) return;
  /* Closing a modal never logs out any account. Session state changes only via explicit Logout. */
  modal.classList.add('yyc-modal-closing');
  if(content){
    content.classList.remove('yyc-panel-swap-in');
    content.classList.add('yyc-panel-swap-out');
  }
  if(window.__yycModalCloseTimer) clearTimeout(window.__yycModalCloseTimer);
  window.__yycModalCloseTimer=window.setTimeout(function(){
    modal.classList.remove('open','yyc-modal-closing');
    if(content) content.classList.remove('yyc-panel-swap-out');
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    if(window.__yycDeepLinkKey){
      var u=new URL(window.location.href);
      u.search='';
      history.replaceState(null,'',u.pathname+u.hash);
      window.__yycDeepLinkKey=null;
    }
    window.__yycGalleryIndex=null;
    window.__yycModalCloseTimer=null;
  },240);
}
/* Login-panel X button: closes only the current login modal. */
document.addEventListener('click',function(e){
  var close=e.target&&e.target.closest?e.target.closest('[data-access-close]'):null;
  if(!close)return;
  e.preventDefault();
  e.stopPropagation();
  closeModal();
},true);

function today(){ return new Date().toISOString().slice(0,10); }
function fmtDate(v){
  if(!v) return '';
  var d=new Date(v+'T00:00:00');
  return isNaN(d) ? v : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
function yycLocalDateTime(value){
  if(!value) return '';
  var d=new Date(value);
  if(isNaN(d)) return '';
  function p(n){return String(n).padStart(2,'0');}
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
}
function yycPublishAtIso(value){
  if(!value) return '';
  var d=new Date(value);
  return isNaN(d)?'':d.toISOString();
}
function yycImageFormatMeta(value){
  var key=String(value||'original').toLowerCase().trim();
  var map={
    original:{key:'original',label:'ORIGINAL / AUTO',ratio:'auto'},
    a4:{key:'a4',label:'A4 PORTRAIT',ratio:'1 / 1.4142'},
    a3:{key:'a3',label:'A3 PORTRAIT',ratio:'1 / 1.4142'},
    a2:{key:'a2',label:'A2 PORTRAIT',ratio:'1 / 1.4142'},
    a1:{key:'a1',label:'A1 PORTRAIT',ratio:'1 / 1.4142'},
    'a4-landscape':{key:'a4-landscape',label:'A4 LANDSCAPE',ratio:'1.4142 / 1'},
    'a3-landscape':{key:'a3-landscape',label:'A3 LANDSCAPE',ratio:'1.4142 / 1'},
    'a2-landscape':{key:'a2-landscape',label:'A2 LANDSCAPE',ratio:'1.4142 / 1'},
    'a1-landscape':{key:'a1-landscape',label:'A1 LANDSCAPE',ratio:'1.4142 / 1'},
    banner:{key:'banner',label:'BANNER · 3:1',ratio:'3 / 1'},
    wide:{key:'wide',label:'WIDE · 16:9',ratio:'16 / 9'},
    square:{key:'square',label:'SQUARE · 1:1',ratio:'1 / 1'},
    'portrait-4-5':{key:'portrait-4-5',label:'PORTRAIT · 4:5',ratio:'4 / 5'},
    'story-9-16':{key:'story-9-16',label:'STORY · 9:16',ratio:'9 / 16'}
  };
  return map[key]||map.original;
}
function yycImageFormatOptions(selected){
  var current=yycImageFormatMeta(selected).key;
  var order=['original','a4','a3','a2','a1','a4-landscape','a3-landscape','a2-landscape','a1-landscape','banner','wide','square','portrait-4-5','story-9-16'];
  return order.map(function(key){
    var m=yycImageFormatMeta(key);
    return '<option value="'+m.key+'" '+(m.key===current?'selected':'')+'>'+m.label+'</option>';
  }).join('');
}
function yycApplyMediaPreview(id,format){
  var el=$(id);
  if(!el) return;
  var m=yycImageFormatMeta(format);
  el.setAttribute('data-yyc-format',m.key);
  el.style.setProperty('--yyc-media-ratio',m.ratio);
}
function yycMediaFrame(format,inner){
  var m=yycImageFormatMeta(format);
  var style=m.ratio==='auto'?'':' style="--yyc-media-ratio:'+m.ratio+'"';
  return '<div class="yyc-media-frame" data-yyc-format="'+m.key+'"'+style+'>'+inner+'</div>';
}

async function rpc(name,args,options){
  options=options||{};
  var payload=args || {};
  var endpoint=YYC_CONFIG.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+encodeURIComponent(name);
  var timeoutMs=Math.max(8000,Number(options.timeoutMs)||30000);
  var retries=Math.max(0,Math.min(2,Number(options.retries)||0));
  var attempt=0;
  while(true){
    var controller=window.AbortController?new AbortController():null;
    var timer=window.setTimeout(function(){if(controller)controller.abort();},timeoutMs);
    try{
      var res=await fetch(endpoint,{
        method:'POST',
        cache:'no-store',
        credentials:'omit',
        headers:{
          'apikey':YYC_CONFIG.supabaseKey,
          'Content-Type':'application/json',
          'Accept':'application/json',
          'Cache-Control':'no-cache, no-store, max-age=0',
          'Pragma':'no-cache'
        },
        body:JSON.stringify(payload),
        signal:controller?controller.signal:undefined
      });
      var responseText=await res.text();
      var data=null;
      try{data=responseText?JSON.parse(responseText):null;}catch(parseErr){data=null;}
      if(!res.ok){
        var msg=(data&&(data.message||data.error||data.hint||data.details))||('Supabase request failed ('+res.status+')');
        throw new Error(String(msg));
      }
      return data;
    }catch(err){
      var transient=!!err && (err.name==='AbortError' || err.name==='TypeError');
      if(transient && attempt<retries){
        attempt++;
        await new Promise(function(resolve){window.setTimeout(resolve,750*attempt);});
        continue;
      }
      if(err&&err.name==='AbortError') throw new Error('YYC server timed out. Please try again.');
      if(err&&err.name==='TypeError') throw new Error('Could not reach the YYC server. Please check your internet connection and try again.');
      throw err;
    }finally{
      window.clearTimeout(timer);
    }
  }
}
function setLoginStatus(formId,msg,isError){
  var form=$('#'+formId);
  if(!form) return;
  var status=form.querySelector('.access-login-status');
  if(!status) return;
  status.textContent=msg||'';
  status.classList.toggle('is-error',!!isError);
  status.classList.toggle('is-success',!!msg&&!isError);
}
function loadScript(src){return new Promise(function(resolve,reject){if(document.querySelector('script[data-yyc-src="'+src+'"]')){var existing=document.querySelector('script[data-yyc-src="'+src+'"]');if(existing.dataset.loaded==='1')return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}var s=document.createElement('script');s.src=src;s.async=true;s.dataset.yycSrc=src;s.onload=function(){s.dataset.loaded='1';resolve();};s.onerror=reject;document.head.appendChild(s);});}
function yycEnhanceLogin(formId,passwordId){
  var form=$('#'+formId), pass=$('#'+passwordId);
  if(!form||!pass) return;
  var wrap=pass.closest('.access-password-field');
  var toggle=wrap&&wrap.querySelector('.access-password-toggle');
  if(toggle){
    toggle.addEventListener('click',function(){
      var showing=pass.type==='text';
      pass.type=showing?'password':'text';
      toggle.textContent=showing?'SHOW':'HIDE';
      toggle.setAttribute('aria-label',showing?'Show password':'Hide password');
    });
  }
  form.addEventListener('submit',function(){
    var btn=form.querySelector('button[type="submit"]');
    if(!btn||btn.dataset.busy==='1') return;
    btn.dataset.busy='1';
    btn.disabled=true;
    btn.classList.add('is-loading');
    btn.dataset.originalText=btn.textContent;
    btn.textContent='CHECKING…';
  });
}


async function uploadYYCImage(dataUrl,type,token,recordId,oldUrl){
  if(!dataUrl || !String(dataUrl).startsWith('data:image/')) return dataUrl || '';
  var headers={'Content-Type':'application/json','apikey':YYC_CONFIG.supabaseKey};
  if(token) headers['x-yyc-session']=token;
  var response=await fetch(YYC_CONFIG.supabaseUrl+'/functions/v1/yyc-image-upload',{
    method:'POST',
    headers:headers,
    body:JSON.stringify({
      type:type,
      token:token||'',
      data_url:dataUrl,
      record_id:recordId||'',
      old_url:oldUrl||''
    })
  });
  var result;
  try{result=await response.json();}catch(e){throw new Error('Image storage service returned an invalid response');}
  if(!response.ok || !result.ok) throw new Error(result.error||'Could not store image');
  return result.public_url;
}

function readFile(file,maxSide){
  return new Promise(function(resolve,reject){
    if(!file){resolve('');return;}
    if(file.size>6*1024*1024){reject(new Error('Image is too large. Maximum upload size is 6 MB.'));return;}
    var r=new FileReader();
    r.onload=function(){
      var img=new Image();
      img.onload=function(){
        var scale=Math.min(1,maxSide/Math.max(img.width,img.height));
        var c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(img.width*scale));
        c.height=Math.max(1,Math.round(img.height*scale));
        var ctx=c.getContext('2d');
        ctx.drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL('image/jpeg',0.76));
      };
      img.onerror=reject;
      img.src=r.result;
    };
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}
function yycManualSquareCrop(dataUrl,scale,x,y,maxSide){
  return new Promise(function(resolve,reject){
    if(!dataUrl || !String(dataUrl).startsWith('data:image/')){resolve(dataUrl||'');return;}
    var img=new Image();
    img.onload=function(){
      try{
        var w=img.naturalWidth||img.width||1;
        var h=img.naturalHeight||img.height||1;
        var zoom=Math.max(1,Math.min(2.4,Number(scale)||1));
        var cropSide=Math.min(w,h)/zoom;
        var maxX=Math.max(0,w-cropSide);
        var maxY=Math.max(0,h-cropSide);
        var xv=Number(x), yv=Number(y);
        if(!isFinite(xv)) xv=50;
        if(!isFinite(yv)) yv=50;
        xv=Math.max(0,Math.min(100,xv));
        yv=Math.max(0,Math.min(100,yv));
        var sx=maxX*(xv/100);
        var sy=maxY*(yv/100);
        var outSide=Math.max(1,Math.min(maxSide||760,Math.round(cropSide)));
        var canvas=document.createElement('canvas');
        canvas.width=outSide;
        canvas.height=outSide;
        var ctx=canvas.getContext('2d');
        if(!ctx) throw new Error('Crop engine did not initialize');
        ctx.imageSmoothingEnabled=true;
        ctx.imageSmoothingQuality='high';
        ctx.drawImage(img,sx,sy,cropSide,cropSide,0,0,outSide,outSide);
        resolve(canvas.toDataURL('image/jpeg',0.90));
      }catch(err){reject(err);}
    };
    img.onerror=function(){reject(new Error('Could not prepare the photo for cropping'));};
    img.src=dataUrl;
  });
}
function imageEditor(id,photo,scale,x,y){
  var z=(scale||1).toFixed(2);
  return '<div class="yyc-photo-editor ig-photo-editor">'+
    '<div class="ig-editor-head">'+
      '<div><span class="ig-editor-kicker">PHOTO UPLOAD</span><h3>Choose your photo first</h3><p>Your full photo is shown first. Cropping starts only after you press Adjust Crop.</p></div>'+
      '<span class="ig-editor-badge">NO AUTO CROP</span>'+
    '</div>'+
    '<div class="ig-full-photo-box" id="'+id+'FullBox">'+
      '<img id="'+id+'FullPreview" src="'+esc(photo || 'assets/yyc-logo-clean.webp')+'" alt="Full photo preview">'+
      '<div class="ig-full-photo-label">FULL PHOTO · NO CROP APPLIED</div>'+
    '</div>'+
    '<button type="button" class="ig-adjust-crop-btn" id="'+id+'AdjustCrop">ADJUST CROP <span>→</span></button>'+
    '<div class="ig-crop-editor" id="'+id+'CropEditor" hidden>'+
      '<div class="ig-crop-editor-head"><span>MANUAL SQUARE CROP</span><small>Drag and zoom to choose the exact framing.</small></div>'+
      '<div class="ig-editor-body">'+
        '<div class="ig-preview-wrap">'+
          '<div class="yyc-photo-preview ig-photo-preview" id="'+id+'Stage" tabindex="0" aria-label="Square manual crop area">'+
            '<div class="ig-preview-topline"><span>LIVE CROP</span><b>1:1</b></div>'+
            '<div class="ig-crop-grid"></div>'+
            '<img id="'+id+'Preview" src="'+esc(photo || 'assets/yyc-logo-clean.webp')+'" alt="Manual crop preview">'+
            '<span class="ig-center-mark"></span>'+
            '<div class="ig-preview-bottom"><span>DRAG TO CROP</span><span>SCROLL TO ZOOM</span></div>'+
          '</div>'+
        '</div>'+
        '<aside class="ig-adjust-panel">'+
          '<div class="ig-adjust-block">'+
            '<div class="ig-block-label"><span>ZOOM</span><output id="'+id+'ScaleOut">'+z+'×</output></div>'+
            '<div class="ig-range-shell"><span>1×</span><input class="ig-zoom-range" id="'+id+'Scale" type="range" min="1" max="2.4" step="0.01" value="'+(scale||1)+'" aria-label="Zoom"><span>2.4×</span></div>'+
          '</div>'+
          '<div class="ig-adjust-divider"></div>'+
          '<div class="ig-adjust-block ig-position-status">'+
            '<div class="ig-block-label"><span>POSITION</span><small>Drag inside crop frame</small></div>'+
            '<div class="ig-position-readout"><span>X <b id="'+id+'XOut">'+Math.round(x==null?50:x)+'%</b></span><span>Y <b id="'+id+'YOut">'+Math.round(y==null?50:y)+'%</b></span></div>'+
          '</div>'+
          '<div class="ig-adjust-actions">'+
            '<button type="button" class="ig-secondary-btn" id="'+id+'Center"><span>◎</span> CENTER</button>'+
            '<button type="button" class="ig-reset-btn" id="'+id+'Reset"><span>↺</span> RESET</button>'+
          '</div>'+
        '</aside>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function wireEditor(id,obj,fileInput){
  var stage=$('#'+id+'Stage'), img=$('#'+id+'Preview'), zoom=$('#'+id+'Scale');
  var fullBox=$('#'+id+'FullBox'), fullImg=$('#'+id+'FullPreview');
  var cropEditor=$('#'+id+'CropEditor'), adjust=$('#'+id+'AdjustCrop');

  function draw(){
    if(!stage||!zoom) return;
    obj.scale=Number(zoom.value);
    obj.x=Math.max(0,Math.min(100,obj.x==null?50:Number(obj.x)));
    obj.y=Math.max(0,Math.min(100,obj.y==null?50:Number(obj.y)));
    var rect=stage.getBoundingClientRect();
    var w=rect.width||320, h=rect.height||320;
    var maxPanX=w*0.32*obj.scale, maxPanY=h*0.32*obj.scale;
    var tx=((obj.x-50)/50)*maxPanX, ty=((obj.y-50)/50)*maxPanY;
    img.style.transform='translate3d('+tx.toFixed(2)+'px,'+ty.toFixed(2)+'px,0) scale('+obj.scale+')';
    img.style.objectPosition='50% 50%';
    $('#'+id+'ScaleOut').textContent=obj.scale.toFixed(2)+'×';
    $('#'+id+'XOut').textContent=Math.round(obj.x)+'%';
    $('#'+id+'YOut').textContent=Math.round(obj.y)+'%';
  }

  function openCrop(){
    cropEditor.hidden=false;
    fullBox.hidden=true;
    adjust.hidden=true;
    img.src=obj.photo||'assets/yyc-logo-clean.webp';
    draw();
  }

  adjust.addEventListener('click',openCrop);
  zoom.addEventListener('input',draw);

  var drag={on:false,x:0,y:0,ox:50,oy:50};
  function pointerDown(e){
    if(e.button!==undefined && e.button!==0) return;
    drag.on=true; drag.x=e.clientX; drag.y=e.clientY;
    drag.ox=obj.x==null?50:Number(obj.x); drag.oy=obj.y==null?50:Number(obj.y);
    stage.classList.add('is-dragging');
    if(stage.setPointerCapture&&e.pointerId!=null) stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function pointerMove(e){
    if(!drag.on) return;
    var rect=stage.getBoundingClientRect();
    var sensitivity=100/Math.max(120,Math.min(rect.width,rect.height));
    var zoomFactor=Math.max(1,Number(obj.scale)||1);
    obj.x=Math.max(0,Math.min(100,drag.ox+(e.clientX-drag.x)*sensitivity/zoomFactor*1.35));
    obj.y=Math.max(0,Math.min(100,drag.oy+(e.clientY-drag.y)*sensitivity/zoomFactor*1.35));
    draw();
    e.preventDefault();
  }
  function pointerUp(e){
    drag.on=false;
    stage.classList.remove('is-dragging');
    if(stage.releasePointerCapture&&e.pointerId!=null){try{stage.releasePointerCapture(e.pointerId)}catch(err){}}
  }
  stage.addEventListener('pointerdown',pointerDown);
  stage.addEventListener('pointermove',pointerMove);
  stage.addEventListener('pointerup',pointerUp);
  stage.addEventListener('pointercancel',pointerUp);
  stage.addEventListener('wheel',function(e){
    if(!cropEditor||cropEditor.hidden) return;
    e.preventDefault();
    zoom.value=Math.max(1,Math.min(2.4,Number(zoom.value)+(e.deltaY<0?0.05:-0.05)));
    draw();
  },{passive:false});

  function resetPhoto(){obj.scale=1;obj.x=50;obj.y=50;zoom.value='1';draw();}
  function centerPhoto(){obj.x=50;obj.y=50;draw();}
  $('#'+id+'Reset').addEventListener('click',resetPhoto);
  $('#'+id+'Center').addEventListener('click',centerPhoto);

  $('#'+fileInput).addEventListener('change',async function(){
    try{
      var file=this.files&&this.files[0];
      if(!file) return;
      var d=await readFile(file,760);
      if(!d) return;
      obj.photo=d;
      obj.scale=1; obj.x=50; obj.y=50;
      zoom.value='1';
      fullImg.src=d;
      img.src=d;
      fullBox.hidden=false;
      cropEditor.hidden=true;
      adjust.hidden=false;
      img.style.transform='none';
    }catch(err){toast('Could not load this photo');}
  });

  if(fullImg&&obj.photo) fullImg.src=obj.photo;
  fullBox.hidden=false;
  cropEditor.hidden=true;
  adjust.hidden=false;
  draw();
}
/* ===== YYC MOTION SYSTEM — SMOOTH, NO-LAYOUT-SHIFT ===== */
function yycAnimateNavigation(targetEl){
  var heroPhoto=$('.hero-photo');
  var hero=$('.hero');
  if(heroPhoto){
    var dirY=targetEl ? (targetEl.getBoundingClientRect().top < (hero ? hero.clientHeight/2 : window.innerHeight/2) ? -1 : 1) : 1;
    var dirX=targetEl ? ((targetEl.offsetTop||0)%2===0 ? 1 : -1) : 1;
    heroPhoto.style.setProperty('--yyc-pan-x',(dirX*1.7).toFixed(2)+'%');
    heroPhoto.style.setProperty('--yyc-pan-y',(dirY*1.15).toFixed(2)+'%');
    heroPhoto.classList.remove('yyc-bg-navigate');
    void heroPhoto.offsetWidth;
    heroPhoto.classList.add('yyc-bg-navigate');
  }

  /* Never translate a full section while navigating: that creates a temporary gap above it. */
  if(targetEl){
    targetEl.classList.remove('yyc-section-navigate');
    void targetEl.offsetWidth;
    targetEl.classList.add('yyc-section-navigate');
    window.setTimeout(function(){targetEl.classList.remove('yyc-section-navigate');},760);
  }
}

function bindMotionSystem(){
  if(window.__yycMotionBound) return;
  window.__yycMotionBound=true;

  document.addEventListener('click',function(e){
    var btn=e.target && e.target.closest ? e.target.closest('button,.btn,.link-btn,.nav-link,.mobile-panel a,.culture-orb,.scroll-cue') : null;
    if(!btn) return;

    if(btn.tagName==='A'){
      var href=btn.getAttribute('href')||'';
      if(href.charAt(0)==='#'){
        var target=$(href);
        yycAnimateNavigation(target);
      }
    }

    btn.classList.remove('yyc-click-flash');
    void btn.offsetWidth;
    btn.classList.add('yyc-click-flash');
    setTimeout(function(){btn.classList.remove('yyc-click-flash');},260);
  },false);

  document.addEventListener('click',function(e){
    var tab=e.target && e.target.closest ? e.target.closest('.admin-tab') : null;
    if(!tab) return;
    var tabs=Array.prototype.slice.call(document.querySelectorAll('.admin-tab'));
    var current=tabs.indexOf(tab);
    var previous=window.__yycLastAdminTabIndex;
    var direction=(previous==null || current<0 || previous===current)?'forward':(current>previous?'forward':'back');
    window.__yycLastAdminTabIndex=current;
    setTimeout(function(){
      var workspace=$('#adminWorkspace');
      if(!workspace) return;
      workspace.classList.remove('yyc-admin-tab-enter','yyc-admin-tab-forward','yyc-admin-tab-back');
      workspace.classList.add(direction==='back'?'yyc-admin-tab-back':'yyc-admin-tab-forward','yyc-admin-tab-enter');
    },30);
  },false);
}
/* ===== YYC PREMIUM SCROLL REVEAL + SOFT PARALLAX ===== */
var yycRevealObserver=null;
var yycParallaxBound=false;

function bindYYCScrollMotion(){
  if(window.__yycScrollMotionBound) return;
  window.__yycScrollMotionBound=true;

  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(!reduce && 'IntersectionObserver' in window){
    yycRevealObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('visible');
          yycRevealObserver.unobserve(entry.target);
        }
      });
    },{root:null,rootMargin:'0px 0px -8% 0px',threshold:.10});
  }

  function observeReveals(root){
    root=root||document;
    var items=root.querySelectorAll('.reveal:not(.visible)');
    Array.prototype.forEach.call(items,function(el,index){
      if(index<6) el.style.setProperty('--yyc-stagger-delay',(index*70)+'ms');
      if(yycRevealObserver) yycRevealObserver.observe(el);
      else el.classList.add('visible');
    });
  }

  function updateParallax(){
    if(reduce) return;
    var img=document.querySelector('.glimpse-feature img');
    if(!img) return;
    var rect=img.parentElement.getBoundingClientRect();
    var vh=window.innerHeight||1;
    if(rect.bottom<0 || rect.top>vh) return;
    var center=rect.top+rect.height/2;
    var offset=((center-vh/2)/vh)*-18;
    img.style.setProperty('--yyc-parallax-y',offset.toFixed(2)+'px');
  }

  if(!reduce && !yycParallaxBound){
    yycParallaxBound=true;
    var ticking=false;
    window.addEventListener('scroll',function(){
      if(ticking) return;
      ticking=true;
      requestAnimationFrame(function(){ticking=false;updateParallax();});
    },{passive:true});
    window.addEventListener('resize',updateParallax,{passive:true});
    updateParallax();
  }

  window.YYCObserveReveals=observeReveals;
  observeReveals(document);
}
function yycHttpUrl(value,fallback){
  var v=String(value||'').trim();
  return /^https?:\/\//i.test(v) ? v : (fallback||'');
}
function yycPrice(value){
  if(value===null||value===undefined||value==='') return '';
  var n=Number(value);
  if(!isFinite(n)) return '';
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
}
function yycProfilePhotoStyle(data){
  var scale=Number(data&&data.photo_scale);
  var xv=Number(data&&data.photo_pos_x), yv=Number(data&&data.photo_pos_y);
  if(!isFinite(scale)) scale=1;
  if(!isFinite(xv)) xv=50;
  if(!isFinite(yv)) yv=50;
  scale=Math.max(1,Math.min(2.4,scale));
  xv=Math.max(0,Math.min(100,xv));
  yv=Math.max(0,Math.min(100,yv));
  return 'style="object-position:'+xv+'% '+yv+'%;transform:scale('+scale.toFixed(3)+');transform-origin:center center"';
}
function socialHTML(){
  var s=(publicData && publicData.settings) || {};
  var arr=[];
  if(s.whatsapp) arr.push('<a class="social-link" href="'+esc(s.whatsapp)+'" target="_blank" rel="noopener"><img src="assets/social-whatsapp.png" alt="WhatsApp" width="30" height="30"></a>');
  if(s.instagram) arr.push('<a class="social-link" href="'+esc(s.instagram)+'" target="_blank" rel="noopener"><img src="assets/social-instagram.png" alt="Instagram" width="30" height="30"></a>');
  if(s.x_url) arr.push('<a class="social-link" href="'+esc(s.x_url)+'" target="_blank" rel="noopener"><img src="assets/social-x.png" alt="X" width="30" height="30"></a>');
  if(s.facebook) arr.push('<a class="social-link" href="'+esc(s.facebook)+'" target="_blank" rel="noopener"><img src="assets/social-facebook.png" alt="Facebook" width="30" height="30"></a>');
  return arr.join('');
}
var yycCollectionExpanded={updates:false,events:false,gallery:false};
function yycLimitedSectionHTML(key,items,renderer,emptyText,itemClass){
  if(!items || !items.length) return '<div class="empty">'+emptyText+'</div>';
  var expanded=!!yycCollectionExpanded[key];
  var visible=expanded ? items : items.slice(0,4);
  var html=visible.map(renderer).join('');
  if(items.length>4){
    html+='<div class="yyc-read-more-wrap"><button type="button" class="yyc-read-more" data-yyc-more="'+key+'">'+(expanded?'SHOW LESS':'READ MORE')+' <span>'+(expanded?'↑':'→')+'</span></button><small>Showing '+(expanded?items.length:Math.min(4,items.length))+' of '+items.length+'</small></div>';
  }
  return html;
}
function renderPublic(){
  if(!publicData) return;
  var s=publicData.settings || {};
  var slogan=$('.slogan'); if(slogan) slogan.innerHTML=esc(s.slogan || 'ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩').replace('🚩','<span>🚩</span>');
  var locs=$$('.brand-type small'); locs.forEach(function(el){el.textContent='YOUTH CLUB';});
  var hs=$('#heroSocial'); if(hs) hs.innerHTML=socialHTML();
  var fs=$('#footerSocial'); if(fs) fs.innerHTML=socialHTML();

  if($('#leaderCount')) $('#leaderCount').textContent=String((publicData.leaders||[]).length).padStart(2,'0');

  var lg=$('#leadersGrid');
  if(lg){
    lg.innerHTML=(publicData.leaders||[]).length ? publicData.leaders.map(function(l){
      var img=l.photo_url ? '<img src="'+esc(l.photo_url)+'" alt="'+esc(l.name)+'" '+yycProfilePhotoStyle(l)+'>' : '<span class="photo-placeholder">✦</span>';
      return '<article class="leader-card compact-leader-card reveal"><div class="leader-profile-row"><div class="leader-avatar">'+img+'</div><div class="leader-info"><span class="leader-kicker">LEADERSHIP</span><strong>'+esc(l.name)+'</strong><small>'+esc(l.role||'LEADER')+'</small><div class="micro">'+esc(l.line||'YUVAKESARI YOUTH CLUB · SUBRAHMANYA')+'</div></div></div><div class="leader-card-line"></div></article>';
    }).join('') : '<div class="empty">Leadership profiles will appear here.</div>';
  }

  var ug=$('#updatesGrid');
  if(ug){
    var ups=publicData.updates||[];
    ug.innerHTML=yycLimitedSectionHTML('updates',ups,function(u){
      var m=yycImageFormatMeta(u.image_format); var image=u.image_url ? yycMediaFrame(m.key,'<div class="update-card-media-inner"><img src="'+esc(u.image_url)+'" alt="'+esc(u.title||'YYC announcement')+'" loading="lazy" decoding="async"></div>') : '';
      return '<article class="update-card '+(image?'has-image':'')+' reveal">'+image+'<time>'+esc(fmtDate(u.event_date || u.published_at))+'</time><div><h3>'+esc(u.title)+'</h3><p>'+esc(u.body||'')+'</p></div><span></span></article>';
    },'No updates published yet.','update-card');
  }

  if($('#eventCount')) $('#eventCount').textContent=String((publicData.events||[]).length).padStart(2,'0');

  var eg=$('#eventsGrid');
  if(eg){
    var events=publicData.events||[];
    eg.innerHTML=yycLimitedSectionHTML('events',events,function(ev){
      var d=ev.event_date ? new Date(ev.event_date+'T00:00:00') : null;
      var day=d&&!isNaN(d)?String(d.getDate()).padStart(2,'0'):'—';
      var month=d&&!isNaN(d)?d.toLocaleDateString('en-IN',{month:'short'}).toUpperCase():'DATE TBC';
      var year=d&&!isNaN(d)?String(d.getFullYear()):'';
      var m=yycImageFormatMeta(ev.image_format); var image=ev.image_url ? '<div class="event-card-photo" data-yyc-format="'+m.key+'"'+(m.ratio==='auto'?'':' style="--yyc-media-ratio:'+m.ratio+'"')+'><img src="'+esc(ev.image_url)+'" alt="'+esc(ev.title||'YYC event')+'" loading="lazy" decoding="async"></div>' : '<div class="event-card-art"><span>YYC</span><b>EVENT</b></div>';
      return '<article class="event-card reveal">'+
        '<div class="event-card-media" data-yyc-format="'+m.key+'"'+(m.ratio==='auto'?'':' style="--yyc-media-ratio:'+m.ratio+'"')+'>'+image+'<div class="event-date-badge"><b>'+day+'</b><span>'+month+'</span><small>'+year+'</small></div></div>'+
        '<div class="event-card-body"><span class="event-kicker">YYC PROGRAMME</span><h3>'+esc(ev.title||'Untitled event')+'</h3>'+
        (ev.description?'<p>'+esc(ev.description)+'</p>':'<p>Community programme by Yuvakesari Youth Club.</p>')+
        '<div class="event-meta"><span>⌖ '+esc(ev.location||'Location to be announced')+'</span><button type="button" class="yyc-calendar-btn" data-yyc-calendar="'+esc(ev.id||'')+'">ADD TO CALENDAR <span>＋</span></button></div></div>'+
      '</article>';
    },'No upcoming events published yet.','event-card');
  }

  var gg=$('#galleryGrid');
  if(gg){
    var gs=publicData.gallery||[];
    gg.innerHTML=yycLimitedSectionHTML('gallery',gs,function(g){
      var m=yycImageFormatMeta(g.image_format); return '<figure class="gallery-card reveal" data-yyc-format="'+m.key+'"'+(m.ratio==='auto'?'':' style="--yyc-media-ratio:'+m.ratio+'"')+'><div class="gallery-card-media" data-yyc-format="'+m.key+'"'+(m.ratio==='auto'?'':' style="--yyc-media-ratio:'+m.ratio+'"')+'><img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'" loading="lazy" decoding="async"></div><figcaption>'+esc(g.caption||g.title)+'</figcaption></figure>';
    },'No gallery items published yet.','gallery-card');
  }
  if(window.YYCObserveReveals) window.YYCObserveReveals(document);
  var sg=$('#swagsGrid');
  if(sg){
    var swags=publicData.swags||[];
    var defaultOrder=yycHttpUrl(s.whatsapp,'');
    sg.innerHTML=yycLimitedSectionHTML('swags',swags,function(sw){
      var image=sw.image_url ? '<img src="'+esc(sw.image_url)+'" alt="'+esc(sw.title||'YYC swag')+'" loading="lazy" decoding="async">' : '<div class="swag-image-placeholder"><span>YYC</span><small>SWAG</small></div>';
      var status=sw.status==='coming-soon'?'COMING SOON':'AVAILABLE';
      var order=yycHttpUrl(sw.order_url,defaultOrder);
      var cta=order?'<a class="swag-order-btn" href="'+esc(order)+'" target="_blank" rel="noopener">ENQUIRE / ORDER <span>↗</span></a>':'<span class="swag-order-btn disabled">ENQUIRE SOON</span>';
      var price=yycPrice(sw.price);
      return '<article class="swag-card reveal">'+
        '<div class="swag-media">'+image+'<span class="swag-status '+(sw.status==='coming-soon'?'soon':'')+'">'+esc(status)+'</span></div>'+
        '<div class="swag-body"><span class="swag-category">'+esc(sw.category||'YYC OFFICIAL')+'</span><h3>'+esc(sw.title)+'</h3>'+
        (price?'<div class="swag-price">'+esc(price)+'</div>':'')+
        (sw.description?'<p>'+esc(sw.description)+'</p>':'')+
        (sw.sizes?'<div class="swag-sizes"><span>SIZES</span><b>'+esc(sw.sizes)+'</b></div>':'')+
        '<div class="swag-actions">'+cta+'</div></div></article>';
    },'Swag collection coming soon.','swag-card');
  }
  document.querySelectorAll('.yyc-read-more').forEach(function(btn){
    btn.addEventListener('click',function(){
      var key=this.getAttribute('data-yyc-more');
      if(!key) return;
      yycCollectionExpanded[key]=!yycCollectionExpanded[key];
      renderPublic();
      var target=key==='updates'?$('#updatesGrid'):key==='events'?$('#eventsGrid'):$('#galleryGrid');
      if(target) target.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  });
}
function yycDownloadEventCalendar(ev){
  if(!ev || !ev.event_date){toast('Event date is not available yet.');return;}
  var d=new Date(ev.event_date+'T00:00:00');
  if(isNaN(d.getTime())){toast('Invalid event date.');return;}
  var y=String(d.getFullYear()),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  var next=new Date(d);next.setDate(next.getDate()+1);
  var ny=String(next.getFullYear()),nm=String(next.getMonth()+1).padStart(2,'0'),nd=String(next.getDate()).padStart(2,'0');
  function icsEsc(v){return String(v||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');}
  var now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  var uid=(ev.id||((ev.title||'yyc-event')+'-'+ev.event_date))+'@yuvakesariyouthclub.in';
  var ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yuvakesari Youth Club//YYC Events//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+icsEsc(uid),'DTSTAMP:'+now,'DTSTART;VALUE=DATE:'+y+m+day,'DTEND;VALUE=DATE:'+ny+nm+nd,'SUMMARY:'+icsEsc(ev.title||'YYC Event'),'DESCRIPTION:'+icsEsc(ev.description||'Community programme by Yuvakesari Youth Club.'),'LOCATION:'+icsEsc(ev.location||''),'END:VEVENT','END:VCALENDAR'].join('\r\n');
  var blob=new Blob([ics+'\r\n'],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=(String(ev.title||'YYC Event').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'yyc-event')+'.ics';
  document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function yycContentKindLabel(kind){
  return kind==='event'?'EVENT':kind==='update'?'UPDATE':kind==='leader'?'LEADER':'GALLERY';
}
function yycIsNewItem(item){
  var v=item&& (item.created_at||item.published_at);
  if(!v) return false;
  var t=new Date(v).getTime();
  return isFinite(t) && (Date.now()-t)<=7*24*60*60*1000;
}
function yycPublicShareUrl(kind,item){
  var url=new URL(window.location.href);
  url.search='';
  url.hash='';
  var key=kind==='event'?'event':kind==='update'?'update':'gallery';
  var slug=item&&item.slug;
  if(slug) url.searchParams.set(key,slug);
  else if(item&&item.id) url.searchParams.set(key,item.id);
  return url.toString();
}
function yycCopyText(textValue){
  return navigator.clipboard&&navigator.clipboard.writeText
    ? navigator.clipboard.writeText(textValue)
    : Promise.reject(new Error('Clipboard access is unavailable'));
}
function yycOpenContentDetail(kind,item){
  if(!item) return;
  var title=item.title||'YYC '+yycContentKindLabel(kind);
  var image=kind==='gallery' ? (item.src||item.image_url||'') : (item.image_url||'');
  var date=fmtDate(item.event_date||item.published_at||item.created_at);
  var meta=[];
  if(date) meta.push('<span><b>DATE</b>'+esc(date)+'</span>');
  if(kind==='event' && item.location) meta.push('<span><b>LOCATION</b>'+esc(item.location)+'</span>');
  if(kind==='event' && item.status && item.status!=='published') meta.push('<span><b>STATUS</b>'+esc(String(item.status).toUpperCase())+'</span>');
  if(kind==='update' && item.category) meta.push('<span><b>CATEGORY</b>'+esc(item.category)+'</span>');
  if(kind==='gallery' && item.album) meta.push('<span><b>ALBUM</b>'+esc(item.album)+'</span>');
  var shareUrl=yycPublicShareUrl(kind,item);
  var eventRsvpHtml='';
  if(kind==='event'){
    if(memberToken){
      var currentRsvp=yycMemberRsvpMap[String(item.id||'')]||'';
      eventRsvpHtml='<div class="yyc-event-rsvp"><div><span class="portal-profile-kicker">MEMBER RSVP</span><strong>Will you attend this YYC programme?</strong><small>Select your response. You can change it later.</small></div><div class="yyc-rsvp-buttons">'+
        ['attending','maybe','not_attending'].map(function(st){return '<button type="button" class="mini-btn '+(currentRsvp===st?'active-rsvp':'')+'" data-yyc-rsvp="'+st+'">'+(st==='attending'?"I'M ATTENDING":st==='maybe'?'MAYBE':"CAN'T ATTEND")+'</button>';}).join('')+
      '</div><div class="yyc-rsvp-status" id="yycRsvpStatus">'+(currentRsvp?'CURRENT RESPONSE · '+String(currentRsvp).replace('_',' ').toUpperCase():'NO RESPONSE YET')+'</div></div>';
    }else{
      eventRsvpHtml='<div class="yyc-event-rsvp guest"><div><span class="portal-profile-kicker">MEMBER RSVP</span><strong>Members can reserve their place.</strong><small>Log in to record your response for this event.</small></div><button type="button" class="btn outline" id="yycEventRsvpLogin">MEMBER LOGIN</button></div>';
    }
  }
  var textBody=kind==='gallery' ? (item.caption||'') : (item.body||item.description||'');
  openModal(
    '<div class="yyc-detail-modal">'+
      '<div class="yyc-detail-kicker">'+yycContentKindLabel(kind)+(item.featured?' · FEATURED':'')+(yycIsNewItem(item)?' · NEW':'')+'</div>'+
      '<div class="yyc-detail-head"><div><h2 class="modal-title">'+esc(title)+'</h2><p class="modal-sub">Official Yuvakesari Youth Club content.</p></div><span class="yyc-detail-status">'+esc(String(item.status||'published').toUpperCase())+'</span></div>'+
      (image?'<div class="yyc-detail-image"><img src="'+esc(image)+'" alt="'+esc(title)+'" loading="eager" decoding="async"></div>':'')+
      (meta.length?'<div class="yyc-detail-meta">'+meta.join('')+'</div>':'')+
      (textBody?'<div class="yyc-detail-copy">'+esc(textBody).replace(/\n/g,'<br>')+'</div>':'')+
      '<div class="yyc-detail-actions"><button type="button" class="btn gold" id="yycDetailShare">SHARE <span>↗</span></button><button type="button" class="mini-btn" id="yycDetailCopy">COPY LINK</button></div>'+
    '</div>'
  );
  var shareBtn=$('#yycDetailShare');
  var copyBtn=$('#yycDetailCopy');
  if(shareBtn) shareBtn.addEventListener('click',async function(){
    try{
      if(navigator.share){await navigator.share({title:title,text:textBody||title,url:shareUrl});}
      else{await yycCopyText(shareUrl);toast('Share link copied');}
    }catch(e){if(e&&e.name!=='AbortError')toast('Could not share this item');}
  });
  if(copyBtn) copyBtn.addEventListener('click',async function(){
    try{await yycCopyText(shareUrl);copyBtn.textContent='COPIED ✓';setTimeout(function(){if(copyBtn)copyBtn.textContent='COPY LINK';},1500);}
    catch(e){toast('Could not copy link');}
  });
  window.__yycDeepLinkKey=kind;
  if(history.replaceState){
    var u=new URL(window.location.href);
    u.search='';
    u.hash='';
    var k=kind==='event'?'event':kind==='update'?'update':'gallery';
    if(item.slug) u.searchParams.set(k,item.slug); else if(item.id) u.searchParams.set(k,item.id);
    history.replaceState(null,'',u.toString());
  }
}
function yycOpenGalleryLightbox(index){
  var items=publicData&&publicData.gallery||[];
  if(!items.length) return;
  index=Math.max(0,Math.min(items.length-1,index));
  window.__yycGalleryIndex=index;
  var g=items[index]||{};
  var image=g.src||g.image_url||'';
  var shareUrl=yycPublicShareUrl('gallery',g);
  openModal(
    '<div class="yyc-lightbox">'+
      '<div class="yyc-lightbox-top"><div><span class="yyc-detail-kicker">GALLERY</span><h2 class="modal-title">'+esc(g.title||'YYC Gallery')+'</h2></div><span class="yyc-lightbox-count">'+(index+1)+' / '+items.length+'</span></div>'+
      '<div class="yyc-lightbox-stage"><button type="button" class="yyc-lightbox-nav yyc-lightbox-prev" data-yyc-lightbox="prev" aria-label="Previous photo">‹</button><img src="'+esc(image)+'" alt="'+esc(g.title||'YYC Gallery photo')+'" loading="eager" decoding="async"><button type="button" class="yyc-lightbox-nav yyc-lightbox-next" data-yyc-lightbox="next" aria-label="Next photo">›</button></div>'+
      (g.caption?'<p class="yyc-lightbox-caption">'+esc(g.caption)+'</p>':'')+
      '<div class="yyc-detail-actions"><button type="button" class="btn gold" id="yycLightboxShare">SHARE <span>↗</span></button><button type="button" class="mini-btn" id="yycLightboxCopy">COPY LINK</button></div>'+
    '</div>'
  );
  var share=$('#yycLightboxShare'),copy=$('#yycLightboxCopy');
  if(share) share.addEventListener('click',async function(){
    try{if(navigator.share) await navigator.share({title:g.title||'YYC Gallery',text:g.caption||'',url:shareUrl});else{await yycCopyText(shareUrl);toast('Share link copied');}}
    catch(e){if(e&&e.name!=='AbortError')toast('Could not share this photo');}
  });
  if(copy) copy.addEventListener('click',async function(){try{await yycCopyText(shareUrl);copy.textContent='COPIED ✓';setTimeout(function(){if(copy)copy.textContent='COPY LINK';},1500);}catch(e){toast('Could not copy link');}});
  window.__yycDeepLinkKey='gallery';
  if(history.replaceState){var u=new URL(window.location.href);u.search='';u.hash='';if(g.slug)u.searchParams.set('gallery',g.slug);else if(g.id)u.searchParams.set('gallery',g.id);history.replaceState(null,'',u.toString());}
}
function yycDecoratePublicCards(){
  if(!publicData) return;
  function decorate(gridSelector,items,selector){
    var grid=$(gridSelector); if(!grid) return;
    var cards=selector?Array.prototype.slice.call(grid.querySelectorAll(selector)):Array.prototype.slice.call(grid.children);
    cards.forEach(function(card,index){
      var item=items[index];
      var existing=card.querySelector('.yyc-public-badges');
      if(!item){
        if(existing) existing.remove();
        return;
      }
      var labels=[];
      if(item.featured) labels.push('<span class="featured">FEATURED</span>');
      if(yycIsNewItem(item)) labels.push('<span class="new">NEW</span>');
      if(item.status && ['cancelled','postponed','ongoing'].indexOf(String(item.status))>=0) labels.push('<span class="status">'+esc(String(item.status).toUpperCase())+'</span>');
      var markup=labels.join('');
      if(!markup){
        if(existing) existing.remove();
        return;
      }
      if(existing){
        if(existing.innerHTML!==markup) existing.innerHTML=markup;
        return;
      }
      var badge=document.createElement('div'); badge.className='yyc-public-badges'; badge.innerHTML=markup;
      card.appendChild(badge);
    });
  }
  decorate('#eventsGrid',publicData.events||[],'.event-card');
  decorate('#updatesGrid',publicData.updates||[],'.update-card');
  decorate('#galleryGrid',publicData.gallery||[],'.gallery-card');
}
function yycInstallPublicContentChrome(){
  if(window.__yycPublicContentChrome) return;
  window.__yycPublicContentChrome=true;
  var nav=document.querySelector('.desktop-nav');
  /* Search is supplied by the production UI layer in its intended position.
     Do not append a duplicate Search control to the far right. */
  if(nav){
    var rightSearch=$('#yycSearchBtn');
    if(rightSearch && rightSearch.dataset.yycSearchBound!=='1'){
      rightSearch.dataset.yycSearchBound='1';
      rightSearch.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        yycOpenSearch();
      });
    }
  }
  ['#eventsGrid','#updatesGrid','#galleryGrid'].forEach(function(sel){
    var grid=$(sel);
    if(grid && 'MutationObserver' in window){
      new MutationObserver(function(){yycDecoratePublicCards();}).observe(grid,{childList:true,subtree:false});
    }
  });
  yycDecoratePublicCards();

  var mobile=document.querySelector('#mobilePanel');
  if(mobile&&!$('#yycSearchMobile')){
    var mb=document.createElement('button');
    mb.type='button';mb.className='nav-admin full yyc-search-trigger';mb.id='yycSearchMobile';mb.textContent='⌕ Search YYC';
    mb.addEventListener('click',function(){if(typeof closeMobile==='function')closeMobile();yycOpenSearch();});
    mobile.appendChild(mb);
  }
  document.addEventListener('click',function(e){
    var cal=e.target.closest('[data-yyc-calendar]');
    if(cal){
      e.preventDefault();e.stopPropagation();
      var cid=cal.getAttribute('data-yyc-calendar');
      var cev=(publicData&&publicData.events||[]).find(function(x){return String(x.id||'')===String(cid);});
      if(cev) yycDownloadEventCalendar(cev); else toast('Event not found.');
      return;
    }
    if(e.target.closest('#modal')) return;
    var eventCard=e.target.closest('.event-card'), updateCard=e.target.closest('.update-card'), galleryCard=e.target.closest('.gallery-card');
    if(eventCard){
      var cards=Array.prototype.slice.call(document.querySelectorAll('#eventsGrid .event-card'));
      var index=cards.indexOf(eventCard);
      if(index>=0 && publicData.events[index]){e.preventDefault();yycOpenContentDetail('event',publicData.events[index]);}
      return;
    }
    if(updateCard){
      var cardsU=Array.prototype.slice.call(document.querySelectorAll('#updatesGrid .update-card'));
      var idx=cardsU.indexOf(updateCard);
      if(idx>=0 && publicData.updates[idx]){e.preventDefault();yycOpenContentDetail('update',publicData.updates[idx]);}
      return;
    }
    if(galleryCard){
      var cardsG=Array.prototype.slice.call(document.querySelectorAll('#galleryGrid .gallery-card'));
      var idxG=cardsG.indexOf(galleryCard);
      if(idxG>=0){e.preventDefault();yycOpenGalleryLightbox(idxG);}
    }
  });
  document.addEventListener('keydown',function(e){
    if(!window.__yycGalleryIndex && window.__yycGalleryIndex!==0) return;
    if(e.key==='ArrowRight'){yycOpenGalleryLightbox(window.__yycGalleryIndex+1);}
    if(e.key==='ArrowLeft'){yycOpenGalleryLightbox(window.__yycGalleryIndex-1);}
  });
}
function yycHandlePublicDeepLink(){
  if(!publicData) return;
  var q=new URLSearchParams(window.location.search);
  var keys=[['event','event'],['update','update'],['gallery','gallery']];
  for(var i=0;i<keys.length;i++){
    var raw=q.get(keys[i][0]); if(!raw) continue;
    var kind=keys[i][1];
    var arr=kind==='event'?publicData.events||[]:kind==='update'?publicData.updates||[]:publicData.gallery||[];
    var found=arr.find(function(x){return String(x.slug||x.id)===String(raw);});
    if(found){setTimeout(function(k,x){return function(){if(k==='gallery')yycOpenGalleryLightbox(arr.indexOf(x));else yycOpenContentDetail(k,x);};}(kind,found),80);}
    break;
  }
}
function yycOpenSearch(){
  var items=[];
  (publicData&&publicData.events||[]).forEach(function(x){items.push({kind:'event',item:x,terms:[x.title,x.description,x.location,x.category]});});
  (publicData&&publicData.updates||[]).forEach(function(x){items.push({kind:'update',item:x,terms:[x.title,x.body,x.category]});});
  (publicData&&publicData.gallery||[]).forEach(function(x){items.push({kind:'gallery',item:x,terms:[x.title,x.caption,x.album]});});
  (publicData&&publicData.leaders||[]).forEach(function(x){items.push({kind:'leader',item:x,terms:[x.name,x.role,x.line]});});
  openModal(
    '<div class="yyc-search-modal"><div class="yyc-detail-kicker">YYC SEARCH</div><h2 class="modal-title">Find something.</h2><p class="modal-sub">Search Events, Updates, Gallery and Leaders.</p>'+
    '<input id="yycSearchInput" class="yyc-search-input" type="search" placeholder="Search YYC content..." autocomplete="off">'+
    '<div id="yycSearchResults" class="yyc-search-results"></div></div>'
  );
  var input=$('#yycSearchInput'), results=$('#yycSearchResults');
  function render(q){
    q=q.trim().toLowerCase();
    var found=!q?items.slice(0,8):items.filter(function(x){return x.terms.filter(Boolean).join(' ').toLowerCase().indexOf(q)>=0;}).slice(0,20);
    results.innerHTML=found.length?found.map(function(x,index){
      var t=x.item.title||x.item.name||'YYC content';
      var sub=x.kind==='leader'?(x.item.role||'LEADER'):(x.item.category||x.item.album||yycContentKindLabel(x.kind));
      return '<button type="button" class="yyc-search-result" data-search-index="'+index+'"><span class="yyc-search-result-kind">'+esc(yycContentKindLabel(x.kind))+'</span><b>'+esc(t)+'</b><small>'+esc(sub)+'</small></button>';
    }).join(''):'<div class="empty">No matching YYC content.</div>';
    results.__yycFound=found;
  }
  input.addEventListener('input',function(){render(this.value);});
  results.addEventListener('click',function(e){
    var b=e.target.closest('[data-search-index]');
    if(!b) return;
    var x=results.__yycFound[Number(b.getAttribute('data-search-index'))];
    if(!x) return;
    if(x.kind==='leader'){closeModal();var lg=document.querySelector('#leadersGrid');if(lg){var cs=Array.prototype.slice.call(lg.querySelectorAll('.leader-card'));var ix=(publicData.leaders||[]).indexOf(x.item);if(ix>=0&&cs[ix])cs[ix].scrollIntoView({behavior:'smooth',block:'center'});}return;}
    if(x.kind==='gallery') yycOpenGalleryLightbox((publicData.gallery||[]).indexOf(x.item));
    else yycOpenContentDetail(x.kind,x.item);
  });
  setTimeout(function(){input.focus();render('');},30);
}

async function yycInitRealtime(){
  if(window.__yycRealtimeInitStarted)return;
  window.__yycRealtimeInitStarted=true;
  try{
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/dist/umd/supabase.min.js');
    if(!window.supabase||typeof window.supabase.createClient!=='function')return;
    if(window.__yycRealtimeClient)return;
    var client=window.supabase.createClient(YYC_CONFIG.supabaseUrl,YYC_CONFIG.supabaseKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    window.__yycRealtimeClient=client;
    var channel=client.channel('yyc:public');
    window.__yycRealtimeChannel=channel;
    channel.on('broadcast',{event:'public_data_changed'},function(){
      if(window.__yycRealtimeRefreshTimer)return;
      window.__yycRealtimeRefreshTimer=window.setTimeout(function(){
        window.__yycRealtimeRefreshTimer=null;
        loadPublic();
      },1200);
    });
    channel.subscribe(function(){});
  }catch(e){
    /* Realtime is an enhancement only. The normal RPC data path remains authoritative. */
  }
}

async function loadPublic(){
  try{
    publicData=await rpc('public_site_data',{}, {timeoutMs:30000,retries:2});
    renderPublic();
    yycInstallPublicContentChrome();
    yycHandlePublicDeepLink();
    yycInitRealtime();
  }catch(e){ toast('Public data is loading from the backup design.'); }
}
function activeNav(){
  var target=location.hash ? location.hash.slice(1) : 'home';
  Array.prototype.slice.call(document.querySelectorAll('.desktop-nav .nav-link')).forEach(function(a){var h=(a.getAttribute('href')||'').slice(1);a.classList.toggle('active',h===target);});
}
function updateYYCScrollProgress(){
  var bar=$('#yycScrollProgressBar');
  if(!bar) return;
  var doc=document.documentElement;
  var max=Math.max(1,doc.scrollHeight-window.innerHeight);
  var p=Math.max(0,Math.min(1,window.scrollY/max));
  bar.style.transform='scaleX('+p.toFixed(4)+')';
}
function syncYYCNavHighlight(activeLink){
  var nav=document.querySelector('.desktop-nav');
  var indicator=document.getElementById('yycNavHighlight');
  if(!nav||!indicator) return;
  if(window.innerWidth<=980){
    indicator.classList.remove('is-visible');
    return;
  }
  var link=activeLink;
  if(!link){
    var active=nav.querySelector('.nav-link.active');
    link=active||nav.querySelector('.nav-link');
  }
  if(!link) return;
  var nr=nav.getBoundingClientRect();
  var lr=link.getBoundingClientRect();
  var left=Math.max(0,lr.left-nr.left);
  var width=Math.max(42,lr.width);
  indicator.style.width=width+'px';
  indicator.style.transform='translate3d('+left+'px,0,0)';
  indicator.classList.add('is-visible');
}
function setYYCNavActive(link){
  var links=Array.prototype.slice.call(document.querySelectorAll('.desktop-nav .nav-link'));
  links.forEach(function(a){a.classList.toggle('active',a===link);});
  syncYYCNavHighlight(link);
}
function updateYYCActiveSection(){
  var links=Array.prototype.slice.call(document.querySelectorAll('.desktop-nav .nav-link'));
  if(!links.length) return;

  var header=document.querySelector('.topbar');
  var headerHeight=header ? header.offsetHeight : 76;
  var hero=document.getElementById('home');

  /* Fresh page / top of page is always Home. */
  if(window.scrollY <= 12){
    var homeLink=links.find(function(a){return (a.getAttribute('href')||'').slice(1)==='home';});
    setYYCNavActive(homeLink||links[0]);
    return;
  }

  /* Keep Home active while the hero is still the main visible area. */
  if(hero){
    var heroBottom=hero.getBoundingClientRect().bottom;
    if(heroBottom > headerHeight + Math.min(180,window.innerHeight*0.28)){
      var heroLink=links.find(function(a){return (a.getAttribute('href')||'').slice(1)==='home';});
      setYYCNavActive(heroLink||links[0]);
      return;
    }
  }

  var sections=[];
  links.forEach(function(a){
    var id=(a.getAttribute('href')||'').slice(1);
    var el=id&&document.getElementById(id);
    if(el) sections.push({id:id,el:el});
  });

  /* Once the page has left the hero, the active tab is the section whose
     top edge is nearest to the header, while remaining above the probe line. */
  var probe=headerHeight+115;
  var active='glimpse';
  var best=-Infinity;
  sections.forEach(function(item){
    if(item.id==='home') return;
    var top=item.el.getBoundingClientRect().top;
    var score=top<=probe ? top : -100000-(top-probe);
    if(score>best){
      best=score;
      active=item.id;
    }
  });

  var activeLink=links.find(function(a){return (a.getAttribute('href')||'').slice(1)===active;});
  setYYCNavActive(activeLink||links[0]);
}
function activeNav(){
  var target=location.hash ? location.hash.slice(1) : 'home';
  var links=$$('.desktop-nav .nav-link');
  var exists=links.some(function(a){return (a.getAttribute('href')||'').slice(1)===target;});
  if(!exists) target='home';
  var targetLink=links.find(function(a){return (a.getAttribute('href')||'').slice(1)===target;});
  setYYCNavActive(targetLink||links[0]);
  updateYYCActiveSection();
  updateYYCScrollProgress();
}
function bindNavigation(){
  $$('a[href^="#"]').forEach(function(link){
    link.addEventListener('click',function(e){
      var href=link.getAttribute('href');
      if(!href || href==='#') return;
      var target=document.querySelector(href);
      if(!target) return;
      e.preventDefault();
      if(typeof closeMobile==='function') closeMobile();
      var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var header=document.querySelector('.topbar');
      var offset=header ? header.offsetHeight + 10 : 0;
      var top=Math.max(0,target.getBoundingClientRect().top + window.pageYOffset - offset);
      /* Highlight the tab immediately and keep it locked during the smooth scroll. */
      window.__yycNavLockUntil=Date.now()+1800;
      setYYCNavActive(link);
      yycAnimateNavigation(target);
      window.scrollTo({top:top,behavior:reduce?'auto':'smooth'});
      if(history.pushState) history.pushState(null,'',href);
      setTimeout(activeNav,40);
    });
  });
  Array.prototype.slice.call(document.querySelectorAll('.desktop-nav .nav-link')).forEach(function(a){a.addEventListener('click',function(){setTimeout(activeNav,140);});});
  if('IntersectionObserver' in window){
    var sectionObserver=new IntersectionObserver(function(){updateYYCActiveSection();},{root:null,rootMargin:'-22% 0px -62% 0px',threshold:[0,.01,.1,.3]});
    Array.prototype.slice.call(document.querySelectorAll('.section[id]')).forEach(function(section){sectionObserver.observe(section);});
  }
  window.addEventListener('hashchange',activeNav);
  var navScrollTicking=false;
  window.addEventListener('scroll',function(){
    if(navScrollTicking)return;
    navScrollTicking=true;
    requestAnimationFrame(function(){
      navScrollTicking=false;
      updateYYCActiveSection();
      updateYYCScrollProgress();
    });
  },{passive:true});
  window.addEventListener('resize',function(){updateYYCScrollProgress();updateYYCActiveSection();},{passive:true});
  activeNav();
  syncYYCNavHighlight();
  window.addEventListener('resize',function(){syncYYCNavHighlight();},{passive:true});
  updateYYCScrollProgress();
}
function submitUpdate(){
  if(!memberToken){
    toast('Member login is required to submit an update.');
    memberLogin();
    return;
  }
  openModal(
    '<div class="modal-kicker">YYC · MEMBER SUBMISSION</div>'+
    '<h2 class="modal-title">Submit an update.</h2>'+
    '<p class="modal-sub">Your update goes to the YYC admin team for review before it appears publicly.</p>'+
    '<form id="memberSubmitUpdateForm"><div class="form-grid">'+
      '<div class="field"><label>Title</label><input id="msuTitle" maxlength="160" required placeholder="Update title"></div>'+
      '<div class="field"><label>Date</label><input id="msuDate" type="date" value="'+today()+'" required></div>'+
      '<div class="field full"><label>Message</label><textarea id="msuBody" maxlength="3000" rows="6" required placeholder="Write the update…"></textarea></div>'+
    '</div><div class="form-actions"><button type="button" class="btn outline" data-modal-close-only>CANCEL</button><button type="submit" class="btn gold">SUBMIT FOR REVIEW <span>→</span></button></div></form>'
  );
  $('#memberSubmitUpdateForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    if(btn&&btn.disabled)return;
    try{
      if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='SUBMITTING…';}
      var r=await rpc('member_submit_update',{p_token:memberToken,p_payload:{
        title:$('#msuTitle').value.trim(),body:$('#msuBody').value.trim(),event_date:$('#msuDate').value
      }});
      if(!r||!r.ok)throw new Error(r&&r.error||'Could not submit update');
      closeModal();toast('Update submitted for admin approval.');
    }catch(err){
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SUBMIT FOR REVIEW →';}
      toast(err.message||'Could not submit update');
    }
  });
}
function submitGallery(){
  if(!memberToken){
    toast('Member login is required to submit a gallery item.');
    memberLogin();
    return;
  }
  openModal(
    '<div class="modal-kicker">YYC · MEMBER SUBMISSION</div>'+
    '<h2 class="modal-title">Submit a gallery item.</h2>'+
    '<p class="modal-sub">Add a publicly reachable image URL and caption. The submission stays pending until an admin reviews it.</p>'+
    '<form id="memberSubmitGalleryForm"><div class="form-grid">'+
      '<div class="field"><label>Title</label><input id="msgTitle" maxlength="160" required placeholder="Photo title"></div>'+
      '<div class="field full"><label>Image URL</label><input id="msgSrc" type="url" maxlength="1200" required placeholder="https://…"></div>'+
      '<div class="field full"><label>Caption</label><textarea id="msgCaption" maxlength="1200" rows="5" placeholder="Optional caption"></textarea></div>'+
    '</div><div class="form-actions"><button type="button" class="btn outline" data-modal-close-only>CANCEL</button><button type="submit" class="btn gold">SUBMIT FOR REVIEW <span>→</span></button></div></form>'
  );
  $('#memberSubmitGalleryForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    if(btn&&btn.disabled)return;
    try{
      if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='SUBMITTING…';}
      var r=await rpc('member_submit_gallery',{p_token:memberToken,p_payload:{
        title:$('#msgTitle').value.trim(),src:$('#msgSrc').value.trim(),caption:$('#msgCaption').value.trim()
      }});
      if(!r||!r.ok)throw new Error(r&&r.error||'Could not submit gallery item');
      closeModal();toast('Gallery item submitted for admin approval.');
    }catch(err){
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SUBMIT FOR REVIEW →';}
      toast(err.message||'Could not submit gallery item');
    }
  });
}
function memberRegister(){
  var obj={photo:'',scale:1,x:50,y:50};
  openModal('<div class="modal-kicker">JOIN YYC</div><h2 class="modal-title">Member Registration</h2><p class="modal-sub">Submit your details for admin approval. After approval you can log in and receive your digital membership card.</p><form id="memberRegisterForm"><div class="form-grid"><div class="field"><label>Full name</label><input id="rName" required></div><div class="field"><label>Date of birth</label><input id="rDob" type="date" required></div><div class="field"><label>Phone</label><input id="rPhone" required></div><div class="field"><label>Email</label><input id="rEmail" type="email" required></div><div class="field full"><label>Password</label><input id="rPass" type="password" minlength="8" required placeholder="Minimum 8 characters"></div><div class="field full"><label>Position</label><input id="rPosition" value="MEMBER" placeholder="MEMBER / VOLUNTEER / COORDINATOR"></div><div class="field full"><label>Member photo</label><input id="rPhoto" type="file" accept="image/*" required></div></div>'+imageEditor('regPhoto',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SUBMIT APPLICATION <span>↗</span></button></div></form>');
  wireEditor('regPhoto',obj,'rPhoto');
  $('#memberRegisterForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      if(!obj.photo){toast('Please choose a photo');return;}
      var btn=e.currentTarget.querySelector('button[type="submit"]');
      if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='UPLOADING PHOTO…';}
      var croppedPhoto=await yycManualSquareCrop(obj.photo,obj.scale,obj.x,obj.y,760);
      var storedPhoto=await uploadYYCImage(croppedPhoto,'member-registration','', '', '');
      var data={name:$('#rName').value.trim(),dob:$('#rDob').value,phone:$('#rPhone').value.trim(),email:$('#rEmail').value.trim(),club_name:'Yuvakesari Youth Club',position:$('#rPosition').value.trim()||'MEMBER',photo_data:storedPhoto,photo_scale:1,photo_pos_x:50,photo_pos_y:50};
      var r=await rpc('member_register',{p_password:$('#rPass').value,p_payload:data});
      if(!r.ok) throw new Error(r.error||'Registration failed');
      closeModal(); toast('Application submitted — wait for admin approval');
    }catch(err){
      var submitBtn=document.querySelector('#memberRegisterForm button[type="submit"]');
      if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='SUBMIT APPLICATION ↗';}
      toast(err.message);
    }
  });
}
function yycVerifyUrl(roleNumber){
  return new URL('verify.html',location.href).href+'?uid='+encodeURIComponent(roleNumber||'');
}
function yycBarcode(){
  var a=[];
  for(var i=0;i<46;i++) a.push('<span style="height:'+(9+(i%7)*2)+'px"></span>');
  return a.join('');
}
function yycDigitalCard(data,kind){
  data=data||{};
  var leader=kind==='leader';
  var roleNumber=data.role_number||'PENDING';
  var photo=data.photo_url||'assets/yyc-logo-clean.webp';
  var name=data.name||'YYC Member';
  var position=leader?(data.role||'LEADER'):(data.position||'MEMBER');
  var verify=yycVerifyUrl(roleNumber);
  var qr='https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data='+encodeURIComponent(verify);
  var dob=data.dob||'—';
  return '<div class="yyc-digital-card-wrap">'+
    '<div class="yyc-digital-card '+(leader?'yyc-role-leader':'')+'" tabindex="0" role="button" aria-label="Flip digital '+(leader?'leader':'membership')+' card">'+
      '<div class="yyc-card-face yyc-card-front">'+
        '<div class="yyc-card-aurora"></div><div class="yyc-card-grid"></div>'+
        '<div class="yyc-idcard-layout">'+
          '<div class="yyc-idcard-head">'+
            '<div class="yyc-id-brand"><span class="yyc-logo-orb"><img src="assets/yyc-logo-clean.webp" alt="YYC"></span><div><b>YUVAKESARI YOUTH CLUB</b><span>SUBRAHMANYA · KARNATAKA</span></div></div>'+
            '<span class="yyc-id-type">'+(leader?'LEADER ID CARD':'MEMBER ID CARD')+'</span>'+
          '</div>'+
          '<div class="yyc-idcard-content">'+
            '<div class="yyc-id-photo"><div class="yyc-photo-frame"><img class="yyc-id-card-photo" src="'+esc(photo)+'" alt="'+esc(name)+'" style="width:100%;height:100%;display:block;object-fit:contain;object-position:center center;transform:none!important;transform-origin:center center;background:#0c1618;"></div></div>'+
            '<div class="yyc-id-details">'+
              '<div class="yyc-id-name">'+esc(name)+'</div>'+
              '<div class="yyc-id-position">'+esc(position)+'</div>'+
              '<div class="yyc-id-field"><span>UNIQUE ID</span><b>'+esc(roleNumber)+'</b></div>'+
              '<div class="yyc-id-field"><span>CLUB</span><b>YUVAKESARI YOUTH CLUB</b></div>'+
            '</div>'+
            '<div class="yyc-id-qr-panel"><div class="yyc-qr-frame"><a class="yyc-qr-link" href="'+esc(verify)+'" target="_blank" rel="noopener" aria-label="Open YYC verification page"><div class="yyc-live-qr"><img src="'+qr+'" alt="YYC verification QR" loading="eager" decoding="async" crossorigin="anonymous" referrerpolicy="no-referrer"><span class="yyc-qr-fallback">OPEN VERIFY</span></div></a></div><span>SCAN TO VERIFY</span><small>Official YYC profile</small></div>'+
          '</div>'+
          '<div class="yyc-idcard-footer"><div><small>VALID DIGITAL ID · OFFICIAL YYC RECORD</small><span>'+esc(leader?'LEADERSHIP ACCESS':'APPROVED MEMBERSHIP')+'</span></div><div class="yyc-approved-seal active"><i>✓</i><div><b>VERIFIED</b><span>YYC DATABASE</span></div></div><div class="yyc-mini-barcode">'+yycBarcode()+'</div></div>'+
        '</div>'+
      '</div>'+
      '<div class="yyc-card-face yyc-card-back">'+
        '<div class="yyc-back-layout">'+
          '<div class="yyc-back-brand"><img src="assets/yyc-logo-clean.webp" alt="YYC"><div><b>YUVAKESARI YOUTH CLUB</b><span>SUBRAHMANYA · KARNATAKA</span></div></div>'+
          '<div class="yyc-back-copy"><span class="yyc-back-label">OFFICIAL DIGITAL ID</span><h3>Identity backed by the YYC record.</h3><p>This card belongs to the approved '+(leader?'YYC leader':'YYC member')+'. Scan the QR code on the front to open the official verification page.</p></div>'+
          '<div class="yyc-back-details"><div><span>UNIQUE ID</span><b>'+esc(roleNumber)+'</b></div><div><span>POSITION</span><b>'+esc(position)+'</b></div><div><span>DATE OF BIRTH</span><b>'+esc(dob)+'</b></div><div><span>STATUS</span><b>ACTIVE</b></div></div>'+
          '<div class="yyc-back-contact"><span>'+esc(data.email||'Email not provided')+'</span><span>'+esc(data.phone||'Phone not provided')+'</span></div>'+
          '<div class="yyc-back-bottom"><span>धर्मो रक्षति रक्षितः 🚩</span><span>YUVAKESARI · YYC</span></div>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="yyc-card-hint">CLICK THE CARD TO FLIP · YOUR OFFICIAL YYC DIGITAL ID</div>'+
  '</div>';
}
async function yycLoadQrGenerator(){
  if(window.qrcode) return window.qrcode;
  if(window.__yycQrGeneratorPromise) return window.__yycQrGeneratorPromise;
  window.__yycQrGeneratorPromise=new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    s.async=true;
    s.onload=function(){window.qrcode?resolve(window.qrcode):reject(new Error('QR generator did not initialize.'));};
    s.onerror=function(){reject(new Error('Could not load the QR generator.'));};
    document.head.appendChild(s);
  }).finally(function(){window.__yycQrGeneratorPromise=null;});
  return window.__yycQrGeneratorPromise;
}
async function yycLoadHtml2Canvas(){
  if(window.html2canvas) return window.html2canvas;
  if(window.__yycHtml2CanvasPromise) return window.__yycHtml2CanvasPromise;
  window.__yycHtml2CanvasPromise=new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.async=true;
    s.onload=function(){window.html2canvas?resolve(window.html2canvas):reject(new Error('Download engine did not initialize.'));};
    s.onerror=function(){reject(new Error('Could not load the ID card download engine.'));};
    document.head.appendChild(s);
  }).finally(function(){window.__yycHtml2CanvasPromise=null;});
  return window.__yycHtml2CanvasPromise;
}
function yycExportFace(sourceFace,width){
  var clone=sourceFace.cloneNode(true);
  clone.classList.remove('yyc-card-front','yyc-card-back');
  clone.classList.add('yyc-export-face');
  clone.style.position='relative';
  clone.style.inset='auto';
  clone.style.transform='none';
  clone.style.backfaceVisibility='visible';
  clone.style.webkitBackfaceVisibility='visible';
  clone.style.width=width+'px';
  clone.style.height=Math.round(width/1.72)+'px';
  clone.style.minHeight='0';
  clone.style.maxHeight='none';
  clone.style.overflow='hidden';
  clone.style.boxSizing='border-box';
  return clone;
}
async function downloadYYCDigitalCard(data,kind,button){
  data=data||{};
  var holder=null;
  var stage=null;
  if(button){
    button.disabled=true;
    button.dataset.prevText=button.textContent;
    button.textContent='PREPARING…';
  }
  try{
    if(!data.role_number) throw new Error('This ID card does not have a valid Unique ID yet.');
    holder=document.createElement('div');
    holder.style.cssText='position:fixed;left:-10000px;top:0;width:960px;z-index:2147483000;background:#05090c;visibility:visible;pointer-events:none;';
    holder.innerHTML=yycDigitalCard(data,kind);
    document.body.appendChild(holder);

    var card=holder.querySelector('.yyc-digital-card');
    var front=card&&card.querySelector('.yyc-card-front');
    var back=card&&card.querySelector('.yyc-card-back');
    if(!front||!back) throw new Error('Unable to prepare the YYC ID card.');

    var html2canvas=await yycLoadHtml2Canvas();
    var qrGenerator=await yycLoadQrGenerator();
    var verify=yycVerifyUrl(data.role_number);
    var qrMaker=qrGenerator(0,'M');
    qrMaker.addData(String(verify));
    qrMaker.make();
    var qrSvg=qrMaker.createSvgTag({cellSize:5,margin:0});

    var width=900;
    var gap=28;
    var padding=24;
    var faceHeight=Math.round(width/1.72);

    function makeExportFace(source){
      var clone=yycExportFace(source,width);
      clone.style.position='relative';
      clone.style.left='auto';
      clone.style.top='auto';
      clone.style.visibility='visible';
      clone.style.opacity='1';
      clone.style.transform='none';
      clone.querySelectorAll('.yyc-live-qr').forEach(function(box){
        box.innerHTML=qrSvg;
        box.style.background='#fff';
        box.style.display='grid';
        box.style.placeItems='center';
        box.style.overflow='hidden';
        var svg=box.querySelector('svg');
        if(svg){
          svg.setAttribute('width','100%');
          svg.setAttribute('height','100%');
          svg.style.display='block';
          svg.style.background='#fff';
        }
      });
      return clone;
    }

    stage=document.createElement('div');
    stage.style.cssText='position:fixed;left:-10000px;top:0;width:'+(width+padding*2)+'px;padding:'+padding+'px;box-sizing:border-box;background:#05090c;z-index:2147483001;visibility:visible;pointer-events:none;';
    var frontClone=makeExportFace(front);
    var backClone=makeExportFace(back);
    stage.appendChild(frontClone);
    var spacer=document.createElement('div');
    spacer.style.height=gap+'px';
    stage.appendChild(spacer);
    stage.appendChild(backClone);
    document.body.appendChild(stage);

    var images=Array.prototype.slice.call(stage.querySelectorAll('img'));
    await Promise.all(images.map(function(img){
      if(img.complete && img.naturalWidth>0){
        return img.decode ? img.decode().catch(function(){}) : Promise.resolve();
      }
      return new Promise(function(resolve){
        var done=function(){resolve();};
        img.addEventListener('load',done,{once:true});
        img.addEventListener('error',done,{once:true});
        window.setTimeout(done,8000);
      });
    }));
    await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});

    var captureOptions={
      backgroundColor:null,
      useCORS:true,
      allowTaint:false,
      scale:2,
      logging:false,
      imageTimeout:15000,
      removeContainer:false
    };
    var frontCanvas=await html2canvas(frontClone,captureOptions);
    var backCanvas=await html2canvas(backClone,captureOptions);

    var scale=2;
    var out=document.createElement('canvas');
    out.width=Math.round((width+padding*2)*scale);
    out.height=Math.round((faceHeight*2+gap+padding*2)*scale);
    var ctx=out.getContext('2d');
    ctx.fillStyle='#05090c';
    ctx.fillRect(0,0,out.width,out.height);
    ctx.drawImage(frontCanvas,padding*scale,padding*scale,width*scale,faceHeight*scale);
    ctx.drawImage(backCanvas,padding*scale,(padding+faceHeight+gap)*scale,width*scale,faceHeight*scale);

    var filename='YYC-'+(kind==='leader'?'Leader':'Member')+'-ID-'+String(data.role_number).replace(/[^a-z0-9_-]+/gi,'-')+'.png';
    var blob=await new Promise(function(resolve,reject){
      out.toBlob(function(value){
        if(value) resolve(value);
        else reject(new Error('Could not create the ID card image.'));
      },'image/png');
    });

    var url=URL.createObjectURL(blob);
    var link=document.createElement('a');
    link.href=url;
    link.download=filename;
    link.rel='noopener';
    link.style.display='none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function(){link.remove();URL.revokeObjectURL(url);},3000);
    toast('ID card downloaded successfully');
  }catch(e){
    toast(e&&e.message?e.message:'ID card download failed. Please try again.');
  }finally{
    if(stage) stage.remove();
    if(holder) holder.remove();
    if(button){
      button.disabled=false;
      button.textContent=button.dataset.prevText||'DOWNLOAD ID CARD ↓';
    }
  }
}
function downloadAdminCard(data,kind,button){
  return downloadYYCDigitalCard(data,kind,button);
}
function yycPortalHeader(kind,data){
  var leader=kind==='leader';
  var preview=data&&data.__adminView;
  var ribbon='<div class="portal-ribbon '+(leader?'leader-portal-ribbon':'member-portal-ribbon')+'"><span class="portal-icon">'+(leader?'♛':'◉')+'</span><div><b>'+(leader?'LEADER PANEL':'MEMBER PANEL')+'</b><small>YUVAKESARI YOUTH CLUB · SECURE ACCESS</small></div><span class="portal-session-state">ACTIVE SESSION</span></div>';
  if(preview){
    return ribbon+
      '<div class="member-dashboard-head"><div class="modal-kicker">'+(leader?'LEADERSHIP ACCESS':'MEMBERSHIP ACCESS')+'</div><h2 class="modal-title">'+(leader?'Welcome to the leader panel.':'Welcome back, '+esc(data.name||'Member')+'.')+'</h2><p class="modal-sub">'+(leader?'Your YYC leadership space is read-only. Account changes are managed by YYC administration.':'Your approved membership, unique ID and digital card are available here.')+'</p></div>';
  }
  return ribbon+
    '<div class="member-dashboard-head yyc-portal-heading"><div><div class="modal-kicker">'+(leader?'LEADERSHIP ACCESS':'MEMBERSHIP ACCESS')+'</div><h2 class="modal-title">'+(leader?'Welcome to the leader panel.':'Welcome back, '+esc(data.name||'Member')+'.')+'</h2><p class="modal-sub">'+(leader?'Your YYC leadership space is read-only. Account changes are managed by YYC administration.':'Your approved membership, unique ID and digital card are available here.')+'</p></div>'+portalAccountMenu(kind,data)+'</div>';
}
function yycPortalSummary(data,kind){
  var leader=kind==='leader';
  var role=leader?(data.role||'LEADER'):(data.position||'MEMBER');
  var number=data.role_number||'PENDING';
  return '<div class="portal-summary-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">'+
    '<div class="portal-summary-card" style="padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:15px"><small style="color:#77827f;font:800 7px/1 Inter;letter-spacing:.14em">UNIQUE ID</small><b style="display:block;margin-top:7px;color:#e9dfc6">'+esc(number)+'</b></div>'+
    '<div class="portal-summary-card" style="padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:15px"><small style="color:#77827f;font:800 7px/1 Inter;letter-spacing:.14em">POSITION</small><b style="display:block;margin-top:7px;color:#e9dfc6">'+esc(role)+'</b></div>'+
    '<div class="portal-summary-card" style="padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:15px"><small style="color:#77827f;font:800 7px/1 Inter;letter-spacing:.14em">STATUS</small><b class="portal-status" style="display:block;margin-top:7px;color:#8fd8b0">ACTIVE</b></div>'+
  '</div>';
}

function portalAccountMenu(kind,data){
  data=data||{};
  var leader=kind==='leader';
  var id=leader?'leader':'member';
  var photo=data.photo_url||'assets/yyc-logo-clean.webp';
  return '<div class="yyc-portal-account">'+
    '<button type="button" class="yyc-portal-avatar-btn" id="'+id+'ProfileMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="Open '+id+' profile menu">'+
      '<img src="'+esc(photo)+'" alt="'+esc(data.name|| (leader?'Leader':'Member'))+'" '+yycProfilePhotoStyle(data)+' onerror="this.onerror=null;this.src=\'assets/yyc-logo-clean.webp\'">'+
      '<span class="yyc-portal-avatar-caret">⌄</span>'+
    '</button>'+
    '<div class="yyc-portal-menu" id="'+id+'ProfileMenu" hidden>'+
      '<div class="yyc-portal-menu-head"><img src="'+esc(photo)+'" alt="" '+yycProfilePhotoStyle(data)+'><div><b>'+esc(data.name|| (leader?'Leader':'Member'))+'</b><small>'+esc(data.role_number||'YYC PROFILE')+'</small></div></div>'+
      '<button type="button" class="yyc-portal-menu-item" id="'+id+'ProfileViewBtn"><span>◉</span> MY PROFILE</button>'+
      '<button type="button" class="yyc-portal-menu-item" id="'+id+'IdCardBtn"><span>▣</span> ID CARD</button>'+
      '<button type="button" class="yyc-portal-menu-item" id="'+id+'EditSubmissionBtn"><span>✎</span> EDIT PROFILE & SECURITY</button>'+
    '</div>'+
  '</div>';
}

function bindPortalAccountMenu(kind,data){
  var leader=kind==='leader';
  var id=leader?'leader':'member';
  var menuBtn=$('#'+id+'ProfileMenuBtn');
  var menu=$('#'+id+'ProfileMenu');
  if(!menuBtn||!menu) return;
  function close(){menu.hidden=true;menuBtn.setAttribute('aria-expanded','false');}
  function toggle(){menu.hidden=!menu.hidden;menuBtn.setAttribute('aria-expanded',menu.hidden?'false':'true');}
  menuBtn.addEventListener('click',function(e){e.stopPropagation();toggle();});
  document.addEventListener('click',function(e){if(!menu.hidden && !e.target.closest('.yyc-portal-account'))close();});
  var profile=$('#'+id+'ProfileViewBtn');
  if(profile) profile.addEventListener('click',function(){close();portalProfileView(kind,data);});
  var card=$('#'+id+'IdCardBtn');
  if(card) card.addEventListener('click',function(){close();var el=document.querySelector('.yyc-digital-card-wrap');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});});
  var edit=$('#'+id+'EditSubmissionBtn');
  if(edit) edit.addEventListener('click',function(){close();leader?leaderEditProfile(data):memberEditSubmission(data);});
}

function portalProfileView(kind,data){
  data=data||{};
  var leader=kind==='leader';
  var date=data.dob?fmtDate(data.dob):'—';
  var photo=data.photo_url||'assets/yyc-logo-clean.webp';
  openModal(
    '<div class="portal-profile-view">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="portalProfileBack">← BACK</button><span class="portal-profile-kicker">'+(leader?'LEADER PROFILE':'MEMBER PROFILE')+'</span></div>'+
      '<div class="portal-profile-hero">'+
        '<img class="portal-profile-large-photo" src="'+esc(photo)+'" alt="'+esc(data.name||'YYC Profile')+'" '+yycProfilePhotoStyle(data)+' onerror="this.onerror=null;this.src=\'assets/yyc-logo-clean.webp\'">'+
        '<div><div class="modal-kicker">YUVAKESARI YOUTH CLUB</div><h2 class="modal-title">'+esc(data.name|| (leader?'Leader':'Member'))+'</h2><p class="modal-sub">'+esc(leader?(data.role||'LEADER'):(data.position||'MEMBER'))+'</p></div>'+
      '</div>'+
      '<div class="portal-profile-grid">'+
        '<div><span>UNIQUE ID</span><b>'+esc(data.role_number||'—')+'</b></div>'+
        '<div><span>DATE OF BIRTH</span><b>'+esc(date)+'</b></div>'+
        '<div><span>PHONE</span><b>'+esc(data.phone||'—')+'</b></div>'+
        '<div><span>EMAIL</span><b>'+esc(data.email||'—')+'</b></div>'+
        '<div><span>CLUB</span><b>'+esc(data.club_name||'Yuvakesari Youth Club')+'</b></div>'+
        '<div><span>STATUS</span><b>ACTIVE</b></div>'+
      '</div>'+
      '<div class="form-actions"><button type="button" class="btn gold" id="portalProfileCardBtn">VIEW ID CARD</button><button type="button" class="btn outline" id="portalProfileEditBtn">EDIT PROFILE</button></div>'+
    '</div>'
  );
  var back=$('#portalProfileBack');
  if(back) back.addEventListener('click',function(){leader?leaderDashboard(data):memberDashboard(data);});
  var card=$('#portalProfileCardBtn');
  if(card) card.addEventListener('click',function(){
    leader?leaderDashboard(data):memberDashboard(data);
    setTimeout(function(){var el=document.querySelector('.yyc-digital-card-wrap');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},80);
  });
  var edit=$('#portalProfileEditBtn');
  if(edit) edit.addEventListener('click',function(){leader?leaderEditProfile(data):memberEditSubmission(data);});
}

function memberEditSubmission(data){
  data=data||{};
  var obj={photo:data.photo_url||'',scale:data.photo_scale||1,x:data.photo_pos_x==null?50:data.photo_pos_x,y:data.photo_pos_y==null?50:data.photo_pos_y};
  openModal(
    '<div class="portal-profile-view">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="memberEditBack">← BACK</button><span class="portal-profile-kicker">MEMBER · EDIT PROFILE</span></div>'+
      '<h2 class="modal-title">Edit your profile.</h2>'+
      '<p class="modal-sub">Change your name, date of birth, phone, email, profile photo or password. Unique ID, position and approval remain admin-controlled.</p>'+
      '<form id="memberEditSubmissionForm"><div class="form-grid">'+
        '<div class="field"><label>Full name</label><input id="meName" value="'+esc(data.name||'')+'" required></div>'+
        '<div class="field"><label>Date of birth</label><input id="meDob" type="date" value="'+esc(data.dob||'')+'" required></div>'+
        '<div class="field"><label>Phone</label><input id="mePhone" value="'+esc(data.phone||'')+'" required></div>'+
        '<div class="field"><label>Email</label><input id="meEmail" type="email" value="'+esc(data.email||'')+'" required></div>'+
        '<div class="field"><label>Current password</label><input id="meCurrentPass" type="password" autocomplete="current-password" placeholder="Only needed to change password"></div>'+
        '<div class="field"><label>New password</label><input id="meNewPass" type="password" autocomplete="new-password" minlength="8" placeholder="Leave blank to keep"></div>'+
        '<div class="field"><label>Confirm new password</label><input id="meConfirmPass" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter new password"></div>'+
        '<div class="field full"><label>Profile photo</label><input id="mePhoto" type="file" accept="image/*"></div>'+
      '</div>'+imageEditor('memberEditPhoto',obj.photo,obj.scale,obj.x,obj.y)+
      '<div class="form-actions"><button type="submit" class="btn gold">SAVE PROFILE <span>✓</span></button></div></form>'+
    '</div>'
  );
  wireEditor('memberEditPhoto',obj,'mePhoto');
  var back=$('#memberEditBack'); if(back) back.addEventListener('click',function(){memberDashboard(data);});
  $('#memberEditSubmissionForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      btn.disabled=true;
      var newPass=$('#meNewPass').value, confirmPass=$('#meConfirmPass').value;
      if(newPass!==confirmPass) throw new Error('New password and confirmation do not match');
      if(newPass && newPass.length<8) throw new Error('New password must be at least 8 characters');
      var payload={name:$('#meName').value.trim(),dob:$('#meDob').value,phone:$('#mePhone').value.trim(),email:$('#meEmail').value.trim(),current_password:$('#meCurrentPass').value,new_password:newPass,photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y};
      if(!payload.name||!payload.dob||!payload.phone||!payload.email) throw new Error('Please complete all required fields');
      if(!obj.photo) throw new Error('Please keep or choose a member photo');
      if(String(obj.photo).startsWith('data:image/')){
        btn.textContent='UPDATING PROFILE…';
        var croppedPhoto=await yycManualSquareCrop(obj.photo,obj.scale,obj.x,obj.y,760);
        payload.photo_data=await uploadYYCImage(croppedPhoto,'member-profile',memberToken,data.id||'',data.photo_url||'');
        payload.photo_scale=1; payload.photo_pos_x=50; payload.photo_pos_y=50;
      }
      var r=await rpc('member_update_submission',{p_token:memberToken,p_payload:payload});
      if(!r||!r.ok) throw new Error(r&&r.error||'Could not save profile');
      yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(r.member));
      closeModal(); memberDashboard(r.member);
      toast(r.password_changed?'Profile and password updated':'Profile updated');
    }catch(err){btn.disabled=false;toast(err.message||'Could not save profile');}
  });
}


function yycOpenMemberNotifications(){
  if(!memberToken){toast('Please log in as a member first.');return;}
  openModal('<div class="yyc-member-notifications"><div class="yyc-detail-kicker">MEMBER NOTIFICATIONS</div><div class="yyc-detail-head"><div><h2 class="modal-title">Your notifications.</h2><p class="modal-sub">YYC account updates and event notices sent to you.</p></div><button type="button" class="mini-btn" id="yycMarkAllNotifications">MARK ALL READ</button></div><div id="yycNotificationList" class="yyc-notification-list"><div class="storage-loading"><strong>Loading notifications…</strong></div></div></div>');
  var list=$('#yycNotificationList');
  function render(items){
    items=items||[];
    if(!items.length){list.innerHTML='<div class="empty">No notifications yet.</div>';return;}
    list.innerHTML=items.map(function(n){
      return '<article class="yyc-notification-item '+(!n.is_read?'unread':'')+'"><div class="yyc-notification-dot"></div><div class="yyc-notification-main"><span>'+esc(String(n.type||'general').toUpperCase())+' · '+esc(fmtDate(n.created_at))+'</span><h3>'+esc(n.title||'YYC notification')+'</h3>'+(n.body?'<p>'+esc(n.body)+'</p>':'')+(n.link?'<a href="'+esc(n.link)+'" target="_blank" rel="noopener">OPEN LINK ↗</a>':'')+'</div>'+(!n.is_read?'<button type="button" class="mini-btn" data-mark-notification="'+esc(n.id)+'">READ</button>':'')+'</article>';
    }).join('');
    Array.prototype.slice.call(document.querySelectorAll('#yycNotificationList [data-mark-notification]')).forEach(function(btn){
      btn.addEventListener('click',async function(){
        btn.disabled=true;
        try{
          var r=await rpc('member_portal',{p_token:memberToken,p_action:'notifications_read',p_payload:{notification_id:btn.getAttribute('data-mark-notification')}});
          if(!r||!r.ok)throw new Error(r&&r.error||'Could not update notification');
          var fresh=await rpc('member_portal',{p_token:memberToken,p_action:'notifications'});
          render(fresh&&fresh.ok?fresh.notifications:[]);
        }catch(e){toast(e.message||'Could not update notification');btn.disabled=false;}
      });
    });
  }
  rpc('member_portal',{p_token:memberToken,p_action:'notifications'}).then(function(r){
    if(!r||!r.ok)throw new Error(r&&r.error||'Could not load notifications');
    yycMemberNotificationCache=r.notifications||[];
    render(yycMemberNotificationCache);
  }).catch(function(e){list.innerHTML='<div class="storage-error"><strong>Could not load notifications.</strong><span>'+esc(e.message)+'</span></div>';});
  var all=$('#yycMarkAllNotifications');
  if(all)all.addEventListener('click',async function(){
    all.disabled=true;
    try{
      var r=await rpc('member_portal',{p_token:memberToken,p_action:'notifications_read_all'});
      if(!r||!r.ok)throw new Error(r&&r.error||'Could not mark notifications');
      all.textContent='ALL READ ✓';
      var fresh=await rpc('member_portal',{p_token:memberToken,p_action:'notifications'});
      yycMemberNotificationCache=fresh&&fresh.ok?(fresh.notifications||[]):[];
      render(yycMemberNotificationCache);
    }catch(e){toast(e.message||'Could not update notifications');all.disabled=false;}
  });
}
async function yycLoadMemberPortalExtras(){
  if(!memberToken)return;
  try{
    var r=await rpc('member_portal',{p_token:memberToken,p_action:'rsvps'});
    yycMemberRsvpMap={};
    if(r&&r.ok)(r.rsvps||[]).forEach(function(x){yycMemberRsvpMap[String(x.event_id)]=x.status;});
  }catch(e){}
  try{
    var n=await rpc('member_portal',{p_token:memberToken,p_action:'notifications'});
    yycMemberNotificationCache=n&&n.ok?(n.notifications||[]):[];
    var b=$('#memberNotificationsBtn');
    if(b){
      var unread=yycMemberNotificationCache.filter(function(x){return !x.is_read;}).length;
      b.innerHTML='NOTIFICATIONS '+(unread?'<span class="yyc-notification-badge">'+unread+'</span>':'');
    }
  }catch(e){}
}
function memberDashboard(data){
  data=data||{};
  openModal('<div class="premium-member-dashboard">'+(data.__adminView?'<div class="portal-admin-backbar"><button type="button" class="mini-btn" id="backToAdmin">← BACK TO ADMIN</button><span>ADMIN PREVIEW · MEMBER CARD</span></div>':'')+yycPortalHeader('member',data)+yycPortalSummary(data,'member')+
    yycDigitalCard(data,'member')+
    '<div class="yyc-card-download-bar"><div><b>DOWNLOAD YYC ID CARD</b><span>Front on top · Back below · QR included</span></div><div class="yyc-member-card-actions"><button type="button" class="btn outline" id="memberNotificationsBtn">NOTIFICATIONS</button><button type="button" class="btn gold" id="memberDownloadBtn">DOWNLOAD ID CARD ↓</button></div></div>'+
    '<div class="portal-action-row" style="margin-top:15px;padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:12px"><div><b>MEMBER ACCESS</b><span style="display:block;color:#7d8784;margin-top:5px;font-size:9px">Your digital ID is linked to the official YYC database.</span></div><div class="form-actions" style="margin:0;display:flex;flex-wrap:wrap"><button type="button" class="btn outline" id="memberEditProfileBtn">EDIT PROFILE</button><button type="button" class="btn outline" id="memberVerifyBtn">VERIFY ID ↗</button><button type="button" class="btn gold" id="memberLogout">LOGOUT</button></div></div>'+
    '<div class="notice portal-note" style="margin-top:12px">Click the digital card to flip between front and back. Scan the QR code to verify the official YYC record.</div>'+
    yycSessionSection('member',[])+
  '</div>');
  var back=$('#backToAdmin'); if(back) back.addEventListener('click',function(){adminPanel(data.__adminTab||'members');});
  bindPortalAccountMenu('member',data);
  var editProfile=$('#memberEditProfileBtn'); if(editProfile) editProfile.addEventListener('click',function(){memberEditSubmission(data);});
  var verify=$('#memberVerifyBtn');
  if(verify) verify.addEventListener('click',function(){window.open(yycVerifyUrl(data.role_number),'_blank','noopener');});
  var download=$('#memberDownloadBtn');
  if(download) download.addEventListener('click',function(){downloadYYCDigitalCard(data,'member',download).catch(function(e){toast(e.message||'ID card download failed.');});});
  if(!data.__adminView) yycLoadDeviceSessions('member');
  var logout=$('#memberLogout');
  if(logout) logout.addEventListener('click',async function(){
    logout.disabled=true;
    try{if(memberToken) await rpc('member_logout',{p_token:memberToken});}catch(e){}
    yycSafeRemove(localStorage,MEMBER_TOKEN_KEY);yycSafeRemove(localStorage,'yyc_member_profile_v1');memberToken='';closeModal();toast('Member logged out');
  });
}
function leaderEditProfile(data){
  data=data||{};
  var obj={photo:data.photo_url||'',scale:data.photo_scale||1,x:data.photo_pos_x==null?50:data.photo_pos_x,y:data.photo_pos_y==null?50:data.photo_pos_y};
  openModal(
    '<div class="portal-profile-view">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="leaderEditBack">← BACK</button><span class="portal-profile-kicker">LEADER · EDIT PROFILE</span></div>'+
      '<h2 class="modal-title">Edit your profile.</h2>'+
      '<p class="modal-sub">Change your name, date of birth, phone, email, profile photo or password. Role, Unique ID and access remain admin-controlled.</p>'+
      '<form id="leaderEditProfileForm"><div class="form-grid">'+
        '<div class="field"><label>Full name</label><input id="leName" value="'+esc(data.name||'')+'" required></div>'+
        '<div class="field"><label>Date of birth</label><input id="leDob" type="date" value="'+esc(data.dob||'')+'" required></div>'+
        '<div class="field"><label>Phone</label><input id="lePhone" value="'+esc(data.phone||'')+'"></div>'+
        '<div class="field"><label>Email</label><input id="leEmail" type="email" value="'+esc(data.email||'')+'" required></div>'+
        '<div class="field"><label>Current password</label><input id="leCurrentPass" type="password" autocomplete="current-password" placeholder="Only needed to change password"></div>'+
        '<div class="field"><label>New password</label><input id="leNewPass" type="password" autocomplete="new-password" minlength="8" placeholder="Leave blank to keep"></div>'+
        '<div class="field"><label>Confirm new password</label><input id="leConfirmPass" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter new password"></div>'+
        '<div class="field full"><label>Profile photo</label><input id="lePhoto" type="file" accept="image/*"></div>'+
      '</div>'+imageEditor('leaderEditPhoto',obj.photo,obj.scale,obj.x,obj.y)+
      '<div class="form-actions"><button type="submit" class="btn gold">SAVE PROFILE <span>✓</span></button></div></form>'+
    '</div>'
  );
  wireEditor('leaderEditPhoto',obj,'lePhoto');
  var back=$('#leaderEditBack');
  if(back) back.addEventListener('click',function(){leaderDashboard(data);});
  $('#leaderEditProfileForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      btn.disabled=true;
      var newPass=$('#leNewPass').value;
      var confirmPass=$('#leConfirmPass').value;
      if(newPass!==confirmPass) throw new Error('New password and confirmation do not match');
      if(newPass && newPass.length<8) throw new Error('New password must be at least 8 characters');
      var payload={name:$('#leName').value.trim(),dob:$('#leDob').value,phone:$('#lePhone').value.trim(),email:$('#leEmail').value.trim(),current_password:$('#leCurrentPass').value,new_password:newPass,photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y};
      if(!payload.name||!payload.dob||!payload.email) throw new Error('Please complete your name, date of birth and email');
      if(!obj.photo) throw new Error('Please keep or choose a leader photo');
      if(String(obj.photo).startsWith('data:image/')){
        btn.textContent='UPDATING PROFILE…';
        var croppedPhoto=await yycManualSquareCrop(obj.photo,obj.scale,obj.x,obj.y,760);
        payload.photo_data=await uploadYYCImage(croppedPhoto,'leader-profile',leaderToken,data.id||'',data.photo_url||'');
        payload.photo_scale=1; payload.photo_pos_x=50; payload.photo_pos_y=50;
      }
      var r=await rpc('leader_update_profile',{p_token:leaderToken,p_payload:payload});
      if(!r||!r.ok) throw new Error(r&&r.error||'Could not save profile');
      yycSafeSet(localStorage,'yyc_leader_profile_v1',JSON.stringify(r.leader));
      closeModal();
      leaderDashboard(r.leader);
      toast(r.password_changed?'Profile and password updated':'Profile updated');
    }catch(err){
      btn.disabled=false;
      toast(err.message||'Could not save profile');
    }
  });
}

function leaderDashboard(data){
  data=data||{};
  openModal('<div class="premium-member-dashboard">'+(data.__adminView?'<div class="portal-admin-backbar"><button type="button" class="mini-btn" id="backToAdmin">← BACK TO ADMIN</button><span>ADMIN PREVIEW · LEADER CARD</span></div>':'')+yycPortalHeader('leader',data)+yycPortalSummary(data,'leader')+
    yycDigitalCard(data,'leader')+
    '<div class="yyc-card-download-bar"><div><b>DOWNLOAD YYC ID CARD</b><span>Front on top · Back below · QR included</span></div><button type="button" class="btn gold" id="leaderDownloadBtn">DOWNLOAD ID CARD ↓</button></div>'+
    '<div class="portal-action-row" style="margin-top:15px;padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:12px"><div><b>LEADER ACCESS</b><span style="display:block;color:#7d8784;margin-top:5px;font-size:9px">Read-only leadership space. Contact YYC administration for account changes.</span></div><div class="form-actions" style="margin:0;display:flex;flex-wrap:wrap"><button type="button" class="btn outline" id="leaderEditProfileBtn">EDIT PROFILE</button><button type="button" class="btn outline" id="leaderVerifyBtn">VERIFY ID ↗</button><button type="button" class="btn gold" id="leaderLogout">LOGOUT</button></div></div>'+
    '<div class="notice leader-portal-note" style="margin-top:12px">Leadership profile access is available here. Administrative editing remains restricted to the YYC admin panel.</div>'+
    yycSessionSection('leader',[])+
  '</div>');
  var back=$('#backToAdmin'); if(back) back.addEventListener('click',function(){adminPanel(data.__adminTab||'leaders');});
  bindPortalAccountMenu('leader',data);
  var editProfile=$('#leaderEditProfileBtn'); if(editProfile) editProfile.addEventListener('click',function(){leaderEditProfile(data);});
  var verify=$('#leaderVerifyBtn');
  if(verify) verify.addEventListener('click',function(){window.open(yycVerifyUrl(data.role_number),'_blank','noopener');});
  var download=$('#leaderDownloadBtn');
  if(download) download.addEventListener('click',function(){downloadYYCDigitalCard(data,'leader',download).catch(function(e){toast(e.message||'ID card download failed.');});});
  if(!data.__adminView) yycLoadDeviceSessions('leader');
  var logout=$('#leaderLogout');
  if(logout) logout.addEventListener('click',async function(){
    logout.disabled=true;
    try{if(leaderToken) await rpc('leader_logout',{p_token:leaderToken});}catch(e){}
    yycSafeRemove(localStorage,LEADER_TOKEN_KEY);yycSafeRemove(localStorage,'yyc_leader_profile_v1');leaderToken='';closeModal();toast('Leader logged out');
  });
}

function memberLegacyPasswordSetup(prefillEmail){
  openModal(
    '<div class="access-login-screen member-access-screen"><button type="button" class="access-inline-close" data-access-close aria-label="Close member login">×</button>'+
      '<div class="access-login-hero"><div class="access-login-icon">⌑</div><div><span class="access-login-kicker">YYC MEMBER ACCOUNT RECOVERY</span><h2 class="access-login-title">Set your member password.</h2><p class="access-login-sub">This is for older approved member accounts whose original password was not carried into the upgraded login system.</p></div><span class="access-login-badge">ONE-TIME SETUP</span></div>'+
      '<form id="memberLegacySetupForm" class="access-login-form" novalidate>'+
        '<div class="access-form-field"><label for="mlEmail">Registered email</label><div class="access-input-wrap"><span class="access-input-icon">◎</span><input id="mlEmail" type="email" autocomplete="email" placeholder="Enter registered email" required></div></div>'+
        '<div class="access-form-field"><label for="mlDob">Date of birth</label><div class="access-input-wrap"><span class="access-input-icon">◷</span><input id="mlDob" type="date" autocomplete="bday" required></div></div>'+
        '<div class="access-form-field"><label for="mlPhone4">Last 4 digits of registered phone</label><div class="access-input-wrap"><span class="access-input-icon">◉</span><input id="mlPhone4" type="text" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="1234" required></div></div>'+
        '<div class="access-form-field"><label for="mlNewPass">New password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="mlNewPass" type="password" autocomplete="new-password" minlength="8" placeholder="Minimum 8 characters" required><button type="button" class="access-password-toggle" aria-label="Show password">SHOW</button></div></div>'+
        '<div class="access-form-field"><label for="mlConfirmPass">Confirm new password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="mlConfirmPass" type="password" autocomplete="new-password" minlength="8" placeholder="Re-enter new password" required><button type="button" class="access-password-toggle" aria-label="Show password">SHOW</button></div></div>'+
        '<div class="access-login-meta"><span>✓ Approved member accounts only</span><span>One-time migration recovery</span></div>'+
        '<div class="form-actions access-login-actions"><button type="submit" class="btn gold access-submit">SET PASSWORD <span>✓</span></button><button type="button" class="btn outline access-secondary" id="backToMemberLogin">BACK TO LOGIN</button></div>'+
        '<div class="access-login-status" role="status" aria-live="polite"></div>'+
      '</form>'+
    '</div>'
  );
  yycEnhanceLogin('memberLegacySetupForm','mlNewPass');
  yycEnhanceLogin('memberLegacySetupForm','mlConfirmPass');
  if(prefillEmail) $('#mlEmail').value=prefillEmail;
  var back=$('#backToMemberLogin'); if(back) back.addEventListener('click',memberLogin);
  $('#memberLegacySetupForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var form=this,btn=form.querySelector('button[type="submit"]');
    var p1=$('#mlNewPass').value,p2=$('#mlConfirmPass').value;
    if(p1!==p2){setLoginStatus('memberLegacySetupForm','Passwords do not match',true);return;}
    if(!/^\d{4}$/.test($('#mlPhone4').value.trim())){setLoginStatus('memberLegacySetupForm','Enter exactly the last 4 digits of your registered phone number',true);return;}
    try{
      if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='SETTING PASSWORD…';}
      setLoginStatus('memberLegacySetupForm','Verifying your old YYC member record…',false);
      var r=await rpc('member_legacy_set_password',{
        p_email:$('#mlEmail').value.trim(),
        p_dob:$('#mlDob').value,
        p_phone_last4:$('#mlPhone4').value.trim(),
        p_new_password:p1,
        p_device_name:yycDeviceLabel()
      });
      if(!r||!r.ok)throw new Error(r&&r.error||'Could not set member password');
      memberToken=r.token;
      yycSafeSet(localStorage,MEMBER_TOKEN_KEY,memberToken);
      yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(r.member||{}));
      setLoginStatus('memberLegacySetupForm','Password set successfully. Opening your member portal…',false);
      window.setTimeout(function(){closeModal();memberDashboard(r.member);},250);
    }catch(err){
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SET PASSWORD ✓';}
      setLoginStatus('memberLegacySetupForm',err.message,true);
      toast(err.message);
    }
  });
}

function memberLogin(){
  if(memberToken){
    var cachedMember=null;
    try{cachedMember=JSON.parse(yycSafeGet(localStorage,'yyc_member_profile_v1')||'null');}catch(e){}
    if(cachedMember && cachedMember.role_number){
      memberDashboard(cachedMember);
      return;
    }
    return rpc('member_me',{p_token:memberToken}).then(function(r){
      if(r&&r.ok&&r.member){
        yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(r.member));
        memberDashboard(r.member);
        return;
      }
      yycSafeRemove(localStorage,MEMBER_TOKEN_KEY);
      memberToken='';
      memberLogin();
    }).catch(function(e){toast(e.message||'Could not restore member session');});
  }
  openModal(
    '<div class="access-login-screen member-access-screen"><button type="button" class="access-inline-close" data-access-close aria-label="Close member login">×</button>'+
      '<div class="access-login-hero"><div class="access-login-icon">◉</div><div><span class="access-login-kicker">YYC MEMBER PORTAL</span><h2 class="access-login-title">Welcome back.</h2><p class="access-login-sub">Sign in with the email or phone number registered with Yuvakesari Youth Club.</p></div><span class="access-login-badge">MEMBER</span></div>'+
      '<form id="memberLoginForm" class="access-login-form" novalidate>'+
        '<div class="access-form-field"><label for="mIdent">Email or phone</label><div class="access-input-wrap"><span class="access-input-icon">◎</span><input id="mIdent" type="text" autocomplete="username" inputmode="email" placeholder="Enter email or phone" required></div></div>'+
        '<div class="access-form-field"><label for="mPass">Password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="mPass" type="password" autocomplete="current-password" placeholder="Enter your password" required><button type="button" class="access-password-toggle" aria-label="Show password">SHOW</button></div></div>'+
        '<div class="access-login-meta"><span>✓ Approved members only</span><span>Secure YYC access</span></div>'+
        '<div class="form-actions access-login-actions"><button type="submit" class="btn gold access-submit">LOGIN <span>→</span></button><button type="button" class="btn outline access-secondary" id="openRegisterFromLogin">NEW MEMBER</button></div>'+
        '<button type="button" class="yyc-legacy-password-link" id="openLegacyPasswordSetup">FIRST LOGIN / SET PASSWORD</button>'+
      '<div class="access-login-status" role="status" aria-live="polite"></div>'+
       '</form>'+
      '<div class="access-login-footer">Don’t have an account? Apply for membership and wait for admin approval.</div>'+
    '</div>'
  );
  yycEnhanceLogin('memberLoginForm','mPass');
  $('#openRegisterFromLogin').addEventListener('click',memberRegister);
  $('#openLegacyPasswordSetup').addEventListener('click',function(){memberLegacyPasswordSetup($('#mIdent').value.trim().includes('@')?$('#mIdent').value.trim():'');});
  $('#memberLoginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var form=this, btn=form.querySelector('button[type="submit"]');
    try{
      setLoginStatus('memberLoginForm','Checking your YYC membership…',false);
      var identifier=$('#mIdent').value.trim();
      var r=await rpc('member_login',{p_identifier:identifier,p_password:$('#mPass').value,p_device_name:yycDeviceLabel()});
      if(!r.ok){
        if(r.error_code==='PASSWORD_NOT_SET'){
          closeModal();
          window.setTimeout(function(){memberLegacyPasswordSetup(identifier.includes('@')?identifier:'');},80);
          return;
        }
        throw new Error(r.error||'Login failed');
      }
      setLoginStatus('memberLoginForm','Login successful. Opening your member portal…',false);
      memberToken=r.token; yycSafeSet(localStorage,MEMBER_TOKEN_KEY,memberToken); yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(r.member||{})); closeModal(); memberDashboard(r.member);
    }catch(err){
      if(btn){btn.dataset.busy='0';btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=btn.dataset.originalText||'LOGIN →';}
      setLoginStatus('memberLoginForm',err.message,true);
      toast(err.message);
    }
  });
}

function leaderLogin(){
  if(leaderToken){
    var cachedLeader=null;
    try{cachedLeader=JSON.parse(yycSafeGet(localStorage,'yyc_leader_profile_v1')||'null');}catch(e){}
    if(cachedLeader && cachedLeader.role_number){
      leaderDashboard(cachedLeader);
      return;
    }
    return rpc('leader_me',{p_token:leaderToken}).then(function(r){
      if(r&&r.ok&&r.leader){
        yycSafeSet(localStorage,'yyc_leader_profile_v1',JSON.stringify(r.leader));
        leaderDashboard(r.leader);
        return;
      }
      yycSafeRemove(localStorage,LEADER_TOKEN_KEY);
      leaderToken='';
      leaderLogin();
    }).catch(function(e){toast(e.message||'Could not restore leader session');});
  }
  openModal(
    '<div class="access-login-screen leader-access-screen"><button type="button" class="access-inline-close" data-access-close aria-label="Close leader login">×</button>'+
      '<div class="access-login-hero"><div class="access-login-icon">♛</div><div><span class="access-login-kicker">YYC LEADERSHIP PORTAL</span><h2 class="access-login-title">Leadership access.</h2><p class="access-login-sub">Use the email or phone number created for you by YYC administration.</p></div><span class="access-login-badge leader">LEADER</span></div>'+
      '<form id="leaderLoginForm" class="access-login-form" novalidate>'+
        '<div class="access-form-field"><label for="lIdent">Email or phone</label><div class="access-input-wrap"><span class="access-input-icon">◎</span><input id="lIdent" type="text" autocomplete="username" inputmode="email" placeholder="Enter email or phone" required></div></div>'+
        '<div class="access-form-field"><label for="lPass">Password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="lPass" type="password" autocomplete="current-password" placeholder="Enter your password" required><button type="button" class="access-password-toggle" aria-label="Show password">SHOW</button></div></div>'+
        '<div class="access-login-meta"><span>♛ Read-only leadership space</span><span>Protected access</span></div>'+
        '<div class="form-actions access-login-actions"><button type="submit" class="btn gold access-submit">LOGIN AS LEADER <span>→</span></button></div>'+
      '<div class="access-login-status" role="status" aria-live="polite"></div>'+
       '</form>'+
      '<div class="access-login-footer">Leadership accounts are created and managed by YYC administration.</div>'+
    '</div>'
  );
  yycEnhanceLogin('leaderLoginForm','lPass');
  $('#leaderLoginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var form=this, btn=form.querySelector('button[type="submit"]');
    try{
      setLoginStatus('leaderLoginForm','Checking your YYC leadership access…',false);
      var r=await rpc('leader_login',{p_identifier:$('#lIdent').value.trim(),p_password:$('#lPass').value,p_device_name:yycDeviceLabel()});
      if(!r.ok) throw new Error(r.error||'Invalid leader credentials');
      setLoginStatus('leaderLoginForm','Login successful. Opening leadership portal…',false);
      leaderToken=r.token; yycSafeSet(localStorage,LEADER_TOKEN_KEY,leaderToken); yycSafeSet(localStorage,'yyc_leader_profile_v1',JSON.stringify(r.leader||{})); closeModal(); leaderDashboard(r.leader);
    }catch(err){
      if(btn){btn.dataset.busy='0';btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=btn.dataset.originalText||'LOGIN AS LEADER →';}
      setLoginStatus('leaderLoginForm',err.message,true);
      toast(err.message);
    }
  });
}

function adminLogin(){
  if(adminToken){
    adminPanel();
    return;
  }
  openModal(
    '<div class="access-login-screen admin-access-screen"><button type="button" class="access-inline-close" data-access-close aria-label="Close admin login">×</button>'+
      '<div class="access-login-hero"><div class="access-login-icon">⌑</div><div><span class="access-login-kicker">YYC PRIVATE CONTROL</span><h2 class="access-login-title">Admin sign in.</h2><p class="access-login-sub">Enter the administrator credentials to access the complete YYC management system.</p></div><span class="access-login-badge admin">PRIVATE</span></div>'+
      '<form id="adminLoginForm" class="access-login-form" novalidate>'+
        '<div class="access-form-field"><label for="aUser">Admin ID</label><div class="access-input-wrap"><span class="access-input-icon">◉</span><input id="aUser" type="text" autocomplete="username" placeholder="Enter admin ID" required></div></div>'+
        '<div class="access-form-field"><label for="aPass">Password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="aPass" type="password" autocomplete="current-password" placeholder="Enter admin password" required><button type="button" class="access-password-toggle" aria-label="Show password">SHOW</button></div></div>'+
        '<div class="access-login-meta"><span>⌑ Private administrator access</span><span>Session protected</span></div>'+
        '<div class="form-actions access-login-actions"><button type="submit" class="btn gold access-submit">ENTER ADMIN <span>→</span></button></div>'+
      '<div class="access-login-status" role="status" aria-live="polite"></div>'+
       '</form>'+
      '<div class="access-login-footer">Administrator credentials are private. Do not share them with other users.</div>'+
    '</div>'
  );
  yycEnhanceLogin('adminLoginForm','aPass');
  $('#adminLoginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var form=this, btn=form.querySelector('button[type="submit"]');
    try{
      setLoginStatus('adminLoginForm','Checking secure administrator access…',false);
      var r=await rpc('admin_login',{p_username:$('#aUser').value.trim(),p_password:$('#aPass').value});
      if(!r.ok) throw new Error(r.error||'Invalid credentials');
      setLoginStatus('adminLoginForm','Login successful. Opening admin control center…',false);
      adminToken=r.token; yycSafeSet(localStorage,ADMIN_TOKEN_KEY,adminToken); adminData=null; closeModal(); adminPanel();
    }catch(err){
      if(btn){btn.dataset.busy='0';btn.disabled=false;btn.classList.remove('is-loading');btn.textContent=btn.dataset.originalText||'ENTER ADMIN →';}
      setLoginStatus('adminLoginForm',err.message,true);
      toast(err.message);
    }
  });
}

function getAdmin(force){
  if(!adminToken) adminToken=yycSafeGet(localStorage,ADMIN_TOKEN_KEY);
  if(!adminToken){adminLogin();return null;}
  if(!force && adminData && adminData.ok!==false) return Promise.resolve(adminData);
  return rpc('admin_dashboard',{p_token:adminToken}).then(function(d){
    if(!d || d.ok===false){
      var msg=d&&d.error ? String(d.error) : 'Could not load admin data';
      if(/^unauthorized$/i.test(msg.trim()) || /invalid.*token|session.*invalid|token.*invalid/i.test(msg)){
        yycSafeRemove(localStorage,ADMIN_TOKEN_KEY);
        adminToken='';
        adminData=null;
        toast('Admin session ended. Please login again.');
        adminLogin();
        return null;
      }
      toast(msg);
      return null;
    }
    adminData=d;
    return d;
  }).catch(function(e){
    /* Network/server failures never destroy a valid saved session. */
    toast(e.message||'Could not load admin data');
    return null;
  });
}
function yycAdminDataSignature(d){
  d=d||{};
  function countByStatus(list,status){
    var target=String(status||'').toLowerCase();
    return (list||[]).filter(function(x){return String(x.status||'').toLowerCase()===target;}).length;
  }
  return JSON.stringify({
    members:(d.members||[]).length,
    leaders:(d.leaders||[]).length,
    updates:(d.updates||[]).length,
    gallery:(d.gallery||[]).length,
    events:(d.events||[]).length,
    swags:(d.swags||[]).length,
    pendingMembers:countByStatus(d.members,'pending'),
    pendingUpdates:(d.pending_updates||[]).length,
    pendingGallery:(d.pending_gallery||[]).length
  });
}
function yycAdminSyncLabel(message,online){
  var text=$('#yycAdminSyncText'),dot=$('#yycAdminSyncDot');
  if(text) text.textContent=message||'LIVE SYNC';
  if(dot) dot.classList.toggle('offline',online===false);
}
async function yycAdminAutoSync(){
  if(window.__yycAdminSyncBusy)return;
  var workspace=$('#adminWorkspace');
  if(!workspace || !adminToken){
    if(window.__yycAdminSyncTimer){clearInterval(window.__yycAdminSyncTimer);window.__yycAdminSyncTimer=null;}
    return;
  }
  /* Never replace an open editor/form while the admin is typing. */
  if(document.querySelector('#modalContent form[id^="admin"]') || document.querySelector('#modalContent #yycpBatchForm')){
    yycAdminSyncLabel('LIVE SYNC · editor open',true);
    return;
  }
  window.__yycAdminSyncBusy=true;
  try{
    var d=await rpc('admin_dashboard',{p_token:adminToken,},{timeoutMs:18000,retries:1});
    if(!d || d.ok===false)throw new Error(d&&d.error||'Admin sync failed');
    var previous=window.__yycAdminLastData||adminData||{};
    var prevSig=yycAdminDataSignature(previous);
    var nextSig=yycAdminDataSignature(d);
    adminData=d;
    window.__yycAdminLastData=d;
    yycAdminSyncLabel('LIVE SYNC · '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),true);
    var active=window.__yycAdminActiveTab||workspace.getAttribute('data-yyc-active-tab')||'overview';
    if(prevSig!==nextSig && prevSig!=='{}'){
      renderAdminTab(active,d);
      toast('YYC data updated automatically.');
      if(typeof window.YYC90MountAdmin==='function') window.setTimeout(window.YYC90MountAdmin,0);
    }
  }catch(e){
    yycAdminSyncLabel('LIVE SYNC · retrying',false);
  }finally{
    window.__yycAdminSyncBusy=false;
  }
}
function yycAdminStartAutoSync(){
  if(window.__yycAdminSyncTimer)clearInterval(window.__yycAdminSyncTimer);
  window.__yycAdminSyncTimer=window.setInterval(yycAdminAutoSync,20000);
}
function yycAdminAddMenuClose(){
  var menu=$('#yycAdminAddMenu'),btn=$('#yycAdminAddBtn');
  if(menu) menu.hidden=true;
  if(btn) btn.setAttribute('aria-expanded','false');
}
function yycAdminOpenAdd(kind){
  yycAdminAddMenuClose();
  if(kind==='member') return adminMemberForm(null);
  if(kind==='leader') return adminLeaderForm(null);
  if(kind==='update') return adminUpdateForm(null);
  if(kind==='gallery') return adminGalleryForm(null);
  if(kind==='event') return adminEventForm(null);
  if(kind==='swag') return adminSwagForm(null);
}
function yycAdminGlobalSearchItems(d,q){
  q=String(q||'').trim().toLowerCase();
  if(!q) return [];
  d=d||{};
  var groups=[
    ['member','members','Member','name,email,phone,role_number,position'],
    ['leader','leaders','Leader','name,email,phone,role,line,role_number'],
    ['update','updates','Update','title,body,category,status'],
    ['gallery','gallery','Gallery','title,caption,album,status'],
    ['event','events','Event','title,description,location,category,status'],
    ['swag','swags','Swag','title,description,category,status']
  ];
  var out=[];
  groups.forEach(function(g){
    (d[g[1]]||[]).forEach(function(x){
      var hay=g[3].split(',').map(function(k){return String(x[k]||'').toLowerCase();}).join(' ');
      if(hay.indexOf(q)>=0){
        out.push({kind:g[0],type:g[2],id:x.id,title:x.name||x.title||'Untitled',meta:x.role||x.position||x.location||x.category||x.status||'YYC record'});
      }
    });
  });
  return out.slice(0,8);
}
function yycAdminRenderGlobalSearch(d,q){
  var box=$('#yycAdminSearchResults');
  if(!box) return;
  q=String(q||'').trim();
  if(!q){box.hidden=true;box.innerHTML='';return;}
  var items=yycAdminGlobalSearchItems(d,q);
  if(!items.length){
    box.innerHTML='<div class="yyc-admin-search-empty">No matching YYC records.</div>';
    box.hidden=false;
    return;
  }
  box.innerHTML=items.map(function(x){
    return '<button type="button" class="yyc-admin-search-result" data-global-kind="'+esc(x.kind)+'" data-global-id="'+esc(x.id)+'"><span class="yyc-admin-search-type">'+esc(x.type)+'</span><span class="yyc-admin-search-main"><b>'+esc(x.title)+'</b><small>'+esc(x.meta)+'</small></span><span class="yyc-admin-search-arrow">↗</span></button>';
  }).join('');
  box.hidden=false;
}
function yycAdminBindTools(d){
  var addBtn=$('#yycAdminAddBtn'),menu=$('#yycAdminAddMenu'),search=$('#yycAdminGlobalSearch'),results=$('#yycAdminSearchResults');
  if(addBtn&&menu&&!addBtn.dataset.bound){
    addBtn.dataset.bound='1';
    addBtn.addEventListener('click',function(e){
      e.stopPropagation();
      menu.hidden=!menu.hidden;
      addBtn.setAttribute('aria-expanded',menu.hidden?'false':'true');
    });
    Array.prototype.slice.call(menu.querySelectorAll('[data-admin-add]')).forEach(function(b){
      b.addEventListener('click',function(e){e.stopPropagation();yycAdminOpenAdd(b.getAttribute('data-admin-add'));});
    });
    document.addEventListener('click',function(e){
      if(menu.hidden)return;
      if(!e.target.closest('.yyc-admin-add-wrap')) yycAdminAddMenuClose();
    });
  }
  if(search&&!search.dataset.bound){
    search.dataset.bound='1';
    search.addEventListener('input',function(){yycAdminRenderGlobalSearch(d,this.value);});
    search.addEventListener('keydown',function(e){
      if(e.key==='Escape'){this.value='';yycAdminRenderGlobalSearch(d,'');this.blur();}
    });
  }
  if(results&&!results.dataset.bound){
    results.dataset.bound='1';
    results.addEventListener('click',function(e){
      var b=e.target.closest('[data-global-kind]');
      if(!b)return;
      e.preventDefault();
      var kind=b.getAttribute('data-global-kind'),id=b.getAttribute('data-global-id');
      if(search) search.value='';
      results.hidden=true;
      if(kind==='member') adminMemberForm(id);
      else if(kind==='leader') adminLeaderForm(id);
      else if(kind==='update') adminUpdateForm(id);
      else if(kind==='gallery') adminGalleryForm(id);
      else if(kind==='event') adminEventForm(id);
      else if(kind==='swag') adminSwagForm(id);
    });
  }
}
function yycAdminLoadRecentActivity(){
  var host=$('#yycAdminRecentActivity');
  if(!host||!adminToken)return;
  rpc('admin_recent_activity',{p_token:adminToken}).then(function(r){
    if(!r||!r.ok)throw new Error(r&&r.error||'Could not load activity');
    var items=(r.items||[]).slice(0,5);
    host.innerHTML=items.length?items.map(function(x){
      return '<div class="yyc-admin-recent-row"><span class="yyc-admin-recent-dot"></span><div><b>'+esc(x.summary||'YYC activity')+'</b><small>'+esc(x.actor_username||'Admin')+' · '+esc(new Date(x.created_at).toLocaleString('en-IN'))+'</small></div></div>';
    }).join(''):'<div class="yyc-admin-recent-empty">No recent administrative changes.</div>';
  }).catch(function(){
    host.innerHTML='<div class="yyc-admin-recent-empty">Recent activity is temporarily unavailable.</div>';
  });
}
function yycAnimateAdminNumbers(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Array.prototype.slice.call(document.querySelectorAll('#adminWorkspace .admin-stats b')).forEach(function(el){
    var target=parseInt(String(el.textContent).replace(/[^0-9]/g,''),10);
    if(!Number.isFinite(target))return;
    if(reduce){el.textContent=String(target);return;}
    var start=performance.now(),duration=420;
    function tick(now){
      var p=Math.min(1,(now-start)/duration);
      var eased=1-Math.pow(1-p,3);
      el.textContent=String(Math.round(target*eased));
      if(p<1)requestAnimationFrame(tick);
    }
    el.textContent='0';
    requestAnimationFrame(tick);
  });
}
function yycAdminWarnUnsaved(e){
  var back=e.target&&e.target.closest?e.target.closest('.admin-form-top .mini-btn,[data-admin-overview]'):null;
  if(!back)return;
  var form=document.querySelector('#modalContent form[id^="admin"]');
  if(!form||form.dataset.dirty!=='1')return;
  if(!confirm('Unsaved changes will be lost. Discard them?')){
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }
}

function adminPanel(tab,forceRefresh){
  /* FIXED SELECTOR MODE */
  getAdmin(!!forceRefresh).then(function(d){
    if(!d) return;
    window.__yycAdminLastData=d;
    tab=tab||'overview';
    var tabs=[['overview','Overview'],['members','Members'],['leaders','Leaders'],['updates','Updates'],['gallery','Gallery'],['swags','Swags'],['approvals','Approvals'],['events','Events'],['notifications','Notifications'],['activity','Activity'],['reports','Reports'],['storage','Data Storage'],['settings','Settings']];
    var nav=tabs.map(function(t){return '<button class="admin-tab '+(t[0]===tab?'active':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('');
    var pending=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';}).length+(d.pending_updates||[]).length+(d.pending_gallery||[]).length;
    openModal('<div class="admin-shell"><div class="portal-ribbon admin-portal-ribbon"><span class="portal-icon">⌑</span><div><b>ADMIN CONTROL CENTER</b><small>ACCESS LEVEL · FULL MANAGEMENT</small></div><span class="portal-secure">PRIVATE</span></div><div class="admin-header"><div><div class="modal-kicker">YUVAKESARI YOUTH CLUB</div><h2 class="modal-title">Admin Control Center</h2><p class="modal-sub">Manage members, leaders, approvals, events, gallery, reports and site settings.</p></div><div class="yyc-admin-head-tools"><div class="yyc-admin-global-tools"><div class="yyc-admin-add-wrap"><button type="button" class="mini-btn gold yyc-admin-add-btn" id="yycAdminAddBtn" aria-expanded="false"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>ADD</span></button><div class="yyc-admin-add-menu" id="yycAdminAddMenu" hidden><button type="button" data-admin-add="member">+ Member</button><button type="button" data-admin-add="leader">+ Leader</button><button type="button" data-admin-add="update">+ Update</button><button type="button" data-admin-add="gallery">+ Photo</button><button type="button" data-admin-add="event">+ Event</button><button type="button" data-admin-add="swag">+ Swag</button></div></div><div class="yyc-admin-global-search"><span aria-hidden="true">⌕</span><input id="yycAdminGlobalSearch" type="search" placeholder="Search all admin records" autocomplete="off"><div class="yyc-admin-search-results" id="yycAdminSearchResults" hidden></div></div></div><div class="yyc-admin-syncbar" aria-live="polite"><span class="yyc-admin-sync-dot" id="yycAdminSyncDot"></span><span id="yycAdminSyncText">LIVE SYNC · CONNECTING</span><button type="button" class="mini-btn" id="yycAdminRefresh">REFRESH NOW</button></div></div></div><div class="admin-tabs">'+nav+'</div><div class="admin-workspace" id="adminWorkspace"></div><div class="admin-session-footer"><span>YYC PRIVATE ADMIN SESSION</span><button class="mini-btn" id="adminLogout">LOGOUT</button></div></div>');
    yycAdminBindTools(d);
    $('#adminLogout').addEventListener('click',async function(){try{await rpc('admin_logout',{p_token:adminToken});}catch(e){}yycSafeRemove(localStorage,ADMIN_TOKEN_KEY);adminToken='';adminData=null;closeModal();toast('Admin logged out');});
    var adminRefreshBtn=$('#yycAdminRefresh');
    if(adminRefreshBtn) adminRefreshBtn.addEventListener('click',function(){
      adminRefreshBtn.disabled=true;adminRefreshBtn.textContent='REFRESHING…';
      yycAdminAutoSync().finally(function(){adminRefreshBtn.disabled=false;adminRefreshBtn.textContent='REFRESH NOW';});
    });
    Array.prototype.slice.call(document.querySelectorAll('.admin-tab')).forEach(function(b){
      b.addEventListener('click',function(){
        var selected=this.getAttribute('data-tab')||'overview';
        Array.prototype.slice.call(document.querySelectorAll('.admin-tab')).forEach(function(x){x.classList.toggle('active',x===b);});
        renderAdminTab(selected,d);
        if(typeof window.YYC90MountAdmin==='function') window.setTimeout(window.YYC90MountAdmin,0);
        var workspace=$('#adminWorkspace');
        if(workspace){
          workspace.setAttribute('data-yyc-active-tab',selected);
          workspace.classList.remove('yyc-admin-tab-enter');
          void workspace.offsetWidth;
          workspace.classList.add('yyc-admin-tab-enter');
          window.setTimeout(function(){workspace.classList.remove('yyc-admin-tab-enter');},520);
        }
      });
    });
    renderAdminTab(tab,d);
    if(typeof window.YYC90MountAdmin==='function') window.setTimeout(window.YYC90MountAdmin,0);
    yycAdminSyncLabel('LIVE SYNC · '+new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),true);
    yycAdminStartAutoSync();
    var workspace=$('#adminWorkspace');
    if(workspace){
      workspace.setAttribute('data-yyc-active-tab',tab);

      workspace.addEventListener('click',function(e){
        var target=e.target.closest('button');
        if(!target || !workspace.contains(target)) return;
        var back=target.closest('[data-admin-overview]');
        if(back){e.preventDefault();e.stopPropagation();adminPanel('overview');return;}
        var cardLeader=target.closest('[data-card-leader]');
        if(cardLeader){
          e.preventDefault();e.stopPropagation();
          var l=(d.leaders||[]).find(function(x){return String(x.id)===String(cardLeader.getAttribute('data-card-leader'));});
          if(l){l.__adminView=true;l.__adminTab='leaders';leaderDashboard(l);}
          return;
        }
        var dlLeader=target.closest('[data-download-leader]');
        if(dlLeader){
          e.preventDefault();e.stopPropagation();
          var dl=(d.leaders||[]).find(function(x){return String(x.id)===String(dlLeader.getAttribute('data-download-leader'));});
          if(dl) downloadAdminCard(dl,'leader');
          return;
        }
        var dlMember=target.closest('[data-download-member]');
    if(dlMember){
      e.preventDefault();
      e.stopPropagation();
      var md=window.__yycAdminLastData||adminData;
      var mm=(md&&md.members||[]).find(function(x){return String(x.id)===String(dlMember.getAttribute('data-download-member'));});
      if(mm) downloadAdminCard(mm,'member',dlMember); else toast('Member record not found');
      return;
    }

    var dlLeader=target.closest('[data-download-leader]');
    if(dlLeader){
      e.preventDefault();
      e.stopPropagation();
      var ld=window.__yycAdminLastData||adminData;
      var ll=(ld&&ld.leaders||[]).find(function(x){return String(x.id)===String(dlLeader.getAttribute('data-download-leader'));});
      if(ll) downloadAdminCard(ll,'leader',dlLeader); else toast('Leader record not found');
      return;
    }

    var resetLeader=target.closest('[data-reset-leader]');
    if(resetLeader){
      e.preventDefault();e.stopImmediatePropagation();
      var rlid=resetLeader.getAttribute('data-reset-leader');
      var rl=(d.leaders||[]).find(function(x){return String(x.id)===String(rlid);});
      if(rl){
        adminLeaderForm(rlid);
        setTimeout(function(){var field=$('#alPass');if(field)field.focus();},80);
      }else toast('Leader record not found');
      return;
    }

    var editLeader=target.closest('[data-edit-leader]');
        if(editLeader){
          e.preventDefault();e.stopPropagation();
          adminLeaderForm(editLeader.getAttribute('data-edit-leader'));
          return;
        }
        var delLeader=target.closest('[data-del-leader]');
        if(delLeader){
          e.preventDefault();e.stopPropagation();
          var lid=delLeader.getAttribute('data-del-leader');
          if(confirm('Remove leader "'+esc(l.name||'this leader')+'"?')) adminAction('admin_delete_leader',{p_id:lid},'Leader deleted');
          return;
        }
      });
    }
  });
}
function renderAdminTab(tab,d){
  var a=$('#adminWorkspace'); if(!a) return;
  if(tab==='overview'){
    var members=d.members||[], leaders=d.leaders||[], updates=d.updates||[], gallery=d.gallery||[], events=d.events||[];
    var pm=members.filter(function(m){return (m.status||'pending')==='pending';}).length;
    var pu=(d.pending_updates||[]).length, pg=(d.pending_gallery||[]).length;
    var approvedMembers=members.filter(function(m){return (m.status||'').toLowerCase()==='approved';}).length;
    var publishedUpdates=updates.filter(function(x){return (x.status||'published').toLowerCase()==='published';}).length;
    var publishedGallery=gallery.filter(function(x){return (x.status||'published').toLowerCase()==='published';}).length;
    var publishedEvents=events.filter(function(x){return (x.status||'published').toLowerCase()==='published';}).length;
    var pendingTotal=pm+pu+pg;
    var memberRate=members.length?Math.round((approvedMembers/members.length)*100):0;
    var maxContent=Math.max(1,publishedUpdates,publishedGallery,publishedEvents);
    function analyticsBar(label,value){
      var pct=Math.max(4,Math.round((value/maxContent)*100));
      return '<div class="yyc-analytics-row"><div class="yyc-analytics-label"><span>'+label+'</span><b>'+value+'</b></div><div class="yyc-analytics-track"><span style="width:'+pct+'%"></span></div></div>';
    }
    a.innerHTML=
      '<div class="admin-stats"><div><b>'+members.length+'</b><span>Members</span></div><div><b>'+leaders.length+'</b><span>Leaders</span></div><div><b>'+publishedUpdates+'</b><span>Published updates</span></div><div><b>'+publishedGallery+'</b><span>Gallery</span></div><div class="pending-stat"><b>'+pendingTotal+'</b><span>Pending approvals</span></div></div>'+
      '<div class="yyc-admin-analytics-grid">'+
        '<section class="yyc-analytics-panel"><div class="yyc-analytics-head"><div><span class="modal-kicker">LIVE ANALYTICS</span><h3>YYC activity snapshot</h3><p>Calculated from the current admin dataset.</p></div><span class="yyc-analytics-chip">'+memberRate+'% APPROVED</span></div>'+
          '<div class="yyc-analytics-bars">'+analyticsBar('Published updates',publishedUpdates)+analyticsBar('Published gallery',publishedGallery)+analyticsBar('Published events',publishedEvents)+'</div>'+
        '</section>'+
        '<section class="yyc-analytics-panel"><div class="yyc-analytics-head"><div><span class="modal-kicker">MEMBERSHIP</span><h3>Member health</h3><p>Approval pipeline and active records.</p></div><span class="yyc-analytics-chip">'+approvedMembers+' ACTIVE</span></div>'+
          '<div class="yyc-analytics-metrics"><div><b>'+approvedMembers+'</b><span>Approved</span></div><div><b>'+pm+'</b><span>Pending</span></div><div><b>'+members.filter(function(m){return (m.status||'').toLowerCase()==='duplicate';}).length+'</b><span>Duplicates</span></div></div>'+
          '<div class="yyc-analytics-note">'+(pendingTotal?'There are '+pendingTotal+' items waiting for review.':'Everything is currently up to date.')+'</div>'+
        '</section>'+
      '</div>'+
      '<div class="yyc-admin-quick-add-grid">'+
        '<button type="button" class="yyc-admin-quick-add" data-admin-add-overview="member"><span>+</span><b>Add member</b><small>Create a member record</small></button>'+
        '<button type="button" class="yyc-admin-quick-add" data-admin-add-overview="leader"><span>+</span><b>Add leader</b><small>Create a leader account</small></button>'+
        '<button type="button" class="yyc-admin-quick-add" data-admin-add-overview="update"><span>+</span><b>Add update</b><small>Publish or draft an update</small></button>'+
        '<button type="button" class="yyc-admin-quick-add" data-admin-add-overview="gallery"><span>+</span><b>Add photo</b><small>Manage gallery media</small></button>'+
        '<button type="button" class="yyc-admin-quick-add" data-admin-add-overview="event"><span>+</span><b>Add event</b><small>Create a YYC programme</small></button>'+
        '</div>'+
      '<div class="yyc-admin-quick-grid">'+
        '<button type="button" class="yyc-admin-quick" data-admin-tab="members"><span>◉</span><b>Members</b><small>Manage member records</small></button>'+
        '<button type="button" class="yyc-admin-quick" data-admin-tab="events"><span>◷</span><b>Events & RSVP</b><small>Publish programmes and member responses</small></button>'+
        '<button type="button" class="yyc-admin-quick" data-admin-tab="notifications"><span>🔔</span><b>Notifications</b><small>Send private member messages</small></button>'+
        '<button type="button" class="yyc-admin-quick" data-admin-tab="reports"><span>▤</span><b>Reports</b><small>Open detailed live reports</small></button>'+
      '</div>'+
      '<section class="yyc-admin-recent-panel"><div class="yyc-admin-recent-head"><h3>Recently changed</h3><span>LAST 5 ACTIONS</span></div><div class="yyc-admin-recent-list" id="yycAdminRecentActivity"><div class="yyc-admin-recent-empty">Loading recent activity…</div></div></section>'+
      '<div class="notice" style="margin-top:16px"><strong>Backend connected.</strong> Member approvals, notifications, event RSVP responses, accounts, content, settings and digital ID cards are stored centrally in Supabase.</div>';
    Array.prototype.slice.call(document.querySelectorAll('#adminWorkspace [data-admin-add-overview]')).forEach(function(btn){btn.addEventListener('click',function(){yycAdminOpenAdd(btn.getAttribute('data-admin-add-overview'));});});
    Array.prototype.slice.call(document.querySelectorAll('#adminWorkspace [data-admin-tab]')).forEach(function(btn){
      btn.addEventListener('click',function(){
        var target=btn.getAttribute('data-admin-tab');
        Array.prototype.slice.call(document.querySelectorAll('.admin-tab')).forEach(function(x){x.classList.toggle('active',x.getAttribute('data-tab')===target);});
        renderAdminTab(target,d);
      });
    });
    yycAdminLoadRecentActivity();
    yycAnimateAdminNumbers();
    return;
  }
  if(tab==='members'){
    /* Keep the admin member registry strictly ordered by YYC role number: 01, 02, 03… Pending/no-number records stay at the end. */
    var members=(d.members||[]).slice().sort(function(a,b){
      var ar=parseInt(String(a.role_number||'').replace(/[^0-9]/g,''),10);
      var br=parseInt(String(b.role_number||'').replace(/[^0-9]/g,''),10);
      var aHas=Number.isFinite(ar), bHas=Number.isFinite(br);
      if(aHas&&bHas) return ar-br;
      if(aHas&&!bHas) return -1;
      if(!aHas&&bHas) return 1;
      return String(a.name||'').localeCompare(String(b.name||'')); 
    });
    a.innerHTML='<div class="admin-top"><h2>Members</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="adminAddMember"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>Add member</span></button></div></div><div class="admin-toolbar"><input id="adminMemberSearch" class="admin-search" placeholder="Search name, role number, phone or email" autocomplete="off"><span class="admin-result-count" id="adminMemberCount"></span><button type="button" class="mini-btn" id="exportMembersCSV">Export CSV</button></div>'+ (members.length?'<div class="admin-card-list">'+members.map(function(m){return '<div class="approval-card"><div class="meta"><strong>'+esc(m.name)+'</strong><small>'+esc(m.role_number||'PENDING')+' · '+esc(m.email||'')+'</small><small>Status: <span class="yyc-member-status '+((m.status||'pending')==='duplicate'?'yyc-member-status-duplicate':((m.status||'pending')==='approved'?'yyc-member-status-approved':''))+'">'+esc(m.status||'pending')+'</span>'+(m.duplicate_of?' · DUPLICATE OF '+esc(m.duplicate_of):'')+'</small></div><div class="admin-actions"><button class="mini-btn" data-view="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">◉</span><span>Card</span></button><button class="mini-btn" data-download-member="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">↓</span><span>Download ID</span></button><button class="mini-btn" data-edit-member="'+m.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn" data-reset-member="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">🔑</span><span>PASSWORD</span></button>'+((m.status||'pending')==='pending'?'<button class="mini-btn" data-review-member="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">◉</span><span>Review</span></button><button class="mini-btn gold" data-approve="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">✓</span><span>Approve</span></button><button class="mini-btn" data-mark-duplicate="'+m.id+'">Duplicate</button><button class="mini-btn" data-deny="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">×</span><span>Deny</span></button>':'<button class="mini-btn" data-review-member="'+m.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">◉</span><span>View</span></button>')+'<button class="mini-btn" data-remove="'+m.id+'"><span class="yyc-admin-action-icon yyc-icon-remove" aria-hidden="true">×</span><span>Remove</span></button></div></div>';}).join('')+'</div>':'<div class="empty">No members yet.</div>');
    $('#adminAddMember').addEventListener('click',function(){adminMemberForm(null);});
    $('#adminMemberSearch').addEventListener('input',function(){var q=this.value.trim().toLowerCase();var rows=Array.prototype.slice.call(document.querySelectorAll('.admin-card-list .approval-card'));var shown=0;rows.forEach(function(row){var hit=!q||row.textContent.toLowerCase().indexOf(q)>=0;row.style.display=hit?'':'none';if(hit)shown++;});$('#adminMemberCount').textContent=shown+' of '+rows.length+' shown';});
    $('#adminMemberSearch').dispatchEvent(new Event('input'));
    $('#exportMembersCSV').addEventListener('click',function(){exportYYCMembersCSV(members);});
    Array.prototype.slice.call(document.querySelectorAll('[data-mark-duplicate]')).forEach(function(b){b.addEventListener('click',async function(){
      await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-mark-duplicate'),p_action:'mark_duplicate'},'Duplicate application marked');
    });});
    return;
  }

  if(tab==='leaders'){
    var ls=d.leaders||[];
    a.innerHTML='<div class="admin-top"><h2>Leaders</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addLeaderBtn"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>Add leader</span></button></div></div><div class="admin-toolbar"><input id="adminLeaderSearch" class="admin-search" placeholder="Search leader, role, number or email" autocomplete="off"><span class="admin-result-count" id="adminLeaderCount"></span><button type="button" class="mini-btn" id="exportLeadersCSV">Export CSV</button></div>'+ (ls.length?'<div class="admin-card-list">'+ls.map(function(l){return '<div class="approval-card"><div class="meta"><strong>'+esc(l.name)+'</strong><small>'+esc(l.role)+' · '+esc(l.role_number||'PENDING')+'</small><small>'+esc(l.line||'')+'</small><small>'+((l.login_enabled)?'Login enabled':'Login not set')+' · '+esc(l.status||'active')+'</small></div><div class="admin-actions"><button class="mini-btn" data-card-leader="'+l.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">◉</span><span>Card</span></button><button class="mini-btn" data-download-leader="'+l.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">↓</span><span>Download ID</span></button><button class="mini-btn" data-edit-leader="'+l.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn" data-reset-leader="'+l.id+'"><span class="yyc-admin-action-icon" aria-hidden="true">🔑</span><span>PASSWORD</span></button><button class="mini-btn" data-del-leader="'+l.id+'"><span class="yyc-admin-action-icon yyc-icon-remove" aria-hidden="true">×</span><span>Remove</span></button></div></div>';}).join(''):'<div class="empty">No leaders yet.</div>');
    $('#addLeaderBtn').addEventListener('click',function(){adminLeaderForm(null);});
    $('#adminLeaderSearch').addEventListener('input',function(){var q=this.value.trim().toLowerCase();var rows=$$('#adminWorkspace .admin-card-list .approval-card');var shown=0;rows.forEach(function(row){var hit=!q||row.textContent.toLowerCase().indexOf(q)>=0;row.style.display=hit?'':'none';if(hit)shown++;});$('#adminLeaderCount').textContent=shown+' of '+rows.length+' shown';});
    $('#adminLeaderSearch').dispatchEvent(new Event('input'));
    $('#exportLeadersCSV').addEventListener('click',function(){exportYYCLeadersCSV(ls);});
    return;
  }
  if(tab==='updates'){
    var ups=d.updates||[];
    a.innerHTML='<div class="admin-top"><h2>Updates</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addUpdateBtn"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>Add update</span></button></div></div><div class="admin-toolbar"><input id="adminUpdateSearch" class="admin-search" placeholder="Search updates" autocomplete="off"><select id="adminUpdateStatus"><option value="">All status</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select><span class="admin-result-count" id="adminUpdateCount"></span></div><div class="admin-card-list">'+(ups.length?ups.map(function(u){return '<div class="approval-card" data-content-status="'+esc(u.status||'published')+'"><div class="meta"><strong>'+esc(u.title)+'</strong><small>'+esc(fmtDate(u.event_date||u.published_at))+' · '+esc(u.body||'')+'</small><small>Status: '+esc(u.status||'published')+(u.featured?' · FEATURED':'')+(u.image_format?' · Photo: '+esc(yycImageFormatMeta(u.image_format).label):'')+'</small></div><div class="admin-actions"><button class="mini-btn gold" data-edit-update="'+u.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn" data-del-update="'+u.id+'"><span class="yyc-admin-action-icon yyc-icon-remove" aria-hidden="true">×</span><span>Remove</span></button></div></div>';}).join(''):'<div class="empty">No updates.</div>')+'</div>';
    $('#addUpdateBtn').addEventListener('click',function(){adminUpdateForm(null);});
    Array.prototype.slice.call(document.querySelectorAll('[data-edit-update]')).forEach(function(b){b.addEventListener('click',function(){adminUpdateForm(b.getAttribute('data-edit-update'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-del-update]')).forEach(function(b){b.addEventListener('click',async function(){if(confirm('Remove update "'+esc(u.title||'this update')+'"?')) await adminAction('admin_delete_content',{p_kind:'update',p_id:b.getAttribute('data-del-update')},'Update deleted');});});
    (function(){function filterUpdates(){var q=$('#adminUpdateSearch').value.trim().toLowerCase(),st=$('#adminUpdateStatus').value,rows=$$('#adminWorkspace .admin-card-list .approval-card');var shown=0;rows.forEach(function(row){var hit=(!q||row.textContent.toLowerCase().indexOf(q)>=0)&&(!st||row.getAttribute('data-content-status')===st);row.style.display=hit?'':'none';if(hit)shown++;});$('#adminUpdateCount').textContent=shown+' of '+rows.length+' shown';}$('#adminUpdateSearch').addEventListener('input',filterUpdates);$('#adminUpdateStatus').addEventListener('change',filterUpdates);filterUpdates();})();
    return;
  }
  if(tab==='gallery'){
    var gs=d.gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Gallery</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addGalleryBtn"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>Add photo</span></button></div></div><div class="admin-toolbar"><input id="adminGallerySearch" class="admin-search" placeholder="Search photos or captions" autocomplete="off"><input id="adminGalleryAlbum" class="admin-search" placeholder="Filter album" autocomplete="off"><select id="adminGalleryStatus"><option value="">All status</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select><span class="admin-result-count" id="adminGalleryCount"></span></div><div class="admin-grid-2">'+(gs.length?gs.map(function(g){return '<figure class="gallery-card admin-gallery-card" data-content-status="'+esc(g.status||'published')+'" data-content-album="'+esc(g.album||'GENERAL')+'">'+yycMediaFrame(g.image_format,'<img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'">')+'<figcaption><strong>'+esc(g.title)+'</strong><small>'+esc(g.album||'GENERAL')+' · '+esc(yycImageFormatMeta(g.image_format).label)+(g.featured?' · FEATURED':'')+'</small><div class="admin-actions"><button class="mini-btn gold" data-edit-gallery="'+g.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn" data-del-gallery="'+g.id+'"><span class="yyc-admin-action-icon yyc-icon-remove" aria-hidden="true">×</span><span>Remove</span></button></div></figcaption></figure>';}).join(''):'<div class="empty">No gallery.</div>')+'</div>';
    $('#addGalleryBtn').addEventListener('click',function(){adminGalleryForm(null);});
    Array.prototype.slice.call(document.querySelectorAll('[data-edit-gallery]')).forEach(function(b){b.addEventListener('click',function(){adminGalleryForm(b.getAttribute('data-edit-gallery'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-del-gallery]')).forEach(function(b){b.addEventListener('click',async function(){if(confirm('Remove photo "'+esc(g.title||'this photo')+'"?')) await adminAction('admin_delete_content',{p_kind:'gallery',p_id:b.getAttribute('data-del-gallery')},'Gallery photo deleted');});});
    (function(){function filterGallery(){var q=$('#adminGallerySearch').value.trim().toLowerCase(),alb=$('#adminGalleryAlbum').value.trim().toLowerCase(),st=$('#adminGalleryStatus').value,rows=$$('#adminWorkspace .admin-gallery-card');var shown=0;rows.forEach(function(row){var hit=(!q||row.textContent.toLowerCase().indexOf(q)>=0)&&(!alb||String(row.getAttribute('data-content-album')||'').toLowerCase().indexOf(alb)>=0)&&(!st||row.getAttribute('data-content-status')===st);row.style.display=hit?'':'none';if(hit)shown++;});$('#adminGalleryCount').textContent=shown+' of '+rows.length+' shown';}$('#adminGallerySearch').addEventListener('input',filterGallery);$('#adminGalleryAlbum').addEventListener('input',filterGallery);$('#adminGalleryStatus').addEventListener('change',filterGallery);filterGallery();})();
    return;
  }
  if(tab==='swags'){
    var swags=d.swags||[];
    a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">Swags</div><h2 class="modal-title">Swags</h2><p class="admin-subline">Add jerseys, T-shirts, caps and other official YYC items.</p></div><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addSwagBtn"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>Add swag</span></button></div></div>'+
      (swags.length?'<div class="swag-admin-grid">'+swags.map(function(sw){
        return '<article class="swag-admin-card">'+
          '<div class="swag-admin-media">'+(sw.image_url?'<img src="'+esc(sw.image_url)+'" alt="'+esc(sw.title)+'">':'<span>YYC</span>')+'</div>'+
          '<div class="swag-admin-body"><span>'+esc(sw.category||'YYC OFFICIAL')+'</span><strong>'+esc(sw.title)+'</strong>'+
          '<small>'+(sw.price!==null&&sw.price!==undefined&&sw.price!==''?esc(yycPrice(sw.price))+' · ':'')+esc(sw.sizes||'Sizes not set')+'</small>'+
          '<small class="swag-admin-status">'+esc(sw.status||'available')+'</small>'+
          '<div class="admin-actions"><button type="button" class="mini-btn" data-edit-swag="'+sw.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button type="button" class="mini-btn" data-del-swag="'+sw.id+'"><span class="yyc-admin-action-icon yyc-icon-remove" aria-hidden="true">×</span><span>Remove</span></button></div></div></article>';
      }).join('')+'</div>':'<div class="empty">No swag items yet. Add your first item.</div>');
    $('#addSwagBtn').addEventListener('click',function(){adminSwagForm(null);});
    Array.prototype.slice.call(document.querySelectorAll('[data-edit-swag]')).forEach(function(b){b.addEventListener('click',function(){adminSwagForm(b.getAttribute('data-edit-swag'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-del-swag]')).forEach(function(b){b.addEventListener('click',async function(){
      if(!confirm('Remove swag "'+esc(sw.title||'this item')+'"?')) return;
      var rr=await rpc('admin_delete_swag',{p_token:adminToken,p_id:b.getAttribute('data-del-swag')});
      if(!rr||!rr.ok) {toast(rr&&rr.error||'Could not delete swag');return;}
      toast('Swag item deleted'); adminPanel('swags');
    });});
    return;
  }

  if(tab==='approvals'){
    var pendingMembers=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';});
    var pUpdates=d.pending_updates||[], pGallery=d.pending_gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Approval Queue</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="approvalRefresh">↻ Refresh</button><span class="approval-count">'+(pendingMembers.length+pUpdates.length+pGallery.length)+' pending</span></div>'+(
      pendingMembers.concat(pUpdates.map(function(x){x.__kind='update';return x;}),pGallery.map(function(x){x.__kind='gallery';return x;})).length
      ? '<div class="admin-card-list">'+pendingMembers.map(function(m){return '<div class="approval-card"><div class="meta"><strong>'+esc(m.name)+' · MEMBER</strong><small>'+esc(m.email||'')+' · '+esc(m.phone||'')+'</small></div><div class="admin-actions"><button class="mini-btn" data-review-member="'+m.id+'">Review</button><button class="mini-btn" data-edit-member="'+m.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn gold" data-am="'+m.id+'">Approve</button><button class="mini-btn" data-dm="'+m.id+'">Deny</button></div></div>';}).join('')+
      pUpdates.map(function(u){return '<div class="approval-card"><div class="meta"><strong>'+esc(u.title)+' · UPDATE</strong><small>'+esc(u.body)+'</small></div><div class="admin-actions"><button class="mini-btn" data-edit-update="'+u.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn gold" data-au="'+u.id+'">Publish</button><button class="mini-btn" data-du="'+u.id+'">Deny</button></div></div>';}).join('')+
      pGallery.map(function(g){return '<div class="approval-card"><div class="meta"><strong>'+esc(g.title)+' · GALLERY</strong><small>Photo submission</small></div><div class="admin-actions"><button class="mini-btn" data-edit-gallery="'+g.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn gold" data-ag="'+g.id+'">Publish</button><button class="mini-btn" data-dg="'+g.id+'">Deny</button></div></div>'}).join('')
      +'</div>' : '<div class="empty">No pending submissions.</div>');
    Array.prototype.slice.call(document.querySelectorAll('[data-review-member]')).forEach(function(b){b.addEventListener('click',function(){adminReviewMember(b.getAttribute('data-review-member'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-edit-member]')).forEach(function(b){b.addEventListener('click',function(){adminMemberForm(b.getAttribute('data-edit-member'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-edit-update]')).forEach(function(b){b.addEventListener('click',function(){adminUpdateForm(b.getAttribute('data-edit-update'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-edit-gallery]')).forEach(function(b){b.addEventListener('click',function(){adminGalleryForm(b.getAttribute('data-edit-gallery'));});});
    Array.prototype.slice.call(document.querySelectorAll('[data-am]')).forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-am'),p_action:'approve'},'Member approved and ID assigned');});});
    Array.prototype.slice.call(document.querySelectorAll('[data-dm]')).forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-dm'),p_action:'deny'},'Member denied');});});
    Array.prototype.slice.call(document.querySelectorAll('[data-au]')).forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'update',p_id:b.getAttribute('data-au'),p_action:'approve'},'Update published');});});
    Array.prototype.slice.call(document.querySelectorAll('[data-du]')).forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'update',p_id:b.getAttribute('data-du'),p_action:'deny'},'Update denied');});});
    Array.prototype.slice.call(document.querySelectorAll('[data-ag]')).forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'gallery',p_id:b.getAttribute('data-ag'),p_action:'approve'},'Gallery published');});});
    Array.prototype.slice.call(document.querySelectorAll('[data-dg]')).forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'gallery',p_id:b.getAttribute('data-dg'),p_action:'deny'},'Gallery denied');});});
    $('#approvalRefresh').addEventListener('click',function(){adminPanel('approvals',true);});
    return;
  }

  if(tab==='events'){
    a.innerHTML='<div class="storage-loading"><div class="storage-spinner"></div><strong>Loading events…</strong><span>Reading YYC event records</span></div>';
    rpc('admin_dashboard',{p_token:adminToken}).then(function(s){
      if(!s.ok) throw new Error(s.error||'Unable to load events');
      adminData=s;
      var events=s.events||[];
      a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">YYC PROGRAMMES</div><h2 class="modal-title">Events</h2><p class="admin-subline">Create and manage public event cards.</p></div>'+
        '<div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="adminAddEvent"><span class="yyc-admin-action-icon yyc-icon-add" aria-hidden="true">+</span><span>Add event</span></button></div></div>'+
        '<div class="admin-toolbar"><input id="adminEventSearch" class="admin-search" placeholder="Search event, location or category" autocomplete="off"><select id="adminEventStatus"><option value="">All status</option><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="ongoing">Ongoing</option><option value="cancelled">Cancelled</option><option value="postponed">Postponed</option></select><span class="admin-result-count" id="adminEventCount"></span></div>'+
        (events.length?'<div class="events-admin-grid">'+events.map(function(ev){
          var dt=ev.event_date?new Date(ev.event_date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'DATE TBC';
          return '<article class="event-admin-card" data-content-status="'+esc(ev.status||'published')+'"><div class="event-admin-date">'+esc(dt)+'</div><div class="event-admin-main"><strong>'+esc(ev.title||'Untitled event')+'</strong><span>'+esc(ev.location||'Location not set')+'</span><small>'+esc(ev.category||'GENERAL')+' · '+esc(ev.status||'published')+(ev.featured?' · FEATURED':'')+'</small>'+(ev.description?'<p>'+esc(ev.description)+'</p>':'')+'<div class="admin-actions event-admin-actions"><button class="mini-btn" data-edit-event="'+ev.id+'"><span class="yyc-admin-action-icon yyc-icon-edit" aria-hidden="true">✎</span><span>Edit</span></button><button class="mini-btn" data-del-event="'+ev.id+'"><span class="yyc-admin-action-icon yyc-icon-remove" aria-hidden="true">×</span><span>Remove</span></button></div></div></article>';
        }).join('')+'</div>':'<div class="empty">No events stored yet. Add the first YYC programme.</div>');
      $('#adminAddEvent').addEventListener('click',function(){adminEventForm(null);});
      Array.prototype.slice.call(document.querySelectorAll('[data-edit-event]')).forEach(function(b){b.addEventListener('click',function(){adminEventForm(b.getAttribute('data-edit-event'));});});
      Array.prototype.slice.call(document.querySelectorAll('[data-del-event]')).forEach(function(b){b.addEventListener('click',function(){adminDeleteEvent(b.getAttribute('data-del-event'));});});
      (function(){function filterEvents(){var q=$('#adminEventSearch').value.trim().toLowerCase(),st=$('#adminEventStatus').value,rows=$('#adminWorkspace .event-admin-card');var shown=0;rows.forEach(function(row){var hit=(!q||row.textContent.toLowerCase().indexOf(q)>=0)&&(!st||row.getAttribute('data-content-status')===st);row.style.display=hit?'':'none';if(hit)shown++;});$('#adminEventCount').textContent=shown+' of '+rows.length+' shown';}$('#adminEventSearch').addEventListener('input',filterEvents);$('#adminEventStatus').addEventListener('change',filterEvents);filterEvents();})();
    }).catch(function(e){
      a.innerHTML='<div class="storage-error"><strong>Could not load events.</strong><span>'+esc(e.message)+'</span><button class="mini-btn gold" id="eventsRetry">Retry</button></div>';
      $('#eventsRetry').addEventListener('click',function(){adminPanel('events');});
    });
    return;
  }

  if(tab==='notifications'){
    var approvedMembers=(d.members||[]).filter(function(m){return (m.status||'pending')==='approved';}).sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});
    a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">MEMBER MESSAGES</div><h2 class="modal-title">Notifications</h2><p class="admin-subline">Send a private notification to one approved member. Credentials and session tokens are never exposed.</p></div><button class="mini-btn" data-admin-overview>← Back to Admin</button></div>'+
      '<form id="adminNotificationForm" class="admin-form"><div class="form-grid"><div class="field"><label>Member</label><select id="anMember" required><option value="">Select approved member</option>'+approvedMembers.map(function(m){return '<option value="'+esc(m.id)+'">'+esc(m.name)+' · '+esc(m.role_number||'PENDING')+'</option>';}).join('')+'</select></div><div class="field"><label>Type</label><select id="anType"><option value="general">General</option><option value="membership">Membership</option><option value="event">Event</option><option value="system">System</option></select></div><div class="field full"><label>Title</label><input id="anTitle" maxlength="160" required placeholder="Notification title"></div><div class="field full"><label>Message</label><textarea id="anBody" maxlength="2000" rows="5" placeholder="Write the notification…"></textarea></div><div class="field full"><label>Optional link</label><input id="anLink" maxlength="500" type="url" placeholder="https://…"></div></div><div class="form-actions"><button type="submit" class="btn gold">SEND NOTIFICATION <span>→</span></button></div></form>';
    var nf=$('#adminNotificationForm');
    nf.addEventListener('submit',async function(e){
      e.preventDefault();
      var btn=nf.querySelector('button[type="submit"]');btn.disabled=true;
      try{
        var r=await rpc('admin_portal',{p_token:adminToken,p_action:'send_notification',p_payload:{member_id:$('#anMember').value,title:$('#anTitle').value.trim(),body:$('#anBody').value.trim(),type:$('#anType').value,link:$('#anLink').value.trim()}});
        if(!r||!r.ok)throw new Error(r&&r.error||'Could not send notification');
        nf.reset();toast('Notification sent');
      }catch(e){toast(e.message||'Could not send notification');}
      finally{btn.disabled=false;}
    });
    return;
  }
  if(tab==='activity'){
    a.innerHTML='<div class="storage-loading"><div class="storage-spinner"></div><strong>Loading activity…</strong><span>Reading recent admin actions</span></div>';
    rpc('admin_recent_activity',{p_token:adminToken}).then(function(s){
      if(!s.ok) throw new Error(s.error||'Unable to load activity');
      var items=s.items||[];
      a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">YYC AUDIT TRAIL</div><h2 class="modal-title">Activity</h2><p class="admin-subline">Recent administrative changes. Sensitive credentials are not recorded.</p></div><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="activityRefresh">↻ Refresh</button></div></div>'+
        (items.length?'<div class="yyc-activity-list">'+items.map(function(x){return '<article class="yyc-activity-item"><div><span>'+esc((x.action||'ACTION').toUpperCase())+' · '+esc((x.entity_type||'SYSTEM').toUpperCase())+'</span><strong>'+esc(x.summary||'YYC activity')+'</strong><small>'+esc(x.actor_username||'Admin')+' · '+esc(new Date(x.created_at).toLocaleString('en-IN'))+'</small></div></article>';}).join('')+'</div>':'<div class="empty">No admin activity has been recorded yet.</div>');
      $('#activityRefresh').addEventListener('click',function(){adminPanel('activity');});
    }).catch(function(e){
      a.innerHTML='<div class="storage-error"><strong>Could not load activity.</strong><span>'+esc(e.message)+'</span><button class="mini-btn gold" id="activityRetry">Retry</button></div>';
      $('#activityRetry').addEventListener('click',function(){adminPanel('activity');});
    });
    return;
  }

  if(tab==='reports'){
    a.innerHTML='<div class="storage-loading"><div class="storage-spinner"></div><strong>Building reports…</strong><span>Calculating from live YYC records</span></div>';
    rpc('admin_storage_summary',{p_token:adminToken}).then(function(s){
      if(!s.ok) throw new Error(s.error||'Unable to build reports');
      var c=s.counts||{},members=s.members||[],leaders=s.leaders||[],announcements=s.announcements||[],gallery=s.gallery||[],events=s.events||[],volunteers=s.volunteers||[];
      var approved=members.filter(function(m){return (m.status||'').toLowerCase()==='approved';}).length;
      var pending=members.filter(function(m){return (m.status||'pending').toLowerCase()==='pending';}).length;
      var published=announcements.filter(function(x){return (x.status||'published').toLowerCase()==='published';}).length;
      var activeLeaders=leaders.filter(function(l){return (l.status||'active').toLowerCase()!=='inactive';}).length;
      var total=members.length;
      var approvalRate=total?Math.round((approved/total)*100):0;
      var cards=[
        ['Total Members',c.members||total],
        ['Approved Members',c.approved_members||approved],
        ['Pending Members',c.pending_members||pending],
        ['Leaders',c.leaders||leaders.length],
        ['Active Leaders',activeLeaders],
        ['Published Updates',published],
        ['Gallery Items',c.gallery||gallery.length],
        ['Events',c.events||events.length],
        ['Volunteers',c.volunteers||volunteers.length],
        ['Swags',c.swags||((d.swags||[]).length)]
      ];
      a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">YYC INSIGHTS</div><h2 class="modal-title">Reports</h2><p class="admin-subline">Live operational summary from the current database.</p></div><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn" id="reportExport">Export CSV</button><button class="mini-btn gold" id="reportsRefresh">↻ Refresh</button></div></div>'+
        '<div class="report-grid">'+cards.map(function(x){return '<div class="report-card"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>';}).join('')+'</div>'+
        '<div class="report-split"><section class="report-panel"><div class="report-panel-head"><h3>Member approval</h3><b>'+approvalRate+'%</b></div><div class="report-progress"><span style="width:'+approvalRate+'%"></span></div><p>'+approved+' approved out of '+total+' member records.</p></section>'+
        '<section class="report-panel"><div class="report-panel-head"><h3>Operational content</h3><b>'+ (published+gallery.length+events.length) +'</b></div><p>Published updates, gallery items and event records currently stored.</p></section></div>';
      $('#reportExport').addEventListener('click',function(){exportYYCReportCSV(cards,approvalRate);});
      $('#reportsRefresh').addEventListener('click',function(){adminPanel('reports');});
    }).catch(function(e){
      a.innerHTML='<div class="storage-error"><strong>Could not build reports.</strong><span>'+esc(e.message)+'</span><button class="mini-btn gold" id="reportsRetry">Retry</button></div>';
      $('#reportsRetry').addEventListener('click',function(){adminPanel('reports');});
    });
    return;
  }

  if(tab==='storage'){
    a.innerHTML='<div class="storage-loading"><div class="storage-spinner"></div><strong>Loading live data…</strong><span>Reading the YYC database</span></div>';
    rpc('admin_storage_summary',{p_token:adminToken}).then(function(s){
      if(!s.ok) throw new Error(s.error||'Unable to load storage');
      var c=s.counts||{};
      var cards=[
        ['members','Members',c.members||0,'👥'],
        ['approved_members','Approved',c.approved_members||0,'✓'],
        ['pending_members','Pending',c.pending_members||0,'⏳'],
        ['leaders','Leaders',c.leaders||0,'♛'],
        ['announcements','Announcements',c.announcements||0,'▤'],
        ['gallery','Gallery',c.gallery||0,'▧'],
        ['events','Events',c.events||0,'◷'],
        ['volunteers','Volunteers',c.volunteers||0,'✦'],
        ['swags','Swags',c.swags||0,'◇']
      ];
      function rows(arr,cols){
        if(!arr || !arr.length) return '<div class="storage-empty">No records yet.</div>';
        return '<div class="storage-table"><div class="storage-row storage-head">'+cols.map(function(x){return '<div>'+x[0]+'</div>';}).join('')+'</div>'+
          arr.map(function(row){
            return '<div class="storage-row">'+cols.map(function(x){
              var v=row[x[1]];
              if(x[1]==='approved') v=v?'Approved':'Pending';
              if(x[1]==='status' && !v) v='published';
              if(x[1]==='event_date' || x[1]==='published_at' || x[1]==='created_at') v=v?new Date(v).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'-';
              return '<div title="'+esc(v==null?'':v)+'">'+esc(v==null||v===''?'-':v)+'</div>';
            }).join('')+'</div>';
          }).join('')+'</div>';
      }
      a.innerHTML='<div class="storage-top"><div><div class="modal-kicker">LIVE DATABASE</div><h2 class="modal-title">Data Storage</h2><p class="modal-sub">Live counts and records from the YYC Supabase database.</p></div><div class="storage-meta"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn" id="exportStorageCSV">Export CSV</button><span>Updated</span><b>'+esc(new Date(s.generated_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}))+'</b><button class="mini-btn gold" id="storageRefresh">↻ Refresh</button></div></div>'+
        '<div class="storage-stats">'+cards.map(function(x){return '<div class="storage-stat"><i>'+x[3]+'</i><div><b>'+x[2]+'</b><span>'+x[1]+'</span></div></div>';}).join('')+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Members</h3><span>'+((s.members||[]).length)+' shown</span></div>'+rows(s.members,[['Name','name'],['Role Number','role_number'],['Status','status']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Leaders</h3><span>'+((s.leaders||[]).length)+' shown</span></div>'+rows(s.leaders,[['Name','name'],['Role','role'],['Created','created_at']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Announcements</h3><span>'+((s.announcements||[]).length)+' shown</span></div>'+rows(s.announcements,[['Title','title'],['Status','status'],['Published','published_at']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Gallery</h3><span>'+((s.gallery||[]).length)+' shown</span></div>'+rows(s.gallery,[['Title','title'],['Caption','caption'],['Status','status']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Events</h3><span>'+((s.events||[]).length)+' shown</span></div>'+rows(s.events,[['Title','title'],['Date','event_date'],['Location','location']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Volunteers</h3><span>'+((s.volunteers||[]).length)+' shown</span></div>'+rows(s.volunteers,[['Name','name'],['Area','area'],['Approved','approved']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Swags</h3><span>'+((s.swags||[]).length)+' shown</span></div>'+rows(s.swags,[['Title','title'],['Category','category'],['Price','price'],['Status','status']])+'</div>';
      $('#storageRefresh').addEventListener('click',function(){adminPanel('storage');});
      $('#exportStorageCSV').addEventListener('click',function(){exportYYCStorageCSV(s);});
    }).catch(function(e){
      a.innerHTML='<div class="storage-error"><strong>Could not load live storage.</strong><span>'+esc(e.message)+'</span><button class="mini-btn gold" id="storageRetry">Retry</button></div>';
      $('#storageRetry').addEventListener('click',function(){adminPanel('storage');});
    });
    return;
  }
  if(tab==='settings'){
    var s=d.settings||{};
    a.innerHTML='<div class="admin-top"><h2>Site Settings</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button></div></div><form id="settingsForm"><div class="form-grid"><div class="field"><label>Club name</label><input id="setClub" value="'+esc(s.club_name||'YUVAKESARI YOUTH CLUB')+'"></div><div class="field"><label>Location</label><input id="setLoc" value="'+esc(s.location||'SUBRAHMANYA · KARNATAKA')+'"></div><div class="field full"><label>Slogan</label><input id="setSlogan" value="'+esc(s.slogan||'ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩')+'"></div><div class="field"><label>Instagram</label><input id="setInsta" value="'+esc(s.instagram||'')+'"></div><div class="field"><label>WhatsApp</label><input id="setWhats" value="'+esc(s.whatsapp||'')+'"></div><div class="field"><label>X</label><input id="setX" value="'+esc(s.x_url||'')+'"></div><div class="field"><label>Facebook</label><input id="setFb" value="'+esc(s.facebook||'')+'"></div></div><div class="form-actions"><button type="reset" class="btn outline">RESET CHANGES</button><button type="submit" class="btn gold">SAVE SETTINGS</button></div></form>';
    $('#settingsForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_save_settings',{p_token:adminToken,p_payload:{club_name:$('#setClub').value.trim(),location:$('#setLoc').value.trim(),slogan:$('#setSlogan').value.trim(),instagram:$('#setInsta').value.trim(),whatsapp:$('#setWhats').value.trim(),x_url:$('#setX').value.trim(),facebook:$('#setFb').value.trim()}});if(!r.ok)throw new Error(r.error||'Failed');toast('Settings saved');loadPublic();adminPanel('settings');}catch(err){toast(err.message);}});
  }
}
async function adminAction(name,args,msg){
  try{var r=await rpc(name,Object.assign({p_token:adminToken},args));if(r && r.ok===false)throw new Error(r.error||'Action failed');toast(msg);var d=await rpc('admin_dashboard',{p_token:adminToken});adminData=d;renderAdminTab('overview',d);adminPanel('overview');}catch(e){toast(e.message);}
}
function adminReviewMember(id){
  var m=(adminData.members||[]).find(function(x){return x.id===id;});
  if(!m) return;
  openModal(
    '<div class="yyc-admin-review">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="adminReviewBack">← BACK</button><button type="button" class="mini-btn" id="adminReviewAdminBack">← BACK TO ADMIN</button><span class="portal-profile-kicker">ADMIN · MEMBER APPLICATION</span></div>'+
      '<div class="yyc-admin-review-hero">'+
        '<div class="yyc-admin-review-photo"><img src="'+esc(m.photo_url||'assets/yyc-logo-clean.webp')+'" alt="'+esc(m.name||'Member photo')+'" onerror="this.onerror=null;this.src=\'assets/yyc-logo-clean.webp\'"></div>'+
        '<div><span class="yyc-admin-review-status">'+esc((m.status||'pending').toUpperCase())+'</span><h2 class="modal-title" style="margin-top:8px">'+esc(m.name||'Member application')+'</h2><p class="modal-sub">Review the submitted details before approving this YYC membership.</p></div>'+
      '</div>'+
      '<div class="yyc-admin-review-grid">'+
        '<div><span>ROLE NUMBER</span><b>'+esc(m.role_number||'PENDING')+'</b></div>'+
        '<div><span>DATE OF BIRTH</span><b>'+esc(m.dob?fmtDate(m.dob):'—')+'</b></div>'+
        '<div><span>PHONE</span><b>'+esc(m.phone||'—')+'</b></div>'+
        '<div><span>EMAIL</span><b>'+esc(m.email||'—')+'</b></div>'+
        '<div><span>POSITION</span><b>'+esc(m.position||'MEMBER')+'</b></div>'+
        '<div><span>CLUB</span><b>'+esc(m.club_name||'Yuvakesari Youth Club')+'</b></div>'+
        '<div><span>APPLICATION STATUS</span><b>'+esc(m.status||'pending')+'</b></div>'+
        '<div><span>SUBMITTED</span><b>'+esc(m.created_at?fmtDate(m.created_at):'—')+'</b></div>'+
      '</div>'+
      '<div class="notice" style="margin-top:14px">Password is hidden. Admin review shows only the application information needed for approval.</div>'+
      '<div class="form-actions yyc-admin-review-actions">'+
        '<button type="button" class="btn outline" id="adminReviewEdit">EDIT APPLICATION</button>'+
        ((m.status||'pending')==='pending'?'<button type="button" class="btn gold" id="adminReviewApprove">APPROVE MEMBER</button><button type="button" class="btn outline" id="adminReviewDeny">DENY</button>':'')+
      '</div>'+
    '</div>'
  );
  var back=$('#adminReviewBack');
  if(back) back.addEventListener('click',function(){closeModal();adminPanel('members');});
  var adminBack=$('#adminReviewAdminBack');
  if(adminBack) adminBack.addEventListener('click',function(){closeModal();adminPanel('overview');});
  var edit=$('#adminReviewEdit');
  if(edit) edit.addEventListener('click',function(){closeModal();adminMemberForm(id);});
  var approve=$('#adminReviewApprove');
  if(approve) approve.addEventListener('click',async function(){
    approve.disabled=true;
    try{
      await adminAction('admin_member_action',{p_member_id:id,p_action:'approve'},'Member approved');
    }catch(err){approve.disabled=false;}
  });
  var deny=$('#adminReviewDeny');
  if(deny) deny.addEventListener('click',async function(){
    deny.disabled=true;
    try{
      await adminAction('admin_member_action',{p_member_id:id,p_action:'deny'},'Member denied');
    }catch(err){deny.disabled=false;}
  });
}

function adminMemberForm(id){
  var existing=(adminData.members||[]).find(function(m){return m.id===id;}) || {name:'',dob:'',phone:'',email:'',club_name:'Yuvakesari Youth Club',position:'MEMBER',photo_url:'',photo_scale:1,photo_pos_x:50,photo_pos_y:50};
  var obj={photo:existing.photo_url||'',scale:existing.photo_scale||1,x:existing.photo_pos_x==null?50:existing.photo_pos_x,y:existing.photo_pos_y==null?50:existing.photo_pos_y};
  openModal('<div class="modal-kicker">ADMIN · MEMBER</div><div class="admin-form-top"><button type="button" class="mini-btn" id="adminMemberBack">← Members</button><button type="button" class="mini-btn" id="adminMemberAdminBack">← BACK TO ADMIN</button></div><h2 class="modal-title">'+(id?'Edit':'Add')+' Member</h2><form id="adminMemberForm"><div class="form-grid"><div class="field"><label>Full name</label><input id="amName" value="'+esc(existing.name)+'" required></div><div class="field"><label>Date of birth</label><input id="amDob" type="date" value="'+esc(existing.dob||'')+'" required></div><div class="field"><label>Phone</label><input id="amPhone" value="'+esc(existing.phone||'')+'"></div><div class="field"><label>Position</label><input id="amPosition" value="'+esc(existing.position||'MEMBER')+'"></div><div class="field"><label>Email</label><input id="amEmail" type="email" value="'+esc(existing.email||'')+'"></div><div class="field"><label>Set / Reset password '+(id?'(leave blank to keep current)':'')+'</label><input id="amPass" type="password" minlength="8" '+(id?'':'required')+' placeholder="Minimum 8 characters"><small class="field-help">Current password is never displayed. Enter a new password here to replace it.</small></div><div class="field full"><label>Photo '+(id?'(leave empty to keep)':'')+'</label><input id="amFile" type="file" accept="image/*"></div></div>'+imageEditor('adminM',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SAVE MEMBER</button></div></form>');
  wireEditor('adminM',obj,'amFile');
  $('#adminMemberBack').addEventListener('click',function(){adminPanel('members');});
  $('#adminMemberAdminBack').addEventListener('click',function(){closeModal();adminPanel('overview');});
  $('#adminMemberForm').addEventListener('submit',async function(e){e.preventDefault();var btn=this.querySelector('button[type="submit"]');try{if(!id && !obj.photo)throw new Error('Photo is required');if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;}var photo=obj.photo;if(String(photo).startsWith('data:image/')){if(btn)btn.textContent='UPLOADING PHOTO…';var croppedPhoto=await yycManualSquareCrop(photo,obj.scale,obj.x,obj.y,760);photo=await uploadYYCImage(croppedPhoto,'member',adminToken,id||'',existing.photo_url||'');obj.scale=1;obj.x=50;obj.y=50;}else if(!photo){photo=existing.photo_url||'';}var payload={name:$('#amName').value.trim(),dob:$('#amDob').value,phone:$('#amPhone').value.trim(),email:$('#amEmail').value.trim(),club_name:'Yuvakesari Youth Club',position:$('#amPosition').value.trim()||'MEMBER',photo_data:photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y,password:$('#amPass').value};var r=await rpc('admin_member_upsert',{p_token:adminToken,p_id:id,p_payload:payload});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Member saved');adminPanel('members');}catch(err){if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SAVE MEMBER';}toast(err.message);}});
}

function adminLeaderForm(id){
  var existing=(adminData.leaders||[]).find(function(l){return l.id===id;}) || {name:'',role:'',line:'YUVAKESARI YOUTH CLUB · SUBRAHMANYA',phone:'',email:'',login_enabled:false,status:'active',photo_url:'',photo_scale:1,photo_pos_x:50,photo_pos_y:50,sort_order:0};
  var obj={photo:existing.photo_url||'',scale:existing.photo_scale||1,x:existing.photo_pos_x==null?50:existing.photo_pos_x,y:existing.photo_pos_y==null?50:existing.photo_pos_y};
  openModal(
    '<div class="modal-kicker">ADMIN · LEADERS</div><div class="admin-form-top"><button type="button" class="mini-btn" id="adminLeaderBack">← Leaders</button><button type="button" class="mini-btn" id="adminLeaderAdminBack">← BACK TO ADMIN</button></div><h2 class="modal-title">'+(id?'Edit':'Add')+' Leader</h2>'+
    '<p class="modal-sub">Leader accounts are separate from members and are created only by the admin.</p>'+
    '<form id="adminLeaderForm"><div class="form-grid">'+
      '<div class="field"><label>Name</label><input id="alName" value="'+esc(existing.name)+'" required></div>'+
      '<div class="field"><label>Role / Position</label><input id="alRole" value="'+esc(existing.role||'')+'" placeholder="PRESIDENT / SECRETARY / CHAIRMAN" required></div>'+
      '<div class="field"><label>Phone</label><input id="alPhone" value="'+esc(existing.phone||'')+'"></div>'+
      '<div class="field"><label>Email</label><input id="alEmail" type="email" value="'+esc(existing.email||'')+'"></div>'+
      '<div class="field"><label>Set / Reset password '+(id?'(leave blank to keep current)':'')+'</label><input id="alPass" type="password" minlength="8" '+(id?'':'required')+' placeholder="Minimum 8 characters"><small class="field-help">Current password is never displayed. Enter a new password here to replace it.</small></div>'+
      '<div class="field"><label>Status</label><select id="alStatus"><option value="active" '+(existing.status!=='inactive'?'selected':'')+'>Active</option><option value="inactive" '+(existing.status==='inactive'?'selected':'')+'>Inactive</option></select></div>'+
      '<div class="field full"><label>Display line</label><input id="alLine" value="'+esc(existing.line||'')+'" placeholder="YUVAKESARI YOUTH CLUB · SUBRAHMANYA"></div>'+
      '<div class="field full"><label>Photo</label><input id="alFile" type="file" accept="image/*"></div>'+
    '</div>'+imageEditor('adminL',obj.photo,obj.scale,obj.x,obj.y)+
    '<div class="form-actions"><button class="btn gold">SAVE LEADER</button></div></form>'
  );
  wireEditor('adminL',obj,'alFile');
  $('#adminLeaderBack').addEventListener('click',function(){adminPanel('leaders');});
  $('#adminLeaderAdminBack').addEventListener('click',function(){closeModal();adminPanel('overview');});
  $('#adminLeaderForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      var photo=obj.photo;
      if(String(photo).startsWith('data:image/')){
        if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='UPLOADING PHOTO…';}
        var croppedPhoto=await yycManualSquareCrop(photo,obj.scale,obj.x,obj.y,760);
        photo=await uploadYYCImage(croppedPhoto,'leader',adminToken,id||'',existing.photo_url||'');
        obj.scale=1; obj.x=50; obj.y=50;
      }else if(!photo){photo=existing.photo_url||'';}
      var payload={
        name:$('#alName').value.trim(),role:$('#alRole').value.trim(),line:$('#alLine').value.trim(),
        phone:$('#alPhone').value.trim(),email:$('#alEmail').value.trim(),password:$('#alPass').value,
        status:$('#alStatus').value,photo_data:photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y,
        sort_order:existing.sort_order||0
      };
      var r=await rpc('admin_upsert_leader',{p_token:adminToken,p_id:id,p_payload:payload});
      if(!r.ok) throw new Error(r.error||'Failed');
      closeModal();toast('Leader saved');adminPanel('leaders');
    }catch(err){if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SAVE LEADER';}toast(err.message);}
  });
}
function adminEventForm(id){
  var events=adminData.events||[];
  var existing=events.find(function(e){return String(e.id)===String(id);}) || {title:'',description:'',event_date:'',location:'',image_url:'',image_format:'original',status:'published',featured:false,category:'GENERAL',publish_at:'',sort_order:0};
  var obj={photo:existing.image_url||''};
  openModal(
    '<div class="modal-kicker">ADMIN · EVENTS</div>'+
    '<div class="admin-form-top"><button type="button" class="mini-btn" id="adminEventBack">← Events</button><button type="button" class="mini-btn" id="adminEventAdminBack">← BACK TO ADMIN</button></div>'+
    '<h2 class="modal-title">'+(id?'Edit':'Add')+' Event</h2>'+
    '<p class="modal-sub">Manage the event, visibility, scheduling and presentation from one place.</p>'+
    '<form id="adminEventForm">'+
      '<div class="form-grid">'+
        '<div class="field"><label>Event name</label><input id="aeTitle" value="'+esc(existing.title||'')+'" required></div>'+
        '<div class="field"><label>Date</label><input id="aeDate" type="date" value="'+esc(existing.event_date||'')+'"></div>'+
        '<div class="field"><label>Location</label><input id="aeLocation" value="'+esc(existing.location||'')+'" placeholder="Subrahmanya, Karnataka"></div>'+
        '<div class="field"><label>Category</label><input id="aeCategory" value="'+esc(existing.category||'GENERAL')+'" placeholder="SPORTS / CULTURE / COMMUNITY"></div>'+
        '<div class="field"><label>Event status</label><select id="aeStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option><option value="ongoing">Ongoing</option><option value="cancelled">Cancelled</option><option value="postponed">Postponed</option></select></div>'+
        '<div class="field"><label>Publish at <span class="field-note">(optional)</span></label><input id="aePublishAt" type="datetime-local" value="'+esc(yycLocalDateTime(existing.publish_at))+'"><small class="field-help">Leave blank to publish according to status immediately.</small></div>'+
        '<div class="field"><label>Display order</label><input id="aeSort" type="number" step="1" value="'+esc(existing.sort_order||0)+'"></div>'+
        '<div class="field"><label class="yyc-check-field"><input id="aeFeatured" type="checkbox" '+(existing.featured?'checked':'')+'> <span>FEATURED EVENT</span></label><small class="field-help">Featured events appear first on the public site.</small></div>'+
        '<div class="field"><label>Display format</label><select id="aeFormat">'+yycImageFormatOptions(existing.image_format)+'</select></div>'+
        '<div class="field full"><label>Event image <span class="field-note">(optional)</span></label><input id="aeFile" type="file" accept="image/*"><small class="field-help">Upload a replacement only when needed; existing image is kept when left unchanged.</small></div>'+
        '<div class="field full"><label>External image URL <span class="field-note">(optional)</span></label><input id="aeImage" value="'+esc(existing.image_url||'')+'" placeholder="https://..."></div>'+
        '<div class="field full"><label>Description</label><textarea id="aeDescription" placeholder="What is happening at this programme?">'+esc(existing.description||'')+'</textarea></div>'+
      '</div>'+
      '<div class="crop-preview yyc-simple-preview admin-event-image-preview yyc-admin-media-preview" id="aePreviewFrame" data-yyc-format="'+yycImageFormatMeta(existing.image_format).key+'"><img id="aePrev" src="'+esc(obj.photo||'assets/yyc-logo-clean.webp')+'" alt="Event image preview"></div>'+
      '<div class="form-actions"><button type="submit" class="btn gold">'+(id?'SAVE CHANGES':'SAVE EVENT')+'</button></div>'+
    '</form>'
  );
  $('#aeStatus').value=existing.status||'published';
  yycApplyMediaPreview('#aePreviewFrame',$('#aeFormat').value);
  $('#aeFormat').addEventListener('change',function(){yycApplyMediaPreview('#aePreviewFrame',this.value);});
  $('#aeFile').addEventListener('change',async function(){try{var file=this.files&&this.files[0];if(!file)return;obj.photo=await readFile(file,2400);$('#aePrev').src=obj.photo;}catch(err){toast('Could not read image');}});
  $('#aeImage').addEventListener('input',function(){if(!String(obj.photo).startsWith('data:image/')){$('#aePrev').src=this.value.trim()||'assets/yyc-logo-clean.webp';}});
  $('#adminEventBack').addEventListener('click',function(){adminPanel('events');});
  $('#adminEventAdminBack').addEventListener('click',function(){closeModal();adminPanel('overview');});
  $('#adminEventForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      if(!$('#aeTitle').value.trim()) throw new Error('Event title is required');
      var image=$('#aeImage').value.trim()||existing.image_url||'';
      if(String(obj.photo).startsWith('data:image/')){
        if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='UPLOADING PHOTO…';}
        image=await uploadYYCImage(obj.photo,'event',adminToken,id||'',existing.image_url||'');
      }
      var payload={
        title:$('#aeTitle').value.trim(),description:$('#aeDescription').value.trim(),event_date:$('#aeDate').value,
        location:$('#aeLocation').value.trim(),image_url:image,image_format:$('#aeFormat').value,status:$('#aeStatus').value,
        featured:$('#aeFeatured').checked,category:$('#aeCategory').value.trim(),publish_at:yycPublishAtIso($('#aePublishAt').value),
        sort_order:Number($('#aeSort').value||0)
      };
      var r=await rpc('admin_upsert_event',{p_token:adminToken,p_id:id||null,p_payload:payload});
      if(!r.ok) throw new Error(r.error||'Failed');
      closeModal();toast(payload.status==='draft'?'Event saved as draft':'Event saved');adminPanel('events');
    }catch(err){if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SAVE EVENT';}toast(err.message);}
  });
}
function adminDeleteEvent(id){
  if(!confirm('Remove event "'+esc(((adminData.events||[]).find(function(x){return String(x.id)===String(id);})||{}).title||'this event')+'"?')) return;
  rpc('admin_delete_event',{p_token:adminToken,p_id:id}).then(function(r){
    if(!r.ok) throw new Error(r.error||'Failed');
    toast('Event deleted');
    adminPanel('events');
  }).catch(function(e){toast(e.message);});
}

function adminUpdateForm(id){
  var existing=(adminData.updates||[]).find(function(u){return String(u.id)===String(id);}) || {title:'',body:'',event_date:today(),image_url:'',image_format:'original',status:'published',featured:false,category:'ANNOUNCEMENT',publish_at:'',sort_order:0};
  var obj={photo:existing.image_url||''};
  openModal(
    '<div class="modal-kicker">ADMIN · UPDATES</div>'+
    '<div class="admin-form-top"><button type="button" class="mini-btn" id="adminUpdateAdminBack">← BACK TO ADMIN</button></div>'+
    '<h2 class="modal-title">'+(id?'Edit':'Add')+' Update</h2>'+
    '<p class="modal-sub">Manage the update, publishing state and public presentation.</p>'+
    '<form id="adminUpdateForm"><div class="form-grid">'+
      '<div class="field"><label>Title</label><input id="auTitle" value="'+esc(existing.title)+'" required></div>'+
      '<div class="field"><label>Date</label><input id="auDate" type="date" value="'+esc(existing.event_date||today())+'"></div>'+
      '<div class="field"><label>Category</label><input id="auCategory" value="'+esc(existing.category||'ANNOUNCEMENT')+'" placeholder="COMMUNITY / SPORTS / CULTURE"></div>'+
      '<div class="field"><label>Status</label><select id="auStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select></div>'+
      '<div class="field"><label>Publish at <span class="field-note">(optional)</span></label><input id="auPublishAt" type="datetime-local" value="'+esc(yycLocalDateTime(existing.publish_at))+'"></div>'+
      '<div class="field"><label>Display order</label><input id="auSort" type="number" step="1" value="'+esc(existing.sort_order||0)+'"></div>'+
      '<div class="field"><label class="yyc-check-field"><input id="auFeatured" type="checkbox" '+(existing.featured?'checked':'')+'> <span>FEATURED UPDATE</span></label></div>'+
      '<div class="field"><label>Display format</label><select id="auFormat">'+yycImageFormatOptions(existing.image_format)+'</select></div>'+
      '<div class="field full"><label>Message</label><textarea id="auBody" required>'+esc(existing.body||'')+'</textarea></div>'+
      '<div class="field"><label>Update image <span class="field-note">(optional)</span></label><input id="auFile" type="file" accept="image/*"></div>'+
    '</div>'+
    '<div class="crop-preview yyc-simple-preview admin-update-image-preview yyc-admin-media-preview" id="auPreviewFrame" data-yyc-format="'+yycImageFormatMeta(existing.image_format).key+'"><img id="auPrev" src="'+esc(obj.photo||'assets/yyc-logo-clean.webp')+'" alt="Announcement image preview"></div>'+
    '<div class="form-actions"><button type="submit" class="btn gold">'+(id?'SAVE CHANGES':'SAVE UPDATE')+'</button></div></form>'
  );
  $('#adminUpdateAdminBack').addEventListener('click',function(){closeModal();adminPanel('overview');});
  $('#auStatus').value=existing.status||'published';
  yycApplyMediaPreview('#auPreviewFrame',$('#auFormat').value);
  $('#auFormat').addEventListener('change',function(){yycApplyMediaPreview('#auPreviewFrame',this.value);});
  $('#auFile').addEventListener('change',async function(){try{var file=this.files&&this.files[0];if(!file)return;obj.photo=await readFile(file,2400);if(obj.photo)$('#auPrev').src=obj.photo;}catch(err){toast('Could not read image');}});
  $('#adminUpdateForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      var image=obj.photo||'';
      if(String(image).startsWith('data:image/')){
        if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='UPLOADING PHOTO…';}
        image=await uploadYYCImage(image,'announcement',adminToken,id||'',existing.image_url||'');
      }
      var r=await rpc('admin_upsert_update',{p_token:adminToken,p_id:id||null,p_payload:{
        title:$('#auTitle').value.trim(),body:$('#auBody').value.trim(),event_date:$('#auDate').value,image_url:image,
        image_format:$('#auFormat').value,status:$('#auStatus').value,featured:$('#auFeatured').checked,
        category:$('#auCategory').value.trim(),publish_at:yycPublishAtIso($('#auPublishAt').value),sort_order:Number($('#auSort').value||0)
      }});
      if(!r.ok) throw new Error(r.error||'Failed');
      closeModal();toast($('#auStatus').value==='draft'?'Update saved as draft':'Update saved');adminPanel('updates');
    }catch(err){if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SAVE UPDATE';}toast(err.message);}
  });
}
function adminGalleryForm(id){
  var existing=(adminData.gallery||[]).find(function(g){return String(g.id)===String(id);}) || {title:'',src:'',caption:'',image_format:'original',status:'published',featured:false,album:'GENERAL',publish_at:'',sort_order:0};
  var obj={photo:existing.src||''};
  openModal(
    '<div class="modal-kicker">ADMIN · GALLERY</div>'+
    '<div class="admin-form-top"><button type="button" class="mini-btn" id="adminGalleryAdminBack">← BACK TO ADMIN</button></div>'+
    '<h2 class="modal-title">'+(id?'Edit':'Publish')+' Gallery Photo</h2>'+
    '<p class="modal-sub">Manage the image, album, visibility and public presentation.</p>'+
    '<form id="adminGalleryForm">'+
      '<div class="form-grid">'+
        '<div class="field"><label>Caption / title</label><input id="agTitle" value="'+esc(existing.title)+'" required></div>'+
        '<div class="field"><label>Album</label><input id="agAlbum" value="'+esc(existing.album||'GENERAL')+'" placeholder="EVENTS / SPORTS / CULTURE"></div>'+
        '<div class="field"><label>Status</label><select id="agStatus"><option value="published">Published</option><option value="draft">Draft</option><option value="hidden">Hidden</option></select></div>'+
        '<div class="field"><label>Publish at <span class="field-note">(optional)</span></label><input id="agPublishAt" type="datetime-local" value="'+esc(yycLocalDateTime(existing.publish_at))+'"></div>'+
        '<div class="field"><label>Display order</label><input id="agSort" type="number" step="1" value="'+esc(existing.sort_order||0)+'"></div>'+
        '<div class="field"><label class="yyc-check-field"><input id="agFeatured" type="checkbox" '+(existing.featured?'checked':'')+'> <span>FEATURED PHOTO</span></label></div>'+
        '<div class="field"><label>Display format</label><select id="agFormat">'+yycImageFormatOptions(existing.image_format)+'</select></div>'+
        '<div class="field full"><label>Photo</label><input id="agFile" type="file" accept="image/*"><small class="field-help">Leave empty while editing to keep the current photo.</small></div>'+
        '<div class="field full"><label>Caption <span class="field-note">(optional)</span></label><textarea id="agCaption">'+esc(existing.caption||'')+'</textarea></div>'+
      '</div>'+
      '<div class="crop-preview yyc-simple-preview yyc-admin-media-preview" id="agPreviewFrame" data-yyc-format="'+yycImageFormatMeta(existing.image_format).key+'"><img id="agPrev" src="'+esc(obj.photo||'assets/yyc-logo-clean.webp')+'" alt="preview"></div>'+
      '<div class="form-actions"><button type="submit" class="btn gold">'+(id?'SAVE CHANGES':'SAVE PHOTO')+'</button></div></form>'
  );
  $('#adminGalleryAdminBack').addEventListener('click',function(){closeModal();adminPanel('overview');});
  $('#agStatus').value=existing.status||'published';
  yycApplyMediaPreview('#agPreviewFrame',$('#agFormat').value);
  $('#agFormat').addEventListener('change',function(){yycApplyMediaPreview('#agPreviewFrame',this.value);});
  $('#agFile').addEventListener('change',async function(){try{var file=this.files&&this.files[0];if(!file)return;obj.photo=await readFile(file,2400);if(obj.photo)$('#agPrev').src=obj.photo;}catch(err){toast('Could not read image');}});
  $('#adminGalleryForm').addEventListener('submit',async function(e){
    e.preventDefault();var btn=this.querySelector('button[type="submit"]');
    try{
      if(!obj.photo) throw new Error('Photo is required');
      if(btn){btn.disabled=true;btn.dataset.originalText=btn.textContent;btn.textContent='UPLOADING PHOTO…';}
      var photo=String(obj.photo).startsWith('data:image/')?await uploadYYCImage(obj.photo,'gallery',adminToken,id||'',existing.src||''):obj.photo;
      var r=await rpc('admin_upsert_gallery',{p_token:adminToken,p_id:id||null,p_payload:{
        title:$('#agTitle').value.trim(),src:photo,caption:$('#agCaption').value.trim(),image_format:$('#agFormat').value,
        status:$('#agStatus').value,featured:$('#agFeatured').checked,album:$('#agAlbum').value.trim(),
        publish_at:yycPublishAtIso($('#agPublishAt').value),sort_order:Number($('#agSort').value||0)
      }});
      if(!r.ok) throw new Error(r.error||'Failed');
      closeModal();toast($('#agStatus').value==='draft'?'Gallery item saved as draft':'Gallery photo saved');adminPanel('gallery');
    }catch(err){if(btn){btn.disabled=false;btn.textContent=btn.dataset.originalText||'SAVE PHOTO';}toast(err.message);}
  });
}
function adminSwagForm(id){
  var existing=(adminData.swags||[]).find(function(sw){return String(sw.id)===String(id);}) || {
    title:'',category:'JERSEY',price:'',sizes:'S · M · L · XL',description:'',
    image_url:'',order_url:(adminData.settings&&adminData.settings.whatsapp)||'',status:'available',sort_order:0
  };
  var image=existing.image_url||'';
  openModal(
    '<div class="modal-kicker">ADMIN · Swags</div>'+
    '<div class="admin-form-top"><button type="button" class="mini-btn" id="adminSwagBack">← Swags</button><button type="button" class="mini-btn" id="adminSwagAdminBack">← BACK TO ADMIN</button></div>'+
    '<h2 class="modal-title">'+(id?'Edit':'Add')+' Swag Item</h2>'+
    '<p class="modal-sub">Add official YYC jerseys, T-shirts, caps, accessories or other club merchandise.</p>'+
    '<form id="adminSwagForm"><div class="form-grid">'+
      '<div class="field"><label>Item name</label><input id="swName" value="'+esc(existing.title||'')+'" placeholder="YYC Official Jersey" required></div>'+
      '<div class="field"><label>Category</label><input id="swCategory" value="'+esc(existing.category||'')+'" placeholder="JERSEY / T-SHIRT / CAP" required></div>'+
      '<div class="field"><label>Price <span class="field-note">(optional)</span></label><input id="swPrice" type="number" min="0" step="1" value="'+esc(existing.price==null?'':existing.price)+'" placeholder="999"></div>'+
      '<div class="field"><label>Sizes <span class="field-note">(optional)</span></label><input id="swSizes" value="'+esc(existing.sizes||'')+'" placeholder="S · M · L · XL"></div>'+
      '<div class="field"><label>Status</label><select id="swStatus"><option value="available" '+(existing.status==='available'?'selected':'')+'>Available</option><option value="coming-soon" '+(existing.status==='coming-soon'?'selected':'')+'>Coming soon</option><option value="hidden" '+(existing.status==='hidden'?'selected':'')+'>Hidden</option></select></div>'+
      '<div class="field"><label>Display order</label><input id="swSort" type="number" step="1" value="'+esc(existing.sort_order||0)+'"></div>'+
      '<div class="field full"><label>Swag image</label><input id="swFile" type="file" accept="image/*"><small class="field-help">Upload a product image; it will be stored in YYC media.</small></div>'+
      '<div class="field full"><label>External image URL <span class="field-note">(optional)</span></label><input id="swImageUrl" value="'+esc(existing.image_url||'')+'" placeholder="https://..."></div>'+
      '<div class="field full"><label>Description <span class="field-note">(optional)</span></label><textarea id="swDescription" placeholder="Premium YYC match jersey with club crest.">'+esc(existing.description||'')+'</textarea></div>'+
      '<div class="field full"><label>Order / enquiry link <span class="field-note">(optional)</span></label><input id="swOrderUrl" value="'+esc(existing.order_url||'')+'" placeholder="https://wa.me/... or your order page"><small class="field-help">Leave blank to use the YYC WhatsApp link from Site Settings.</small></div>'+
    '</div>'+
    '<div class="crop-preview yyc-simple-preview admin-swag-image-preview"><img id="swPrev" src="'+esc(image||'assets/yyc-logo-clean.webp')+'" alt="Swag image preview"></div>'+
    '<div class="form-actions"><button type="submit" class="btn gold">'+(id?'SAVE CHANGES':'ADD SWAG')+' <span>✓</span></button></div></form>'
  );
  $('#swFile').addEventListener('change',async function(){
    try{var file=this.files&&this.files[0];if(!file)return;image=await readFile(file,1400);$('#swPrev').src=image;}
    catch(e){toast('Could not read image');}
  });
  $('#swImageUrl').addEventListener('input',function(){
    if(!String(image).startsWith('data:image/')) $('#swPrev').src=this.value.trim()||'assets/yyc-logo-clean.webp';
  });
  $('#adminSwagBack').addEventListener('click',function(){adminPanel('swags');});
  $('#adminSwagAdminBack').addEventListener('click',function(){closeModal();adminPanel('overview');});
  $('#adminSwagForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      btn.disabled=true; btn.dataset.originalText=btn.textContent;
      var imageUrl=$('#swImageUrl').value.trim()||existing.image_url||'';
      if(String(image).startsWith('data:image/')){
        btn.textContent='UPLOADING IMAGE…';
        imageUrl=await uploadYYCImage(image,'swag',adminToken,id||'',existing.image_url||'');
      }
      if(!imageUrl) throw new Error('Please add a swag image');
      var payload={
        title:$('#swName').value.trim(),
        category:$('#swCategory').value.trim(),
        price:$('#swPrice').value.trim(),
        sizes:$('#swSizes').value.trim(),
        description:$('#swDescription').value.trim(),
        image_url:imageUrl,
        order_url:$('#swOrderUrl').value.trim(),
        status:$('#swStatus').value,
        sort_order:$('#swSort').value||0
      };
      var rr=await rpc('admin_upsert_swag',{p_token:adminToken,p_id:id||null,p_payload:payload});
      if(!rr||!rr.ok) throw new Error(rr&&rr.error||'Could not save swag item');
      closeModal(); toast(id?'Swag item updated':'Swag item added'); adminPanel('swags');
    }catch(err){
      btn.disabled=false; btn.textContent=btn.dataset.originalText||'ADD SWAG ✓'; toast(err.message);
    }
  });
}
async function verifyFromUrl(){
  var role=new URLSearchParams(location.search).get('verify');
  if(!role) return;
  try{
    var r=await rpc('public_role_verify',{p_role_number:role});
    if(!r.ok) throw new Error(r.error||'Role number not found');
    var p=r.profile||{};
    var kind=r.kind==='leader'?'leader':'member';
    var photo=esc(p.photo_url||'assets/yyc-logo-clean.webp');
    var photoStyle='transform:scale('+(p.photo_scale||1)+' );object-position:'+(p.photo_pos_x==null?50:p.photo_pos_x)+'% '+(p.photo_pos_y==null?50:p.photo_pos_y)+'%';
    var heading=kind==='leader'?'Verified YYC Leader':'Verified YYC Member';
    var kicker=kind==='leader'?'LEADER QR VERIFICATION':'MEMBER QR VERIFICATION';
    var badge=kind==='leader'?'✓ VERIFIED LEADER':'✓ VERIFIED MEMBER';
    var roleLabel=kind==='leader'?'LEADER ID':'MEMBER ID';
    var notice=kind==='leader'
      ? '✓ Leadership record is active in the YYC database. Leader number matches the official leader record.'
      : '✓ Membership is approved in the YYC database. Role number matches the member record.';
    openModal(
      '<div class="verify-profile premium-verify-profile">'+
        '<div class="verify-hero"><div><div class="modal-kicker">'+kicker+'</div><h2 class="modal-title">'+heading+'</h2><p class="modal-sub">This profile was opened directly from the official YYC QR code.</p></div><span class="verify-pill">'+badge+'</span></div>'+
        '<div class="verify-profile-card '+(kind==='leader'?'verify-leader-card':'')+'">'+
          '<div class="verify-photo"><img src="'+photo+'" alt="'+esc(p.name||kind)+'" style="'+photoStyle+'"></div>'+
          '<div class="verify-details"><div class="verify-member-name">'+esc(p.name||'Unknown')+'</div><div class="verify-member-role">'+esc(p.position||'LEADER')+'</div>'+
          '<div class="verify-role-number">'+esc(roleLabel+': '+(p.role_number||role.toUpperCase()))+'</div>'+
          (kind==='leader'&&p.line?'<div class="verify-line">'+esc(p.line)+'</div>':'')+
          '<div class="verify-meta"><span>CLUB<strong>'+esc(p.club_name||'Yuvakesari Youth Club')+'</strong></span><span>STATUS<strong>'+esc(kind==='leader'?(p.status||'active').toUpperCase():'APPROVED')+'</strong></span></div>'+
          (kind==='leader'&&p.email?'<div class="verify-meta"><span>EMAIL<strong>'+esc(p.email)+'</strong></span><span>PHONE<strong>'+esc(p.phone||'Not provided')+'</strong></span></div>':'')+
          '</div></div>'+
        '<div class="notice verify-notice">'+notice+'</div>'+
      '</div>'
    );
  }catch(e){
    openModal('<div class="modal-kicker">YYC VERIFICATION</div><h2 class="modal-title">Not Verified</h2><p class="modal-sub">'+esc(e.message)+'</p>');
  }
}
function bindAdminActionDelegation(){
  if(window.__yycAdminDelegationBound) return;
  window.__yycAdminDelegationBound=true;
  document.addEventListener('click',function(e){
    var target=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!target) return;
    var modal=target.closest('#modal');
    if(!modal) return;
    var d=window.__yycAdminLastData||adminData||{};

    var addMember=target.closest('#adminAddMember');
    if(addMember){
      e.preventDefault();e.stopImmediatePropagation();
      adminMemberForm(null);return;
    }

    var viewMember=target.closest('[data-view]');
    if(viewMember){
      e.preventDefault();e.stopImmediatePropagation();
      var id=viewMember.getAttribute('data-view');
      var m=(d.members||[]).find(function(x){return String(x.id)===String(id);});
      if(m){m.__adminView=true;m.__adminTab='members';memberDashboard(m);}else toast('Member record not found');
      return;
    }

    var downloadMember=target.closest('[data-download-member]');
    if(downloadMember){
      e.preventDefault();e.stopImmediatePropagation();
      var mid=downloadMember.getAttribute('data-download-member');
      var mm=(d.members||[]).find(function(x){return String(x.id)===String(mid);});
      if(mm) downloadAdminCard(mm,'member',downloadMember); else toast('Member record not found');
      return;
    }

    var resetMember=target.closest('[data-reset-member]');
    if(resetMember){
      e.preventDefault();e.stopImmediatePropagation();
      var rmid=resetMember.getAttribute('data-reset-member');
      var rm=(d.members||[]).find(function(x){return String(x.id)===String(rmid);});
      if(rm){
        adminMemberForm(rmid);
        setTimeout(function(){var field=$('#amPass');if(field)field.focus();},80);
      }else toast('Member record not found');
      return;
    }

    var editMember=target.closest('[data-edit-member]');
    if(editMember){
      e.preventDefault();e.stopImmediatePropagation();
      var eid=editMember.getAttribute('data-edit-member');
      var em=(d.members||[]).find(function(x){return String(x.id)===String(eid);});
      if(em) adminMemberForm(eid); else toast('Member record not found');
      return;
    }

    var reviewMember=target.closest('[data-review-member]');
    if(reviewMember){
      e.preventDefault();e.stopImmediatePropagation();
      var rid=reviewMember.getAttribute('data-review-member');
      var rm=(d.members||[]).find(function(x){return String(x.id)===String(rid);});
      if(rm) adminReviewMember(rid); else toast('Member record not found');
      return;
    }

    var approveMember=target.closest('[data-approve]');
    if(approveMember){
      e.preventDefault();e.stopImmediatePropagation();
      adminAction('admin_member_action',{p_member_id:approveMember.getAttribute('data-approve'),p_action:'approve'},'Member approved');return;
    }

    var denyMember=target.closest('[data-deny]');
    if(denyMember){
      e.preventDefault();e.stopImmediatePropagation();
      adminAction('admin_member_action',{p_member_id:denyMember.getAttribute('data-deny'),p_action:'deny'},'Member denied');return;
    }

    var removeMember=target.closest('[data-remove]');
    if(removeMember){
      e.preventDefault();e.stopImmediatePropagation();
      if(confirm('Remove member "'+esc(m.name||'this member')+'"?')) adminAction('admin_member_action',{p_member_id:removeMember.getAttribute('data-remove'),p_action:'remove'},'Member removed');
      return;
    }

    var cardLeader=target.closest('[data-card-leader]');
    if(cardLeader){
      e.preventDefault();e.stopImmediatePropagation();
      var lid=cardLeader.getAttribute('data-card-leader');
      var l=(d.leaders||[]).find(function(x){return String(x.id)===String(lid);});
      if(l){l.__adminView=true;l.__adminTab='leaders';leaderDashboard(l);}else toast('Leader record not found');
      return;
    }

    var dlLeader=target.closest('[data-download-leader]');
    if(dlLeader){
      e.preventDefault();e.stopImmediatePropagation();
      var dlid=dlLeader.getAttribute('data-download-leader');
      var dl=(d.leaders||[]).find(function(x){return String(x.id)===String(dlid);});
      if(dl) downloadAdminCard(dl,'leader',dlLeader); else toast('Leader record not found');
      return;
    }

    var editLeader=target.closest('[data-edit-leader]');
    if(editLeader){
      e.preventDefault();e.stopImmediatePropagation();
      var leid=editLeader.getAttribute('data-edit-leader');
      var le=(d.leaders||[]).find(function(x){return String(x.id)===String(leid);});
      if(le) adminLeaderForm(leid); else toast('Leader record not found');
      return;
    }

    var delLeader=target.closest('[data-del-leader]');
    if(delLeader){
      e.preventDefault();e.stopImmediatePropagation();
      if(confirm('Delete this leader?')) adminAction('admin_delete_leader',{p_id:delLeader.getAttribute('data-del-leader')},'Leader deleted');
      return;
    }
  },true);
}
function yycAdminFormDirtyGuard(){
  if(window.__yycAdminFormDirtyGuard)return;
  window.__yycAdminFormDirtyGuard=true;
  document.addEventListener('input',function(e){
    var form=e.target&&e.target.closest?e.target.closest('#modalContent form[id^="admin"]'):null;
    if(form)form.dataset.dirty='1';
  });
  document.addEventListener('change',function(e){
    var form=e.target&&e.target.closest?e.target.closest('#modalContent form[id^="admin"]'):null;
    if(form)form.dataset.dirty='1';
  });
  document.addEventListener('click',yycAdminWarnUnsaved,true);
}

function bindUI(){
  bindYYCScrollMotion();
  bindMotionSystem();
  bindAdminActionDelegation();
  yycAdminFormDirtyGuard();
  if($('#memberLoginBtn')) $('#memberLoginBtn').addEventListener('click',memberLogin);
  if($('#leaderLoginBtn')) $('#leaderLoginBtn').addEventListener('click',leaderLogin);
  if($('#memberLoginMobile')) $('#memberLoginMobile').addEventListener('click',function(){if(typeof closeMobile==='function')closeMobile();memberLogin();});
  if($('#leaderLoginMobile')) $('#leaderLoginMobile').addEventListener('click',function(){if(typeof closeMobile==='function')closeMobile();leaderLogin();});
  if($('#adminOpenBtn')) $('#adminOpenBtn').addEventListener('click',adminLogin);
  if($('#adminOpenMobile')) $('#adminOpenMobile').addEventListener('click',function(){if(typeof closeMobile==='function')closeMobile();adminLogin();});
  if($('#footerAdminBtn')) $('#footerAdminBtn').addEventListener('click',adminLogin);
  if($('#memberRegisterBtn')) $('#memberRegisterBtn').addEventListener('click',memberRegister);
  if($('#submitUpdateBtn')) $('#submitUpdateBtn').addEventListener('click',function(){submitUpdate(false);});
  if($('#submitGalleryBtn')) $('#submitGalleryBtn').addEventListener('click',function(){submitGallery(false);});
  if(!window.__yycModalCloseBound){
    window.__yycModalCloseBound=true;
    document.addEventListener('click',function(e){
      var closeOnly=e.target && e.target.closest ? e.target.closest('[data-modal-close-only]') : null;
      if(closeOnly){
        e.preventDefault();
        e.stopImmediatePropagation();
        closeModal();
        return;
      }
      var backdrop=e.target && e.target.closest ? e.target.closest('.modal-backdrop[data-close]') : null;
      if(backdrop){
        e.preventDefault();
        e.stopImmediatePropagation();
        closeModal();
      }
    },true);
  }
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});
  bindNavigation();
  window.__yycAppCoreBound=true;
}
window.YYC={memberLogin:memberLogin,memberRegister:memberRegister,leaderLogin:leaderLogin,leaderDashboard:leaderDashboard,adminLogin:adminLogin,adminPanel:adminPanel,submitUpdate:submitUpdate,submitGallery:submitGallery};
window.__yycAppCoreBound=false;
async function restorePersistentPortals(){
  /* Keep saved sessions alive across refresh/reopen, but NEVER open a portal
     automatically on page load. The portal opens only when its access button is
     clicked. Temporary network failures do not clear the saved session. */
  if(memberToken){
    try{
      var mr=await rpc('member_me',{p_token:memberToken});
      if(mr && mr.ok && mr.member){
        yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(mr.member));
      }else if(mr && mr.ok===false){
        yycSafeRemove(localStorage,MEMBER_TOKEN_KEY);
        yycSafeRemove(localStorage,'yyc_member_profile_v1');
        memberToken='';
      }
    }catch(e){}
  }
  if(leaderToken){
    try{
      var lr=await rpc('leader_me',{p_token:leaderToken});
      if(lr && lr.ok && lr.leader){
        yycSafeSet(localStorage,'yyc_leader_profile_v1',JSON.stringify(lr.leader));
      }else if(lr && lr.ok===false){
        yycSafeRemove(localStorage,LEADER_TOKEN_KEY);
        yycSafeRemove(localStorage,'yyc_leader_profile_v1');
        leaderToken='';
      }
    }catch(e){}
  }
  /* Admin token stays saved silently; adminPanel() is opened only by Admin Login. */
}

function initYYCApp(){
  if(!$('#yycScrollProgress')){
    var progress=document.createElement('div');
    progress.id='yycScrollProgress';
    progress.className='yyc-scroll-progress';
    progress.setAttribute('aria-hidden','true');
    progress.innerHTML='<span id="yycScrollProgressBar"></span>';
    document.body.appendChild(progress);
  }
  if(window.__yycAppInitialized) return;
  window.__yycAppInitialized=true;
  document.body.classList.add('yyC-opening');
  setTimeout(function(){document.body.classList.remove('yyC-opening');},1700);
  /* Removed undefined legacy initializer; file inputs are bound by their form/editor handlers. */
  bindUI();
  loadPublic();
  restorePersistentPortals();
  verifyFromUrl();
  if($('#year')) $('#year').textContent=new Date().getFullYear();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initYYCApp);
else initYYCApp();