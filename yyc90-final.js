/* YYC 90-FEATURE FINAL EXTENSION
   Safe additive layer. Does not replace existing login, ID-card, member,
   leader, admin, event, update, gallery, or session code. */
(function(){
  'use strict';

  function $(s){return document.querySelector(s);}
  function $$(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function rpc(name,args){
    if(typeof window.rpc!=='function') return Promise.reject(new Error('YYC connection is not ready'));
    return window.rpc(name,args||{});
  }
  function say(msg){
    if(typeof window.toast==='function') window.toast(msg);
  }
  function fmt(v){
    if(!v) return '—';
    var d=new Date(String(v).length===10 ? String(v)+'T00:00:00' : v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  }
  function past(v){
    if(!v) return false;
    var d=new Date(String(v).length===10 ? String(v)+'T23:59:59' : v);
    return !isNaN(d.getTime()) && d.getTime()<Date.now();
  }
  function download(name,text,type){
    var blob=new Blob([text],{type:type||'application/json;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},900);
  }

  var culture={
    'KAMBALA':['Kambala','A traditional coastal Karnataka buffalo-race celebration connected with community life and seasonal heritage.'],
    'DHARMA DAIVA':['Dharma Daiva','A glimpse of Tulunadu traditions of faith, protection, ritual and community memory.'],
    'AATI KALENJA':['Aati Kalenja','A seasonal folk tradition of Tulunadu remembered through performance, costume and community practice.'],
    'YAKSHAGANA':['Yakshagana','A coastal performance tradition combining storytelling, music, dance, costume and dramatic expression.'],
    'TULUNAD FOOD CULTURE':['Tulunad Food Culture','Cuisine connected with local ingredients, seasons, family traditions and the cultural identity of Tulunadu.']
  };

  function cultureDetails(){
    $$('#glimpse .glimpse-feature,#glimpse .glimpse-card').forEach(function(card){
      if(card.getAttribute('data-yyc90-culture')==='1') return;
      card.setAttribute('data-yyc90-culture','1');
      card.style.cursor='pointer';
      card.addEventListener('click',function(){
        var b=card.querySelector('figcaption b');
        var key=b ? b.textContent.trim().toUpperCase() : 'TULUNADU';
        var c=culture[key] || ['Tulunadu','A part of the cultural landscape and living heritage of coastal Karnataka.'];
        if(typeof window.openModal!=='function') return;
        window.openModal(
          '<div class="modal-kicker">TULUNADU GLIMPSE</div>'+
          '<h2 class="modal-title">'+esc(c[0])+'</h2>'+
          '<p class="modal-sub">Culture · Tradition · Identity</p>'+
          '<div class="yyc90-culture-copy">'+esc(c[1])+'</div>'
        );
      });
    });
  }

  function maintenance(){
    var s=(window.publicData&&window.publicData.settings)||{};
    var old=$('#yyc90Maintenance');
    if(!s.maintenance_mode){
      if(old) old.remove();
      return;
    }
    if(old) return;
    var el=document.createElement('div');
    el.id='yyc90Maintenance';
    el.className='yyc90-maintenance';
    el.innerHTML='<div class="yyc90-maintenance-card"><span class="section-kicker">YUVAKESARI YOUTH CLUB</span><h2>We are making a few updates.</h2><p>The public website is temporarily in maintenance mode. Please check again soon.</p><button type="button" class="btn gold" id="yyc90MaintenanceRefresh">REFRESH</button></div>';
    document.body.appendChild(el);
    var r=$('#yyc90MaintenanceRefresh');
    if(r) r.onclick=function(){location.reload();};
  }

  function dynamicMeta(){
    var box=$('#modalContent');
    if(!box || box.getAttribute('data-yyc90-meta')==='1') return;
    box.setAttribute('data-yyc90-meta','1');
    var observer=new MutationObserver(function(){
      var title=box.querySelector('.yyc-detail-modal .modal-title,.yyc-lightbox .modal-title');
      if(title && title.textContent.trim()){
        document.title=title.textContent.trim()+' · Yuvakesari Youth Club';
      }else{
        var s=(window.publicData&&window.publicData.settings)||{};
        if(s.meta_title) document.title=s.meta_title;
      }
    });
    observer.observe(box,{childList:true,subtree:true,characterData:true});
  }

  function undoBar(){
    if($('#yyc90UndoBar')) return;
    var x=document.createElement('div');
    x.id='yyc90UndoBar';
    x.className='yyc90-undo-bar';
    x.innerHTML='<span>Item deleted.</span><button type="button">UNDO</button>';
    document.body.appendChild(x);
  }
  var lastUndo=null;
  function showUndo(label,restore){
    undoBar();
    lastUndo={restore:restore,until:Date.now()+12000};
    var bar=$('#yyc90UndoBar');
    if(!bar) return;
    bar.querySelector('span').textContent=label;
    bar.classList.add('show');
    clearTimeout(bar.__yyc90UndoTimer);
    bar.__yyc90UndoTimer=setTimeout(function(){
      bar.classList.remove('show');
      lastUndo=null;
    },12000);
    bar.querySelector('button').onclick=function(){
      if(!lastUndo || Date.now()>lastUndo.until) return;
      var btn=this;
      btn.disabled=true;
      lastUndo.restore().then(function(){
        say('Item restored');
        bar.classList.remove('show');
        if(typeof window.adminPanel==='function') window.adminPanel('overview',true);
      }).catch(function(e){
        say(e.message||'Could not restore item');
      }).finally(function(){
        btn.disabled=false;
        lastUndo=null;
      });
    };
  }

  function deletionRecovery(){
    if(window.__yyc90DeletionRecovery) return;
    window.__yyc90DeletionRecovery=true;
    document.addEventListener('click',function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(!b || !$('#modal') || !$('#modal').classList.contains('open')) return;
      var d=window.__yycAdminLastData||window.adminData||{};
      var id='',item=null,kind='',deleteCall=null,restoreCall=null;

      if(b.hasAttribute('data-del-event')){
        id=b.getAttribute('data-del-event');
        item=(d.events||[]).find(function(x){return String(x.id)===String(id);});
        kind='Event';
        if(item){
          deleteCall=function(){return rpc('admin_delete_event',{p_token:window.adminToken,p_id:id});};
          restoreCall=function(){return rpc('admin_upsert_event',{p_token:window.adminToken,p_id:null,p_payload:{
            title:item.title,description:item.description,event_date:item.event_date,location:item.location,image_url:item.image_url,
            image_format:item.image_format,status:item.status,featured:item.featured,category:item.category,publish_at:item.publish_at,
            slug:item.slug,sort_order:item.sort_order
          }});};
        }
      }else if(b.hasAttribute('data-del-update')){
        id=b.getAttribute('data-del-update');
        item=(d.updates||[]).find(function(x){return String(x.id)===String(id);});
        kind='Update';
        if(item){
          deleteCall=function(){return rpc('admin_delete_content',{p_token:window.adminToken,p_kind:'update',p_id:id});};
          restoreCall=function(){return rpc('admin_upsert_update',{p_token:window.adminToken,p_id:null,p_payload:{
            title:item.title,body:item.body,event_date:item.event_date,image_url:item.image_url,image_format:item.image_format,
            status:item.status,featured:item.featured,category:item.category,publish_at:item.publish_at,slug:item.slug,sort_order:item.sort_order
          }});};
        }
      }else if(b.hasAttribute('data-del-gallery')){
        id=b.getAttribute('data-del-gallery');
        item=(d.gallery||[]).find(function(x){return String(x.id)===String(id);});
        kind='Gallery item';
        if(item){
          deleteCall=function(){return rpc('admin_delete_content',{p_token:window.adminToken,p_kind:'gallery',p_id:id});};
          restoreCall=function(){return rpc('admin_upsert_gallery',{p_token:window.adminToken,p_id:null,p_payload:{
            title:item.title,src:item.src||item.image_url,caption:item.caption,image_format:item.image_format,status:item.status,
            featured:item.featured,album:item.album,publish_at:item.publish_at,slug:item.slug,sort_order:item.sort_order
          }});};
        }
      }else if(b.hasAttribute('data-a90-del')){
        id=b.getAttribute('data-a90-del');
        item=(window.YYC90_FEATURE_DATA||{}).achievements||[];
        item=item.find(function(x){return String(x.id)===String(id);});
        kind='Achievement';
        if(item){
          deleteCall=function(){return rpc('admin_delete_achievement',{p_token:window.adminToken,p_id:id});};
          restoreCall=function(){return rpc('admin_upsert_achievement',{p_token:window.adminToken,p_id:null,p_payload:item});};
        }
      }else if(b.hasAttribute('data-h90-del')){
        id=b.getAttribute('data-h90-del');
        item=(window.YYC90_FEATURE_DATA||{}).history||[];
        item=item.find(function(x){return String(x.id)===String(id);});
        kind='History item';
        if(item){
          deleteCall=function(){return rpc('admin_delete_history',{p_token:window.adminToken,p_id:id});};
          restoreCall=function(){return rpc('admin_upsert_history',{p_token:window.adminToken,p_id:null,p_payload:item});};
        }
      }

      if(!deleteCall || !restoreCall) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(!confirm('Delete this '+kind.toLowerCase()+'?')) return;
      deleteCall().then(function(r){
        if(!r || r.ok===false) throw new Error(r && r.error || 'Delete failed');
        showUndo(kind+' deleted.',function(){
          return restoreCall().then(function(r2){
            if(!r2 || r2.ok===false) throw new Error(r2 && r2.error || 'Restore failed');
          });
        });
        if(typeof window.adminPanel==='function') window.adminPanel('overview',true);
      }).catch(function(err){say(err.message||'Delete failed');});
    },true);
  }

  function bulkIdPack(items,kind){
    items=(items||[]).filter(function(x){return x && x.role_number;});
    if(!items.length) return Promise.reject(new Error('No records with valid Unique IDs found.'));
    var win=window.open('about:blank','_blank');
    if(!win) return Promise.reject(new Error('Please allow pop-ups for the bulk ID print pack.'));
    var pages=[];
    items.forEach(function(item){
      var verify=location.origin+location.pathname+'?verify='+encodeURIComponent(item.role_number);
      var qr='https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data='+encodeURIComponent(verify);
      pages.push(
        '<section class="yyc90-pack-card">'+
          '<div class="yyc90-pack-front">'+
            '<div class="pack-top">YUVAKESARI YOUTH CLUB</div>'+
            '<div class="pack-photo">'+(item.photo_url?'<img src="'+esc(item.photo_url)+'" alt="">':'')+'</div>'+
            '<h2>'+esc(item.name)+'</h2>'+
            '<span>'+esc(item.role||item.position||kind.toUpperCase())+'</span>'+
            '<div class="pack-data"><div>UNIQUE ID<strong>'+esc(item.role_number)+'</strong></div><div>STATUS<strong>APPROVED</strong></div></div>'+
            '<img class="pack-qr" src="'+qr+'" alt="YYC verification QR">'+
          '</div>'+
          '<div class="yyc90-pack-back"><div class="pack-top">OFFICIAL DIGITAL ID</div><h3>Identity backed by the YYC record.</h3><p>Scan the QR code on the front to open the official verification page.</p><div>POSITION · '+esc(item.role||item.position||kind.toUpperCase())+'</div><div>DATE OF BIRTH · '+esc(item.dob||'—')+'</div><div>PHONE · '+esc(item.phone||'—')+'</div><div>EMAIL · '+esc(item.email||'—')+'</div><strong>ಧರ್ಮೋ ರಕ್ಷತಿ ರಕ್ಷಿತಃ 🚩</strong></div>'+
        '</section>'
      );
    });
    var style='<style>@page{size:A4 portrait;margin:12mm}body{margin:0;font-family:Arial,sans-serif;background:white;color:#111}.no-print{font-size:12px;color:#555;margin-bottom:12mm}.yyc90-pack-card{page-break-after:always;display:grid;gap:8mm}.yyc90-pack-front,.yyc90-pack-back{width:180mm;min-height:72mm;max-width:100%;margin:auto;box-sizing:border-box;border:1px solid #888;border-radius:6mm;padding:8mm}.yyc90-pack-front{position:relative;background:#111;color:#f0d294}.pack-top{font-size:10px;font-weight:700;letter-spacing:.16em}.pack-photo{width:31mm;height:38mm;background:#222;margin:7mm 0 4mm;border-radius:3mm;overflow:hidden}.pack-photo img{width:100%;height:100%;object-fit:contain}.yyc90-pack-front h2{margin:0;font-size:23px}.yyc90-pack-front>span{font-size:10px;letter-spacing:.12em}.pack-data{display:flex;gap:18mm;margin-top:7mm}.pack-data div{font-size:8px;color:#999}.pack-data strong{display:block;color:#fff;margin-top:1mm}.pack-qr{position:absolute;width:28mm;height:28mm;right:8mm;bottom:8mm;background:#fff;padding:2mm}.yyc90-pack-back{background:#f6f1e7}.yyc90-pack-back h3{font-size:23px;margin:12mm 0 5mm}.yyc90-pack-back p{font-size:11px;line-height:1.6}.yyc90-pack-back>div{font-size:9px;margin:4mm 0}.yyc90-pack-back>strong{display:block;margin-top:12mm;font-size:12px}</style>';
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>YYC Bulk ID Card Print Pack</title>'+style+'</head><body><div class="no-print">YYC '+esc(kind)+' bulk ID-card print pack · '+items.length+' records</div>'+pages.join('')+'<script>window.onload=function(){setTimeout(function(){window.print()},500)};<\\/script></body></html>');
    win.document.close();
    return Promise.resolve();
  }

  function addBulkButtons(){
    var workspace=$('#adminWorkspace');
    if(!workspace) return;
    var head=workspace.querySelector('.admin-top-actions');
    if(!head) return;
    var isMembers=!!workspace.querySelector('#adminMemberSearch');
    var isLeaders=!!workspace.querySelector('#leaderAdminSearch');
    if(!isMembers && !isLeaders) return;
    if($('#yyc90BulkIds')) return;
    var b=document.createElement('button');
    b.id='yyc90BulkIds';
    b.type='button';
    b.className='mini-btn';
    b.textContent='Bulk ID Print Pack';
    b.onclick=function(){
      var d=window.__yycAdminLastData||window.adminData||{};
      bulkIdPack(isLeaders?(d.leaders||[]):(d.members||[]),isLeaders?'leader':'member').catch(function(e){say(e.message);});
    };
    head.appendChild(b);
  }

  function addMediaAuditButton(){
    var tabs=$('.admin-tabs');
    if(!tabs || $('[data-yyc90-mediaaudit]')) return;
    var b=document.createElement('button');
    b.type='button';
    b.className='admin-tab';
    b.setAttribute('data-yyc90-mediaaudit','1');
    b.textContent='Media Audit';
    tabs.appendChild(b);
  }

  function mediaAudit(){
    var workspace=$('#adminWorkspace');
    if(!workspace) return;
    var d=window.__yycAdminLastData||window.adminData||{};
    var groups=[
      ['Members',d.members||function(){return [];}(),function(x){return x.photo_url;}],
      ['Leaders',d.leaders||function(){return [];}(),function(x){return x.photo_url;}],
      ['Updates',d.updates||function(){return [];}(),function(x){return x.image_url;}],
      ['Events',d.events||function(){return [];}(),function(x){return x.image_url;}],
      ['Gallery',d.gallery||function(){return [];}(),function(x){return x.src||x.image_url;}],
      ['Swags',d.swags||function(){return [];}(),function(x){return x.image_url;}]
    ];
    var total=0,missing=0;
    groups.forEach(function(g){g[1].forEach(function(x){total++;if(!g[2](x))missing++;});});
    workspace.innerHTML='<div class="admin-top"><div><div class="modal-kicker">MEDIA HEALTH</div><h2 class="modal-title">Media Audit</h2><p class="admin-subline">Reference audit only. Content and uploaded media are never deleted automatically.</p></div><div class="admin-top-actions"><button class="mini-btn" id="yyc90MediaBack">← BACK</button></div></div><div class="yyc90-metric-grid"><div><b>'+total+'</b><span>MEDIA REFERENCES</span></div><div><b>'+missing+'</b><span>MISSING MEDIA</span></div><div><b>'+Math.max(0,total-missing)+'</b><span>REFERENCES OK</span></div></div><div class="notice" style="margin-top:14px">Routine cleanup only removes stale analytics, backup snapshots and old audit rows. Existing member cards and content media are not touched.</div>';
    var back=$('#yyc90MediaBack');
    if(back) back.onclick=function(){if(typeof window.adminPanel==='function')window.adminPanel('overview',true);};
  }

  function installMediaClick(){
    document.addEventListener('click',function(e){
      var b=e.target.closest ? e.target.closest('[data-yyc90-mediaaudit]') : null;
      if(!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      mediaAudit();
    },true);
  }

  function backupEnhance(){
    var workspace=$('#adminWorkspace');
    if(!workspace || !$('#yyc90BackupBtn') || $('#yyc90BackupStatus')) return;
    var box=document.createElement('div');
    box.id='yyc90BackupStatus';
    box.className='yyc90-analytics-box';
    box.innerHTML='<div class="storage-loading"><div class="storage-spinner"></div><strong>Checking automated backup…</strong></div>';
    workspace.appendChild(box);
    rpc('admin_backup_status',{p_token:window.adminToken}).then(function(r){
      if(!r || !r.ok) throw new Error(r && r.error || 'Unable to check backup status');
      box.innerHTML='<div class="yyc90-metric-grid"><div><b>'+esc(r.snapshot_count)+'</b><span>SNAPSHOTS</span></div><div><b>'+esc(r.cron_enabled?'ON':'OFF')+'</b><span>DAILY BACKUP</span></div><div><b>'+esc(r.last_snapshot_at ? fmt(r.last_snapshot_at) : 'WAITING')+'</b><span>LAST SNAPSHOT</span></div></div><div class="form-actions"><button type="button" class="mini-btn gold" id="yyc90CleanupBtn">RUN SAFE CLEANUP</button></div>';
      var cl=$('#yyc90CleanupBtn');
      if(cl) cl.onclick=function(){
        cl.disabled=true;
        rpc('admin_cleanup_data',{p_token:window.adminToken}).then(function(x){
          if(!x || !x.ok) throw new Error(x && x.error || 'Cleanup failed');
          say('Safe cleanup completed');
          cl.disabled=false;
          backupEnhance();
        }).catch(function(e){say(e.message);cl.disabled=false;});
      };
    }).catch(function(e){box.innerHTML='<div class="notice">'+esc(e.message)+'</div>';});
  }

  var FEATURES=[
    'Premium branding','Responsive layout','Sticky navigation','Active tab highlight','Smooth scrolling',
    'Hero auto zoom','Scroll reveal','Soft parallax','Reduced motion support','Back-to-top',
    'Keyboard shortcuts','Offline indicator','PWA manifest','Service worker','Skip link',
    'Tulunadu glimpse','Culture cards','Culture detail modal','Public leaders',
    'Updates read-more system','Events read-more system','Gallery read-more system','Swag showcase','Update detail modal',
    'Event detail modal','Gallery lightbox','Share links','Copy links','Deep-link URLs',
    'Public search','Mobile search','Featured badges','NEW badges','Status badges',
    'Upcoming event filter','Past event archive','Gallery album filter','Event countdown','Undo after content deletion',
    'Member registration','Member approval','Member login','Persistent member session','Member profile',
    'Member editing','Photo editor','Password change','Member ID card','QR verification',
    'Leader login','Persistent leader session','Leader profile','Bulk ID-card print pack','Leader ID card',
    'Leader QR verification','Admin leader CRUD','Leader password reset','Admin dashboard','Member search',
    'Leader search','Updates filters','Gallery filters','Event filters','Swag CRUD',
    'Approval queue','Activity log','Site settings','Reports','Data storage',
    'Announcement strip','Quick contact','Volunteer workflow','Profile completion','Duplicate warning',
    'Unsaved changes warning','Admin content preview','Desktop/mobile preview','Image compression','Site Pro settings',
    'Organization JSON-LD','Event structured data','Page-view analytics','Analytics dashboard','Backup download',
    'Automated backups','Finance management','Attendance management','Achievements','YYC history timeline',
    'Media/storage audit'
  ];
  window.YYC90_FEATURES=FEATURES;
  window.YYC90_COMPLETED_COUNT=FEATURES.length;
  window.YYC90_FEATURE_AUDIT={total:90,completed:FEATURES.length,unchangedCore:true};

  function scan(){
    cultureDetails();
    maintenance();
    dynamicMeta();
    deletionRecovery();
    addBulkButtons();
    addMediaAuditButton();
    backupEnhance();
    var workspace=$('#adminWorkspace');
    if(workspace){
      var activeMedia=$('[data-yyc90-mediaactive]');
      if(activeMedia) mediaAudit();
      if($('#yyc90BackupBtn')) backupEnhance();
    }
  }

  installMediaClick();
  var timer=setInterval(scan,1800);
  setTimeout(function(){clearInterval(timer);scan();},18000);
})();
