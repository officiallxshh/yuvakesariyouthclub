'use strict';

var YYC_CONFIG = {
  supabaseUrl: 'https://vrllozfzheikjbhxvpkx.supabase.co',
  supabaseKey: 'sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt'
};

var sb = null;
var yycSupabasePromise = null;
function ensureSupabaseClient(){
  if(sb) return Promise.resolve(sb);
  if(window.supabase && typeof window.supabase.createClient==='function'){
    sb=window.supabase.createClient(YYC_CONFIG.supabaseUrl, YYC_CONFIG.supabaseKey);
    return Promise.resolve(sb);
  }
  if(yycSupabasePromise) return yycSupabasePromise;
  yycSupabasePromise=new Promise(function(resolve,reject){
    var sources=[
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'https://unpkg.com/@supabase/supabase-js@2'
    ];
    var index=0;
    function next(){
      if(window.supabase && typeof window.supabase.createClient==='function'){
        sb=window.supabase.createClient(YYC_CONFIG.supabaseUrl,YYC_CONFIG.supabaseKey);
        resolve(sb); return;
      }
      if(index>=sources.length){reject(new Error('Connection library failed to load. Please refresh and try again.'));return;}
      var src=sources[index++];
      var script=document.createElement('script');
      script.src=src;
      script.async=true;
      script.onload=function(){
        if(window.supabase && typeof window.supabase.createClient==='function'){
          sb=window.supabase.createClient(YYC_CONFIG.supabaseUrl,YYC_CONFIG.supabaseKey);
          resolve(sb);
        }else next();
      };
      script.onerror=next;
      document.head.appendChild(script);
    }
    next();
  });
  return yycSupabasePromise;
}
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
  adminPanel: function(tab,forceRefresh){ return adminPanel(tab,forceRefresh); }
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

function exportYYCStorageCSV(s){
  var headers=['Record Type','ID','Name','Role Number','Role','Status','Approved','Date of Birth','Phone','Email','Club Name','Title','Message','Caption','Event Date','Location','Description','Area','Created At','Published At'];
  var rows=[];
  (s.members||[]).forEach(function(m){rows.push({'Record Type':'Member','ID':m.id,'Name':m.name,'Role Number':m.role_number,'Status':m.status,'Approved':m.approved?'Approved':'Pending','Date of Birth':m.dob,'Phone':m.phone,'Email':m.email,'Club Name':m.club_name,'Role':m.position,'Created At':m.created_at});});
  (s.leaders||[]).forEach(function(l){rows.push({'Record Type':'Leader','ID':l.id,'Name':l.name,'Role':l.role,'Status':l.status,'Phone':l.phone,'Email':l.email,'Created At':l.created_at});});
  (s.announcements||[]).forEach(function(x){rows.push({'Record Type':'Announcement','ID':x.id,'Title':x.title,'Message':x.message,'Status':x.status,'Published At':x.published_at,'Created At':x.created_at});});
  (s.gallery||[]).forEach(function(x){rows.push({'Record Type':'Gallery','ID':x.id,'Title':x.title,'Caption':x.caption,'Status':x.status,'Created At':x.created_at});});
  (s.events||[]).forEach(function(x){rows.push({'Record Type':'Event','ID':x.id,'Title':x.title,'Event Date':x.event_date,'Location':x.location,'Description':x.description,'Status':x.status,'Created At':x.created_at});});
  (s.volunteers||[]).forEach(function(x){rows.push({'Record Type':'Volunteer','ID':x.id,'Name':x.name,'Area':x.area,'Approved':x.approved?'Approved':'Pending','Created At':x.created_at});});
  downloadYYCAdminCSV('yyc-data-export.csv',headers,rows);
  toast((rows.length||0)+' records exported');
}

function openModal(html){
  $('#modalContent').innerHTML=html;
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeModal(){
  /* Closing a modal never logs out any account. Session state changes only via explicit Logout. */
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}
function today(){ return new Date().toISOString().slice(0,10); }
function fmtDate(v){
  if(!v) return '';
  var d=new Date(v+'T00:00:00');
  return isNaN(d) ? v : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}
async function rpc(name,args){
  var payload=args || {};
  var endpoint=YYC_CONFIG.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+encodeURIComponent(name);
  var controller=window.AbortController?new AbortController():null;
  var timer=window.setTimeout(function(){if(controller)controller.abort();},15000);
  try{
    var res=await fetch(endpoint,{
      method:'POST',
      headers:{
        'apikey':YYC_CONFIG.supabaseKey,
        'Content-Type':'application/json',
        'Accept':'application/json'
      },
      body:JSON.stringify(payload),
      signal:controller?controller.signal:undefined
    });
    var text=await res.text();
    var data=null;
    try{data=text?JSON.parse(text):null;}catch(parseErr){data=null;}
    if(!res.ok){
      var msg=(data&&(data.message||data.error||data.hint||data.details))||('Supabase request failed ('+res.status+')');
      throw new Error(String(msg));
    }
    return data;
  }catch(err){
    if(err&&err.name==='AbortError') throw new Error('YYC server timed out. Please try again.');
    throw err;
  }finally{
    window.clearTimeout(timer);
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


function readFile(file,maxSide){
  return new Promise(function(resolve,reject){
    if(!file){resolve('');return;}
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
function imageEditor(id,photo,scale,x,y){
  var z=(scale||1).toFixed(2);
  return '<div class="yyc-photo-editor ig-photo-editor">'+
    '<div class="ig-editor-head">'+
      '<div><span class="ig-editor-kicker">PHOTO ADJUSTMENT</span><h3>Position your photo perfectly</h3><p>Drag the image to move it. Use the wheel or touch scroll to zoom.</p></div>'+
      '<span class="ig-editor-badge">SQUARE ID CROP</span>'+
    '</div>'+
    '<div class="ig-editor-body">'+
      '<div class="ig-preview-wrap">'+
        '<div class="yyc-photo-preview ig-photo-preview" id="'+id+'Stage" tabindex="0" aria-label="Square photo adjustment area">'+
          '<div class="ig-preview-topline"><span>LIVE PREVIEW</span><b>1:1</b></div>'+
          '<div class="ig-crop-grid"></div>'+
          '<img id="'+id+'Preview" src="'+esc(photo || 'assets/yyc-logo-clean.webp')+'" alt="Photo preview">'+
          '<span class="ig-center-mark"></span>'+
          '<div class="ig-preview-bottom"><span>DRAG TO POSITION</span><span>SCROLL TO ZOOM</span></div>'+
        '</div>'+
      '</div>'+
      '<aside class="ig-adjust-panel">'+
        '<div class="ig-adjust-block">'+
          '<div class="ig-block-label"><span>ZOOM</span><output id="'+id+'ScaleOut">'+z+'×</output></div>'+
          '<div class="ig-range-shell"><span>1×</span><input class="ig-zoom-range" id="'+id+'Scale" type="range" min="1" max="2.4" step="0.01" value="'+(scale||1)+'" aria-label="Zoom"><span>2.4×</span></div>'+
        '</div>'+
        '<div class="ig-adjust-divider"></div>'+
        '<div class="ig-adjust-block ig-position-status">'+
          '<div class="ig-block-label"><span>POSITION</span><small>Drag inside preview</small></div>'+
          '<div class="ig-position-readout"><span>X <b id="'+id+'XOut">'+Math.round(x==null?50:x)+'%</b></span><span>Y <b id="'+id+'YOut">'+Math.round(y==null?50:y)+'%</b></span></div>'+
        '</div>'+
        '<div class="ig-adjust-actions">'+
          '<button type="button" class="ig-secondary-btn" id="'+id+'Center"><span>◎</span> CENTER</button>'+
          '<button type="button" class="ig-reset-btn" id="'+id+'Reset"><span>↺</span> RESET</button>'+
        '</div>'+
      '</aside>'+
    '</div>'+
  '</div>';
}
function wireEditor(id,obj,fileInput){
  var stage=$('#'+id+'Stage'), img=$('#'+id+'Preview'), zoom=$('#'+id+'Scale');
  function draw(){
    obj.scale=Number(zoom.value);
    obj.x=Math.max(0,Math.min(100,obj.x==null?50:Number(obj.x)));
    obj.y=Math.max(0,Math.min(100,obj.y==null?50:Number(obj.y)));
    var rect=stage.getBoundingClientRect();
    var w=rect.width||320, h=rect.height||320;
    /* Translate the whole preview so vertical movement is always visible. */
    var maxPanX=w*0.32*obj.scale;
    var maxPanY=h*0.32*obj.scale;
    var tx=((obj.x-50)/50)*maxPanX;
    var ty=((obj.y-50)/50)*maxPanY;
    img.style.transform='translate3d('+tx.toFixed(2)+'px,'+ty.toFixed(2)+'px,0) scale('+obj.scale+')';
    img.style.objectPosition='50% 50%';
    $('#'+id+'ScaleOut').textContent=obj.scale.toFixed(2)+'×'; $('#'+id+'XOut').textContent=Math.round(obj.x)+'%'; $('#'+id+'YOut').textContent=Math.round(obj.y)+'%';
  }
  zoom.addEventListener('input',draw);

  var drag={on:false,x:0,y:0,ox:50,oy:50};
  function pointerDown(e){
    if(e.button!==undefined && e.button!==0) return;
    drag.on=true; drag.x=e.clientX; drag.y=e.clientY;
    drag.ox=obj.x==null?50:Number(obj.x); drag.oy=obj.y==null?50:Number(obj.y);
    stage.classList.add('is-dragging');
    if(stage.setPointerCapture && e.pointerId!=null) stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function pointerMove(e){
    if(!drag.on) return;
    var rect=stage.getBoundingClientRect();
    var sensitivity=100/Math.max(120,Math.min(rect.width,rect.height));
    /* Move the image in the same direction as the mouse/finger. */
    var zoomFactor=Math.max(1,Number(obj.scale)||1);
    obj.x=Math.max(0,Math.min(100,drag.ox+(e.clientX-drag.x)*sensitivity/zoomFactor*1.35));
    obj.y=Math.max(0,Math.min(100,drag.oy+(e.clientY-drag.y)*sensitivity/zoomFactor*1.35));
    draw();
    e.preventDefault();
  }
  function pointerUp(e){
    drag.on=false; stage.classList.remove('is-dragging');
    if(stage.releasePointerCapture && e.pointerId!=null){try{stage.releasePointerCapture(e.pointerId)}catch(err){}}
  }
  stage.addEventListener('pointerdown',pointerDown);
  stage.addEventListener('pointermove',pointerMove);
  stage.addEventListener('pointerup',pointerUp);
  stage.addEventListener('pointercancel',pointerUp);
  stage.addEventListener('wheel',function(e){
    e.preventDefault();
    zoom.value=Math.max(1,Math.min(2.4,Number(zoom.value)+(e.deltaY<0?0.05:-0.05)));
    draw();
  },{passive:false});

  function resetPhoto(){
    obj.scale=1; obj.x=50; obj.y=50; zoom.value='1'; draw();
  }
  function centerPhoto(){
    obj.x=50; obj.y=50; draw();
  }
  $('#'+id+'Reset').addEventListener('click',resetPhoto);
  $('#'+id+'Center').addEventListener('click',centerPhoto);

  $('#'+fileInput).addEventListener('change',async function(){
    try{
      var d=await readFile(this.files[0],760);
      if(!d) return;
      obj.photo=d; obj.scale=1; obj.x=50; obj.y=50;
      zoom.value='1'; img.src=d; draw();
    }catch(err){toast('Could not load this photo');}
  });
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
    setTimeout(function(){targetEl.classList.remove('yyc-section-navigate');},700);
  }
}

function bindMotionSystem(){
  if(window.__yycMotionBound) return;
  window.__yycMotionBound=true;

  /* Click feedback without scale/transform, so buttons never grow and page layout never shifts. */
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

  /* Admin tabs are injected dynamically, so animate their workspace through delegation. */
  document.addEventListener('click',function(e){
    var tab=e.target && e.target.closest ? e.target.closest('.admin-tab') : null;
    if(!tab) return;
    setTimeout(function(){
      var workspace=$('#adminWorkspace');
      if(!workspace) return;
      workspace.classList.remove('yyc-admin-tab-enter');
      void workspace.offsetWidth;
      workspace.classList.add('yyc-admin-tab-enter');
    },30);
  },false);
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
      var img=l.photo_url ? '<img src="'+esc(l.photo_url)+'" alt="'+esc(l.name)+'">' : '<span class="photo-placeholder">✦</span>';
      return '<article class="leader-card compact-leader-card reveal visible"><div class="leader-profile-row"><div class="leader-avatar">'+img+'</div><div class="leader-info"><span class="leader-kicker">LEADERSHIP</span><strong>'+esc(l.name)+'</strong><small>'+esc(l.role||'LEADER')+'</small><div class="micro">'+esc(l.line||'YUVAKESARI YOUTH CLUB · SUBRAHMANYA')+'</div></div></div><div class="leader-card-line"></div></article>';
    }).join('') : '<div class="empty">Leadership profiles will appear here.</div>';
  }

  var ug=$('#updatesGrid');
  if(ug){
    var ups=publicData.updates||[];
    ug.innerHTML=ups.length ? ups.map(function(u){
      return '<article class="update-card reveal visible"><time>'+esc(fmtDate(u.event_date || u.published_at))+'</time><div><h3>'+esc(u.title)+'</h3><p>'+esc(u.body||'')+'</p></div><span></span></article>';
    }).join('') : '<div class="empty">No updates published yet.</div>';
  }

  if($('#eventCount')) $('#eventCount').textContent=String((publicData.events||[]).length).padStart(2,'0');

  var eg=$('#eventsGrid');
  if(eg){
    var events=publicData.events||[];
    eg.innerHTML=events.length ? events.map(function(ev){
      var d=ev.event_date ? new Date(ev.event_date+'T00:00:00') : null;
      var day=d&&!isNaN(d)?String(d.getDate()).padStart(2,'0'):'—';
      var month=d&&!isNaN(d)?d.toLocaleDateString('en-IN',{month:'short'}).toUpperCase():'DATE TBC';
      var year=d&&!isNaN(d)?String(d.getFullYear()):'';
      var image=ev.image_url ? '<img src="'+esc(ev.image_url)+'" alt="'+esc(ev.title||'YYC event')+'" loading="lazy">' : '<div class="event-card-art"><span>YYC</span><b>EVENT</b></div>';
      return '<article class="event-card reveal visible">'+
        '<div class="event-card-media">'+image+'<div class="event-date-badge"><b>'+day+'</b><span>'+month+'</span><small>'+year+'</small></div></div>'+
        '<div class="event-card-body"><span class="event-kicker">YYC PROGRAMME</span><h3>'+esc(ev.title||'Untitled event')+'</h3>'+
        (ev.description?'<p>'+esc(ev.description)+'</p>':'<p>Community programme by Yuvakesari Youth Club.</p>')+
        '<div class="event-meta"><span>⌖ '+esc(ev.location||'Location to be announced')+'</span></div></div>'+
      '</article>';
    }).join('') : '<div class="empty">No upcoming events published yet.</div>';
  }

  var gg=$('#galleryGrid');
  if(gg){
    var gs=publicData.gallery||[];
    gg.innerHTML=gs.length ? gs.map(function(g){
      return '<figure class="gallery-card reveal visible"><img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'" loading="lazy"><figcaption>'+esc(g.caption||g.title)+'</figcaption></figure>';
    }).join('') : '<div class="empty">No gallery items published yet.</div>';
  }
}
async function loadPublic(){
  try{ publicData=await rpc('public_site_data',{}); renderPublic(); }
  catch(e){ toast('Public data is loading from the backup design.'); }
}
function activeNav(){
  var target=location.hash ? location.hash.slice(1) : 'home';
  $$('.desktop-nav .nav-link').forEach(function(a){var h=(a.getAttribute('href')||'').slice(1);a.classList.toggle('active',h===target);});
}
function bindNavigation(){
  $$(`a[href^="#"]`).forEach(function(link){
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
      window.scrollTo({top:top,behavior:reduce?'auto':'smooth'});
      if(history.pushState) history.pushState(null,'',href);
      setTimeout(activeNav,30);
    });
  });
  $$('.desktop-nav .nav-link').forEach(function(a){a.addEventListener('click',function(){setTimeout(activeNav,120);});});
  window.addEventListener('hashchange',activeNav);
  activeNav();
}
function memberRegister(){
  var obj={photo:'',scale:1,x:50,y:50};
  openModal('<div class="modal-kicker">JOIN YYC</div><h2 class="modal-title">Member Registration</h2><p class="modal-sub">Submit your details for admin approval. After approval you can log in and receive your digital membership card.</p><form id="memberRegisterForm"><div class="form-grid"><div class="field"><label>Full name</label><input id="rName" required></div><div class="field"><label>Date of birth</label><input id="rDob" type="date" required></div><div class="field"><label>Phone</label><input id="rPhone" required></div><div class="field"><label>Email</label><input id="rEmail" type="email" required></div><div class="field full"><label>Password</label><input id="rPass" type="password" minlength="8" required placeholder="Minimum 8 characters"></div><div class="field full"><label>Position</label><input id="rPosition" value="MEMBER" placeholder="MEMBER / VOLUNTEER / COORDINATOR"></div><div class="field full"><label>Member photo</label><input id="rPhoto" type="file" accept="image/*" required></div></div>'+imageEditor('regPhoto',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SUBMIT APPLICATION <span>↗</span></button></div></form>');
  wireEditor('regPhoto',obj,'rPhoto');
  $('#memberRegisterForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      var data={name:$('#rName').value.trim(),dob:$('#rDob').value,phone:$('#rPhone').value.trim(),email:$('#rEmail').value.trim(),club_name:'Yuvakesari Youth Club',position:$('#rPosition').value.trim()||'MEMBER',photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y};
      if(!obj.photo){toast('Please choose a photo');return;}
      var r=await rpc('member_register',{p_password:$('#rPass').value,p_payload:data});
      if(!r.ok) throw new Error(r.error||'Registration failed');
      closeModal(); toast('Application submitted — wait for admin approval');
    }catch(err){toast(err.message);}
  });
}
function yycVerifyUrl(roleNumber){
  return location.origin+location.pathname+'?verify='+encodeURIComponent(roleNumber||'');
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
            '<div class="yyc-id-photo"><div class="yyc-photo-frame"><img src="'+esc(photo)+'" alt="'+esc(name)+'"></div></div>'+
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
      '<img src="'+esc(photo)+'" alt="'+esc(data.name|| (leader?'Leader':'Member'))+'" onerror="this.onerror=null;this.src=\'assets/yyc-logo-clean.webp\'">'+
      '<span class="yyc-portal-avatar-caret">⌄</span>'+
    '</button>'+
    '<div class="yyc-portal-menu" id="'+id+'ProfileMenu" hidden>'+
      '<div class="yyc-portal-menu-head"><img src="'+esc(photo)+'" alt=""><div><b>'+esc(data.name|| (leader?'Leader':'Member'))+'</b><small>'+esc(data.role_number||'YYC PROFILE')+'</small></div></div>'+
      '<button type="button" class="yyc-portal-menu-item" id="'+id+'ProfileViewBtn"><span>◉</span> MY PROFILE</button>'+
      '<button type="button" class="yyc-portal-menu-item" id="'+id+'IdCardBtn"><span>▣</span> ID CARD</button>'+
      '<button type="button" class="yyc-portal-menu-item '+(leader?'is-disabled':'')+'" id="'+id+'EditSubmissionBtn" '+(leader?'title="Leader details are managed by YYC Admin"':'')+'><span>✎</span> EDIT SUBMISSION</button>'+
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
  if(edit) edit.addEventListener('click',function(){close();if(leader) toast('Leader details are managed by YYC Admin');else memberEditSubmission(data);});
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
        '<img class="portal-profile-large-photo" src="'+esc(photo)+'" alt="'+esc(data.name||'YYC Profile')+'" onerror="this.onerror=null;this.src=\'assets/yyc-logo-clean.webp\'">'+
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
      '<div class="form-actions"><button type="button" class="btn gold" id="portalProfileCardBtn">VIEW ID CARD</button>'+(leader?'':'<button type="button" class="btn outline" id="portalProfileEditBtn">EDIT SUBMISSION</button>')+'</div>'+
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
  if(edit) edit.addEventListener('click',function(){memberEditSubmission(data);});
}

function memberEditSubmission(data){
  data=data||{};
  var obj={photo:data.photo_url||'',scale:data.photo_scale||1,x:data.photo_pos_x==null?50:data.photo_pos_x,y:data.photo_pos_y==null?50:data.photo_pos_y};
  openModal(
    '<div class="portal-profile-view">'+
      '<div class="portal-profile-top"><button type="button" class="mini-btn" id="memberEditBack">← BACK</button><span class="portal-profile-kicker">MEMBER · EDIT SUBMISSION</span></div>'+
      '<h2 class="modal-title">Edit your submission.</h2>'+
      '<p class="modal-sub">You can update your personal contact details and photo. YYC Admin controls your Unique ID, position and approval status.</p>'+
      '<form id="memberEditSubmissionForm"><div class="form-grid">'+
        '<div class="field"><label>Full name</label><input id="meName" value="'+esc(data.name||'')+'" required></div>'+
        '<div class="field"><label>Date of birth</label><input id="meDob" type="date" value="'+esc(data.dob||'')+'" required></div>'+
        '<div class="field"><label>Phone</label><input id="mePhone" value="'+esc(data.phone||'')+'" required></div>'+
        '<div class="field"><label>Email</label><input id="meEmail" type="email" value="'+esc(data.email||'')+'" required></div>'+
        '<div class="field full"><label>Change photo</label><input id="mePhoto" type="file" accept="image/*"></div>'+
      '</div>'+imageEditor('memberEditPhoto',obj.photo,obj.scale,obj.x,obj.y)+
      '<div class="form-actions"><button type="submit" class="btn gold">SAVE CHANGES <span>✓</span></button></div></form>'+
    '</div>'
  );
  wireEditor('memberEditPhoto',obj,'mePhoto');
  var back=$('#memberEditBack');
  if(back) back.addEventListener('click',function(){memberDashboard(data);});
  $('#memberEditSubmissionForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=this.querySelector('button[type="submit"]');
    try{
      btn.disabled=true;
      var payload={
        name:$('#meName').value.trim(),
        dob:$('#meDob').value,
        phone:$('#mePhone').value.trim(),
        email:$('#meEmail').value.trim(),
        photo_data:obj.photo,
        photo_scale:obj.scale,
        photo_pos_x:obj.x,
        photo_pos_y:obj.y
      };
      if(!payload.name||!payload.dob||!payload.phone||!payload.email) throw new Error('Please complete all required fields');
      if(!obj.photo) throw new Error('Please keep or choose a member photo');
      var r=await rpc('member_update_submission',{p_token:memberToken,p_payload:payload});
      if(!r||!r.ok) throw new Error(r&&r.error||'Could not save changes');
      memberToken=yycSafeGet(localStorage,MEMBER_TOKEN_KEY);
      yycSafeSet(localStorage,'yyc_member_profile_v1',JSON.stringify(r.member));
      closeModal();
      memberDashboard(r.member);
      toast('Member submission updated');
    }catch(err){
      btn.disabled=false;
      toast(err.message||'Could not save changes');
    }
  });
}

function memberDashboard(data){
  data=data||{};
  openModal('<div class="premium-member-dashboard">'+(data.__adminView?'<div class="portal-admin-backbar"><button type="button" class="mini-btn" id="backToAdmin">← BACK TO ADMIN</button><span>ADMIN PREVIEW · MEMBER CARD</span></div>':'')+yycPortalHeader('member',data)+yycPortalSummary(data,'member')+
    yycDigitalCard(data,'member')+
    '<div class="yyc-card-download-bar"><div><b>DOWNLOAD YYC ID CARD</b><span>Front on top · Back below · QR included</span></div><button type="button" class="btn gold" id="memberDownloadBtn">DOWNLOAD ID CARD ↓</button></div>'+
    '<div class="portal-action-row" style="margin-top:15px;padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:12px"><div><b>MEMBER ACCESS</b><span style="display:block;color:#7d8784;margin-top:5px;font-size:9px">Your digital ID is linked to the official YYC database.</span></div><div class="form-actions" style="margin:0"><button type="button" class="btn outline" id="memberVerifyBtn">VERIFY ID ↗</button><button type="button" class="btn gold" id="memberLogout">LOGOUT</button></div></div>'+
    '<div class="notice portal-note" style="margin-top:12px">Click the digital card to flip between front and back. Scan the QR code to verify the official YYC record.</div>'+
  '</div>');
  var back=$('#backToAdmin'); if(back) back.addEventListener('click',function(){adminPanel(data.__adminTab||'members');});
  bindPortalAccountMenu('member',data);
  var verify=$('#memberVerifyBtn');
  if(verify) verify.addEventListener('click',function(){window.open(yycVerifyUrl(data.role_number),'_blank','noopener');});
  var download=$('#memberDownloadBtn');
  if(download) download.addEventListener('click',function(){downloadYYCDigitalCard(data,'member',download).catch(function(e){toast(e.message||'ID card download failed.');});});
  var logout=$('#memberLogout');
  if(logout) logout.addEventListener('click',async function(){
    logout.disabled=true;
    try{if(memberToken) await rpc('member_logout',{p_token:memberToken});}catch(e){}
    yycSafeRemove(localStorage,MEMBER_TOKEN_KEY);yycSafeRemove(localStorage,'yyc_member_profile_v1');memberToken='';closeModal();toast('Member logged out');
  });
}
function leaderDashboard(data){
  data=data||{};
  openModal('<div class="premium-member-dashboard">'+(data.__adminView?'<div class="portal-admin-backbar"><button type="button" class="mini-btn" id="backToAdmin">← BACK TO ADMIN</button><span>ADMIN PREVIEW · LEADER CARD</span></div>':'')+yycPortalHeader('leader',data)+yycPortalSummary(data,'leader')+
    yycDigitalCard(data,'leader')+
    '<div class="yyc-card-download-bar"><div><b>DOWNLOAD YYC ID CARD</b><span>Front on top · Back below · QR included</span></div><button type="button" class="btn gold" id="leaderDownloadBtn">DOWNLOAD ID CARD ↓</button></div>'+
    '<div class="portal-action-row" style="margin-top:15px;padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:12px"><div><b>LEADER ACCESS</b><span style="display:block;color:#7d8784;margin-top:5px;font-size:9px">Read-only leadership space. Contact YYC administration for account changes.</span></div><div class="form-actions" style="margin:0"><button type="button" class="btn outline" id="leaderVerifyBtn">VERIFY ID ↗</button><button type="button" class="btn gold" id="leaderLogout">LOGOUT</button></div></div>'+
    '<div class="notice leader-portal-note" style="margin-top:12px">Leadership profile access is available here. Administrative editing remains restricted to the YYC admin panel.</div>'+
  '</div>');
  var back=$('#backToAdmin'); if(back) back.addEventListener('click',function(){adminPanel(data.__adminTab||'leaders');});
  bindPortalAccountMenu('leader',data);
  var verify=$('#leaderVerifyBtn');
  if(verify) verify.addEventListener('click',function(){window.open(yycVerifyUrl(data.role_number),'_blank','noopener');});
  var download=$('#leaderDownloadBtn');
  if(download) download.addEventListener('click',function(){downloadYYCDigitalCard(data,'leader',download).catch(function(e){toast(e.message||'ID card download failed.');});});
  var logout=$('#leaderLogout');
  if(logout) logout.addEventListener('click',async function(){
    logout.disabled=true;
    try{if(leaderToken) await rpc('leader_logout',{p_token:leaderToken});}catch(e){}
    yycSafeRemove(localStorage,LEADER_TOKEN_KEY);yycSafeRemove(localStorage,'yyc_leader_profile_v1');leaderToken='';closeModal();toast('Leader logged out');
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
    '<div class="access-login-screen member-access-screen">'+
      '<div class="access-login-hero"><div class="access-login-icon">◉</div><div><span class="access-login-kicker">YYC MEMBER PORTAL</span><h2 class="access-login-title">Welcome back.</h2><p class="access-login-sub">Sign in with the email or phone number registered with Yuvakesari Youth Club.</p></div><span class="access-login-badge">MEMBER</span></div>'+
      '<form id="memberLoginForm" class="access-login-form" novalidate>'+
        '<div class="access-form-field"><label for="mIdent">Email or phone</label><div class="access-input-wrap"><span class="access-input-icon">◎</span><input id="mIdent" type="text" autocomplete="username" inputmode="email" placeholder="Enter email or phone" required></div></div>'+
        '<div class="access-form-field"><label for="mPass">Password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="mPass" type="password" autocomplete="current-password" placeholder="Enter your password" required><button type="button" class="access-password-toggle" aria-label="Show password">SHOW</button></div></div>'+
        '<div class="access-login-meta"><span>✓ Approved members only</span><span>Secure YYC access</span></div>'+
        '<div class="form-actions access-login-actions"><button type="submit" class="btn gold access-submit">LOGIN <span>→</span></button><button type="button" class="btn outline access-secondary" id="openRegisterFromLogin">NEW MEMBER</button></div>'+
      '<div class="access-login-status" role="status" aria-live="polite"></div>'+
       '</form>'+
      '<div class="access-login-footer">Don’t have an account? Apply for membership and wait for admin approval.</div>'+
    '</div>'
  );
  yycEnhanceLogin('memberLoginForm','mPass');
  $('#openRegisterFromLogin').addEventListener('click',memberRegister);
  $('#memberLoginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var form=this, btn=form.querySelector('button[type="submit"]');
    try{
      setLoginStatus('memberLoginForm','Checking your YYC membership…',false);
      var r=await rpc('member_login',{p_identifier:$('#mIdent').value.trim(),p_password:$('#mPass').value});
      if(!r.ok) throw new Error(r.error||'Login failed');
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
    '<div class="access-login-screen leader-access-screen">'+
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
      var r=await rpc('leader_login',{p_identifier:$('#lIdent').value.trim(),p_password:$('#lPass').value});
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
    '<div class="access-login-screen admin-access-screen">'+
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
function adminPanel(tab,forceRefresh){
  /* FIXED SELECTOR MODE */
  getAdmin(!!forceRefresh).then(function(d){
    if(!d) return;
    window.__yycAdminLastData=d;
    tab=tab||'overview';
    var tabs=[['overview','Overview'],['members','Members'],['leaders','Leaders'],['updates','Updates'],['gallery','Gallery'],['approvals','Approvals'],['events','Events'],['reports','Reports'],['storage','Data Storage'],['settings','Settings']];
    var nav=tabs.map(function(t){return '<button class="admin-tab '+(t[0]===tab?'active':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('');
    var pending=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';}).length+(d.pending_updates||[]).length+(d.pending_gallery||[]).length;
    openModal('<div class="admin-shell"><div class="portal-ribbon admin-portal-ribbon"><span class="portal-icon">⌑</span><div><b>ADMIN CONTROL CENTER</b><small>ACCESS LEVEL · FULL MANAGEMENT</small></div><span class="portal-secure">PRIVATE</span></div><div class="admin-header"><div><div class="modal-kicker">YUVAKESARI YOUTH CLUB</div><h2 class="modal-title">Admin Control Center</h2><p class="modal-sub">Manage members, leaders, approvals, events, gallery, reports and site settings.</p></div></div><div class="admin-tabs">'+nav+'</div><div class="admin-workspace" id="adminWorkspace"></div><div class="admin-session-footer"><span>YYC PRIVATE ADMIN SESSION</span><button class="mini-btn" id="adminLogout">LOGOUT</button></div></div>');
    $('#adminLogout').addEventListener('click',async function(){try{await rpc('admin_logout',{p_token:adminToken});}catch(e){}yycSafeRemove(localStorage,ADMIN_TOKEN_KEY);adminToken='';adminData=null;closeModal();toast('Admin logged out');});
    $$('.admin-tab').forEach(function(b){
      b.addEventListener('click',function(){
        var selected=this.getAttribute('data-tab')||'overview';
        $$('.admin-tab').forEach(function(x){x.classList.toggle('active',x===b);});
        renderAdminTab(selected,d);
        var workspace=$('#adminWorkspace');
        if(workspace){workspace.classList.remove('yyc-admin-tab-enter');void workspace.offsetWidth;workspace.classList.add('yyc-admin-tab-enter');}
      });
    });
    renderAdminTab(tab,d);
    var workspace=$('#adminWorkspace');
    if(workspace){
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
          if(confirm('Delete this leader?')) adminAction('admin_delete_leader',{p_id:lid},'Leader deleted');
          return;
        }
      });
    }
  });
}
function renderAdminTab(tab,d){
  var a=$('#adminWorkspace'); if(!a) return;
  if(tab==='overview'){
    var pm=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';}).length;
    var pu=(d.pending_updates||[]).length, pg=(d.pending_gallery||[]).length;
    a.innerHTML='<div class="admin-stats"><div><b>'+((d.members||[]).length)+'</b><span>Members</span></div><div><b>'+((d.leaders||[]).length)+'</b><span>Leaders</span></div><div><b>'+((d.updates||[]).filter(function(x){return x.status==='published';}).length)+'</b><span>Updates</span></div><div><b>'+((d.gallery||[]).length)+'</b><span>Gallery</span></div><div class="pending-stat"><b>'+(pm+pu+pg)+'</b><span>Pending approvals</span></div></div><div class="notice" style="margin-top:16px"><strong>Backend connected.</strong> Member approvals, accounts, content, settings and digital ID cards are stored centrally in Supabase.</div>';
    return;
  }
  if(tab==='members'){
    var members=d.members||[];
    a.innerHTML='<div class="admin-top"><h2>Members</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="adminAddMember">+ Add member</button></div></div><div class="admin-toolbar"><input id="adminMemberSearch" class="admin-search" placeholder="Search name, role number, phone or email" autocomplete="off"><span class="admin-result-count" id="adminMemberCount"></span><button type="button" class="mini-btn" id="exportMembersCSV">Export CSV</button></div>'+ (members.length?'<div class="admin-card-list">'+members.map(function(m){return '<div class="approval-card"><div class="meta"><strong>'+esc(m.name)+'</strong><small>'+esc(m.role_number||'PENDING')+' · '+esc(m.email||'')+'</small><small>Status: '+esc(m.status||'pending')+'</small></div><div class="admin-actions"><button class="mini-btn" data-view="'+m.id+'">Card</button><button class="mini-btn" data-download-member="'+m.id+'">Download ID</button><button class="mini-btn" data-edit-member="'+m.id+'">Edit</button>'+((m.status||'pending')==='pending'?'<button class="mini-btn gold" data-approve="'+m.id+'">Approve</button><button class="mini-btn" data-deny="'+m.id+'">Deny</button>':'')+'<button class="mini-btn" data-remove="'+m.id+'">Delete</button></div></div>';}).join('')+'</div>':'<div class="empty">No members yet.</div>');
    $('#adminAddMember').addEventListener('click',function(){adminMemberForm(null);});
    $('[data-view]').forEach(function(b){b.addEventListener('click',function(){var m=members.find(function(x){return x.id===b.getAttribute('data-view');}); if(m){m.__adminView=true;m.__adminTab='members';memberDashboard(m);}});});
    $('[data-download-member]').forEach(function(b){b.addEventListener('click',function(){var m=members.find(function(x){return x.id===b.getAttribute('data-download-member');});if(m)downloadAdminCard(m,'member');});});
    $$('[data-edit-member]').forEach(function(b){b.addEventListener('click',function(){adminMemberForm(b.getAttribute('data-edit-member'));});});
    $$('[data-approve]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-approve'),p_action:'approve'},'Member approved');});});
    $$('[data-deny]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-deny'),p_action:'deny'},'Member denied');});});
    $$('[data-remove]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Remove this member?')) await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-remove'),p_action:'remove'},'Member removed');});});
    $('#adminMemberSearch').addEventListener('input',function(){var q=this.value.trim().toLowerCase();var rows=$$('.admin-card-list .approval-card');var shown=0;rows.forEach(function(row){var hit=!q||row.textContent.toLowerCase().indexOf(q)>=0;row.style.display=hit?'':'none';if(hit)shown++;});$('#adminMemberCount').textContent=shown+' of '+rows.length+' shown';});
    $('#adminMemberSearch').dispatchEvent(new Event('input'));
    $('#exportMembersCSV').addEventListener('click',function(){exportYYCMembersCSV(members);});
    return;
  }

  if(tab==='leaders'){
    var ls=d.leaders||[];
    a.innerHTML='<div class="admin-top"><h2>Leaders</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addLeaderBtn">+ Add leader</button></div></div>'+ (ls.length?'<div class="admin-card-list">'+ls.map(function(l){return '<div class="approval-card"><div class="meta"><strong>'+esc(l.name)+'</strong><small>'+esc(l.role)+' · '+esc(l.role_number||'PENDING')+'</small><small>'+esc(l.line||'')+'</small><small>'+((l.login_enabled)?'Login enabled':'Login not set')+' · '+esc(l.status||'active')+'</small></div><div class="admin-actions"><button class="mini-btn" data-card-leader="'+l.id+'">Card</button><button class="mini-btn" data-download-leader="'+l.id+'">Download ID</button><button class="mini-btn" data-edit-leader="'+l.id+'">Edit</button><button class="mini-btn" data-del-leader="'+l.id+'">Delete</button></div></div>';}).join('')+'</div>':'<div class="empty">No leaders yet.</div>');
    $('#addLeaderBtn').addEventListener('click',function(){adminLeaderForm(null);});
    /* Leader Card/Edit/Delete are handled by the admin workspace event delegation below. */
    return;
  }
  if(tab==='updates'){
    var ups=d.updates||[];
    a.innerHTML='<div class="admin-top"><h2>Updates</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addUpdateBtn">+ Add update</button></div></div><div class="admin-card-list">'+(ups.length?ups.map(function(u){return '<div class="approval-card"><div class="meta"><strong>'+esc(u.title)+'</strong><small>'+esc(fmtDate(u.event_date||u.published_at))+' · '+esc(u.body||'')+'</small><small>Status: '+esc(u.status||'published')+'</small></div><div class="admin-actions"><button class="mini-btn" data-del-update="'+u.id+'">Delete</button></div></div>';}).join(''):'<div class="empty">No updates.</div>')+'</div>';
    $('#addUpdateBtn').addEventListener('click',function(){adminUpdateForm(null);});
    $$('[data-del-update]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete update?')) await adminAction('admin_delete_content',{p_kind:'update',p_id:b.getAttribute('data-del-update')},'Update deleted');});});
    return;
  }
  if(tab==='gallery'){
    var gs=d.gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Gallery</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="addGalleryBtn">+ Add photo</button></div></div><div class="admin-grid-2">'+(gs.length?gs.map(function(g){return '<figure class="gallery-card admin-gallery-card"><img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'"><figcaption>'+esc(g.title)+' <button class="mini-btn" data-del-gallery="'+g.id+'">Delete</button></figcaption></figure>';}).join(''):'<div class="empty">No gallery.</div>')+'</div>';
    $('#addGalleryBtn').addEventListener('click',function(){adminGalleryForm(null);});
    $$('[data-del-gallery]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete photo?')) await adminAction('admin_delete_content',{p_kind:'gallery',p_id:b.getAttribute('data-del-gallery')},'Gallery photo deleted');});});
    return;
  }
  if(tab==='approvals'){
    var pendingMembers=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';});
    var pUpdates=d.pending_updates||[], pGallery=d.pending_gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Approval Queue</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><span class="approval-count">'+(pendingMembers.length+pUpdates.length+pGallery.length)+' pending</span></div>'+(
      pendingMembers.concat(pUpdates.map(function(x){x.__kind='update';return x;}),pGallery.map(function(x){x.__kind='gallery';return x;})).length
      ? '<div class="admin-card-list">'+pendingMembers.map(function(m){return '<div class="approval-card"><div class="meta"><strong>'+esc(m.name)+' · MEMBER</strong><small>'+esc(m.email||'')+' · '+esc(m.phone||'')+'</small></div><div class="admin-actions"><button class="mini-btn gold" data-am="'+m.id+'">Approve</button><button class="mini-btn" data-dm="'+m.id+'">Deny</button></div></div>';}).join('')+
      pUpdates.map(function(u){return '<div class="approval-card"><div class="meta"><strong>'+esc(u.title)+' · UPDATE</strong><small>'+esc(u.body)+'</small></div><div class="admin-actions"><button class="mini-btn gold" data-au="'+u.id+'">Publish</button><button class="mini-btn" data-du="'+u.id+'">Deny</button></div></div>';}).join('')+
      pGallery.map(function(g){return '<div class="approval-card"><div class="meta"><strong>'+esc(g.title)+' · GALLERY</strong><small>Photo submission</small></div><div class="admin-actions"><button class="mini-btn gold" data-ag="'+g.id+'">Publish</button><button class="mini-btn" data-dg="'+g.id+'">Deny</button></div></div>'}).join('')
      +'</div>' : '<div class="empty">No pending submissions.</div>');
    $$('[data-am]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-am'),p_action:'approve'},'Member approved and ID assigned');});});
    $$('[data-dm]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-dm'),p_action:'deny'},'Member denied');});});
    $$('[data-au]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'update',p_id:b.getAttribute('data-au'),p_action:'approve'},'Update published');});});
    $$('[data-du]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'update',p_id:b.getAttribute('data-du'),p_action:'deny'},'Update denied');});});
    $$('[data-ag]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'gallery',p_id:b.getAttribute('data-ag'),p_action:'approve'},'Gallery published');});});
    $$('[data-dg]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_approve_content',{p_kind:'gallery',p_id:b.getAttribute('data-dg'),p_action:'deny'},'Gallery denied');});});
    return;
  }

  if(tab==='events'){
    a.innerHTML='<div class="storage-loading"><div class="storage-spinner"></div><strong>Loading events…</strong><span>Reading YYC event records</span></div>';
    rpc('admin_dashboard',{p_token:adminToken}).then(function(s){
      if(!s.ok) throw new Error(s.error||'Unable to load events');
      adminData=s;
      var events=s.events||[];
      a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">YYC PROGRAMMES</div><h2 class="modal-title">Events</h2><p class="admin-subline">Create and manage public event cards.</p></div>'+
        '<div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="adminAddEvent">+ Add event</button></div></div>'+
        (events.length?'<div class="events-admin-grid">'+events.map(function(ev){
          var dt=ev.event_date?new Date(ev.event_date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'DATE TBC';
          return '<article class="event-admin-card"><div class="event-admin-date">'+esc(dt)+'</div><div class="event-admin-main"><strong>'+esc(ev.title||'Untitled event')+'</strong><span>'+esc(ev.location||'Location not set')+'</span>'+(ev.description?'<p>'+esc(ev.description)+'</p>':'')+'<div class="admin-actions event-admin-actions"><button class="mini-btn" data-edit-event="'+ev.id+'">Edit</button><button class="mini-btn" data-del-event="'+ev.id+'">Delete</button></div></div></article>';
        }).join('')+'</div>':'<div class="empty">No events stored yet. Add the first YYC programme.</div>');
      $('#adminAddEvent').addEventListener('click',function(){adminEventForm(null);});
      $$('[data-edit-event]').forEach(function(b){b.addEventListener('click',function(){adminEventForm(b.getAttribute('data-edit-event'));});});
      $$('[data-del-event]').forEach(function(b){b.addEventListener('click',function(){adminDeleteEvent(b.getAttribute('data-del-event'));});});
    }).catch(function(e){
      a.innerHTML='<div class="storage-error"><strong>Could not load events.</strong><span>'+esc(e.message)+'</span><button class="mini-btn gold" id="eventsRetry">Retry</button></div>';
      $('#eventsRetry').addEventListener('click',function(){adminPanel('events');});
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
        ['Volunteers',c.volunteers||volunteers.length]
      ];
      a.innerHTML='<div class="admin-top"><div><div class="modal-kicker">YYC INSIGHTS</div><h2 class="modal-title">Reports</h2><p class="admin-subline">Live operational summary from the current database.</p></div><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button><button class="mini-btn gold" id="reportsRefresh">↻ Refresh</button></div></div>'+
        '<div class="report-grid">'+cards.map(function(x){return '<div class="report-card"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong></div>';}).join('')+'</div>'+
        '<div class="report-split"><section class="report-panel"><div class="report-panel-head"><h3>Member approval</h3><b>'+approvalRate+'%</b></div><div class="report-progress"><span style="width:'+approvalRate+'%"></span></div><p>'+approved+' approved out of '+total+' member records.</p></section>'+
        '<section class="report-panel"><div class="report-panel-head"><h3>Operational content</h3><b>'+ (published+gallery.length+events.length) +'</b></div><p>Published updates, gallery items and event records currently stored.</p></section></div>';
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
        ['volunteers','Volunteers',c.volunteers||0,'✦']
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
        '<div class="storage-section"><div class="storage-section-head"><h3>Volunteers</h3><span>'+((s.volunteers||[]).length)+' shown</span></div>'+rows(s.volunteers,[['Name','name'],['Area','area'],['Approved','approved']])+'</div>';
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
    a.innerHTML='<div class="admin-top"><h2>Site Settings</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Back to Admin</button></div></div><form id="settingsForm"><div class="form-grid"><div class="field"><label>Club name</label><input id="setClub" value="'+esc(s.club_name||'YUVAKESARI YOUTH CLUB')+'"></div><div class="field"><label>Location</label><input id="setLoc" value="'+esc(s.location||'SUBRAHMANYA · KARNATAKA')+'"></div><div class="field full"><label>Slogan</label><input id="setSlogan" value="'+esc(s.slogan||'ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩')+'"></div><div class="field"><label>Instagram</label><input id="setInsta" value="'+esc(s.instagram||'')+'"></div><div class="field"><label>WhatsApp</label><input id="setWhats" value="'+esc(s.whatsapp||'')+'"></div><div class="field"><label>X</label><input id="setX" value="'+esc(s.x_url||'')+'"></div><div class="field"><label>Facebook</label><input id="setFb" value="'+esc(s.facebook||'')+'"></div></div><div class="form-actions"><button class="btn gold">SAVE SETTINGS</button></div></form>';
    $('#settingsForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_save_settings',{p_token:adminToken,p_payload:{club_name:$('#setClub').value.trim(),location:$('#setLoc').value.trim(),slogan:$('#setSlogan').value.trim(),instagram:$('#setInsta').value.trim(),whatsapp:$('#setWhats').value.trim(),x_url:$('#setX').value.trim(),facebook:$('#setFb').value.trim()}});if(!r.ok)throw new Error(r.error||'Failed');toast('Settings saved');loadPublic();adminPanel('settings');}catch(err){toast(err.message);}});
  }
}
async function adminAction(name,args,msg){
  try{var r=await rpc(name,Object.assign({p_token:adminToken},args));if(r && r.ok===false)throw new Error(r.error||'Action failed');toast(msg);var d=await rpc('admin_dashboard',{p_token:adminToken});adminData=d;renderAdminTab('overview',d);adminPanel('overview');}catch(e){toast(e.message);}
}
function adminMemberForm(id){
  var existing=(adminData.members||[]).find(function(m){return m.id===id;}) || {name:'',dob:'',phone:'',email:'',club_name:'Yuvakesari Youth Club',position:'MEMBER',photo_url:'',photo_scale:1,photo_pos_x:50,photo_pos_y:50};
  var obj={photo:existing.photo_url||'',scale:existing.photo_scale||1,x:existing.photo_pos_x==null?50:existing.photo_pos_x,y:existing.photo_pos_y==null?50:existing.photo_pos_y};
  openModal('<div class="modal-kicker">ADMIN · MEMBER</div><div class="admin-form-top"><button type="button" class="mini-btn" id="adminMemberBack">← Members</button></div><h2 class="modal-title">'+(id?'Edit':'Add')+' Member</h2><form id="adminMemberForm"><div class="form-grid"><div class="field"><label>Full name</label><input id="amName" value="'+esc(existing.name)+'" required></div><div class="field"><label>Date of birth</label><input id="amDob" type="date" value="'+esc(existing.dob||'')+'" required></div><div class="field"><label>Phone</label><input id="amPhone" value="'+esc(existing.phone||'')+'"></div><div class="field"><label>Position</label><input id="amPosition" value="'+esc(existing.position||'MEMBER')+'"></div><div class="field"><label>Email</label><input id="amEmail" type="email" value="'+esc(existing.email||'')+'"></div><div class="field"><label>Password '+(id?'(leave blank to keep)':'')+'</label><input id="amPass" type="password" minlength="8" '+(id?'':'required')+'></div><div class="field full"><label>Photo '+(id?'(leave empty to keep)':'')+'</label><input id="amFile" type="file" accept="image/*"></div></div>'+imageEditor('adminM',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SAVE MEMBER</button></div></form>');
  wireEditor('adminM',obj,'amFile');
  $('#adminMemberBack').addEventListener('click',function(){adminPanel('members');});
  $('#adminMemberForm').addEventListener('submit',async function(e){e.preventDefault();try{if(!id && !obj.photo)throw new Error('Photo is required');var payload={name:$('#amName').value.trim(),dob:$('#amDob').value,phone:$('#amPhone').value.trim(),email:$('#amEmail').value.trim(),club_name:'Yuvakesari Youth Club',position:$('#amPosition').value.trim()||'MEMBER',photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y,password:$('#amPass').value};var r=await rpc('admin_member_upsert',{p_token:adminToken,p_id:id,p_payload:payload});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Member saved');adminPanel('members');}catch(err){toast(err.message);}});
}

function adminLeaderForm(id){
  var existing=(adminData.leaders||[]).find(function(l){return l.id===id;}) || {name:'',role:'',line:'YUVAKESARI YOUTH CLUB · SUBRAHMANYA',phone:'',email:'',login_enabled:false,status:'active',photo_url:'',photo_scale:1,photo_pos_x:50,photo_pos_y:50,sort_order:0};
  var obj={photo:existing.photo_url||'',scale:existing.photo_scale||1,x:existing.photo_pos_x==null?50:existing.photo_pos_x,y:existing.photo_pos_y==null?50:existing.photo_pos_y};
  openModal(
    '<div class="modal-kicker">ADMIN · LEADERS</div><div class="admin-form-top"><button type="button" class="mini-btn" id="adminLeaderBack">← Leaders</button></div><h2 class="modal-title">'+(id?'Edit':'Add')+' Leader</h2>'+
    '<p class="modal-sub">Leader accounts are separate from members and are created only by the admin.</p>'+
    '<form id="adminLeaderForm"><div class="form-grid">'+
      '<div class="field"><label>Name</label><input id="alName" value="'+esc(existing.name)+'" required></div>'+
      '<div class="field"><label>Role / Position</label><input id="alRole" value="'+esc(existing.role||'')+'" placeholder="PRESIDENT / SECRETARY / CHAIRMAN" required></div>'+
      '<div class="field"><label>Phone</label><input id="alPhone" value="'+esc(existing.phone||'')+'"></div>'+
      '<div class="field"><label>Email</label><input id="alEmail" type="email" value="'+esc(existing.email||'')+'"></div>'+
      '<div class="field"><label>Password '+(id?'(leave blank to keep)':'')+'</label><input id="alPass" type="password" minlength="8" '+(id?'':'required')+' placeholder="Minimum 8 characters"></div>'+
      '<div class="field"><label>Status</label><select id="alStatus"><option value="active" '+(existing.status!=='inactive'?'selected':'')+'>Active</option><option value="inactive" '+(existing.status==='inactive'?'selected':'')+'>Inactive</option></select></div>'+
      '<div class="field full"><label>Display line</label><input id="alLine" value="'+esc(existing.line||'')+'" placeholder="YUVAKESARI YOUTH CLUB · SUBRAHMANYA"></div>'+
      '<div class="field full"><label>Photo</label><input id="alFile" type="file" accept="image/*"></div>'+
    '</div>'+imageEditor('adminL',obj.photo,obj.scale,obj.x,obj.y)+
    '<div class="form-actions"><button class="btn gold">SAVE LEADER</button></div></form>'
  );
  wireEditor('adminL',obj,'alFile');
  $('#adminLeaderBack').addEventListener('click',function(){adminPanel('leaders');});
  $('#adminLeaderForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      var payload={
        name:$('#alName').value.trim(),role:$('#alRole').value.trim(),line:$('#alLine').value.trim(),
        phone:$('#alPhone').value.trim(),email:$('#alEmail').value.trim(),password:$('#alPass').value,
        status:$('#alStatus').value,photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y,
        sort_order:existing.sort_order||0
      };
      var r=await rpc('admin_upsert_leader',{p_token:adminToken,p_id:id,p_payload:payload});
      if(!r.ok) throw new Error(r.error||'Failed');
      closeModal();toast('Leader saved');adminPanel('leaders');
    }catch(err){toast(err.message);}
  });
}
function adminEventForm(id){
  var events=adminData.events||[];
  var existing=events.find(function(e){return String(e.id)===String(id);}) || {title:'',description:'',event_date:'',location:'',image_url:''};
  openModal(
    '<div class="modal-kicker">ADMIN · EVENTS</div>'+
    '<div class="admin-form-top"><button type="button" class="mini-btn" id="adminEventBack">← Events</button></div>'+
    '<h2 class="modal-title">'+(id?'Edit':'Add')+' Event</h2>'+
    '<p class="modal-sub">Publish a clean event card to the public YYC website.</p>'+
    '<form id="adminEventForm">'+
      '<div class="form-grid">'+
        '<div class="field"><label>Event name</label><input id="aeTitle" value="'+esc(existing.title||'')+'" required></div>'+
        '<div class="field"><label>Date</label><input id="aeDate" type="date" value="'+esc(existing.event_date||'')+'"></div>'+
        '<div class="field"><label>Location</label><input id="aeLocation" value="'+esc(existing.location||'')+'" placeholder="Subrahmanya, Karnataka"></div>'+
        '<div class="field"><label>Image URL</label><input id="aeImage" value="'+esc(existing.image_url||'')+'" placeholder="https://..."></div>'+
        '<div class="field full"><label>Description</label><textarea id="aeDescription" placeholder="What is happening at this programme?">'+esc(existing.description||'')+'</textarea></div>'+
      '</div>'+
      '<div class="form-actions"><button class="btn gold">SAVE EVENT</button></div>'+
    '</form>'
  );
  $('#adminEventBack').addEventListener('click',function(){adminPanel('events');});
  $('#adminEventForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      var payload={
        title:$('#aeTitle').value.trim(),
        description:$('#aeDescription').value.trim(),
        event_date:$('#aeDate').value,
        location:$('#aeLocation').value.trim(),
        image_url:$('#aeImage').value.trim()
      };
      var r=await rpc('admin_upsert_event',{p_token:adminToken,p_id:id||null,p_payload:payload});
      if(!r.ok) throw new Error(r.error||'Failed');
      closeModal(); toast('Event saved'); adminPanel('events');
    }catch(err){toast(err.message);}
  });
}
function adminDeleteEvent(id){
  if(!confirm('Delete this event?')) return;
  rpc('admin_delete_event',{p_token:adminToken,p_id:id}).then(function(r){
    if(!r.ok) throw new Error(r.error||'Failed');
    toast('Event deleted');
    adminPanel('events');
  }).catch(function(e){toast(e.message);});
}

function adminUpdateForm(id){
  var existing=(adminData.updates||[]).find(function(u){return u.id===id;}) || {title:'',body:'',event_date:today(),image_url:''};
  openModal('<div class="modal-kicker">ADMIN · UPDATES</div><h2 class="modal-title">'+(id?'Edit':'Add')+' Update</h2><form id="adminUpdateForm"><div class="form-grid"><div class="field"><label>Title</label><input id="auTitle" value="'+esc(existing.title)+'" required></div><div class="field"><label>Date</label><input id="auDate" type="date" value="'+esc(existing.event_date||today())+'"></div><div class="field full"><label>Message</label><textarea id="auBody" required>'+esc(existing.body||'')+'</textarea></div></div><div class="form-actions"><button class="btn gold">PUBLISH UPDATE</button></div></form>');
  $('#adminUpdateForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_upsert_update',{p_token:adminToken,p_id:id,p_payload:{title:$('#auTitle').value.trim(),body:$('#auBody').value.trim(),event_date:$('#auDate').value}});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Update published');adminPanel('updates');}catch(err){toast(err.message);}});
}
function adminGalleryForm(id){
  var existing=(adminData.gallery||[]).find(function(g){return g.id===id;}) || {title:'',src:'',caption:''};
  var obj={photo:existing.src||''};
  openModal('<div class="modal-kicker">ADMIN · GALLERY</div><h2 class="modal-title">Publish Gallery Photo</h2><form id="adminGalleryForm"><div class="field"><label>Caption</label><input id="agTitle" value="'+esc(existing.title)+'" required></div><div class="field" style="margin-top:12px"><label>Photo</label><input id="agFile" type="file" accept="image/*"></div><div class="crop-preview yyc-simple-preview"><img id="agPrev" src="'+esc(obj.photo||'assets/yyc-logo-clean.webp')+'" alt="preview"></div><div class="form-actions"><button class="btn gold">PUBLISH PHOTO</button></div></form>');
  $('#agFile').addEventListener('change',async function(){obj.photo=await readFile(this.files[0],860);if(obj.photo)$('#agPrev').src=obj.photo;});
  $('#adminGalleryForm').addEventListener('submit',async function(e){e.preventDefault();try{if(!obj.photo)throw new Error('Photo is required');var r=await rpc('admin_upsert_gallery',{p_token:adminToken,p_id:id,p_payload:{title:$('#agTitle').value.trim(),src:obj.photo}});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Gallery published');adminPanel('gallery');}catch(err){toast(err.message);}});
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
    var target=e.target && e.target.closest ? e.target.closest('button') : null;
    if(!target) return;

    var cardLeader=target.closest('[data-card-leader]');
    if(cardLeader){
      var modal=target.closest('#modal');
      if(!modal) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var id=cardLeader.getAttribute('data-card-leader');
      var d=window.__yycAdminLastData || adminData;
      var l=(d && d.leaders || []).find(function(x){return String(x.id)===String(id);});
      if(l){
        l.__adminView=true;
        l.__adminTab='leaders';
        leaderDashboard(l);
      }else{
        toast('Leader record not found');
      }
      return;
    }

    var editLeader=target.closest('[data-edit-leader]');
    if(editLeader){
      var modal2=target.closest('#modal');
      if(!modal2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      adminLeaderForm(editLeader.getAttribute('data-edit-leader'));
      return;
    }

    var delLeader=target.closest('[data-del-leader]');
    if(delLeader){
      var modal3=target.closest('#modal');
      if(!modal3) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var lid=delLeader.getAttribute('data-del-leader');
      if(confirm('Delete this leader?')) adminAction('admin_delete_leader',{p_id:lid},'Leader deleted');
      return;
    }
  },true);
}

function bindUI(){
  bindMotionSystem();
  bindAdminActionDelegation();
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
window.YYC={memberLogin:memberLogin,memberRegister:memberRegister,leaderLogin:leaderLogin,leaderDashboard:leaderDashboard,adminLogin:adminLogin,adminPanel:adminPanel};
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
  if(window.__yycAppInitialized) return;
  window.__yycAppInitialized=true;
  ensureSupabaseClient().catch(function(){});
  document.body.classList.add('yyC-opening');
  setTimeout(function(){document.body.classList.remove('yyC-opening');},1700);
  bindUI();
  loadPublic();
  restorePersistentPortals();
  verifyFromUrl();
  if($('#year')) $('#year').textContent=new Date().getFullYear();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistrations().then(function(rs){
      if(!rs.length)return;
      return Promise.all(rs.map(function(r){return r.unregister();})).then(function(){
        if(!yycSafeGet(sessionStorage,'yyc_sw_clean_v1')) yycSafeSet(sessionStorage,'yyc_sw_clean_v1','1');
      });
    }).catch(function(){});
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initYYCApp);
else initYYCApp();