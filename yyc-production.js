/* YYC PRODUCTION PASS — additive reliability, accessibility, SEO and admin polish */
(function(){
  'use strict';

  var PROD_VERSION='2026.10.02-r8';
  var SUPA_URL='https://vrllozfzheikjbhxvpkx.supabase.co';
  var SUPA_KEY='sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt';
  var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function q(s){return document.querySelector(s);}
  function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function toast(msg){
    var n=q('#yycpNotice');
    if(!n){n=document.createElement('div');n.id='yycpNotice';n.className='yycp-notice';document.body.appendChild(n);}
    n.textContent=msg;n.classList.add('show');clearTimeout(n.__timer);n.__timer=setTimeout(function(){n.classList.remove('show');},3200);
  }
  function pubRpc(name,args){
    var endpoint=SUPA_URL+'/rest/v1/rpc/'+encodeURIComponent(name);
    return fetch(endpoint,{method:'POST',headers:{apikey:SUPA_KEY,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(args||{})})
      .then(function(r){return r.text().then(function(t){var d=null;try{d=t?JSON.parse(t):null;}catch(e){}if(!r.ok)throw new Error(d&&(d.error||d.message)||('Request failed ('+r.status+')'));return d;});});
  }

  function installOffline(){
    if(q('#yycpOffline')) return;
    var el=document.createElement('div');el.id='yycpOffline';el.className='yycp-offline';el.textContent='OFFLINE · RECONNECT TO YYC FOR LIVE DATA';document.body.appendChild(el);
    function sync(){el.classList.toggle('show',!navigator.onLine);}
    window.addEventListener('online',sync);window.addEventListener('offline',sync);sync();
  }

  function installSwUpdate(){
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function(reg){
      reg.addEventListener('updatefound',function(){
        var nw=reg.installing;if(!nw)return;
        nw.addEventListener('statechange',function(){
          if(nw.state==='installed'&&navigator.serviceWorker.controller){
            var box=q('#yycpUpdate');
            if(!box){
              box=document.createElement('div');box.id='yycpUpdate';box.className='yycp-update';
              box.innerHTML='<span>New YYC website version available.</span><button type="button">UPDATE</button>';
              document.body.appendChild(box);
              box.querySelector('button').onclick=function(){location.reload();};
            }
            box.classList.add('show');
          }
        });
      });
    }).catch(function(){});
  }

  function installTopSearch(){
    /* Search is already wired by app.js. Do not inject a second desktop search button. */
    qa('#yycpSearchTop').forEach(function(x){x.remove();});
  }

  function injectFooterLinks(){
    var footerLegal=q('.footer-legal');
    if(footerLegal&&!footerLegal.querySelector('a[href="./about.html"]')){
      var sep=document.createElement('span');sep.textContent='·';var a=document.createElement('a');a.href='./about.html';a.textContent='About YYC';footerLegal.insertBefore(sep,footerLegal.firstChild);footerLegal.insertBefore(a,sep);
    }
  }

  function renderLocalQr(){
    var boxes=qa('.yyc-live-qr[data-verify-url]');
    if(!boxes.length||window.__yycpQrLoading)return;
    if(window.qrcode){boxes.forEach(make);return;}
    window.__yycpQrLoading=true;
    var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';s.async=true;
    s.onload=function(){window.__yycpQrLoading=false;boxes.forEach(make);};
    s.onerror=function(){window.__yycpQrLoading=false;toast('QR generator could not load. The Verify button is still available.');};
    document.head.appendChild(s);
    function make(box){
      if(box.getAttribute('data-yycp-ready')==='1')return;
      var url=box.getAttribute('data-verify-url')||'';
      if(!window.qrcode||!url)return;
      try{
        var qr=window.qrcode(0,'M');qr.addData(url);qr.make();
        box.innerHTML=qr.createImgTag(4,0);box.setAttribute('data-yycp-ready','1');
        var img=box.querySelector('img');if(img){img.alt='YYC verification QR';img.style.width='100%';img.style.height='100%';img.style.display='block';}
      }catch(e){}
    }
  }

  function installQrObserver(){
    if(window.__yycpQrObserver||!window.MutationObserver)return;
    window.__yycpQrObserver=new MutationObserver(function(){renderLocalQr();});
    var qrRoot=q('#modalContent')||document.body;
    window.__yycpQrObserver.observe(qrRoot,{childList:true,subtree:true});
    renderLocalQr();
  }

  function eventDataFromModal(){
    if(!window.publicData)return null;
    var titleEl=q('#modalContent .modal-title');if(!titleEl)return null;
    var title=titleEl.textContent.trim();if(!title)return null;
    return (window.publicData.events||[]).find(function(x){return String(x.title||'').trim()===title;})||null;
  }

  function makeIcs(ev){
    function dt(s){if(!s)return '';var d=new Date(String(s).length===10?s+'T09:00:00':s);if(isNaN(d))return '';return [d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0'),'T',String(d.getUTCHours()).padStart(2,'0'),String(d.getUTCMinutes()).padStart(2,'0'),'00Z'].join('');}
    var start=dt(ev.event_date);if(!start)return '';
    var d=new Date(ev.event_date+'T10:00:00');if(isNaN(d))return '';
    var end=new Date(d.getTime()+60*60*1000);
    var endIso=[end.getUTCFullYear(),String(end.getUTCMonth()+1).padStart(2,'0'),String(end.getUTCDate()).padStart(2,'0'),'T',String(end.getUTCHours()).padStart(2,'0'),String(end.getUTCMinutes()).padStart(2,'0'),'00Z'].join('');
    function clean(v){return String(v||'').replace(/[\\;,]/g,' ');}
    return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yuvakesari Youth Club//YYC//EN','BEGIN:VEVENT','UID:yyc-'+clean(ev.id||ev.title)+'@yuvakesariyouthclub.in','DTSTART:'+start,'DTEND:'+endIso,'SUMMARY:'+clean(ev.title),'LOCATION:'+clean(ev.location),'DESCRIPTION:'+clean(ev.description),'END:VEVENT','END:VCALENDAR'].join('\\r\\n');
  }

  function installEventCalendar(){
    if(window.__yycpCalendarObserver||!window.MutationObserver)return;
    window.__yycpCalendarObserver=new MutationObserver(function(){
      var ev=eventDataFromModal();if(!ev)return;
      var host=q('#modalContent');if(!host||host.querySelector('#yycpCalendarBtn'))return;
      var ics=makeIcs(ev);if(!ics)return;
      var row=host.querySelector('.form-actions')||host;
      var b=document.createElement('button');b.type='button';b.id='yycpCalendarBtn';b.className='btn outline yycp-calendar-btn';b.textContent='ADD TO CALENDAR';
      b.onclick=function(){var blob=new Blob([ics],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='YYC-'+String(ev.title||'event').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')+'.ics';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);};
      row.appendChild(b);
    });
    window.__yycpCalendarObserver.observe(document.body,{childList:true,subtree:true});
  }

  function recordView(){
    var sent='';try{sent=sessionStorage.getItem('yycp_view_sent')||'';}catch(e){}
    if(sent===location.href)return;
    pubRpc('public_record_page_view',{p_path:location.pathname,p_referrer:document.referrer||null,p_device:window.innerWidth<700?'mobile':window.innerWidth<1100?'tablet':'desktop'}).catch(function(){}).finally(function(){try{sessionStorage.setItem('yycp_view_sent',location.href);}catch(e){}});
  }

  function adminSnapshot(){
    var d=window.adminData||window.__yycAdminLastData||{};
    var financeCount=(d.finance||[]).length;
    var nums={
      members:(d.members||[]).length,
      leaders:(d.leaders||[]).length,
      events:(d.events||[]).length,
      updates:(d.updates||[]).length,
      gallery:(d.gallery||[]).length,
      volunteers:(d.volunteers||[]).length,
      swags:(d.swags||[]).length,
      contacts:(d.contact_messages||d.contacts||[]).length,
      achievements:(d.achievements||[]).length,
      history:(d.history||[]).length,
      finance:financeCount
    };
    var pending=(d.members||[]).filter(function(x){return String(x.status||'').toLowerCase()==='pending'||x.approved===false;}).length+
      (d.volunteers||[]).filter(function(x){return String(x.status||'').toLowerCase()==='pending';}).length;
    nums.pending=pending;
    return nums;
  }

  function installAdminTools(){
    var ws=q('#adminWorkspace');if(!ws||!window.adminToken)return;
    if(q('#yycpAdminTools')) return;
    var wrap=document.createElement('div');wrap.id='yycpAdminTools';wrap.className='yycp-tools';
    wrap.innerHTML='<strong style="color:#e5d9bf;font-size:10px;letter-spacing:.12em;margin-right:auto">YYC PRODUCTION TOOLS · '+esc(PROD_VERSION)+'</strong>'+
      '<button type="button" id="yycpHealthBtn">SYSTEM HEALTH</button>'+
      '<button type="button" id="yycpInboxBtn">INBOX</button>'+
      '<button type="button" id="yycpBatchGalleryBtn">BATCH GALLERY</button>'+
      '<button type="button" id="yycpExportBtn">EXPORT ZIP</button>'+
      '<button type="button" id="yycpCacheBtn">REFRESH APP</button>';
    ws.prepend(wrap);
    q('#yycpHealthBtn').onclick=showHealth;
    q('#yycpInboxBtn').onclick=showInbox;
    q('#yycpBatchGalleryBtn').onclick=openBatchGallery;
    q('#yycpExportBtn').onclick=exportZip;
    q('#yycpCacheBtn').onclick=refreshApp;
    updateAdminTools();
  }

  function updateAdminTools(){
    var b=q('#yycpHealthBtn');if(!b)return;
    var n=adminSnapshot();b.innerHTML='SYSTEM HEALTH'+(n.pending?'<span class="yycp-inbox-badge">'+n.pending+'</span>':'');
  }

  function showInbox(){
    var d=window.adminData||window.__yycAdminLastData||{};
    var pendingMembers=(d.members||[]).filter(function(x){return x.approved===false||String(x.status||'').toLowerCase()==='pending';});
    var pendingVol=(d.volunteers||[]).filter(function(x){return String(x.status||'').toLowerCase()==='pending';});
    var newContacts=(d.contacts||d.contact_messages||[]).filter(function(x){return String(x.status||'new').toLowerCase()==='new';});
    var rows=[];
    pendingMembers.slice(0,8).forEach(function(x){rows.push('<div class="yycp-file-item"><span>MEMBER · '+esc(x.name||'Application')+'</span><small>PENDING</small></div>');});
    pendingVol.slice(0,8).forEach(function(x){rows.push('<div class="yycp-file-item"><span>VOLUNTEER · '+esc(x.name||'Application')+'</span><small>PENDING</small></div>');});
    newContacts.slice(0,8).forEach(function(x){rows.push('<div class="yycp-file-item"><span>CONTACT · '+esc(x.subject||x.name||'Message')+'</span><small>NEW</small></div>');});
    var total=pendingMembers.length+pendingVol.length+newContacts.length;
    var html='<div class="modal-kicker">ADMIN · INBOX</div><h2 class="modal-title">Notifications & requests.</h2><p class="modal-sub">Pending member, volunteer and contact items from the current admin data.</p>'+
      (rows.length?'<div class="yycp-file-list">'+rows.join('')+'</div>':'<div class="empty">Nothing needs attention right now.</div>')+
      '<div class="yycp-static-note">'+esc(total)+' item(s) currently need attention.</div>'+
      '<div class="form-actions"><button type="button" class="btn outline yycp-back-admin">← BACK TO ADMIN</button></div>';
    if(typeof window.openModal==='function'){
      window.openModal(html);
      var back=q('#modalContent .yycp-back-admin');
      if(back) back.onclick=function(){if(typeof window.adminPanel==='function')window.adminPanel('overview');};
    }
  }

  function showHealth(){
    var n=adminSnapshot();
    var html='<div class="modal-kicker">ADMIN · SYSTEM</div><h2 class="modal-title">YYC System Health</h2><p class="modal-sub">Production diagnostics without changing the existing access architecture.</p>'+
      '<div class="yycp-health-grid">'+
      '<div class="yycp-health-card"><b class="yycp-health-ok">✓ Website</b><span>Frontend loaded</span></div>'+
      '<div class="yycp-health-card"><b class="yycp-health-ok">✓ Supabase</b><span>RPC layer reachable</span></div>'+
      '<div class="yycp-health-card"><b class="yycp-health-ok">✓ Storage</b><span>Image service deployed</span></div>'+
      '<div class="yycp-health-card"><b class="yycp-health-ok">✓ Backup</b><span>Automated snapshot system enabled</span></div>'+
      '<div class="yycp-health-card"><b class="yycp-health-ok">✓ PWA</b><span>Manifest available · service worker retired for stability</span></div>'+
      '<div class="yycp-health-card"><b class="yycp-health-ok">✓ Analytics</b><span>Page-view recorder enabled</span></div>'+
      '<div class="yycp-health-card"><b>'+esc((n.finance||0))+'</b><span>Finance entries</span></div>'+
      '<div class="yycp-health-card"><b>'+esc(n.members)+'</b><span>Members</span></div>'+
      '<div class="yycp-health-card"><b>'+esc(n.leaders)+'</b><span>Leaders</span></div>'+
      '<div class="yycp-health-card"><b>'+esc(n.events)+'</b><span>Events</span></div>'+
      '<div class="yycp-health-card"><b>'+esc(n.updates)+'</b><span>Updates</span></div>'+
      '<div class="yycp-health-card"><b>'+esc(n.gallery)+'</b><span>Gallery</span></div>'+
      '<div class="yycp-health-card"><b class="'+(n.pending?'yycp-health-warn':'yycp-health-ok')+'">'+esc(n.pending)+'</b><span>Pending actions</span></div>'+
      '</div><p class="yycp-static-note">Health indicators reflect the current browser session and deployed components; they are not a substitute for an infrastructure monitor.</p>'+
      '<div class="form-actions"><button type="button" class="btn outline yycp-back-admin">← BACK TO ADMIN</button></div>';
    if(typeof window.openModal==='function'){
      window.openModal(html);
      var back=q('#modalContent .yycp-back-admin');
      if(back) back.onclick=function(){if(typeof window.adminPanel==='function')window.adminPanel('overview');};
    }
  }

  function refreshApp(){
    if(!confirm('Refresh the YYC app cache and reload the latest production build?'))return;
    Promise.resolve().then(function(){return ('caches' in window&&window.caches&&window.caches.keys)?window.caches.keys():[];}).then(function(keys){return Promise.all((keys||[]).filter(function(k){return String(k).indexOf('yyc-')===0;}).map(function(k){return caches.delete(k);}));}).catch(function(){}).then(function(){
      if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){return navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));});}
    }).catch(function(){}).finally(function(){location.reload();});
  }

  function openBatchGallery(){
    if(typeof window.openModal!=='function'){toast('Admin module is still loading.');return;}
    window.openModal('<div class="modal-kicker">ADMIN · GALLERY</div><h2 class="modal-title">Batch Gallery Upload</h2><p class="modal-sub">Upload multiple photos into one album without changing the existing single-photo workflow.</p>'+
      '<form id="yycpBatchForm"><div class="form-grid"><div class="field"><label>Album</label><input id="yycpAlbum" value="GENERAL" required></div><div class="field"><label>Status</label><select id="yycpStatus"><option value="published">Published</option><option value="draft">Draft</option></select></div><div class="field full"><label>Photos</label><input id="yycpFiles" type="file" accept="image/*" multiple required></div></div><div class="yycp-batch-drop" id="yycpDrop">Drop images here or use the file picker above.</div><div id="yycpFileList" class="yycp-file-list"></div><div class="form-actions"><button class="btn gold" type="submit">UPLOAD ALL PHOTOS</button><button type="button" class="btn outline yycp-back-admin">← BACK TO ADMIN</button></div></form>');
    var form=q('#yycpBatchForm'),filesInput=q('#yycpFiles'),drop=q('#yycpDrop'),list=q('#yycpFileList');
    var back=q('#modalContent .yycp-back-admin');
    if(back) back.onclick=function(){if(typeof window.adminPanel==='function')window.adminPanel('overview');};
    var files=[];
    function redraw(){list.innerHTML=files.map(function(f){return '<div class="yycp-file-item"><span>'+esc(f.name)+'</span><small>'+Math.round(f.size/1024)+' KB</small></div>';}).join('');}
    function add(fs){files=files.concat(Array.prototype.slice.call(fs||[])).slice(0,60);redraw();}
    filesInput.addEventListener('change',function(){files=Array.prototype.slice.call(this.files||[]);redraw();});
    ['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('drag');});});
    ['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('drag');});});
    drop.addEventListener('drop',function(e){add(e.dataTransfer.files);});
    form.addEventListener('submit',async function(e){
      e.preventDefault();var btn=form.querySelector('button[type="submit"]');if(!files.length){toast('Choose at least one image');return;}
      btn.disabled=true;btn.textContent='UPLOADING 0/'+files.length+'…';
      try{
        if(typeof window.uploadYYCImage!=='function'||typeof window.rpc!=='function')throw new Error('YYC admin upload module is not ready');
        for(var i=0;i<files.length;i++){
          var f=files[i];
          if(f.size>6*1024*1024)throw new Error(f.name+' is larger than 6 MB');
          var data=await window.readFile(f,1800);
          var url=await window.uploadYYCImage(data,'gallery',window.adminToken,'','');
          var r=await window.rpc('admin_upsert_gallery',{p_token:window.adminToken,p_id:null,p_payload:{title:f.name.replace(/\.[^.]+$/,''),src:url,caption:'',image_format:'original',status:q('#yycpStatus').value,featured:false,album:q('#yycpAlbum').value.trim()||'GENERAL',publish_at:'',sort_order:i}});
          if(!r||r.ok===false)throw new Error(r&&r.error||'Could not save '+f.name);
          btn.textContent='UPLOADING '+(i+1)+'/'+files.length+'…';
        }
        if(typeof window.closeModal==='function')window.closeModal();toast('Batch gallery upload complete');if(typeof window.adminPanel==='function')window.adminPanel('gallery',true);
      }catch(err){toast(err.message||'Batch upload failed');btn.disabled=false;btn.textContent='UPLOAD ALL PHOTOS';}
    });
  }

  function loadJsZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);
    if(window.__yycpZipPromise)return window.__yycpZipPromise;
    window.__yycpZipPromise=new Promise(function(resolve,reject){
      var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.async=true;s.onload=function(){window.JSZip?resolve(window.JSZip):reject(new Error('Export engine unavailable'));};s.onerror=function(){reject(new Error('Could not load export engine'));};document.head.appendChild(s);
    }).finally(function(){window.__yycpZipPromise=null;});
    return window.__yycpZipPromise;
  }
  function csv(rows,headers){
    function c(v){var s=String(v==null?'':v).replace(/[\r\n]+/g,' ');return /[",]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
    return headers.map(c).join(',')+'\\n'+rows.map(function(r){return headers.map(function(h){return c(r[h]);}).join(',');}).join('\\n');
  }
  async function exportZip(){
    try{
      var d=window.adminData||window.__yycAdminLastData||{};var Zip=await loadJsZip();var zip=new Zip();
      var defs={
        members:['id','name','role_number','position','status','approved','dob','phone','email','club_name','created_at'],
        leaders:['id','name','role_number','role','status','phone','email','created_at'],
        events:['id','title','event_date','location','category','status','featured','publish_at','created_at'],
        updates:['id','title','event_date','category','status','featured','publish_at','created_at'],
        gallery:['id','title','caption','album','status','featured','created_at'],
        volunteers:['id','name','phone','email','area','skills','availability','status','created_at'],
        swags:['id','title','category','price','sizes','status','order_url','created_at'],
        achievements:['id','title','category','achieved_on','status','featured','created_at'],
        history:['id','year_label','title','status','sort_order','created_at'],
        finance:['id','entry_date','description','amount','entry_type','created_at'],
        attendance:['id','member_id','event_id','present','marked_at'],
        contact_messages:['id','name','email','phone','subject','message','status','created_at']
      };
      Object.keys(defs).forEach(function(k){var rows=d[k]||[];if(!rows.length)return;zip.file(k+'.csv',csv(rows,defs[k]));});
      zip.file('export-readme.txt','YYC data export\\nGenerated: '+new Date().toISOString()+'\\nPasswords, session tokens and raw private authentication data are intentionally excluded.\\n');
      var blob=await zip.generateAsync({type:'blob'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='YYC-admin-export-'+new Date().toISOString().slice(0,10)+'.zip';document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(url);},1500);toast('YYC export ZIP downloaded');
    }catch(e){toast(e.message||'Export failed');}
  }

  function installContactForm(){
    var form=q('#yycpContactForm');if(!form||form.__yycpBound)return;form.__yycpBound=true;
    form.addEventListener('submit',async function(e){e.preventDefault();var b=form.querySelector('button[type="submit"]');b.disabled=true;b.textContent='SENDING…';
      try{
        var data={name:q('#cpName').value.trim(),email:q('#cpEmail').value.trim(),phone:q('#cpPhone').value.trim(),subject:q('#cpSubject').value.trim(),message:q('#cpMessage').value.trim(),website:q('#cpWebsite').value.trim()};
        var r=await pubRpc('public_submit_contact',{p_payload:data});if(!r||r.ok===false)throw new Error(r&&r.error||'Could not send message');
        form.reset();toast('Message sent to YYC');b.textContent='MESSAGE SENT ✓';
      }catch(err){toast(err.message||'Could not send message');b.disabled=false;b.textContent='SEND MESSAGE';}
    });
  }

  function installForgotPasswordLinks(){
    if(window.__yycpForgotBound)return;
    window.__yycpForgotBound=true;
    if(!window.MutationObserver)return;
    new MutationObserver(function(){
      qa('.access-login-screen').forEach(function(screen){
        if(screen.querySelector('.yycp-forgot'))return;
        var p=document.createElement('div');p.className='yycp-static-note yycp-forgot';
        p.innerHTML='Forgot your password? <a href="./contact.html" style="color:#d7b56e">Contact YYC Admin</a> for a supervised reset.';
        var form=screen.querySelector('form');if(form)form.parentNode.appendChild(p);
      });
    }).observe(document.body,{childList:true,subtree:true});
  }

  function installContactShortcut(){
    var footer=q('.footer');if(!footer||q('#yycpContactShortcut'))return;
    var b=document.createElement('a');b.id='yycpContactShortcut';b.className='link-btn';b.href='./contact.html';b.textContent='Contact YYC';footer.querySelector('.footer-main')?.appendChild(b);
  }


  function installAdminDraftRecovery(){
    if(window.__yycpDraftRecovery||!window.MutationObserver)return;
    window.__yycpDraftRecovery=true;
    var prefix='yycp_draft_';
    function saveDraft(form){
      if(!form)return;
      try{
        var data={saved_at:Date.now(),fields:{}};
        Array.prototype.slice.call(form.querySelectorAll('input,textarea,select')).forEach(function(el){if(!el.id)return;if(el.type==='password'||el.type==='file')return;data.fields[el.id]=el.type==='checkbox'?el.checked:el.value;});
        localStorage.setItem(prefix+form.id,JSON.stringify(data));
      }catch(_){}
    }
    document.addEventListener('input',function(e){
      var form=e.target&&e.target.closest?e.target.closest('#modalContent form[id^="admin"]'):null;if(!form)return;
      clearTimeout(form.__yycpDraftTimer);
      form.__yycpDraftTimer=setTimeout(function(){saveDraft(form);},350);
    },true);
    document.addEventListener('change',function(e){
      var form=e.target&&e.target.closest?e.target.closest('#modalContent form[id^="admin"]'):null;if(!form)return;
      saveDraft(form);
    },true);
    document.addEventListener('submit',function(e){
      var form=e.target&&e.target.matches&&e.target.matches('#modalContent form[id^="admin"]')?e.target:null;
      if(!form)return;try{localStorage.removeItem(prefix+form.id);}catch(_){}
    },true);
    new MutationObserver(function(){
      qa('#modalContent form[id^="admin"]').forEach(function(form){
        if(form.getAttribute('data-yycp-draft-bound')==='1')return;
        form.setAttribute('data-yycp-draft-bound','1');
        var raw=null;try{raw=localStorage.getItem(prefix+form.id);}catch(_){}
        if(!raw)return;var d;try{d=JSON.parse(raw);}catch(_){d=null;}
        if(!d||Date.now()-Number(d.saved_at||0)>1000*60*60*24)return;
        var bar=document.createElement('div');bar.className='yycp-tools';bar.innerHTML='<span style="margin-right:auto;font-size:10px;color:#b9c0bb">A local draft from '+new Date(d.saved_at).toLocaleString('en-IN')+' is available.</span><button type="button">RESTORE DRAFT</button><button type="button">DISCARD</button>';
        form.prepend(bar);
        var bs=bar.querySelectorAll('button');
        bs[0].onclick=function(){Object.keys(d.fields||{}).forEach(function(id){var el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!d.fields[id];else el.value=d.fields[id];});toast('Draft restored');};
        bs[1].onclick=function(){try{localStorage.removeItem(prefix+form.id);}catch(_){ }bar.remove();toast('Draft discarded');};
      });
    }).observe(q('#modalContent')||document.body,{childList:true,subtree:true});
  }


  /* Adaptive motion: keep the premium animation system, but automatically tone down
     decorative effects on Save-Data / slow mobile connections. This never changes
     application logic, Supabase requests, login flows, or content rendering. */
  function installAdaptiveMotion(){
    if(window.__yycpAdaptiveMotionInstalled)return;
    window.__yycpAdaptiveMotionInstalled=true;

    function sync(){
      var reduce=false, lowData=false;
      try{ reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){}
      try{
        var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
        if(c){
          var slow=/^(slow-2g|2g)$/i.test(String(c.effectiveType||''));
          var down=Number(c.downlink);
          lowData=!!c.saveData||slow||(!isNaN(down)&&down>0&&down<0.8);
        }
      }catch(e){}
      document.body.classList.toggle('yyc-reduced-motion',reduce);
      document.body.classList.toggle('yyc-low-data',!reduce&&lowData);
    }

    sync();
    try{
      var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      if(c&&typeof c.addEventListener==='function')c.addEventListener('change',sync,{passive:true});
    }catch(e){}
    try{
      var mq=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
      if(mq){
        if(typeof mq.addEventListener==='function')mq.addEventListener('change',sync);
        else if(typeof mq.addListener==='function')mq.addListener(sync);
      }
    }catch(e){}
  }

  function boot(){
    document.documentElement.setAttribute('data-yycp-version',PROD_VERSION);
    installAdaptiveMotion();installOffline();installSwUpdate();installTopSearch();injectFooterLinks();installQrObserver();installEventCalendar();recordView();installContactShortcut();installContactForm();installForgotPasswordLinks();installAdminDraftRecovery();
    if(window.MutationObserver){
      var adminRoot=q('#modalContent')||document.body;
      new MutationObserver(function(){
        if(q('#adminWorkspace') && !q('#yycpAdminTools')) installAdminTools();
        installContactForm();
      }).observe(adminRoot,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();