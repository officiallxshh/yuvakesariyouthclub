
(function(){
  'use strict';
  var BUCKET='yyc-reels';
  var publicLoaded=false;
  var publicLoading=false;
  var publicReels=[];
  var publicEventGroups=[];
  var eventModalOpener=null;
  var adminReels=[];
  var adminBusy=false;
  var adminSelectedGroupKey='';

  function byId(id){return document.getElementById(id);}
  function escapeHTML(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[ch];
    });
  }
  function config(){
    var c=window.YYC_CONFIG||{};
    if(!c.supabaseUrl||!c.supabaseKey)throw new Error('YYC database configuration is unavailable.');
    return c;
  }
  function getAdminToken(){
    try{return String(window.adminToken||localStorage.getItem('yyc_admin_session_v1')||'').trim();}catch(e){return String(window.adminToken||'').trim();}
  }
  function notify(message){
    if(typeof window.toast==='function')window.toast(message);
    else if(window.console&&console.info)console.info('[YYC Reel]',message);
  }
  async function callRPC(name,args){
    var c=config();
    var response=await fetch(c.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+encodeURIComponent(name),{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'apikey':c.supabaseKey,'Content-Type':'application/json','Accept':'application/json','Cache-Control':'no-store'},
      body:JSON.stringify(args||{})
    });
    var raw=await response.text(), data={};
    try{data=raw?JSON.parse(raw):{};}catch(e){data={error:raw};}
    if(!response.ok)throw new Error(data.message||data.error||('Supabase request failed ('+response.status+').'));
    return data;
  }
  async function callUploadService(payload){
    var c=config(), token=getAdminToken();
    if(!token)throw new Error('Admin session is missing. Please log in again.');
    var response;
    try{
      response=await fetch(c.supabaseUrl.replace(/\/$/,'')+'/functions/v1/yyc-reel-upload',{
        method:'POST',credentials:'omit',cache:'no-store',
        headers:{'apikey':c.supabaseKey,'Authorization':'Bearer '+c.supabaseKey,'Content-Type':'application/json'},
        body:JSON.stringify(Object.assign({},payload,{token:token}))
      });
    }catch(fetchError){
      throw new Error('Could not reach the YYC upload service. Check the connection and retry; the upload request did not return a response.');
    }
    var raw=await response.text(), data={};
    try{data=raw?JSON.parse(raw):{};}catch(e){data={error:raw};}
    if(!response.ok||data.ok===false)throw new Error(data.error||('Reel storage request failed ('+response.status+').'));
    return data;
  }
  function inferMime(file,kind){
    if(file&&file.type)return file.type.toLowerCase().split(';')[0].trim();
    var name=String(file&&file.name||'').toLowerCase();
    var ext=(name.match(/\.([a-z0-9]{1,8})$/)||[])[1]||'';
    var known={
      mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime',
      avi:'video/x-msvideo',mkv:'video/x-matroska','3gp':'video/3gpp',
      mpg:'video/mpeg',mpeg:'video/mpeg',ogv:'video/ogg',ts:'video/mp2t',
      flv:'video/x-flv',wmv:'video/x-ms-wmv',jpg:'image/jpeg',jpeg:'image/jpeg',
      png:'image/png',webp:'image/webp'
    };
    if(known[ext])return known[ext];
    return kind==='thumbnail'?'image/jpeg':'video/mp4';
  }
  async function uploadFile(file,kind){
    var mime=inferMime(file,kind);
    if(!file||!file.size)throw new Error('Choose a file to upload.');
    if(kind==='thumbnail'&&!/^image\/(jpeg|png|webp)$/.test(mime))throw new Error('Thumbnail must be JPG, PNG or WebP.');
    if(kind==='video'&&!/^video\//.test(mime))throw new Error('Choose a video file.');
    var signed=await callUploadService({action:'sign-upload',kind:kind,fileName:file.name,contentType:mime,size:file.size});
    var c=config();
    var encodedPath=String(signed.path||'').split('/').map(function(part){return encodeURIComponent(part);}).join('/');
    var uploadUrl=c.supabaseUrl.replace(/\/$/,'')+'/storage/v1/object/upload/sign/'+BUCKET+'/'+encodedPath+'?token='+encodeURIComponent(signed.token);
    var response;
    try{
      response=await fetch(uploadUrl,{
        method:'PUT',cache:'no-store',credentials:'omit',
        headers:{'apikey':c.supabaseKey,'Authorization':'Bearer '+c.supabaseKey,'Content-Type':mime,'x-upsert':'false'},
        body:file
      });
    }catch(fetchError){
      throw new Error('Could not reach file storage. Check your connection and retry; the upload did not return a response.');
    }
    if(!response.ok){
      var errorText='';try{errorText=(await response.text()).slice(0,500);}catch(e){}
      throw new Error('Upload failed ('+response.status+'). '+(errorText||'Please try again.'));
    }
    return {path:signed.path,url:signed.publicUrl};
  }
  async function cleanupPaths(paths){
    paths=(paths||[]).filter(function(p){return typeof p==='string'&&p.indexOf('reels/')===0;}).slice(0,2);
    if(!paths.length)return;
    try{await callUploadService({action:'delete-files',paths:paths});}catch(e){}
  }
  function formatDate(value){
    if(!value)return 'YYC MOMENT';
    try{return new Date(value).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase();}catch(e){return 'YYC MOMENT';}
  }
  function publicState(message,withRetry){
    var grid=byId('yycReelGrid');if(!grid)return;
    grid.innerHTML='<div class="yyc-reel-state">'+(withRetry?'<strong>Could not load Reel right now.</strong>':'<strong>'+escapeHTML(message||'YYC Reels are coming soon.')+'</strong>')+
      (withRetry?'<span>'+escapeHTML(message||'Check your connection and try again.')+'</span><button type="button" id="yycReelRetry">TRY AGAIN ↻</button>':'<span>Official YYC moments will appear here after the admin publishes a reel.</span>')+'</div>';
    var count=byId('yycReelCount');if(count)count.textContent='Reel';
  }
  function attachVideoSource(video){
    if(!video||video.dataset.yycLoaded==='1')return;
    var src=video.getAttribute('data-video-url')||'';
    if(!src)return;
    video.dataset.yycLoaded='1';
    video.preload='metadata';
    video.src=src;
    try{video.load();}catch(e){}
  }
  function startWarmingVideos(root){
    /* Keep video sources detached until explicit play/fullscreen interaction.
       Preloading metadata for several nearby vertical videos can download megabytes
       on mobile before the visitor chooses a Reel. Poster images remain available. */
    if(!root)return;
  }
  function reelCardHTML(r){
    var poster=String(r.thumbnail_url||'');
    var category=String(r.category||'YYC');
    var eventName=String(r.event_name||'').trim();
    var reelNumber=Math.max(1,parseInt(r.reel_number,10)||1);
    var reelTotal=Math.max(reelNumber,parseInt(r.reel_total,10)||1);
    return '<article class="yyc-reel-card" data-reel-card="'+escapeHTML(r.id)+'">'+
      '<div class="yyc-reel-player">'+
        '<video class="yyc-reel-video" data-video-url="'+escapeHTML(r.video_url)+'" '+(poster?'poster="'+escapeHTML(poster)+'"':'')+' preload="none" loading="lazy" playsinline disablepictureinpicture aria-label="'+escapeHTML(r.title)+'"></video>'+
        '<span class="yyc-reel-chip">'+escapeHTML(category)+'</span>'+
        (eventName?'<span class="yyc-reel-number-badge">REEL '+reelNumber+' / '+reelTotal+'</span>':'')+
        '<button type="button" class="yyc-reel-expand" data-reel-fullscreen aria-label="View reel fullscreen" title="Fullscreen">⛶</button>'+
        '<button type="button" class="yyc-reel-play" data-reel-play aria-label="Play '+escapeHTML(r.title)+'"><span class="yyc-reel-play-icon">▶</span><span class="yyc-reel-play-label">PLAY Reel</span></button>'+
        '<div class="yyc-reel-player-error" role="status" hidden></div>'+
      '</div>'+
      '<div class="yyc-reel-meta"><h3>'+escapeHTML(r.title)+'</h3>'+
        (r.caption?'<p>'+escapeHTML(r.caption)+'</p>':'')+
        '<div class="yyc-reel-meta-foot"><span>'+escapeHTML(category)+'</span><span>'+escapeHTML(formatDate(r.created_at))+'</span></div></div>'+
    '</article>';
  }
  function eventCubeHTML(group,index){
    var covers=group.reels.slice(0,4);
    var coverMarkup=covers.map(function(r,slot){
      var thumb=String(r.thumbnail_url||'');
      var number=Math.max(1,parseInt(r.reel_number,10)||slot+1);
      return '<div class="yyc-reel-event-cover-tile">'+
        (thumb?'<img src="'+escapeHTML(thumb)+'" alt="" loading="lazy">':'<div class="yyc-reel-event-cover-placeholder"><span>REEL '+number+'</span></div>')+
        (slot===3&&group.reels.length>4?'<span class="yyc-reel-event-more">+'+(group.reels.length-4)+'</span>':'')+
      '</div>';
    }).join('');
    return '<article class="yyc-reel-event-cube" data-event-cube="'+index+'">'+
      '<button type="button" class="yyc-reel-event-cube-button" data-reel-event-open="'+index+'" aria-haspopup="dialog" aria-label="Open '+escapeHTML(group.name)+' collection, '+group.reels.length+' Reels">'+
        '<div class="yyc-reel-event-cube-cover '+(covers.length===1?'is-single':covers.length===2?'is-double':'is-mosaic')+'">'+coverMarkup+
          '<span class="yyc-reel-event-cube-badge">'+group.reels.length+' '+(group.reels.length===1?'REEL':'REELS')+'</span>'+
          '<span class="yyc-reel-event-cube-open"><span aria-hidden="true">▶</span> VIEW COLLECTION</span>'+
        '</div>'+
        '<div class="yyc-reel-event-cube-meta"><span class="yyc-reel-event-kicker">EVENT COLLECTION</span>'+
          '<h3>'+escapeHTML(group.name)+'</h3>'+
          '<div class="yyc-reel-event-cube-foot"><span>'+group.reels.length+' '+(group.reels.length===1?'Reel':'Reels')+' in this event</span><span class="yyc-reel-event-arrow" aria-hidden="true">↗</span></div>'+
        '</div>'+
      '</button>'+
    '</article>';
  }
  function renderPublic(reels){
    var grid=byId('yycReelGrid');if(!grid)return;
    var published=(reels||[]).filter(function(r){return String(r.status||'published').toLowerCase()==='published'&&r.video_url;});
    publicReels=published.slice();
    var count=byId('yycReelCount');if(count)count.textContent=published.length+' '+(published.length===1?'Reel':'Reels');
    if(!published.length){publicEventGroups=[];publicState('No reels published yet.');return;}
    var standalone=[],groupMap={},groups=[];
    published.forEach(function(r){
      var name=String(r.event_name||'').trim();
      if(!name){standalone.push(r);return;}
      var key=name.toLocaleLowerCase();
      if(!groupMap[key]){
        groupMap[key]={name:name,reels:[],sortOrder:Number(r.sort_order)||0,latest:String(r.created_at||'')};
        groups.push(groupMap[key]);
      }
      groupMap[key].reels.push(r);
      groupMap[key].sortOrder=Math.min(groupMap[key].sortOrder,Number(r.sort_order)||0);
      if(String(r.created_at||'')>groupMap[key].latest)groupMap[key].latest=String(r.created_at||'');
    });
    standalone.sort(function(a,b){return (Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(b.created_at||'').localeCompare(String(a.created_at||''));});
    groups.forEach(function(g){
      g.reels.sort(function(a,b){return (Number(a.reel_number)||1)-(Number(b.reel_number)||1)||(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.created_at||'').localeCompare(String(b.created_at||''));});
    });
    groups.sort(function(a,b){return a.sortOrder-b.sortOrder||b.latest.localeCompare(a.latest)||a.name.localeCompare(b.name);});
    publicEventGroups=groups;
    var markup=standalone.map(reelCardHTML).join('');
    groups.forEach(function(g,index){markup+=eventCubeHTML(g,index);});
    grid.innerHTML=markup;
    startWarmingVideos(grid);
  }
  function closeEventModal(restoreFocus){
    var modal=byId('yycReelEventModal');
    if(modal){
      modal.querySelectorAll('.yyc-reel-video').forEach(function(video){
        try{video.pause();}catch(e){}
      });
      modal.remove();
    }
    document.body.classList.remove('yyc-reel-modal-open');
    var opener=eventModalOpener;
    eventModalOpener=null;
    if(restoreFocus!==false&&opener&&document.contains(opener)&&typeof opener.focus==='function')opener.focus();
  }
  function openEventModal(index){
    var group=publicEventGroups[Number(index)];
    if(!group)return;
    var trigger=document.querySelector('[data-reel-event-open="'+Number(index)+'"]');
    closeEventModal(false);
    eventModalOpener=trigger||null;
    var markup='<div class="yyc-reel-event-modal" id="yycReelEventModal">'+
      '<section class="yyc-reel-event-dialog" role="dialog" aria-modal="true" aria-labelledby="yycReelEventDialogTitle">'+
        '<header class="yyc-reel-event-dialog-head"><div><span class="yyc-reel-event-kicker">YYC EVENT COLLECTION</span><h2 id="yycReelEventDialogTitle">'+escapeHTML(group.name)+'</h2><p>'+group.reels.length+' '+(group.reels.length===1?'Reel':'Reels')+' · shown in numbered order</p></div>'+
        '<button type="button" class="yyc-reel-event-close" data-reel-event-close aria-label="Close event collection" title="Close">×</button></header>'+
        '<div class="yyc-reel-event-dialog-grid yyc-reel-grid">'+group.reels.map(reelCardHTML).join('')+'</div>'+
      '</section></div>';
    document.body.insertAdjacentHTML('beforeend',markup);
    document.body.classList.add('yyc-reel-modal-open');
    var modal=byId('yycReelEventModal');
    if(modal)startWarmingVideos(modal);
    var close=modal&&modal.querySelector('[data-reel-event-close]');
    if(close)close.focus();
  }
  async function loadPublic(force){
    if(publicLoading)return;
    if(publicLoaded&&!force)return;
    publicLoading=true;
    var grid=byId('yycReelGrid');
    if(grid)grid.innerHTML='<div class="yyc-reel-state"><span class="yyc-reel-loading-dot" aria-hidden="true"></span><strong>Loading YYC Reel…</strong><span>Video files load only when they are near the screen or playback is requested.</span></div>';
    try{
      var data=await callRPC('yyc_reels_public_list',{});
      if(!data||data.ok!==true)throw new Error(data&&data.error||'Could not load published reels.');
      renderPublic(data.reels||[]);
      publicLoaded=true;
    }catch(e){publicState(e.message||'Please check your internet connection.',true);}
    finally{publicLoading=false;}
  }
  function bindPublic(){
    var section=byId('reel');if(!section)return;
    if('IntersectionObserver' in window){
      var sectionObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){loadPublic(false);sectionObserver.disconnect();}
        });
      },{rootMargin:'320px 0px'});
      sectionObserver.observe(section);
    }
    document.addEventListener('click',function(event){
      var link=event.target.closest&&event.target.closest('a[href="#reel"]');
      if(link)window.setTimeout(function(){loadPublic(false);},80);
      var eventOpen=event.target.closest&&event.target.closest('[data-reel-event-open]');
      if(eventOpen){openEventModal(eventOpen.getAttribute('data-reel-event-open'));return;}
      var eventClose=event.target.closest&&event.target.closest('[data-reel-event-close]');
      if(eventClose){closeEventModal();return;}
      if(event.target&&event.target.id==='yycReelEventModal'){closeEventModal();return;}
      var retry=event.target.closest&&event.target.closest('#yycReelRetry');
      if(retry){loadPublic(true);return;}
      var play=event.target.closest&&event.target.closest('[data-reel-play]');
      if(play){
        var card=play.closest('.yyc-reel-card'), video=card&&card.querySelector('.yyc-reel-video');
        if(!video)return;
        document.querySelectorAll('.yyc-reel-video').forEach(function(other){if(other!==video&&!other.paused)other.pause();});
        attachVideoSource(video);
        video.controls=true;
        var err=card.querySelector('.yyc-reel-player-error');if(err)err.hidden=true;
        if(video.ended)try{video.currentTime=0;}catch(e){}
        var result;
        try{result=video.play();}catch(e){result=Promise.reject(e);}
        if(result&&typeof result.then==='function'){
          result.then(function(){play.hidden=true;}).catch(function(){
            if(err){err.textContent='This format may not play in your browser. MP4 (H.264/AAC) is recommended.';err.hidden=false;}
            play.hidden=false;video.controls=false;
          });
        }else{play.hidden=true;}
        return;
      }
      var full=event.target.closest&&event.target.closest('[data-reel-fullscreen]');
      if(full){
        var parent=full.closest('.yyc-reel-player'), target=parent&&parent.querySelector('.yyc-reel-video');
        if(!target)return;
        var card=full.closest('.yyc-reel-card');
        var play=card&&card.querySelector('[data-reel-play]');
        var err=card&&card.querySelector('.yyc-reel-player-error');
        attachVideoSource(target);
        target.controls=true;
        if(err)err.hidden=true;
        /* Toggle the same control: clicking again exits fullscreen instead of trapping the page zoomed in. */
        var isPlayerFullscreen=!!(parent&&(
          document.fullscreenElement===parent ||
          document.webkitFullscreenElement===parent
        ));
        if(isPlayerFullscreen){
          try{
            var exitResult;
            if(document.exitFullscreen)exitResult=document.exitFullscreen();
            else if(document.webkitExitFullscreen)exitResult=document.webkitExitFullscreen();
            if(exitResult&&typeof exitResult.catch==='function')exitResult.catch(function(){});
          }catch(e){}
          return;
        }
        /* Request fullscreen synchronously from the click; preserve the complete video frame. */
        try{
          var fullscreenResult;
          if(parent&&parent.requestFullscreen)fullscreenResult=parent.requestFullscreen();
          else if(target.webkitEnterFullscreen)fullscreenResult=target.webkitEnterFullscreen();
          else if(target.requestFullscreen)fullscreenResult=target.requestFullscreen();
          if(fullscreenResult&&typeof fullscreenResult.catch==='function')fullscreenResult.catch(function(){});
        }catch(e){}
        var playback;
        try{playback=target.play();}catch(e){playback=Promise.reject(e);}
        if(playback&&typeof playback.then==='function'){
          playback.then(function(){if(play)play.hidden=true;}).catch(function(){
            if(err){err.textContent='Playback could not start. Tap Play Reel to try again.';err.hidden=false;}
            if(play)play.hidden=false;
            target.controls=false;
          });
        }else if(play){play.hidden=true;}
        return;
      }
    });
    function syncFullscreenButton(player){
      if(!player)return;
      var button=player.querySelector('[data-reel-fullscreen]');
      if(!button)return;
      var active=document.fullscreenElement===player||document.webkitFullscreenElement===player;
      button.textContent=active?'×':'⛶';
      button.title=active?'Exit fullscreen':'Fullscreen';
      button.setAttribute('aria-label',active?'Exit Reel fullscreen':'View Reel fullscreen');
      button.setAttribute('aria-pressed',active?'true':'false');
    }
    function syncAllFullscreenButtons(){
      document.querySelectorAll('.yyc-reel-player').forEach(syncFullscreenButton);
    }
    document.addEventListener('fullscreenchange',syncAllFullscreenButtons);
    document.addEventListener('webkitfullscreenchange',syncAllFullscreenButtons);
    document.addEventListener('keydown',function(event){if(event.key==='Escape')closeEventModal();});
    document.addEventListener('ended',function(event){
      var video=event.target;
      if(!video||!video.classList||!video.classList.contains('yyc-reel-video'))return;
      var card=video.closest('.yyc-reel-card'), play=card&&card.querySelector('[data-reel-play]');
      if(play){play.hidden=false;var label=play.querySelector('.yyc-reel-play-label');if(label)label.textContent='PLAY AGAIN';}
    },true);
    document.addEventListener('error',function(event){
      var video=event.target;
      if(!video||!video.classList||!video.classList.contains('yyc-reel-video'))return;
      var card=video.closest('.yyc-reel-card'), play=card&&card.querySelector('[data-reel-play]'), err=card&&card.querySelector('.yyc-reel-player-error');
      if(play)play.hidden=false;
      if(err){err.textContent='Video unavailable. The format may not be supported or the connection may be slow.';err.hidden=false;}
    },true);
  }
  async function loadAdminReels(){
    var token=getAdminToken();
    if(!token)throw new Error('Admin session is missing. Please close this panel and log in again.');
    var data=await callRPC('yyc_reels_admin_list',{p_token:token});
    if(!data||data.ok!==true)throw new Error(data&&data.error||'Could not load Reel records.');
    adminReels=Array.isArray(data.reels)?data.reels:[];
    return adminReels;
  }
  function backToReelList(){renderAdminList(adminReels,adminSelectedGroupKey);}
  function normalizeEventName(value){return String(value||'').trim().toLocaleLowerCase();}
  function getEventRows(name){
    var key=normalizeEventName(name);
    return key?adminReels.filter(function(r){return normalizeEventName(r.event_name)===key;}):[];
  }
  function adminReelGroups(reels){
    var standalone=[],map=Object.create(null),groups=[];
    (reels||[]).forEach(function(r){
      var name=String(r.event_name||'').trim();
      if(!name){standalone.push(r);return;}
      var key=normalizeEventName(name);
      if(!map[key]){
        map[key]={key:key,name:name,reels:[],sortOrder:Number(r.sort_order)||0,latest:String(r.created_at||'')};
        groups.push(map[key]);
      }
      map[key].reels.push(r);
      map[key].sortOrder=Math.min(map[key].sortOrder,Number(r.sort_order)||0);
      if(String(r.created_at||'')>map[key].latest)map[key].latest=String(r.created_at||'');
    });
    standalone.sort(function(a,b){
      return (Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(b.created_at||'').localeCompare(String(a.created_at||''));
    });
    groups.forEach(function(group){
      group.reels.sort(function(a,b){
        return (Number(a.reel_number)||1)-(Number(b.reel_number)||1)||
          (Number(a.sort_order)||0)-(Number(b.sort_order)||0)||
          String(a.created_at||'').localeCompare(String(b.created_at||''));
      });
      group.publishedCount=group.reels.filter(function(r){return String(r.status||'draft').toLowerCase()==='published'&&r.video_url;}).length;
    });
    groups.sort(function(a,b){
      return a.sortOrder-b.sortOrder||b.latest.localeCompare(a.latest)||a.name.localeCompare(b.name);
    });
    return {standalone:standalone,groups:groups};
  }
  function adminReelCardHTML(r){
    var img=r.thumbnail_url||'';
    var status=String(r.status||'draft').toLowerCase();
    var search=[r.title,r.caption,r.category,r.event_name,r.reel_number,r.reel_total,status].join(' ').toLowerCase();
    return '<article class="yyc-reel-admin-card" data-admin-reel-card="'+escapeHTML(r.id)+'" data-reel-search="'+escapeHTML(search)+'">'+
      '<img class="yyc-reel-admin-thumb" src="'+(img?escapeHTML(img):'')+'" alt="" loading="lazy" '+(img?'':'hidden')+'>'+
      '<div><h4>'+escapeHTML(r.title)+'</h4><p>'+escapeHTML(r.caption||'No caption')+'</p>'+
      '<span class="yyc-reel-admin-pill '+(status==='published'?'is-published':'')+'">'+escapeHTML(status)+'</span><span class="yyc-reel-admin-pill">'+escapeHTML(r.category||'Community')+'</span>'+
      (String(r.event_name||'').trim()?'<span class="yyc-reel-admin-pill">'+escapeHTML(r.event_name)+' · Reel '+(Number(r.reel_number)||1)+' / '+(Number(r.reel_total)||1)+'</span>':'')+
      '<div class="yyc-reel-admin-actions"><button type="button" data-reel-edit="'+escapeHTML(r.id)+'">Edit</button><button type="button" data-reel-toggle="'+escapeHTML(r.id)+'">'+(status==='published'?'Unpublish':'Publish')+'</button><button type="button" class="is-danger" data-reel-delete="'+escapeHTML(r.id)+'">Delete</button></div></div></article>';
  }
  function adminReelCubeHTML(group){
    var published=group.reels.filter(function(r){return String(r.status||'draft').toLowerCase()==='published'&&r.video_url;});
    var source=published.length?published:group.reels;
    var covers=source.slice(0,4);
    var search=group.reels.map(function(r){return [r.title,r.caption,r.category,r.status,r.event_name,r.reel_number].join(' ');}).join(' ').toLowerCase();
    var coverMarkup=covers.map(function(r,slot){
      var thumb=String(r.thumbnail_url||'');
      var number=Math.max(1,parseInt(r.reel_number,10)||slot+1);
      return '<div class="yyc-reel-event-cover-tile">'+
        (thumb?'<img src="'+escapeHTML(thumb)+'" alt="" loading="lazy">':'<div class="yyc-reel-event-cover-placeholder"><span>REEL '+number+'</span></div>')+
        (slot===3&&group.reels.length>4?'<span class="yyc-reel-event-more">+'+(group.reels.length-4)+'</span>':'')+
      '</div>';
    }).join('');
    return '<article class="yyc-reel-event-cube yyc-reel-admin-event-cube">'+
      '<button type="button" class="yyc-reel-event-cube-button" data-admin-reel-group="'+escapeHTML(group.key)+'" aria-haspopup="true" aria-label="Manage '+escapeHTML(group.name)+' collection, '+group.reels.length+' Reels" data-reel-search="'+escapeHTML(search)+'">'+
        '<div class="yyc-reel-event-cube-cover '+(covers.length===1?'is-single':covers.length===2?'is-double':'is-mosaic')+'">'+coverMarkup+
          '<span class="yyc-reel-event-cube-badge">'+group.reels.length+' '+(group.reels.length===1?'REEL':'REELS')+'</span>'+
          '<span class="yyc-reel-event-cube-open"><span aria-hidden="true">✎</span> MANAGE COLLECTION</span>'+
        '</div>'+
        '<div class="yyc-reel-event-cube-meta"><span class="yyc-reel-event-kicker">EVENT COLLECTION · ADMIN</span>'+
          '<h3>'+escapeHTML(group.name)+'</h3>'+
          '<div class="yyc-reel-event-cube-foot"><span>'+group.reels.length+' Reels · '+group.publishedCount+' published</span><span class="yyc-reel-event-arrow" aria-hidden="true">↗</span></div>'+
        '</div>'+
      '</button>'+
    '</article>';
  }
  function renderAdminList(reels,selectedGroupKey){
    var workspace=byId('adminWorkspace');if(!workspace)return;
    if(Array.isArray(reels))adminReels=reels.slice();
    if(arguments.length>1)adminSelectedGroupKey=String(selectedGroupKey||'');
    var grouped=adminReelGroups(adminReels);
    var selectedGroup=adminSelectedGroupKey?grouped.groups.find(function(group){return group.key===adminSelectedGroupKey;}):null;
    if(adminSelectedGroupKey&&!selectedGroup)adminSelectedGroupKey='';
    var collectionMode=!!selectedGroup;
    var items=collectionMode?selectedGroup.reels:grouped.standalone;
    var searchText=collectionMode?selectedGroup.name:'';
    workspace.innerHTML='<div class="admin-top yyc-reel-admin-head"><div><div class="modal-kicker">YYC MEDIA STUDIO</div><h3>'+(collectionMode?escapeHTML(selectedGroup.name):'Reel Studio')+'</h3><p>'+(collectionMode?'Manage every Reel in this event collection. Edit details, change visibility or delete individual Reels.':'Upload, draft, publish, edit or remove official YYC videos. Event-named Reels appear together in the same collection cube as on the public site.')+'</p></div><div class="admin-top-actions">'+
      (collectionMode?'<button type="button" class="mini-btn" data-reel-admin-collections-back>← Back to collections</button>':'<button type="button" class="mini-btn" data-reel-admin-back>← Back to Admin</button>')+
      '<button type="button" class="mini-btn gold" data-reel-admin-add>'+(collectionMode?'＋ Add Reels to event':'＋ Add Reels')+'</button></div></div>'+
      '<div class="yyc-reel-admin-note">For smooth playback, MP4 (H.264 video + AAC audio) is recommended. The Reel Studio does not impose a separate size cap; Supabase project-wide upload limits may still apply. Videos remain stored separately from GitHub.</div>'+
      '<input type="search" class="yyc-reel-admin-search" id="yycReelAdminSearch" placeholder="'+(collectionMode?'Search this event’s Reels…':'Search title, caption, category, event or status…')+'" autocomplete="off" aria-label="Search Reels">'+
      '<div class="yyc-reel-admin-grid yyc-reel-admin-collections" id="yycReelAdminGrid">'+
      (collectionMode
        ?(items.length?items.map(adminReelCardHTML).join(''):'<div class="yyc-reel-state"><strong>No Reels in this collection.</strong><span>Go back to the collection grid to add more.</span></div>')
        :(grouped.standalone.map(adminReelCardHTML).join('')+grouped.groups.map(adminReelCubeHTML).join(''))||
          '<div class="yyc-reel-state"><strong>No Reels added yet.</strong><span>Choose “Add Reels” to upload a standalone Reel or a complete event collection.</span></div>')+
      '</div>';

    var backAdmin=workspace.querySelector('[data-reel-admin-back]');
    if(backAdmin)backAdmin.addEventListener('click',function(){
      var tab=document.querySelector('.admin-tab[data-tab="overview"]');
      if(tab)tab.click();
    });
    var backCollections=workspace.querySelector('[data-reel-admin-collections-back]');
    if(backCollections)backCollections.addEventListener('click',function(){renderAdminList(adminReels,'');});
    var addButton=workspace.querySelector('[data-reel-admin-add]');
    if(addButton)addButton.addEventListener('click',function(){renderEventBatchForm(collectionMode?selectedGroup.name:'');});

    workspace.querySelectorAll('[data-admin-reel-group]').forEach(function(button){
      button.addEventListener('click',function(){
        renderAdminList(adminReels,button.getAttribute('data-admin-reel-group'));
      });
    });
    var search=byId('yycReelAdminSearch');
    if(search)search.addEventListener('input',function(){
      var q=search.value.trim().toLowerCase();
      workspace.querySelectorAll('[data-reel-search]').forEach(function(card){
        card.hidden=!!q&&String(card.getAttribute('data-reel-search')||'').indexOf(q)<0;
      });
    });
    workspace.querySelectorAll('[data-reel-edit]').forEach(function(button){
      button.addEventListener('click',function(){
        var reel=adminReels.find(function(item){return String(item.id)===String(button.getAttribute('data-reel-edit'));});
        if(reel)renderAdminForm(reel);
      });
    });
    workspace.querySelectorAll('[data-reel-toggle]').forEach(function(button){
      button.addEventListener('click',function(){
        var reel=adminReels.find(function(item){return String(item.id)===String(button.getAttribute('data-reel-toggle'));});
        if(reel)togglePublish(reel);
      });
    });
    workspace.querySelectorAll('[data-reel-delete]').forEach(function(button){
      button.addEventListener('click',function(){
        var reel=adminReels.find(function(item){return String(item.id)===String(button.getAttribute('data-reel-delete'));});
        if(reel)deleteReel(reel);
      });
    });
  }
  function renderAdminForm(reel){
    var workspace=byId('adminWorkspace');if(!workspace)return;
    var isEdit=!!reel;
    workspace.innerHTML='<div class="admin-top yyc-reel-admin-head"><div><div class="modal-kicker">YYC MEDIA STUDIO</div><h3>'+(isEdit?'Edit Reel':'Add a Reel')+'</h3><p>Fill in a title and choose the video. Publishing makes it visible in the public Reel tab.</p></div><div class="admin-top-actions"><button type="button" class="mini-btn" data-reel-form-cancel>← Back to Reels</button></div></div>'+
      '<form class="yyc-reel-admin-form" id="yycReelAdminForm">'+
      '<div class="yyc-reel-admin-fields">'+
      '<div class="yyc-reel-admin-field"><label for="yycReelTitle">Title *</label><input id="yycReelTitle" name="title" maxlength="140" required value="'+escapeHTML(reel&&reel.title||'')+'" placeholder="YYC Cleanliness Drive 2026"></div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelCategory">Category</label><select id="yycReelCategory" name="category">'+
      ['Community','Events','Cleanliness Drive','Culture','Sports','Celebrations','Club Edits','Other'].map(function(c){return '<option value="'+escapeHTML(c)+'"'+((reel&&reel.category||'Community')===c?' selected':'')+'>'+escapeHTML(c)+'</option>';}).join('')+
      '</select></div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelEventName">Event name (optional)</label><input id="yycReelEventName" name="event_name" maxlength="160" value="'+escapeHTML(reel&&reel.event_name||'')+'" placeholder="YYC Cleanliness Drive 2026"><small>Use the same name to group this Reel with the other Reels from the event.</small></div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelNumber">Reel number</label><input id="yycReelNumber" name="reel_number" type="number" min="1" max="100" step="1" value="'+escapeHTML(reel&&Number(reel.reel_number)>0?reel.reel_number:1)+'"></div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelTotal">Total Reels in event</label><input id="yycReelTotal" name="reel_total" type="number" min="1" max="30" step="1" value="'+escapeHTML(reel&&Number(reel.reel_total)>0?reel.reel_total:1)+'"><small>If event name is blank, numbering is ignored.</small></div>'+
      '<div class="yyc-reel-admin-field is-full"><label for="yycReelCaption">Caption</label><textarea id="yycReelCaption" name="caption" maxlength="2400" placeholder="Add a short description…">'+escapeHTML(reel&&reel.caption||'')+'</textarea><small>Maximum 2,400 characters.</small></div>'+
      '<div class="yyc-reel-admin-field is-full"><label for="yycReelVideo">Video '+(isEdit?'(optional — choose only to replace)':'*')+'</label><input id="yycReelVideo" name="video" type="file" accept="video/*" '+(isEdit?'':'required')+'><small>Common video formats are accepted. MP4 is recommended for the smoothest playback; larger uploads may take longer.</small>'+(isEdit?'<span class="yyc-reel-admin-current">Current video is saved. Leave this blank to keep it.</span>':'')+'</div>'+
      '<div class="yyc-reel-admin-field is-full"><label for="yycReelThumbnail">Thumbnail (optional)</label><input id="yycReelThumbnail" name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG or WebP. A clear 9:16 image looks best.</small>'+(isEdit&&reel.thumbnail_url?'<span class="yyc-reel-admin-current">Current thumbnail is saved. Choose a new file to replace it.</span>':'')+'</div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelStatus">Visibility</label><select id="yycReelStatus" name="status"><option value="draft"'+((reel&&reel.status)==='draft'?' selected':'')+'>Draft — only in admin</option><option value="published"'+((reel&&reel.status==='published')?' selected':'')+'>Published — public</option><option value="hidden"'+((reel&&reel.status==='hidden')?' selected':'')+'>Hidden — not public</option></select></div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelOrder">Display order</label><input id="yycReelOrder" name="sort_order" type="number" min="0" step="1" value="'+escapeHTML(reel&&Number.isFinite(Number(reel.sort_order))?reel.sort_order:0)+'"><small>Lower numbers appear first.</small></div>'+
      '</div><div class="yyc-reel-admin-form-actions"><button class="is-primary" id="yycReelSaveBtn" type="submit">'+(isEdit?'Save changes':'Upload & Save Reel')+'</button><button type="button" data-reel-form-cancel>Cancel</button></div><div class="yyc-reel-admin-status" id="yycReelFormStatus" role="status" aria-live="polite"></div></form>';
    workspace.querySelectorAll('[data-reel-form-cancel]').forEach(function(btn){btn.addEventListener('click',backToReelList);});
    var form=byId('yycReelAdminForm');
    form.addEventListener('submit',async function(event){
      event.preventDefault();
      if(adminBusy)return;
      var status=byId('yycReelFormStatus'), save=byId('yycReelSaveBtn');
      var videoFile=byId('yycReelVideo').files[0]||null;
      var thumbFile=byId('yycReelThumbnail').files[0]||null;
      var newPaths=[];
      if(!isEdit&&!videoFile){if(status)status.textContent='Choose a video first.';return;}
      adminBusy=true;if(save){save.disabled=true;save.textContent='Uploading…';}
      if(status)status.textContent='Uploading and saving… Larger videos may take a little longer.';
      var videoUrl=reel&&reel.video_url||'', videoPath=reel&&reel.video_path||'';
      var thumbUrl=reel&&reel.thumbnail_url||'', thumbPath=reel&&reel.thumbnail_path||'';
      try{
        var groupingName=byId('yycReelEventName').value.trim();
        var groupingNumber=parseInt(byId('yycReelNumber').value,10)||1;
        var groupingTotal=parseInt(byId('yycReelTotal').value,10)||1;
        if(groupingName&&(groupingNumber<1||groupingTotal<1||groupingTotal>100||groupingNumber>groupingTotal))throw new Error('For an event Reel, choose a Reel number between 1 and the event total (maximum 100).');
        if(videoFile){
          var uploadedVideo=await uploadFile(videoFile,'video');videoUrl=uploadedVideo.url;videoPath=uploadedVideo.path;newPaths.push(videoPath);
        }
        if(thumbFile){
          var uploadedThumb=await uploadFile(thumbFile,'thumbnail');thumbUrl=uploadedThumb.url;thumbPath=uploadedThumb.path;newPaths.push(thumbPath);
        }
        var payload={
          p_token:getAdminToken(),p_id:reel&&reel.id||null,
          p_title:byId('yycReelTitle').value.trim(),
          p_caption:byId('yycReelCaption').value.trim(),
          p_category:byId('yycReelCategory').value,
          p_video_url:videoUrl,p_video_path:videoPath,
          p_thumbnail_url:thumbUrl,p_thumbnail_path:thumbPath,
          p_status:byId('yycReelStatus').value,
          p_sort_order:Math.max(0,parseInt(byId('yycReelOrder').value,10)||0),
          p_event_name:byId('yycReelEventName').value.trim(),
          p_reel_number:Math.max(1,parseInt(byId('yycReelNumber').value,10)||1),
          p_reel_total:Math.max(1,parseInt(byId('yycReelTotal').value,10)||1)
        };
        var saved=await callRPC('yyc_reels_admin_save',payload);
        if(!saved||saved.ok!==true)throw new Error(saved&&saved.error||'Could not save this Reel.');
        newPaths=[];
        var oldPaths=[];
        if(reel&&videoFile&&reel.video_path&&reel.video_path!==videoPath)oldPaths.push(reel.video_path);
        if(reel&&thumbFile&&reel.thumbnail_path&&reel.thumbnail_path!==thumbPath)oldPaths.push(reel.thumbnail_path);
        if(oldPaths.length)await cleanupPaths(oldPaths);
        adminBusy=false;
        notify(payload.p_status==='published'?'Reel published successfully.':'Reel saved successfully.');
        try{
          await loadAdminReels();
          renderAdminList(adminReels);
          loadPublic(true);
        }catch(refreshError){
          if(status)status.textContent='Reel saved successfully, but the Reel list could not refresh. Use “Refresh Reel List” below — do not upload it again.';
          if(save){save.disabled=false;save.type='button';save.textContent='Refresh Reel List';save.onclick=function(){renderAdminPanel();};}
          return;
        }
      }catch(error){
        await cleanupPaths(newPaths);
        if(status)status.textContent=error.message||'Upload failed. Please try again.';
        notify(error.message||'Could not save the Reel.');
        if(save){save.disabled=false;save.textContent=isEdit?'Save changes':'Upload & Save Reel';}
        adminBusy=false;
      }
    });
  }
  async function togglePublish(reel){
    if(adminBusy)return;
    var next=reel.status==='published'?'draft':'published';
    if(next==='published'&&!reel.video_url)return;
    adminBusy=true;
    try{
      var result=await callRPC('yyc_reels_admin_save',{
        p_token:getAdminToken(),p_id:reel.id,p_title:reel.title,p_caption:reel.caption||'',
        p_category:reel.category||'Community',p_video_url:reel.video_url,p_video_path:reel.video_path,
        p_thumbnail_url:reel.thumbnail_url||'',p_thumbnail_path:reel.thumbnail_path||'',
        p_status:next,p_sort_order:Number(reel.sort_order)||0,
        p_event_name:reel.event_name||'',p_reel_number:Number(reel.reel_number)||1,p_reel_total:Number(reel.reel_total)||1
      });
      if(!result||result.ok!==true)throw new Error(result&&result.error||'Could not change Reel visibility.');
      notify(next==='published'?'Reel published.':'Reel unpublished.');
      await loadAdminReels();renderAdminList(adminReels);loadPublic(true);
    }catch(e){notify(e.message||'Could not update Reel.');}
    finally{adminBusy=false;}
  }
  async function deleteReel(reel){
    if(adminBusy)return;
    if(!window.confirm('Delete “'+String(reel.title||'this Reel')+'”? This removes the published card and its uploaded files.'))return;
    adminBusy=true;
    try{
      var result=await callRPC('yyc_reels_admin_delete',{p_token:getAdminToken(),p_id:reel.id});
      if(!result||result.ok!==true)throw new Error(result&&result.error||'Could not delete Reel.');
      var paths=[result.video_path,result.thumbnail_path].filter(Boolean);
      var cleanupError='';
      if(paths.length){try{await callUploadService({action:'delete-files',paths:paths});}catch(e){cleanupError=e.message||'Media cleanup failed.';}}
      notify(cleanupError?'Reel deleted from the site, but a media file may remain in storage.':'Reel and its uploaded media deleted.');
      await loadAdminReels();renderAdminList(adminReels);loadPublic(true);
    }catch(e){notify(e.message||'Could not delete Reel.');}
    finally{adminBusy=false;}
  }

  window.YYCReels={adminPanel:renderAdminPanel,refreshPublic:function(){return loadPublic(true);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindPublic);
  else bindPublic();
})();
