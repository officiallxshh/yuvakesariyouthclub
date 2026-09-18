'use strict';

var YYC_CONFIG = {
  supabaseUrl: 'https://vrllozfzheikjbhxvpkx.supabase.co',
  supabaseKey: 'sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt'
};

var sb = window.supabase.createClient(YYC_CONFIG.supabaseUrl, YYC_CONFIG.supabaseKey);
var ADMIN_TOKEN_KEY = 'yyc_admin_session_v1';
var MEMBER_TOKEN_KEY = 'yyc_member_session_v1';
var adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
var memberToken = localStorage.getItem(MEMBER_TOKEN_KEY) || '';
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
  return '<div class="yyc-photo-editor"><div class="yyc-photo-preview"><img id="'+id+'Preview" src="'+esc(photo || 'assets/yyc-logo-clean.webp')+'" alt="Photo preview"></div><div class="yyc-photo-controls"><label>Zoom <input id="'+id+'Scale" type="range" min="1" max="2.4" step="0.01" value="'+(scale||1)+'"></label><output id="'+id+'ScaleOut">'+(scale||1).toFixed(2)+'×</output><label>Left / Right <input id="'+id+'X" type="range" min="0" max="100" value="'+(x==null?50:x)+'"></label><output id="'+id+'XOut">'+(x==null?50:x)+'%</output><label>Up / Down <input id="'+id+'Y" type="range" min="0" max="100" value="'+(y==null?50:y)+'"></label><output id="'+id+'YOut">'+(y==null?50:y)+'%</output></div></div>';
}
function wireEditor(id,obj,fileInput){
  function draw(){
    obj.scale=Number($('#'+id+'Scale').value); obj.x=Number($('#'+id+'X').value); obj.y=Number($('#'+id+'Y').value);
    var im=$('#'+id+'Preview'); im.style.transform='scale('+obj.scale+')'; im.style.objectPosition=obj.x+'% '+obj.y+'%';
    $('#'+id+'ScaleOut').textContent=obj.scale.toFixed(2)+'×'; $('#'+id+'XOut').textContent=obj.x+'%'; $('#'+id+'YOut').textContent=obj.y+'%';
  }
  ['Scale','X','Y'].forEach(function(k){ $('#'+id+k).addEventListener('input',draw); });
  $('#'+fileInput).addEventListener('change',async function(){
    var d=await readFile(this.files[0],520); if(!d) return;
    obj.photo=d; $('#'+id+'Preview').src=d;
  });
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
  $$('.desktop-nav .nav-link').forEach(function(a){a.addEventListener('click',function(){setTimeout(activeNav,20);});});
  window.addEventListener('hashchange',activeNav); activeNav();
}

function memberRegister(){
  var obj={photo:'',scale:1,x:50,y:50};
  openModal('<div class="modal-kicker">JOIN YYC</div><h2 class="modal-title">Member Registration</h2><p class="modal-sub">Submit your details for admin approval. After approval you can log in and receive your digital membership card.</p><form id="memberRegisterForm"><div class="form-grid"><div class="field"><label>Full name</label><input id="rName" required></div><div class="field"><label>Date of birth</label><input id="rDob" type="date" required></div><div class="field"><label>Phone</label><input id="rPhone" required></div><div class="field"><label>Email</label><input id="rEmail" type="email" required></div><div class="field full"><label>Password</label><input id="rPass" type="password" minlength="8" required placeholder="Minimum 8 characters"></div><div class="field full"><label>Member photo</label><input id="rPhoto" type="file" accept="image/*" required></div></div>'+imageEditor('regPhoto',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SUBMIT APPLICATION <span>↗</span></button></div></form>');
  wireEditor('regPhoto',obj,'rPhoto');
  $('#memberRegisterForm').addEventListener('submit',async function(e){
    e.preventDefault();
    try{
      var data={name:$('#rName').value.trim(),dob:$('#rDob').value,phone:$('#rPhone').value.trim(),email:$('#rEmail').value.trim(),club_name:'Yuvakesari Youth Club',photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y};
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
function memberDashboard(memberArg){
  var m=memberArg;
  if(!m){
    if(!memberToken){memberLogin();return;}
    rpc('member_me',{p_token:memberToken}).then(function(r){if(!r.ok){localStorage.removeItem(MEMBER_TOKEN_KEY);memberToken='';memberLogin();return;}memberDashboard(r.member);}).catch(function(){memberLogin();});
    return;
  }
  var verifyUrl=location.origin+location.pathname+'?verify='+encodeURIComponent(m.role_number||'');
  openModal('<div class="member-dashboard"><div class="modal-kicker">MEMBER DASHBOARD</div><div class="member-dashboard-head"><div><h2 class="modal-title">Welcome, '+esc(m.name)+'</h2><p class="modal-sub">Your membership has been approved.</p></div><button class="mini-btn" id="memberLogout">Logout</button></div><div id="yycDigitalCard" class="yyc-digital-card"><div class="id-head"><img src="assets/yyc-logo-clean.webp" alt="YYC"><div><small>YUVAKESARI YOUTH CLUB</small><b>SUBRAHMANYA · KARNATAKA</b></div><span>MEMBER</span></div><div class="id-body"><div class="id-photo"><img src="'+esc(m.photo_url||'assets/yyc-logo-clean.webp')+'" alt="'+esc(m.name)+'" style="transform:scale('+(m.photo_scale||1)+');object-position:'+(m.photo_pos_x==null?50:m.photo_pos_x)+'% '+(m.photo_pos_y==null?50:m.photo_pos_y)+'%"></div><div class="id-details"><div class="id-name">'+esc(m.name)+'</div><div class="id-role">'+esc(m.role_number||'YYC MEMBER')+'</div><div class="id-grid"><span>DOB<strong>'+esc(m.dob||'-')+'</strong></span><span>PHONE<strong>'+esc(m.phone||'-')+'</strong></span><span>EMAIL<strong>'+esc(m.email||'-')+'</strong></span><span>CLUB<strong>'+esc(m.club_name||'Yuvakesari Youth Club')+'</strong></span></div></div><div class="id-qr" id="memberQr"></div></div><div class="id-footer"><span>ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩</span><small>Scan QR to verify membership</small></div></div><div class="form-actions"><button class="btn gold" id="downloadCard">DOWNLOAD ID CARD</button><button class="btn outline" id="memberSubmitUpdate">SUBMIT UPDATE</button><button class="btn outline" id="memberSubmitGallery">SUBMIT PHOTO</button></div><p class="verify-link">'+esc(verifyUrl)+'</p></div>');
  if(window.QRCode && m.role_number) new QRCode($('#memberQr'),{text:verifyUrl,width:86,height:86,colorDark:'#0b0d10',colorLight:'#f5f1e7'});
  $('#memberLogout').addEventListener('click',async function(){try{await rpc('member_logout',{p_token:memberToken});}catch(e){} localStorage.removeItem(MEMBER_TOKEN_KEY);memberToken='';closeModal();toast('Logged out');});
  $('#downloadCard').addEventListener('click',async function(){if(!window.html2canvas){window.print();return;}var canvas=await html2canvas($('#yycDigitalCard'),{backgroundColor:'#0b0d10',scale:2,useCORS:true});var a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=(m.role_number||'yyc-member-card')+'.png';a.click();});
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
  var obj={photo:''};
  openModal('<div class="modal-kicker">MEMBER SUBMISSION</div><h2 class="modal-title">Submit Gallery Photo</h2><p class="modal-sub">Admin approval is required before publishing.</p><form id="submitGalleryForm"><div class="field"><label>Caption</label><input id="sgTitle" required></div><div class="field" style="margin-top:12px"><label>Photo</label><input id="sgFile" type="file" accept="image/*" required></div><div class="crop-preview yyc-simple-preview"><img id="sgPrev" src="assets/yyc-logo-clean.webp" alt="preview"></div><div class="form-actions"><button class="btn gold">SEND FOR APPROVAL</button></div></form>');
  $('#sgFile').addEventListener('change',async function(){obj.photo=await readFile(this.files[0],760);if(obj.photo)$('#sgPrev').src=obj.photo;});
  $('#submitGalleryForm').addEventListener('submit',async function(e){e.preventDefault();if(!obj.photo){toast('Choose a photo');return;}try{var r=await rpc('member_submit_gallery',{p_token:memberToken,p_payload:{title:$('#sgTitle').value.trim(),src:obj.photo}});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Gallery item sent to admin');}catch(err){toast(err.message);}});
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
    tab=tab||'overview';
    var tabs=[['overview','Overview'],['members','Members'],['leaders','Leaders'],['updates','Updates'],['gallery','Gallery'],['approvals','Approvals'],['storage','Data Storage'],['settings','Settings']];
    var nav=tabs.map(function(t){return '<button class="admin-tab '+(t[0]===tab?'active':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';}).join('');
    var pending=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';}).length+(d.pending_updates||[]).length+(d.pending_gallery||[]).length;
    openModal('<div class="admin-shell"><div class="admin-header"><div><div class="modal-kicker">YUVAKESARI YOUTH CLUB</div><h2 class="modal-title">Admin Control Center</h2></div><button class="mini-btn" id="adminLogout">Logout</button></div><div class="admin-tabs">'+nav+'</div><div class="admin-workspace" id="adminWorkspace"></div></div>');
    $('#adminLogout').addEventListener('click',async function(){try{await rpc('admin_logout',{p_token:adminToken});}catch(e){}sessionStorage.removeItem(ADMIN_TOKEN_KEY);adminToken='';closeModal();toast('Admin logged out');});
    $$('.admin-tab').forEach(function(b){b.addEventListener('click',function(){adminPanel(this.getAttribute('data-tab'));});});
    renderAdminTab(tab,d);
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
    a.innerHTML='<div class="admin-top"><h2>Members</h2><button class="mini-btn gold" id="adminAddMember">+ Add member</button></div>'+ (members.length?'<div class="admin-card-list">'+members.map(function(m){return '<div class="approval-card"><div class="meta"><strong>'+esc(m.name)+'</strong><small>'+esc(m.role_number||'PENDING')+' · '+esc(m.email||'')+'</small><small>Status: '+esc(m.status||'pending')+'</small></div><div class="admin-actions"><button class="mini-btn" data-view="'+m.id+'">Card</button>'+((m.status||'pending')==='pending'?'<button class="mini-btn gold" data-approve="'+m.id+'">Approve</button><button class="mini-btn" data-deny="'+m.id+'">Deny</button>':'')+'<button class="mini-btn" data-remove="'+m.id+'">Remove</button></div></div>';}).join('')+'</div>':'<div class="empty">No members yet.</div>');
    $('#adminAddMember').addEventListener('click',function(){adminMemberForm(null);});
    $$('[data-view]').forEach(function(b){b.addEventListener('click',function(){var m=members.find(function(x){return x.id===b.getAttribute('data-view');}); if(m) memberDashboard(m);});});
    $$('[data-approve]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-approve'),p_action:'approve'},'Member approved');});});
    $$('[data-deny]').forEach(function(b){b.addEventListener('click',async function(){await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-deny'),p_action:'deny'},'Member denied');});});
    $$('[data-remove]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Remove this member?')) await adminAction('admin_member_action',{p_member_id:b.getAttribute('data-remove'),p_action:'remove'},'Member removed');});});
    return;
  }
  if(tab==='leaders'){
    var ls=d.leaders||[];
    a.innerHTML='<div class="admin-top"><h2>Leaders</h2><button class="mini-btn gold" id="addLeaderBtn">+ Add leader</button></div>'+ (ls.length?'<div class="admin-card-list">'+ls.map(function(l){return '<div class="approval-card"><div class="meta"><strong>'+esc(l.name)+'</strong><small>'+esc(l.role)+'</small><small>'+esc(l.line||'')+'</small></div><div class="admin-actions"><button class="mini-btn" data-edit-leader="'+l.id+'">Edit</button><button class="mini-btn" data-del-leader="'+l.id+'">Delete</button></div></div>';}).join('')+'</div>':'<div class="empty">No leaders yet.</div>');
    $('#addLeaderBtn').addEventListener('click',function(){adminLeaderForm(null);});
    $$('[data-edit-leader]').forEach(function(b){b.addEventListener('click',function(){adminLeaderForm(b.getAttribute('data-edit-leader'));});});
    $$('[data-del-leader]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete this leader?')) await adminAction('admin_delete_leader',{p_id:b.getAttribute('data-del-leader')},'Leader deleted');});});
    return;
  }
  if(tab==='updates'){
    var ups=d.updates||[];
    a.innerHTML='<div class="admin-top"><h2>Updates</h2><button class="mini-btn gold" id="addUpdateBtn">+ Add update</button></div><div class="admin-card-list">'+(ups.length?ups.map(function(u){return '<div class="approval-card"><div class="meta"><strong>'+esc(u.title)+'</strong><small>'+esc(fmtDate(u.event_date||u.published_at))+' · '+esc(u.body||'')+'</small><small>Status: '+esc(u.status||'published')+'</small></div><div class="admin-actions"><button class="mini-btn" data-del-update="'+u.id+'">Delete</button></div></div>';}).join(''):'<div class="empty">No updates.</div>')+'</div>';
    $('#addUpdateBtn').addEventListener('click',function(){adminUpdateForm(null);});
    $$('[data-del-update]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete update?')) await adminAction('admin_delete_content',{p_kind:'update',p_id:b.getAttribute('data-del-update')},'Update deleted');});});
    return;
  }
  if(tab==='gallery'){
    var gs=d.gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Gallery</h2><button class="mini-btn gold" id="addGalleryBtn">+ Add photo</button></div><div class="admin-grid-2">'+(gs.length?gs.map(function(g){return '<figure class="gallery-card admin-gallery-card"><img src="'+esc(g.src||g.image_url)+'" alt="'+esc(g.title)+'"><figcaption>'+esc(g.title)+' <button class="mini-btn" data-del-gallery="'+g.id+'">Delete</button></figcaption></figure>';}).join(''):'<div class="empty">No gallery.</div>')+'</div>';
    $('#addGalleryBtn').addEventListener('click',function(){adminGalleryForm(null);});
    $$('[data-del-gallery]').forEach(function(b){b.addEventListener('click',async function(){if(confirm('Delete photo?')) await adminAction('admin_delete_content',{p_kind:'gallery',p_id:b.getAttribute('data-del-gallery')},'Gallery photo deleted');});});
    return;
  }
  if(tab==='approvals'){
    var pendingMembers=(d.members||[]).filter(function(m){return (m.status||'pending')==='pending';});
    var pUpdates=d.pending_updates||[], pGallery=d.pending_gallery||[];
    a.innerHTML='<div class="admin-top"><h2>Approval Queue</h2><span class="approval-count">'+(pendingMembers.length+pUpdates.length+pGallery.length)+' pending</span></div>'+(
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
      a.innerHTML='<div class="storage-top"><div><div class="modal-kicker">LIVE DATABASE</div><h2 class="modal-title">Data Storage</h2><p class="modal-sub">Live counts and records from the YYC Supabase database.</p></div><div class="storage-meta"><span>Updated</span><b>'+esc(new Date(s.generated_at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}))+'</b><button class="mini-btn gold" id="storageRefresh">↻ Refresh</button></div></div>'+
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
    a.innerHTML='<div class="admin-top"><h2>Site Settings</h2></div><form id="settingsForm"><div class="form-grid"><div class="field"><label>Club name</label><input id="setClub" value="'+esc(s.club_name||'YUVAKESARI YOUTH CLUB')+'"></div><div class="field"><label>Location</label><input id="setLoc" value="'+esc(s.location||'SUBRAHMANYA · KARNATAKA')+'"></div><div class="field full"><label>Slogan</label><input id="setSlogan" value="'+esc(s.slogan||'ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩')+'"></div><div class="field"><label>Instagram</label><input id="setInsta" value="'+esc(s.instagram||'')+'"></div><div class="field"><label>WhatsApp</label><input id="setWhats" value="'+esc(s.whatsapp||'')+'"></div><div class="field"><label>X</label><input id="setX" value="'+esc(s.x_url||'')+'"></div><div class="field"><label>Facebook</label><input id="setFb" value="'+esc(s.facebook||'')+'"></div></div><div class="form-actions"><button class="btn gold">SAVE SETTINGS</button></div></form>';
    $('#settingsForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_save_settings',{p_token:adminToken,p_payload:{club_name:$('#setClub').value.trim(),location:$('#setLoc').value.trim(),slogan:$('#setSlogan').value.trim(),instagram:$('#setInsta').value.trim(),whatsapp:$('#setWhats').value.trim(),x_url:$('#setX').value.trim(),facebook:$('#setFb').value.trim()}});if(!r.ok)throw new Error(r.error||'Failed');toast('Settings saved');loadPublic();adminPanel('settings');}catch(err){toast(err.message);}});
  }
}
async function adminAction(name,args,msg){
  try{var r=await rpc(name,Object.assign({p_token:adminToken},args));if(r && r.ok===false)throw new Error(r.error||'Action failed');toast(msg);var d=await rpc('admin_dashboard',{p_token:adminToken});adminData=d;renderAdminTab('overview',d);adminPanel();}catch(e){toast(e.message);}
}
function adminMemberForm(id){
  var existing=(adminData.members||[]).find(function(m){return m.id===id;}) || {name:'',dob:'',phone:'',email:'',club_name:'Yuvakesari Youth Club',photo_url:'',photo_scale:1,photo_pos_x:50,photo_pos_y:50};
  var obj={photo:existing.photo_url||'',scale:existing.photo_scale||1,x:existing.photo_pos_x==null?50:existing.photo_pos_x,y:existing.photo_pos_y==null?50:existing.photo_pos_y};
  openModal('<div class="modal-kicker">ADMIN · MEMBER</div><h2 class="modal-title">'+(id?'Edit':'Add')+' Member</h2><form id="adminMemberForm"><div class="form-grid"><div class="field"><label>Full name</label><input id="amName" value="'+esc(existing.name)+'" required></div><div class="field"><label>Date of birth</label><input id="amDob" type="date" value="'+esc(existing.dob||'')+'" required></div><div class="field"><label>Phone</label><input id="amPhone" value="'+esc(existing.phone||'')+'"></div><div class="field"><label>Email</label><input id="amEmail" type="email" value="'+esc(existing.email||'')+'"></div><div class="field"><label>Password '+(id?'(leave blank to keep)':'')+'</label><input id="amPass" type="password" minlength="8" '+(id?'':'required')+'></div><div class="field full"><label>Photo '+(id?'(leave empty to keep)':'')+'</label><input id="amFile" type="file" accept="image/*"></div></div>'+imageEditor('adminM',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SAVE MEMBER</button></div></form>');
  wireEditor('adminM',obj,'amFile');
  $('#adminMemberForm').addEventListener('submit',async function(e){e.preventDefault();try{if(!id && !obj.photo)throw new Error('Photo is required');var payload={name:$('#amName').value.trim(),dob:$('#amDob').value,phone:$('#amPhone').value.trim(),email:$('#amEmail').value.trim(),club_name:'Yuvakesari Youth Club',photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y,password:$('#amPass').value};var r=await rpc('admin_member_upsert',{p_token:adminToken,p_id:id,p_payload:payload});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Member saved');adminPanel('members');}catch(err){toast(err.message);}});
}
function adminLeaderForm(id){
  var existing=(adminData.leaders||[]).find(function(l){return l.id===id;}) || {name:'',role:'',line:'YUVAKESARI YOUTH CLUB · SUBRAHMANYA',photo_url:'',photo_scale:1,photo_pos_x:50,photo_pos_y:50,sort_order:0};
  var obj={photo:existing.photo_url||'',scale:existing.photo_scale||1,x:existing.photo_pos_x==null?50:existing.photo_pos_x,y:existing.photo_pos_y==null?50:existing.photo_pos_y};
  openModal('<div class="modal-kicker">ADMIN · LEADERS</div><h2 class="modal-title">'+(id?'Edit':'Add')+' Leader</h2><form id="adminLeaderForm"><div class="form-grid"><div class="field"><label>Name</label><input id="alName" value="'+esc(existing.name)+'" required></div><div class="field"><label>Role</label><input id="alRole" value="'+esc(existing.role||'')+'" required></div><div class="field full"><label>Line</label><input id="alLine" value="'+esc(existing.line||'')+'"></div><div class="field full"><label>Photo</label><input id="alFile" type="file" accept="image/*"></div></div>'+imageEditor('adminL',obj.photo,obj.scale,obj.x,obj.y)+'<div class="form-actions"><button class="btn gold">SAVE LEADER</button></div></form>');
  wireEditor('adminL',obj,'alFile');
  $('#adminLeaderForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc('admin_upsert_leader',{p_token:adminToken,p_id:id,p_payload:{name:$('#alName').value.trim(),role:$('#alRole').value.trim(),line:$('#alLine').value.trim(),photo_data:obj.photo,photo_scale:obj.scale,photo_pos_x:obj.x,photo_pos_y:obj.y,sort_order:existing.sort_order||0}});if(!r.ok)throw new Error(r.error||'Failed');closeModal();toast('Leader saved');adminPanel('leaders');}catch(err){toast(err.message);}});
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
  try{var r=await rpc('public_member_verify',{p_role_number:role});if(!r.ok)throw new Error(r.error||'Member not found');
    var m=r.member||{};
    openModal('<div class="modal-kicker">MEMBERSHIP VERIFICATION</div><h2 class="modal-title">Verified YYC Member</h2><div class="verify-card"><div class="id-photo"><img src="'+esc(m.photo_url||'assets/yyc-logo-clean.webp')+'" alt="'+esc(m.name)+'"></div><div><h3>'+esc(m.name)+'</h3><p>'+esc(m.role_number)+'</p><small>'+esc(m.club_name||'Yuvakesari Youth Club')+'</small></div></div><div class="notice">This membership record is marked approved in the YYC database.</div>');
  }catch(e){openModal('<div class="modal-kicker">MEMBERSHIP VERIFICATION</div><h2 class="modal-title">Not Verified</h2><p class="modal-sub">'+esc(e.message)+'</p>');}
}
function bindUI(){
  if($('#memberLoginBtn')) $('#memberLoginBtn').addEventListener('click',memberLogin);
  if($('#memberLoginMobile')) $('#memberLoginMobile').addEventListener('click',function(){if(typeof closeMobile==='function')closeMobile();memberLogin();});
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
window.YYC={memberLogin:memberLogin,memberRegister:memberRegister,adminLogin:adminLogin,adminPanel:adminPanel};
document.addEventListener('DOMContentLoaded',function(){
  bindUI();
  loadPublic();
  verifyFromUrl();
  if($('#year')) $('#year').textContent=new Date().getFullYear();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});
});
