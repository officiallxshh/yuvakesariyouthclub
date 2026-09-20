'use strict';

var YYC_CONFIG = {
  supabaseUrl: 'https://vrllozfzheikjbhxvpkx.supabase.co',
  supabaseKey: 'sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt'
};

var sb = window.supabase.createClient(YYC_CONFIG.supabaseUrl, YYC_CONFIG.supabaseKey);
var ADMIN_TOKEN_KEY = 'yyc_admin_session_v1';
var MEMBER_TOKEN_KEY = 'yyc_member_session_v1';
var LEADER_TOKEN_KEY = 'yyc_leader_session_v1';
var adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
var memberToken = localStorage.getItem(MEMBER_TOKEN_KEY) || '';
var leaderToken = localStorage.getItem(LEADER_TOKEN_KEY) || '';
var publicData = null;
var adminData = null;

var $ = function(s){ return document.querySelector(s); };
var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };

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
  var res=await sb.rpc(name,args || {});
  if(res.error) throw new Error(res.error.message || 'Database request failed');
  return res.data;
}
function loadScript(src){return new Promise(function(resolve,reject){if(document.querySelector('script[data-yyc-src="'+src+'"]')){var existing=document.querySelector('script[data-yyc-src="'+src+'"]');if(existing.dataset.loaded==='1')return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}var s=document.createElement('script');s.src=src;s.async=true;s.dataset.yycSrc=src;s.onload=function(){s.dataset.loaded='1';resolve();};s.onerror=reject;document.head.appendChild(s);});}

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
  return '<div class="yyc-photo-editor ig-photo-editor">'+
    '<div class="yyc-photo-preview ig-photo-preview" id="'+id+'Stage" tabindex="0" aria-label="Square photo adjustment area">'+
      '<div class="ig-crop-grid"></div>'+
      '<img id="'+id+'Preview" src="'+esc(photo || 'assets/yyc-logo-clean.webp')+'" alt="Photo preview">'+
      '<span class="ig-drag-hint">DRAG • SCROLL • ARROW KEYS</span>'+
      '<div class="ig-hover-controls" aria-label="Photo adjustment controls">'+
        '<div class="ig-control-row"><button type="button" data-photo-action="up" aria-label="Move photo up">↑</button><button type="button" data-photo-action="zoomIn" aria-label="Zoom in">＋</button><button type="button" data-photo-action="down" aria-label="Move photo down">↓</button></div>'+
        '<div class="ig-control-row"><button type="button" data-photo-action="left" aria-label="Move photo left">←</button><button type="button" data-photo-action="center" aria-label="Center photo">●</button><button type="button" data-photo-action="right" aria-label="Move photo right">→</button></div>'+
        '<div class="ig-control-row"><button type="button" data-photo-action="zoomOut" aria-label="Zoom out">−</button><button type="button" data-photo-action="reset" aria-label="Reset photo">RESET</button></div>'+
      '</div>'+
    '</div>'+
    '<div class="ig-photo-side">'+
      '<div class="ig-zoom-title">ZOOM</div>'+
      '<input class="ig-zoom-range" id="'+id+'Scale" type="range" min="1" max="2.4" step="0.01" value="'+(scale||1)+'" aria-label="Zoom">'+
      '<output id="'+id+'ScaleOut">'+(scale||1).toFixed(2)+'×</output>'+
      '<button type="button" class="mini-btn ig-reset-btn" id="'+id+'Reset">RESET</button>'+
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
    $('#'+id+'ScaleOut').textContent=obj.scale.toFixed(2)+'×';
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

  function clampZoom(v){ return Math.max(1,Math.min(2.4,Number(v)||1)); }
  function nudge(dx,dy){
    obj.x=Math.max(0,Math.min(100,(obj.x==null?50:Number(obj.x))+dx));
    obj.y=Math.max(0,Math.min(100,(obj.y==null?50:Number(obj.y))+dy));
    draw();
  }
  function resetPhoto(){
    obj.scale=1; obj.x=50; obj.y=50; zoom.value='1'; draw();
  }
  function zoomBy(delta){
    zoom.value=clampZoom(Number(zoom.value)+delta).toFixed(2);
    draw();
  }
  stage.querySelectorAll('[data-photo-action]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var act=btn.getAttribute('data-photo-action');
      if(act==='up') nudge(0,-4);
      else if(act==='down') nudge(0,4);
      else if(act==='left') nudge(-4,0);
      else if(act==='right') nudge(4,0);
      else if(act==='center'){obj.x=50;obj.y=50;draw();}
      else if(act==='zoomIn') zoomBy(.1);
      else if(act==='zoomOut') zoomBy(-.1);
      else if(act==='reset') resetPhoto();
      stage.focus();
    });
  });
  $('#'+id+'Reset').addEventListener('click',resetPhoto);
  stage.addEventListener('keydown',function(e){
    var step=e.shiftKey?8:4;
    if(e.key==='ArrowUp'){nudge(0,-step);e.preventDefault();}
    else if(e.key==='ArrowDown'){nudge(0,step);e.preventDefault();}
    else if(e.key==='ArrowLeft'){nudge(-step,0);e.preventDefault();}
    else if(e.key==='ArrowRight'){nudge(step,0);e.preventDefault();}
    else if(e.key==='+' || e.key==='='){zoomBy(.1);e.preventDefault();}
    else if(e.key==='-' || e.key==='_'){zoomBy(-.1);e.preventDefault();}
  });

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
      var img=l.photo_url ? '<img src="'+esc(l.photo_url)+'" alt="'+esc(l.name)+'" style="transform:scale('+(l.photo_scale||1)+');object-position:'+(l.photo_pos_x==null?50:l.photo_pos_x)+'% '+(l.photo_pos_y==null?50:l.photo_pos_y)+'%">' : '<span class="photo-placeholder">✦</span>';
      return '<article class="leader-card reveal visible"><div class="leader-photo">'+img+'</div><div class="leader-info"><strong>'+esc(l.name)+'</strong><small>'+esc(l.role||'LEADER')+'</small><div class="micro">'+esc(l.line||'YUVAKESARI YOUTH CLUB · SUBRAHMANYA')+'</div></div></article>';
    }).join('') : '<div class="empty">Leadership profiles will appear here.</div>';
  }
  var ug=$('#updatesGrid');
  if(ug){
    var ups=publicData.updates||[];
    ug.innerHTML=ups.length ? ups.map(function(u){return '<article class="update-card reveal visible"><time>'+esc(fmtDate(u.event_date || u.published_at))+'</time><div><h3>'+esc(u.title)+'</h3><p>'+esc(u.body||'')+'</p></div><span></span></article>';}).join('') : '<div class="empty">No updates published yet.</div>';
  }
  var gg=$('#galleryGrid');
  if(gg){
    var gs=publicData.gallery||[];
    gg.innerHTML=gs.length ? gs.map(function(g){return '<figure class="gallery-card reveal visible"><img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'" loading="lazy"><figcaption>'+esc(g.caption||g.title)+'</figcaption></figure>';}).join('') : '<div class="empty">No gallery items published yet.</div>';
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
function memberLogin(){
  openModal('<div class="modal-kicker">MEMBER ACCESS</div><h2 class="modal-title">Member Login</h2><p class="modal-sub">Use your registered email or phone after admin approval.</p><form id="memberLoginForm"><div class="field"><label>Email or phone</label><input id="mIdent" required></div><div class="field" style="margin-top:12px"><label>Password</label><input id="mPass" type="password" required></div><div class="form-actions"><button class="btn gold">LOGIN <span>→</span></button><button type="button" class="btn outline" id="openRegisterFromLogin">NEW MEMBER</button></div></form>');
  $('#openRegisterFromLogin').addEventListener('click',memberRegister);
  $('#memberLoginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      var r=await rpc('member_login',{p_identifier:$('#mIdent').value.trim(),p_password:$('#mPass').value});
      if(!r.ok) throw new Error(r.error||'Login failed');
      memberToken=r.token; localStorage.setItem(MEMBER_TOKEN_KEY,memberToken); closeModal(); memberDashboard(r.member);
    }catch(err){toast(err.message);}
  });
}
function yycMemberIdCardHTML(m,kind){
  var isLeader=kind==='leader';
  var roleRaw=m.role_number||(isLeader?'YYC-L-2026-0000':'YYC-2026-0000');
  var phoneRaw=m.phone||'';
  var emailRaw=m.email||'';
  var photo=m.photo_url||'';
  var sx=Math.max(1,Math.min(2.4,Number(m.photo_scale)||1));
  var px=Math.max(0,Math.min(100,m.photo_pos_x==null?50:Number(m.photo_pos_x)));
  var py=Math.max(0,Math.min(100,m.photo_pos_y==null?50:Number(m.photo_pos_y)));
  var tx=((px-50)/50)*15*sx;
  var ty=((py-50)/50)*15*sx;
  var photoTag=photo
    ? '<img src="'+esc(photo)+'" alt="Photo" style="transform:translate3d('+tx.toFixed(2)+'%,'+ty.toFixed(2)+'%,0) scale('+sx.toFixed(2)+')">'
    : '';
  var emailSize=emailRaw.length>30?3.25:(emailRaw.length>23?3.65:4.05);
  var typeLabel=isLeader?'leader':'member';
  return '<div id="yycDigitalCard" class="yyc-template-id-card" role="img" aria-label="Yuvakesari Youth Club '+typeLabel+' identity card">'+
    '<div class="yyc-template-photo">'+photoTag+'</div>'+
    '<div class="yyc-template-data-mask yyc-template-id-mask"><div class="yyc-template-value">'+esc(roleRaw)+'</div></div>'+
    '<div class="yyc-template-data-mask yyc-template-phone-mask"><div class="yyc-template-value">'+esc(phoneRaw)+'</div></div>'+
    '<div class="yyc-template-data-mask yyc-template-email-mask"><div class="yyc-template-value" style="font-size:'+emailSize+'cqw">'+esc(emailRaw)+'</div></div>'+
    '<div class="yyc-template-qr-mask"><div id="memberQr" class="yyc-template-qr"></div></div>'+
  '</div>';
}
function memberDashboard(memberArg){
  var m=memberArg;
  if(!m){
    if(!memberToken){memberLogin();return;}
    rpc('member_me',{p_token:memberToken}).then(function(r){
      if(!r.ok){localStorage.removeItem(MEMBER_TOKEN_KEY);memberToken='';memberLogin();return;}
      memberDashboard(r.member);
    }).catch(function(){memberLogin();});
    return;
  }

  var verifyUrl=location.origin+location.pathname+'?verify='+encodeURIComponent(m.role_number||'');
  var role=esc(m.role_number||'YYC-2026-0000');
  var name=esc(m.name||'Member');
  var position=esc(m.position||'MEMBER');
  var phone=esc(m.phone||'Not provided');
  var email=esc(m.email||'Not provided');
  var photo=esc(m.photo_url||'assets/yyc-logo-clean.webp');

  openModal(
    '<div class="member-dashboard premium-member-dashboard">'+
      '<div class="member-dashboard-head">'+
        '<div><div class="modal-kicker">MEMBER IDENTITY</div><h2 class="modal-title">Digital Membership Card</h2><p class="modal-sub">Official YYC member card with live verification QR.</p></div>'+
        (m.__adminView?'<button class="mini-btn" id="memberBackAdmin">← BACK TO ADMIN</button>':'<button class="mini-btn" id="memberLogout">Logout</button>')+
      '</div>'+
      yycMemberIdCardHTML(m)+
      '<div class="form-actions member-card-actions">'+
        '<button class="btn gold" id="downloadCard">DOWNLOAD ID CARD</button>'+
        '<button class="btn outline" id="memberSubmitUpdate">SUBMIT UPDATE</button>'+
        '<button class="btn outline" id="memberSubmitGallery">SUBMIT PHOTO</button>'+
      '</div>'+
      '<div class="verify-url-box"><small>QR VERIFICATION LINK</small><a href="'+esc(verifyUrl)+'" target="_blank" rel="noopener">'+esc(verifyUrl)+'</a></div>'+
    '</div>'
  );

  loadScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js').then(function(){ if(!window.QRCode || !m.role_number) return;
    new QRCode($('#memberQr'),{
      text:verifyUrl,
      width:108,
      height:108,
      colorDark:'#0b1014',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.H
    });
  }).catch(function(){});

  if(m.__adminView){
    $('#memberBackAdmin').addEventListener('click',function(){adminPanel(m.__adminTab||'members');});
  }else{
    $('#memberLogout').addEventListener('click',async function(){
    try{await rpc('member_logout',{p_token:memberToken});}catch(e){}
    localStorage.removeItem(MEMBER_TOKEN_KEY);
    memberToken='';
    closeModal();
    toast('Member logged out');
    });
  }

  $('#downloadCard').addEventListener('click',async function(){
    try{
      await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    }catch(e){window.print();return;}
    if(!window.html2canvas){window.print();return;}
    var canvas=await html2canvas($('#yycDigitalCard'),{
      backgroundColor:'#071016',
      scale:2,
      useCORS:true,
      logging:false
    });
    var a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=(m.role_number||'yyc-member-card')+'.png';
    a.click();
  });

  $('#memberSubmitUpdate').addEventListener('click',function(){submitUpdate(true);});
  $('#memberSubmitGallery').addEventListener('click',function(){submitGallery(true);});
}

function submitUpdate(auth){
  if(auth===true && !memberToken){memberLogin();return;}
  openModal('<div class="modal-kicker">MEMBER SUBMISSION</div><h2 class="modal-title">Submit an Update</h2><p class="modal-sub">Your submission will remain hidden until an admin approves it.</p><form id="submitUpdateForm"><div class="form-grid"><div class="field"><label>Title</label><input id="suTitle" required></div><div class="field"><label>Date</label><input id="suDate" type="date" value="'+today()+'"></div><div class="field full"><label>Message</label><textarea id="suBody" required></textarea></div></div><div class="form-actions"><button class="btn gold">SEND FOR APPROVAL</button></div></form>');
  $('#submitUpdateForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('member_submit_update',{p_token:memberToken,p_payload:{title:$('#suTitle').value.trim(),body:$('#suBody').value.trim(),event_date:$('#suDate').value}});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Update sent to admin approval');}catch(err){toast(err.message);}});
}
function submitGallery(auth){
  if(auth===true && !memberToken){memberLogin();return;}
  var obj={photo:'',scale:1,x:50,y:50};
  openModal('<div class="modal-kicker">MEMBER SUBMISSION</div><h2 class="modal-title">Submit Gallery Photo</h2><p class="modal-sub">Admin approval is required before publishing.</p><form id="submitGalleryForm"><div class="field"><label>Caption</label><input id="sgTitle" required></div><div class="field" style="margin-top:12px"><label>Photo</label><input id="sgFile" type="file" accept="image/*" required></div>'+imageEditor('galleryPhoto',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SEND FOR APPROVAL</button></div></form>');
  wireEditor('galleryPhoto',obj,'sgFile');
  $('#submitGalleryForm').addEventListener('submit',async function(e){e.preventDefault();if(!obj.photo){toast('Choose a photo');return;}try{var r=await rpc('member_submit_gallery',{p_token:memberToken,p_payload:{title:$('#sgTitle').value.trim(),src:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y}});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Gallery item sent to admin');}catch(err){toast(err.message);}});
}


function leaderLogin(){
  openModal('<div class="modal-kicker">LEADER ACCESS</div><h2 class="modal-title">Leader Login</h2><p class="modal-sub">Use the email address or phone number created for you by the YYC admin.</p><form id="leaderLoginForm"><div class="field"><label>Email or phone</label><input id="lIdent" autocomplete="username" required></div><div class="field" style="margin-top:12px"><label>Password</label><input id="lPass" type="password" autocomplete="current-password" required></div><div class="form-actions"><button class="btn gold">LOGIN AS LEADER <span>→</span></button></div></form>');
  $('#leaderLoginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      var r=await rpc('leader_login',{p_identifier:$('#lIdent').value.trim(),p_password:$('#lPass').value});
      if(!r.ok) throw new Error(r.error||'Invalid leader credentials');
      leaderToken=r.token;
      localStorage.setItem(LEADER_TOKEN_KEY,leaderToken);
      closeModal();
      leaderDashboard(r.leader);
    }catch(err){toast(err.message);}
  });
}
function leaderDashboard(leaderArg){
  if(!leaderArg){
    if(!leaderToken){leaderLogin();return;}
    rpc('leader_me',{p_token:leaderToken}).then(function(r){
      if(!r.ok){localStorage.removeItem(LEADER_TOKEN_KEY);leaderToken='';leaderLogin();return;}
      leaderDashboard(r.leader);
    }).catch(function(){leaderLogin();});
    return;
  }
  var l=leaderArg;
  var verifyUrl=location.origin+location.pathname+'?verify='+encodeURIComponent(l.role_number||'');
  var name=esc(l.name||'Leader');

  openModal(
    '<div class="leader-dashboard premium-member-dashboard">'+
      '<div class="member-dashboard-head">'+
        '<div><div class="modal-kicker">'+(l.__adminView?'ADMIN · LEADER IDENTITY':'LEADER ACCESS · READ ONLY')+'</div><h2 class="modal-title">Official Leader ID Card</h2><p class="modal-sub">The same official YYC card design is used for leader identity verification.</p></div>'+
        (l.__adminView?'<button class="mini-btn" id="leaderBackAdmin">← BACK TO ADMIN</button>':'<button class="mini-btn" id="leaderLogout">Logout</button>')+
      '</div>'+
      yycMemberIdCardHTML({role_number:l.role_number,name:l.name,position:l.role||l.position,phone:l.phone,email:l.email,photo_url:l.photo_url,photo_scale:l.photo_scale,photo_pos_x:l.photo_pos_x,photo_pos_y:l.photo_pos_y},'leader')+
      (l.__adminView?'':'<div class="form-actions member-card-actions"><button class="btn gold" id="downloadLeaderCard">DOWNLOAD LEADER ID</button></div>')+
      (l.__adminView?'<div class="form-actions member-card-actions"><button class="btn gold" id="downloadLeaderCard">DOWNLOAD ID CARD</button></div>':'')+
      '<div class="verify-url-box"><small>QR VERIFICATION LINK</small><a href="'+esc(verifyUrl)+'" target="_blank" rel="noopener">'+esc(verifyUrl)+'</a></div>'+
    '</div>'
  );

  loadScript('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js').then(function(){
    if(!window.QRCode || !l.role_number) return;
    new QRCode($('#memberQr'),{
      text:verifyUrl,
      width:108,
      height:108,
      colorDark:'#0b1014',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.H
    });
  }).catch(function(){});

  if(l.__adminView){
    $('#leaderBackAdmin').addEventListener('click',function(){adminPanel(l.__adminTab||'leaders');});
  }else{
    $('#leaderLogout').addEventListener('click',async function(){
      try{await rpc('leader_logout',{p_token:leaderToken});}catch(e){}
      localStorage.removeItem(LEADER_TOKEN_KEY);
      leaderToken='';
      closeModal();
      toast('Leader logged out');
    });
  }

  $('#downloadLeaderCard').addEventListener('click',async function(){
    try{await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');}
    catch(e){window.print();return;}
    if(!window.html2canvas){window.print();return;}
    var canvas=await html2canvas($('#yycDigitalCard'),{backgroundColor:'#071016',scale:2,useCORS:true,logging:false});
    var aa=document.createElement('a');
    aa.href=canvas.toDataURL('image/png');
    aa.download=(l.role_number||'yyc-leader-card')+'.png';
    aa.click();
  });
}

function adminLogin(){
  openModal('<div class="modal-kicker">PRIVATE MANAGEMENT</div><h2 class="modal-title">YYC Admin Access</h2><p class="modal-sub">Secure club management dashboard.</p><form id="adminLoginForm"><div class="field"><label>Admin ID</label><input id="aUser" autocomplete="username" required></div><div class="field" style="margin-top:12px"><label>Password</label><input id="aPass" type="password" autocomplete="current-password" required></div><div class="form-actions"><button class="btn gold">ENTER ADMIN</button></div></form>');
  $('#adminLoginForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_login',{p_username:$('#aUser').value.trim(),p_password:$('#aPass').value});if(!r.ok)throw new Error(r.error||'Invalid credentials');adminToken=r.token;sessionStorage.setItem(ADMIN_TOKEN_KEY,adminToken);closeModal();adminPanel();}catch(err){toast(err.message);}});
}
async function getAdmin(){
  if(!adminToken){adminLogin();return null;}
  try{adminData=await rpc('admin_dashboard',{p_token:adminToken});if(!adminData.ok){sessionStorage.removeItem(ADMIN_TOKEN_KEY);adminToken='';toast('Admin session expired');adminLogin();return null;}return adminData;}catch(e){toast(e.message);return null;}
}
function adminPanel(tab){
  getAdmin().then(function(d){
    if(!d) return;
    window.__yycAdminLastData=d;
    tab=tab||'overview';
    var tabs=[['overview','Overview'],['members','Members'],['leaders','Leaders'],['updates','Updates'],['gallery','Gallery'],['approvals','Approvals'],['storage','Data Storage'],['settings','Settings']];
    var nav=tabs.map(function(t){return '<button class="admin-tab '+(t[0]===tab?'active':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('');
    var pending=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';}).length+(d.pending_updates||[]).length+(d.pending_gallery||[]).length;
    openModal('<div class="admin-shell"><div class="admin-header"><div><div class="modal-kicker">YUVAKESARI YOUTH CLUB</div><h2 class="modal-title">Admin Control Center</h2></div><button class="mini-btn" id="adminLogout">Logout</button></div><div class="admin-tabs">'+nav+'</div><div class="admin-workspace" id="adminWorkspace"></div></div>');
    $('#adminLogout').addEventListener('click',async function(){try{await rpc('admin_logout',{p_token:adminToken});}catch(e){}sessionStorage.removeItem(ADMIN_TOKEN_KEY);adminToken='';closeModal();toast('Admin logged out');});
    $$('.admin-tab').forEach(function(b){b.addEventListener('click',function(){adminPanel(this.getAttribute('data-tab'));});});
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
    a.innerHTML='<div class="admin-top"><h2>Members</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Overview</button><button class="mini-btn gold" id="adminAddMember">+ Add member</button></div></div>'+ (members.length?'<div class="admin-card-list">'+members.map(function(m){return '<div class="approval-card"><div class="meta"><strong>'+esc(m.name)+'</strong><small>'+esc(m.role_number||'PENDING')+' · '+esc(m.email||'')+'</small><small>Status: '+esc(m.status||'pending')+'</small></div><div class="admin-actions"><button class="mini-btn" data-view="'+m.id+'">Card</button><button class="mini-btn" data-edit-member="'+m.id+'">Edit</button>'+((m.status||'pending')==='pending'?'<button class="mini-btn gold" data-approve="'+m.id+'">Approve</button><button class="mini-btn" data-deny="'+m.id+'">Deny</button>':'')+'<button class="mini-btn" data-remove="'+m.id+'">Delete</button></div></div>';}).join('')+'</div>':'<div class="empty">No members yet.</div>');
    $('#adminAddMember').addEventListener('click',function(){adminMemberForm(null);});
    $('[data-view]').forEach(function(b){b.addEventListener('click',function(){var m=members.find(function(x){return x.id===b.getAttribute('data-view');}); if(m){m.__adminView=true;m.__adminTab='members';memberDashboard(m);}});});
    $('[data-edit-member]').forEach(function(b){b.addEventListener('click',function(){adminMemberForm(b.getAttribute('data-edit-member'));});});
    $$('[data-approve]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-approve'),p_action:'approve'},'Member approved');});});
    $$('[data-deny]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-deny'),p_action:'deny'},'Member denied');});});
    $$('[data-remove]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Remove this member?')) await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-remove'),p_action:'remove'},'Member removed');});});
    return;
  }

  if(tab==='leaders'){
    var ls=d.leaders||[];
    a.innerHTML='<div class="admin-top"><h2>Leaders</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Overview</button><button class="mini-btn gold" id="addLeaderBtn">+ Add leader</button></div></div>'+ (ls.length?'<div class="admin-card-list">'+ls.map(function(l){return '<div class="approval-card"><div class="meta"><strong>'+esc(l.name)+'</strong><small>'+esc(l.role)+' · '+esc(l.role_number||'PENDING')+'</small><small>'+esc(l.line||'')+'</small><small>'+((l.login_enabled)?'Login enabled':'Login not set')+' · '+esc(l.status||'active')+'</small></div><div class="admin-actions"><button class="mini-btn" data-card-leader="'+l.id+'">Card</button><button class="mini-btn" data-edit-leader="'+l.id+'">Edit</button><button class="mini-btn" data-del-leader="'+l.id+'">Delete</button></div></div>';}).join('')+'</div>':'<div class="empty">No leaders yet.</div>');
    $('#addLeaderBtn').addEventListener('click',function(){adminLeaderForm(null);});
    /* Leader Card/Edit/Delete are handled by the admin workspace event delegation below. */
    return;
  }
  if(tab==='updates'){
    var ups=d.updates||[];
    a.innerHTML='<div class="admin-top"><h2>Updates</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Overview</button><button class="mini-btn gold" id="addUpdateBtn">+ Add update</button></div></div><div class="admin-card-list">'+(ups.length?ups.map(function(u){return '<div class="approval-card"><div class="meta"><strong>'+esc(u.title)+'</strong><small>'+esc(fmtDate(u.event_date||u.published_at))+' · '+esc(u.body||'')+'</small><small>Status: '+esc(u.status||'published')+'</small></div><div class="admin-actions"><button class="mini-btn" data-del-update="'+u.id+'">Delete</button></div></div>';}).join(''):'<div class="empty">No updates.</div>')+'</div>';
    $('#addUpdateBtn').addEventListener('click',function(){adminUpdateForm(null);});
    $$('[data-del-update]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete update?')) await adminAction('admin_delete_content',{p_kind:'update',p_id:b.getAttribute('data-del-update')},'Update deleted');});});
    return;
  }
  if(tab==='gallery'){
    var gs=d.gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Gallery</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Overview</button><button class="mini-btn gold" id="addGalleryBtn">+ Add photo</button></div></div><div class="admin-grid-2">'+(gs.length?gs.map(function(g){return '<figure class="gallery-card admin-gallery-card"><img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'"><figcaption>'+esc(g.title)+' <button class="mini-btn" data-del-gallery="'+g.id+'">Delete</button></figcaption></figure>';}).join(''):'<div class="empty">No gallery.</div>')+'</div>';
    $('#addGalleryBtn').addEventListener('click',function(){adminGalleryForm(null);});
    $$('[data-del-gallery]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete photo?')) await adminAction('admin_delete_content',{p_kind:'gallery',p_id:b.getAttribute('data-del-gallery')},'Gallery photo deleted');});});
    return;
  }
  if(tab==='approvals'){
    var pendingMembers=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';});
    var pUpdates=d.pending_updates||[], pGallery=d.pending_gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Approval Queue</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Overview</button><span class="approval-count">'+(pendingMembers.length+pUpdates.length+pGallery.length)+' pending</span></div>'+(
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
      a.innerHTML='<div class="storage-top"><div><div class="modal-kicker">LIVE DATABASE</div><h2 class="modal-title">Data Storage</h2><p class="modal-sub">Live counts and records from the YYC Supabase database.</p></div><div class="storage-meta"><button class="mini-btn" data-admin-overview>← Overview</button><span>Updated</span><b>'+esc(new Date(s.generated_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}))+'</b><button class="mini-btn gold" id="storageRefresh">↻ Refresh</button></div></div>'+
        '<div class="storage-stats">'+cards.map(function(x){return '<div class="storage-stat"><i>'+x[3]+'</i><div><b>'+x[2]+'</b><span>'+x[1]+'</span></div></div>';}).join('')+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Members</h3><span>'+((s.members||[]).length)+' shown</span></div>'+rows(s.members,[['Name','name'],['Role Number','role_number'],['Status','status']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Leaders</h3><span>'+((s.leaders||[]).length)+' shown</span></div>'+rows(s.leaders,[['Name','name'],['Role','role'],['Created','created_at']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Announcements</h3><span>'+((s.announcements||[]).length)+' shown</span></div>'+rows(s.announcements,[['Title','title'],['Status','status'],['Published','published_at']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Gallery</h3><span>'+((s.gallery||[]).length)+' shown</span></div>'+rows(s.gallery,[['Title','title'],['Caption','caption'],['Status','status']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Events</h3><span>'+((s.events||[]).length)+' shown</span></div>'+rows(s.events,[['Title','title'],['Date','event_date'],['Location','location']])+'</div>'+
        '<div class="storage-section"><div class="storage-section-head"><h3>Volunteers</h3><span>'+((s.volunteers||[]).length)+' shown</span></div>'+rows(s.volunteers,[['Name','name'],['Area','area'],['Approved','approved']])+'</div>';
      $('#storageRefresh').addEventListener('click',function(){adminPanel('storage');});
    }).catch(function(e){
      a.innerHTML='<div class="storage-error"><strong>Could not load live storage.</strong><span>'+esc(e.message)+'</span><button class="mini-btn gold" id="storageRetry">Retry</button></div>';
      $('#storageRetry').addEventListener('click',function(){adminPanel('storage');});
    });
    return;
  }
  if(tab==='settings'){
    var s=d.settings||{};
    a.innerHTML='<div class="admin-top"><h2>Site Settings</h2><div class="admin-top-actions"><button class="mini-btn" data-admin-overview>← Overview</button></div></div><form id="settingsForm"><div class="form-grid"><div class="field"><label>Club name</label><input id="setClub" value="'+esc(s.club_name||'YUVAKESARI YOUTH CLUB')+'"></div><div class="field"><label>Location</label><input id="setLoc" value="'+esc(s.location||'SUBRAHMANYA · KARNATAKA')+'"></div><div class="field full"><label>Slogan</label><input id="setSlogan" value="'+esc(s.slogan||'ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩')+'"></div><div class="field"><label>Instagram</label><input id="setInsta" value="'+esc(s.instagram||'')+'"></div><div class="field"><label>WhatsApp</label><input id="setWhats" value="'+esc(s.whatsapp||'')+'"></div><div class="field"><label>X</label><input id="setX" value="'+esc(s.x_url||'')+'"></div><div class="field"><label>Facebook</label><input id="setFb" value="'+esc(s.facebook||'')+'"></div></div><div class="form-actions"><button class="btn gold">SAVE SETTINGS</button></div></form>';
    $('#settingsForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_save_settings',{p_token:adminToken,p_payload:{club_name:$('#setClub').value.trim(),location:$('#setLoc').value.trim(),slogan:$('#setSlogan').value.trim(),instagram:$('#setInsta').value.trim(),whatsapp:$('#setWhats').value.trim(),x_url:$('#setX').value.trim(),facebook:$('#setFb').value.trim()}});if(!r.ok)throw new Error(r.error||'Failed');toast('Settings saved');loadPublic();adminPanel('settings');}catch(err){toast(err.message);}});
  }
}
async function adminAction(name,args,msg){
  try{var r=await rpc(name,Object.assign({p_token:adminToken},args));if(r && r.ok===false)throw new Error(r.error||'Action failed');toast(msg);var d=await rpc('admin_dashboard',{p_token:adminToken});adminData=d;renderAdminTab('overview',d);adminPanel();}catch(e){toast(e.message);}
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
  $$('[data-close]').forEach(function(x){x.addEventListener('click',closeModal);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});
  bindNavigation();
}
window.YYC={memberLogin:memberLogin,memberRegister:memberRegister,leaderLogin:leaderLogin,leaderDashboard:leaderDashboard,adminLogin:adminLogin,adminPanel:adminPanel};
document.addEventListener('DOMContentLoaded',function(){
  bindUI();
  loadPublic();
  verifyFromUrl();
  if($('#year')) $('#year').textContent=new Date().getFullYear();
  if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){if(!rs.length)return Promise.resolve();return Promise.all(rs.map(function(r){return r.unregister();})).then(function(){if(!sessionStorage.getItem('yyc_sw_clean_v1')){sessionStorage.setItem('yyc_sw_clean_v1','1');location.reload();}});}).catch(function(){});}
});
