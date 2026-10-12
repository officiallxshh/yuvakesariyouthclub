
(function(){
  'use strict';
  var BUCKET='yyc-reels';
  var MAX_VIDEO=50*1024*1024;
  var MAX_THUMB=5*1024*1024;
  var publicLoaded=false;
  var publicLoading=false;
  var publicReels=[];
  var adminReels=[];
  var adminBusy=false;

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
    else if(window.console&&console.info)console.info('[YYC REEL]',message);
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
    var response=await fetch(c.supabaseUrl.replace(/\/$/,'')+'/functions/v1/yyc-reel-upload',{
      method:'POST',credentials:'omit',cache:'no-store',
      headers:{'apikey':c.supabaseKey,'Authorization':'Bearer '+c.supabaseKey,'Content-Type':'application/json'},
      body:JSON.stringify(Object.assign({},payload,{token:token}))
    });
    var raw=await response.text(), data={};
    try{data=raw?JSON.parse(raw):{};}catch(e){data={error:raw};}
    if(!response.ok||data.ok===false)throw new Error(data.error||('REEL storage request failed ('+response.status+').'));
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
    var limit=kind==='video'?MAX_VIDEO:MAX_THUMB;
    if(!file||!file.size)throw new Error('Choose a file to upload.');
    if(file.size>limit)throw new Error(kind==='video'?'Video is over 50 MB. Compress it first for smoother playback.':'Thumbnail is over 5 MB.');
    if(kind==='thumbnail'&&!/^image\/(jpeg|png|webp)$/.test(mime))throw new Error('Thumbnail must be JPG, PNG or WebP.');
    if(kind==='video'&&!/^video\//.test(mime))throw new Error('Choose a video file.');
    var signed=await callUploadService({action:'sign-upload',kind:kind,fileName:file.name,contentType:mime,size:file.size});
    var c=config();
    var encodedPath=String(signed.path||'').split('/').map(function(part){return encodeURIComponent(part);}).join('/');
    var uploadUrl=c.supabaseUrl.replace(/\/$/,'')+'/storage/v1/object/upload/sign/'+BUCKET+'/'+encodedPath+'?token='+encodeURIComponent(signed.token);
    var response=await fetch(uploadUrl,{
      method:'PUT',cache:'no-store',credentials:'omit',
      headers:{'apikey':c.supabaseKey,'Authorization':'Bearer '+c.supabaseKey,'Content-Type':mime,'x-upsert':'false'},
      body:file
    });
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
    grid.innerHTML='<div class="yyc-reel-state">'+(withRetry?'<strong>Could not load REEL right now.</strong>':'<strong>'+escapeHTML(message||'YYC Reels are coming soon.')+'</strong>')+
      (withRetry?'<span>'+escapeHTML(message||'Check your connection and try again.')+'</span><button type="button" id="yycReelRetry">TRY AGAIN ↻</button>':'<span>Official YYC moments will appear here after the admin publishes a reel.</span>')+'</div>';
    var count=byId('yycReelCount');if(count)count.textContent='REEL';
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
    var videos=root.querySelectorAll('.yyc-reel-video');
    if(!('IntersectionObserver' in window)){
      Array.prototype.forEach.call(videos,function(video,i){if(i<2)attachVideoSource(video);});
      return;
    }
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          attachVideoSource(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },{root:null,rootMargin:'420px 0px',threshold:0.01});
    Array.prototype.forEach.call(videos,function(video){observer.observe(video);});
  }
  function renderPublic(reels){
    var grid=byId('yycReelGrid');if(!grid)return;
    var published=(reels||[]).filter(function(r){return String(r.status||'published').toLowerCase()==='published'&&r.video_url;});
    publicReels=published.slice();
    var count=byId('yycReelCount');if(count)count.textContent=published.length+' '+(published.length===1?'REEL':'REELS');
    if(!published.length){publicState('No reels published yet.');return;}
    grid.innerHTML=published.map(function(r){
      var poster=String(r.thumbnail_url||'');
      var category=String(r.category||'YYC');
      return '<article class="yyc-reel-card" data-reel-card="'+escapeHTML(r.id)+'">'+
        '<div class="yyc-reel-player">'+
          '<video class="yyc-reel-video" data-video-url="'+escapeHTML(r.video_url)+'" '+(poster?'poster="'+escapeHTML(poster)+'"':'')+' preload="none" loading="lazy" playsinline disablepictureinpicture aria-label="'+escapeHTML(r.title)+'"></video>'+
          '<span class="yyc-reel-chip">'+escapeHTML(category)+'</span>'+
          '<button type="button" class="yyc-reel-expand" data-reel-fullscreen aria-label="View reel fullscreen" title="Fullscreen">⛶</button>'+
          '<button type="button" class="yyc-reel-play" data-reel-play aria-label="Play '+escapeHTML(r.title)+'"><span class="yyc-reel-play-icon">▶</span><span class="yyc-reel-play-label">PLAY REEL</span></button>'+
          '<div class="yyc-reel-player-error" role="status" hidden></div>'+
        '</div>'+
        '<div class="yyc-reel-meta"><h3>'+escapeHTML(r.title)+'</h3>'+
          (r.caption?'<p>'+escapeHTML(r.caption)+'</p>':'')+
          '<div class="yyc-reel-meta-foot"><span>'+escapeHTML(category)+'</span><span>'+escapeHTML(formatDate(r.created_at))+'</span></div></div>'+
      '</article>';
    }).join('');
    startWarmingVideos(grid);
  }
  async function loadPublic(force){
    if(publicLoading)return;
    if(publicLoaded&&!force)return;
    publicLoading=true;
    var grid=byId('yycReelGrid');
    if(grid)grid.innerHTML='<div class="yyc-reel-state"><span class="yyc-reel-loading-dot" aria-hidden="true"></span><strong>Loading YYC REEL…</strong><span>Video files load only when they are near the screen or playback is requested.</span></div>';
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
        attachVideoSource(target);
        try{
          if(target.requestFullscreen)target.requestFullscreen();
          else if(target.webkitEnterFullscreen)target.webkitEnterFullscreen();
          else if(parent&&parent.requestFullscreen)parent.requestFullscreen();
        }catch(e){}
      }
    });
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
    if(!data||data.ok!==true)throw new Error(data&&data.error||'Could not load REEL records.');
    adminReels=Array.isArray(data.reels)?data.reels:[];
    return adminReels;
  }
  function backToReelList(){renderAdminList(adminReels);}
  function renderAdminPanel(){
    var workspace=byId('adminWorkspace');if(!workspace)return;
    workspace.innerHTML='<div class="yyc-reel-state"><span class="yyc-reel-loading-dot" aria-hidden="true"></span><strong>Opening REEL Studio…</strong><span>Checking your admin session.</span></div>';
    loadAdminReels().then(renderAdminList).catch(function(e){
      workspace.innerHTML='<div class="yyc-reel-state"><strong>REEL Studio could not open.</strong><span>'+escapeHTML(e.message||'Check the admin session and try again.')+'</span><button type="button" data-reel-admin-retry>TRY AGAIN ↻</button></div>';
      workspace.querySelector('[data-reel-admin-retry]').addEventListener('click',renderAdminPanel);
    });
  }
  function renderAdminList(reels){
    var workspace=byId('adminWorkspace');if(!workspace)return;
    adminReels=(reels||[]).slice();
    workspace.innerHTML='<div class="admin-top yyc-reel-admin-head"><div><div class="modal-kicker">YYC MEDIA STUDIO</div><h3>REEL Studio</h3><p>Upload, draft, publish, edit or remove official YYC videos.</p></div><div class="admin-top-actions"><button type="button" class="mini-btn" data-reel-admin-back>← Back to Admin</button><button type="button" class="mini-btn gold" data-reel-admin-add>＋ Add Reel</button></div></div>'+
      '<div class="yyc-reel-admin-note">For the smoothest playback, use a compressed MP4 (H.264 video + AAC audio), ideally 720p or 1080p and 50 MB or less. Other video formats can be uploaded, but playback support varies by browser. Video files are stored separately from GitHub.</div>'+
      '<input type="search" class="yyc-reel-admin-search" id="yycReelAdminSearch" placeholder="Search title, caption, category or status…" autocomplete="off" aria-label="Search reels">'+
      '<div class="yyc-reel-admin-grid" id="yycReelAdminGrid">'+
      (adminReels.length?adminReels.map(function(r){
        var img=r.thumbnail_url||'';
        var status=String(r.status||'draft').toLowerCase();
        return '<article class="yyc-reel-admin-card" data-admin-reel-card="'+escapeHTML(r.id)+'" data-reel-search="'+escapeHTML([r.title,r.caption,r.category,status].join(' ').toLowerCase())+'">'+
          '<img class="yyc-reel-admin-thumb" src="'+(img?escapeHTML(img):'')+'" alt="" loading="lazy" '+(img?'':'hidden')+'>'+
          '<div><h4>'+escapeHTML(r.title)+'</h4><p>'+escapeHTML(r.caption||'No caption')+'</p>'+
          '<span class="yyc-reel-admin-pill '+(status==='published'?'is-published':'')+'">'+escapeHTML(status)+'</span><span class="yyc-reel-admin-pill">'+escapeHTML(r.category||'Community')+'</span>'+
          '<div class="yyc-reel-admin-actions"><button type="button" data-reel-edit="'+escapeHTML(r.id)+'">Edit</button><button type="button" data-reel-toggle="'+escapeHTML(r.id)+'">'+(status==='published'?'Unpublish':'Publish')+'</button><button type="button" class="is-danger" data-reel-delete="'+escapeHTML(r.id)+'">Delete</button></div></div></article>';
      }).join(''):'<div class="yyc-reel-state"><strong>No reels added yet.</strong><span>Choose “Add Reel” to upload the first YYC video.</span></div>')+
      '</div>';
    workspace.querySelector('[data-reel-admin-back]').addEventListener('click',function(){
      var tab=document.querySelector('.admin-tab[data-tab="overview"]');
      if(tab)tab.click();
    });
    workspace.querySelector('[data-reel-admin-add]').addEventListener('click',function(){renderAdminForm(null);});
    var search=byId('yycReelAdminSearch');
    if(search)search.addEventListener('input',function(){
      var q=search.value.trim().toLowerCase();
      workspace.querySelectorAll('[data-admin-reel-card]').forEach(function(card){card.hidden=!!q&&card.getAttribute('data-reel-search').indexOf(q)<0;});
    });
    workspace.querySelectorAll('[data-reel-edit]').forEach(function(button){
      button.addEventListener('click',function(){
        var reel=adminReels.find(function(item){return item.id===button.getAttribute('data-reel-edit');});
        if(reel)renderAdminForm(reel);
      });
    });
    workspace.querySelectorAll('[data-reel-toggle]').forEach(function(button){
      button.addEventListener('click',function(){
        var reel=adminReels.find(function(item){return item.id===button.getAttribute('data-reel-toggle');});
        if(reel)togglePublish(reel);
      });
    });
    workspace.querySelectorAll('[data-reel-delete]').forEach(function(button){
      button.addEventListener('click',function(){
        var reel=adminReels.find(function(item){return item.id===button.getAttribute('data-reel-delete');});
        if(reel)deleteReel(reel);
      });
    });
  }
  function renderAdminForm(reel){
    var workspace=byId('adminWorkspace');if(!workspace)return;
    var isEdit=!!reel;
    workspace.innerHTML='<div class="admin-top yyc-reel-admin-head"><div><div class="modal-kicker">YYC MEDIA STUDIO</div><h3>'+(isEdit?'Edit REEL':'Add a REEL')+'</h3><p>Fill in a title and choose the video. Publishing makes it visible in the public REEL tab.</p></div><div class="admin-top-actions"><button type="button" class="mini-btn" data-reel-form-cancel>← Back to Reels</button></div></div>'+
      '<form class="yyc-reel-admin-form" id="yycReelAdminForm">'+
      '<div class="yyc-reel-admin-fields">'+
      '<div class="yyc-reel-admin-field"><label for="yycReelTitle">Title *</label><input id="yycReelTitle" name="title" maxlength="140" required value="'+escapeHTML(reel&&reel.title||'')+'" placeholder="YYC Cleanliness Drive 2026"></div>'+
      '<div class="yyc-reel-admin-field"><label for="yycReelCategory">Category</label><select id="yycReelCategory" name="category">'+
      ['Community','Events','Cleanliness Drive','Culture','Sports','Celebrations','Club Edits','Other'].map(function(c){return '<option value="'+escapeHTML(c)+'"'+((reel&&reel.category||'Community')===c?' selected':'')+'>'+escapeHTML(c)+'</option>';}).join('')+
      '</select></div>'+
      '<div class="yyc-reel-admin-field is-full"><label for="yycReelCaption">Caption</label><textarea id="yycReelCaption" name="caption" maxlength="2400" placeholder="Add a short description…">'+escapeHTML(reel&&reel.caption||'')+'</textarea><small>Maximum 2,400 characters.</small></div>'+
      '<div class="yyc-reel-admin-field is-full"><label for="yycReelVideo">Video '+(isEdit?'(optional — choose only to replace)':'*')+'</label><input id="yycReelVideo" name="video" type="file" accept="video/*" '+(isEdit?'':'required')+'><small>Common video formats are accepted, maximum 50 MB. MP4 is recommended for the smoothest playback.</small>'+(isEdit?'<span class="yyc-reel-admin-current">Current video is saved. Leave this blank to keep it.</span>':'')+'</div>'+
      '<div class="yyc-reel-admin-field is-full"><label for="yycReelThumbnail">Thumbnail (optional)</label><input id="yycReelThumbnail" name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG or WebP; maximum 5 MB. A clear 9:16 image looks best.</small>'+(isEdit&&reel.thumbnail_url?'<span class="yyc-reel-admin-current">Current thumbnail is saved. Choose a new file to replace it.</span>':'')+'</div>'+
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
      if(videoFile&&videoFile.size>MAX_VIDEO){if(status)status.textContent='Videos must be 50 MB or smaller. Compress this video and try again.';return;}
      if(thumbFile&&thumbFile.size>MAX_THUMB){if(status)status.textContent='Thumbnails must be 5 MB or smaller.';return;}
      adminBusy=true;if(save){save.disabled=true;save.textContent='Uploading…';}
      if(status)status.textContent='Uploading and saving… Larger videos may take a little longer.';
      var videoUrl=reel&&reel.video_url||'', videoPath=reel&&reel.video_path||'';
      var thumbUrl=reel&&reel.thumbnail_url||'', thumbPath=reel&&reel.thumbnail_path||'';
      try{
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
          p_sort_order:Math.max(0,parseInt(byId('yycReelOrder').value,10)||0)
        };
        var saved=await callRPC('yyc_reels_admin_save',payload);
        if(!saved||saved.ok!==true)throw new Error(saved&&saved.error||'Could not save this REEL.');
        var oldPaths=[];
        if(reel&&videoFile&&reel.video_path&&reel.video_path!==videoPath)oldPaths.push(reel.video_path);
        if(reel&&thumbFile&&reel.thumbnail_path&&reel.thumbnail_path!==thumbPath)oldPaths.push(reel.thumbnail_path);
        if(oldPaths.length)await cleanupPaths(oldPaths);
        adminBusy=false;
        notify(payload.p_status==='published'?'REEL published successfully.':'REEL saved successfully.');
        await loadAdminReels();
        renderAdminList(adminReels);
        loadPublic(true);
      }catch(error){
        await cleanupPaths(newPaths);
        if(status)status.textContent=error.message||'Upload failed. Please try again.';
        notify(error.message||'Could not save the REEL.');
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
        p_status:next,p_sort_order:Number(reel.sort_order)||0
      });
      if(!result||result.ok!==true)throw new Error(result&&result.error||'Could not change REEL visibility.');
      notify(next==='published'?'REEL published.':'REEL unpublished.');
      await loadAdminReels();renderAdminList(adminReels);loadPublic(true);
    }catch(e){notify(e.message||'Could not update REEL.');}
    finally{adminBusy=false;}
  }
  async function deleteReel(reel){
    if(adminBusy)return;
    if(!window.confirm('Delete “'+String(reel.title||'this REEL')+'”? This removes the published card and its uploaded files.'))return;
    adminBusy=true;
    try{
      var result=await callRPC('yyc_reels_admin_delete',{p_token:getAdminToken(),p_id:reel.id});
      if(!result||result.ok!==true)throw new Error(result&&result.error||'Could not delete REEL.');
      var paths=[result.video_path,result.thumbnail_path].filter(Boolean);
      var cleanupError='';
      if(paths.length){try{await callUploadService({action:'delete-files',paths:paths});}catch(e){cleanupError=e.message||'Media cleanup failed.';}}
      notify(cleanupError?'REEL deleted from the site, but a media file may remain in storage.':'REEL and its uploaded media deleted.');
      await loadAdminReels();renderAdminList(adminReels);loadPublic(true);
    }catch(e){notify(e.message||'Could not delete REEL.');}
    finally{adminBusy=false;}
  }

  window.YYCReels={adminPanel:renderAdminPanel,refreshPublic:function(){return loadPublic(true);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindPublic);
  else bindPublic();
})();
