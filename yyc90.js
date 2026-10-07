/* YYC 90-FEATURE PLATFORM PACK
   Additive enhancement layer. Existing app.js remains the source of truth for
   login, ID cards, core content CRUD and current navigation. */
(function(){
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var once={};
  var featureData=null;
  var portalFetchBusy=false;

  function esc90(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function q(s){return document.querySelector(s);}
  function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function toast90(m){
    if(typeof window.toast==='function') window.toast(m);
    else { var t=q('#toast'); if(t){t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2600);} }
  }
  function rpc90(name,args){
    if(typeof window.rpc!=='function') return Promise.reject(new Error('YYC connection is not ready'));
    return window.rpc(name,args||{});
  }
  function open90(html){
    if(typeof window.openModal==='function') return window.openModal(html);
    var c=q('#modalContent'),m=q('#modal');
    if(c)c.innerHTML=html;
    if(m){m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';}
  }
  function close90(force){
    if(typeof window.__yyc90OriginalCloseModal!=='function') return;
    if(force) window.__yyc90AllowClose=true;
    window.__yyc90OriginalCloseModal();
  }

  function download90(filename,text,type){
    var blob=new Blob([text],{type:type||'application/json;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=filename;
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},800);
  }

  function format90Date(v){
    if(!v) return '—';
    var d=new Date(String(v).length===10?String(v)+'T00:00:00':v);
    if(isNaN(d)) return String(v);
    return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  }

  function isPast90(v){
    if(!v) return false;
    var d=new Date(String(v).length===10?String(v)+'T23:59:59':v);
    return !isNaN(d) && d.getTime()<Date.now();
  }

  function slug90(s){
    return String(s||'').toLowerCase().trim().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,180) || ('item-'+Date.now());
  }

  function merge90Public(extra){
    var pd=window.publicData||{};
    pd.settings=Object.assign({},pd.settings||{},extra&&extra.contact?{contact:extra.contact}:{} , extra&&extra.settings?extra.settings:{});
    pd.achievements=(extra&&extra.achievements)||[];
    pd.history=(extra&&extra.history)||[];
    window.publicData=pd;
    return pd;
  }

  async function load90Public(){
    try{
      var r=await rpc90('public_feature_data',{});
      if(r && r.achievements!==undefined) merge90Public(r);
      render90Public();
    }catch(e){
      render90Public();
    }
  }

  function setMeta90(){
    var s=(window.publicData&&window.publicData.settings)||{};
    var title=s.meta_title||'Yuvakesari Youth Club';
    var desc=s.meta_description||'Yuvakesari Youth Club — community, culture, service and youth initiatives.';
    document.title=title;
    function meta(name,content,property){
      var sel=property?'meta[property="'+name+'"]':'meta[name="'+name+'"]';
      var el=q(sel);
      if(!el){el=document.createElement('meta');if(property)el.setAttribute('property',name);else el.setAttribute('name',name);document.head.appendChild(el);}
      el.setAttribute('content',content||'');
    }
    meta('description',desc,false);
    meta('og:title',title,true);meta('og:description',desc,true);meta('og:type','website',true);
    if(s.meta_image) meta('og:image',s.meta_image,true);
    var canonical=q('link[rel="canonical"]');
    if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical);}
    canonical.href=location.href.split('?')[0].split('#')[0];
  }

  function installStructuredData90(){
    var old=q('#yyc90StructuredData'); if(old) old.remove();
    var s=(window.publicData&&window.publicData.settings)||{};
    var events=((window.publicData&&window.publicData.events)||[]).slice(0,20);
    var graph=[{
      '@type':'Organization',
      'name':s.club_name||'Yuvakesari Youth Club',
      'url':location.href.split('#')[0].split('?')[0],
      'description':s.meta_description||'Yuvakesari Youth Club'
    }];
    events.forEach(function(ev){
      if(!ev || !ev.title) return;
      graph.push({'@type':'Event','name':ev.title,'description':ev.description||'','startDate':ev.event_date||undefined,'eventStatus':'https://schema.org/EventScheduled','eventAttendanceMode':'https://schema.org/OfflineEventAttendanceMode','location':{'@type':'Place','name':ev.location||'Yuvakesari Youth Club'}});
    });
    var sEl=document.createElement('script');sEl.type='application/ld+json';sEl.id='yyc90StructuredData';sEl.textContent=JSON.stringify({'@context':'https://schema.org','@graph':graph});
    document.head.appendChild(sEl);
  }

  function installAnnouncement90(){
    var s=(window.publicData&&window.publicData.settings)||{};
    var existing=q('#yyc90Announcement');
    if(!s.announcement_enabled || !String(s.announcement_text||'').trim()){
      if(existing)existing.remove();
      document.documentElement.style.setProperty('--yyc90-ann-height','0px');
      return;
    }
    if(!existing){
      existing=document.createElement('div');existing.id='yyc90Announcement';existing.className='yyc90-announcement';
      var top=q('#topbar');
      if(top) top.insertAdjacentElement('afterend',existing); else document.body.prepend(existing);
    }
    existing.innerHTML='<span class="yyc90-ann-dot"></span><span>'+esc90(s.announcement_text)+'</span>'+
      (s.announcement_link && /^https?:\/\//i.test(s.announcement_link)?'<a href="'+esc90(s.announcement_link)+'" target="_blank" rel="noopener">OPEN ↗</a>':'')+
      '<button type="button" aria-label="Dismiss announcement">×</button>';
    existing.querySelector('button').onclick=function(){existing.classList.add('dismissed');document.documentElement.style.setProperty('--yyc90-ann-height','0px');try{sessionStorage.setItem('yyc90_ann_dismissed','1');}catch(e){}};
    try{if(sessionStorage.getItem('yyc90_ann_dismissed')==='1'){existing.classList.add('dismissed');return;}}catch(e){}
    document.documentElement.style.setProperty('--yyc90-ann-height','44px');
  }

  function installBackTop90(){
    if(q('#yyc90BackTop')) return;
    var b=document.createElement('button');b.id='yyc90BackTop';b.className='yyc90-backtop';b.type='button';b.setAttribute('aria-label','Back to top');b.innerHTML='↑';
    document.body.appendChild(b);
    b.onclick=function(){window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});};
    var ticking=false;
    window.addEventListener('scroll',function(){
      if(ticking)return;ticking=true;requestAnimationFrame(function(){ticking=false;b.classList.toggle('visible',window.scrollY>520);});
    },{passive:true});
  }

  function installSkipLink90(){
    if(q('#yyc90Skip')) return;
    var a=document.createElement('a');a.id='yyc90Skip';a.className='yyc90-skip';a.href='#home';a.textContent='Skip to content';
    document.body.prepend(a);
  }

  function renderImpact90(){
    var pd=window.publicData||{};
    var achievements=pd.achievements||[], history=pd.history||[];
    var host=q('#join');
    var old=q('#yyc90Impact');
    if(!achievements.length && !history.length){if(old)old.remove();return;}
    if(!old){
      old=document.createElement('section');old.id='yyc90Impact';old.className='section yyc90-impact';
      (host?host.parentNode:document.querySelector('main')).insertBefore(old,host||null);
    }
    var ai=achievements.length?achievements.map(function(a){
      return '<article class="yyc90-achievement-card"><div class="yyc90-achievement-media">'+(a.image_url?'<img src="'+esc90(a.image_url)+'" alt="'+esc90(a.title)+'" loading="lazy">':'<span>✦</span>')+'</div><div><span>'+esc90(a.category||'GENERAL')+'</span><h3>'+esc90(a.title)+'</h3><small>'+esc90(format90Date(a.achieved_on))+'</small><p>'+esc90(a.description||'')+'</p></div></article>';
    }).join(''):'<div class="yyc90-empty">No achievements published yet.</div>';
    var hi=history.length?history.map(function(h){
      return '<article class="yyc90-history-item"><div class="yyc90-history-year">'+esc90(h.year_label)+'</div><div class="yyc90-history-line"></div><div><h3>'+esc90(h.title)+'</h3><p>'+esc90(h.body||'')+'</p></div></article>';
    }).join(''):'<div class="yyc90-empty">Club history will appear here.</div>';
    old.innerHTML='<div class="section-kicker">07 / YYC IMPACT</div><div class="section-head tight"><div><h2>Our story. Our milestones.</h2><p>'+(pd.settings&&pd.settings.history_intro?esc90(pd.settings.history_intro):'Achievements and the journey of Yuvakesari Youth Club.')+'</p></div></div>'+
      '<div class="yyc90-impact-grid"><div><div class="yyc90-subhead">ACHIEVEMENTS</div><div class="yyc90-achievement-grid">'+ai+'</div></div><div><div class="yyc90-subhead">TIMELINE</div><div class="yyc90-history-list">'+hi+'</div></div></div>';
    if(window.YYCObserveReveals) window.YYCObserveReveals(old);
  }

  function addVolunteerButton90(){
    var join=q('#join');if(!join||q('#yyc90VolunteerBtn'))return;
    var actions=join.querySelector('.join-card > div + button') || join.querySelector('.join-card .btn');
    var b=document.createElement('button');b.type='button';b.id='yyc90VolunteerBtn';b.className='btn glass';b.innerHTML='VOLUNTEER WITH YYC <span>↗</span>';
    b.onclick=openVolunteer90;
    var wrapper=actions&&actions.parentNode;
    if(wrapper) wrapper.appendChild(b);
  }

  function openVolunteer90(){
    open90('<div class="modal-kicker">JOIN YYC</div><h2 class="modal-title">Volunteer with the club.</h2><p class="modal-sub">Send a volunteer application. The admin team will review it.</p>'+
      '<form id="yyc90VolunteerForm"><div class="form-grid">'+
      '<div class="field"><label>Full name</label><input id="v90Name" required maxlength="120"></div>'+
      '<div class="field"><label>Phone</label><input id="v90Phone" maxlength="40"></div>'+
      '<div class="field"><label>Email</label><input id="v90Email" type="email" maxlength="160"></div>'+
      '<div class="field"><label>Area / locality</label><input id="v90Area" maxlength="120" placeholder="Subrahmanya / Kadaba"></div>'+
      '<div class="field"><label>Skills / interests</label><input id="v90Skills" maxlength="240" placeholder="Sports, events, technical, culture"></div>'+
      '<div class="field"><label>Availability</label><input id="v90Avail" maxlength="120" placeholder="Weekends / Evenings"></div>'+
      '<div class="field full"><label>Message</label><textarea id="v90Message" maxlength="1000" placeholder="Tell YYC how you would like to contribute."></textarea></div>'+
      '</div><div class="form-actions"><button class="btn gold" type="submit">SUBMIT APPLICATION</button></div></form>');
    q('#yyc90VolunteerForm').addEventListener('submit',async function(e){
      e.preventDefault();var b=this.querySelector('button[type="submit"]');b.disabled=true;b.textContent='SUBMITTING…';
      try{
        var r=await rpc90('public_submit_volunteer',{p_payload:{name:q('#v90Name').value.trim(),phone:q('#v90Phone').value.trim(),email:q('#v90Email').value.trim(),area:q('#v90Area').value.trim(),skills:q('#v90Skills').value.trim(),availability:q('#v90Avail').value.trim(),message:q('#v90Message').value.trim()}});
        if(!r||!r.ok)throw new Error(r&&r.error||'Could not submit application');
        close90(true);toast90('Volunteer application submitted');
      }catch(err){b.disabled=false;b.textContent='SUBMIT APPLICATION';toast90(err.message);}
    });
  }

  function openContact90(){
    var s=(window.publicData&&window.publicData.settings)||{};
    open90('<div class="modal-kicker">CONTACT YYC</div><h2 class="modal-title">Send a message.</h2><p class="modal-sub">Use the form below for general enquiries. For urgent matters, use the official contact details shown by YYC.</p>'+
      '<div class="yyc90-contact-strip">'+
      (s.contact_email?'<span>EMAIL<strong>'+esc90(s.contact_email)+'</strong></span>':'')+
      (s.contact_phone?'<span>PHONE<strong>'+esc90(s.contact_phone)+'</strong></span>':'')+
      (s.contact_address?'<span>ADDRESS<strong>'+esc90(s.contact_address)+'</strong></span>':'')+
      '</div>'+
      '<form id="yyc90ContactForm"><div class="form-grid">'+
      '<div class="field"><label>Name</label><input id="c90Name" required maxlength="120"></div>'+
      '<div class="field"><label>Email</label><input id="c90Email" type="email" maxlength="160"></div>'+
      '<div class="field"><label>Phone</label><input id="c90Phone" maxlength="40"></div>'+
      '<div class="field"><label>Subject</label><input id="c90Subject" maxlength="180"></div>'+
      '<div class="field full"><label>Message</label><textarea id="c90Message" required maxlength="2000"></textarea></div>'+
      '</div><div class="form-actions"><button class="btn gold" type="submit">SEND MESSAGE</button></div></form>');
    q('#yyc90ContactForm').addEventListener('submit',async function(e){
      e.preventDefault();var b=this.querySelector('button[type="submit"]');b.disabled=true;b.textContent='SENDING…';
      try{
        var r=await rpc90('public_submit_contact',{p_payload:{name:q('#c90Name').value.trim(),email:q('#c90Email').value.trim(),phone:q('#c90Phone').value.trim(),subject:q('#c90Subject').value.trim(),message:q('#c90Message').value.trim()}});
        if(!r||!r.ok)throw new Error(r&&r.error||'Could not send message');
        close90(true);toast90('Message sent to YYC');
      }catch(err){b.disabled=false;b.textContent='SEND MESSAGE';toast90(err.message);}
    });
  }

  function addContactButton90(){
    if(q('#yyc90ContactBtn'))return;
    var f=q('.footer-social');
    if(!f)return;
    var b=document.createElement('button');b.type='button';b.id='yyc90ContactBtn';b.className='yyc90-footer-contact';b.textContent='Quick Contact';b.onclick=openContact90;
    f.appendChild(b);
  }

  function decorateEvents90(){
    var grid=q('#eventsGrid'),pd=window.publicData||{},events=pd.events||[];
    if(!grid)return;
    var cards=qa('#eventsGrid .event-card');
    var currentDateFilter=grid.getAttribute('data-yyc90-event-filter')||'all';
    cards.forEach(function(card,i){
      var ev=events[i];if(!ev)return;
      card.setAttribute('data-yyc90-event-id',ev.id||String(i));
      card.classList.toggle('yyc90-event-past',isPast90(ev.event_date));
      var badge=card.querySelector('.yyc90-countdown');
      if(!badge){
        badge=document.createElement('div');badge.className='yyc90-countdown';card.querySelector('.event-card-body')?.appendChild(badge);
      }
      var label='';
      if(ev.status==='cancelled') label='CANCELLED';
      else if(ev.status==='postponed') label='POSTPONED';
      else if(isPast90(ev.event_date)) label='EVENT ENDED';
      else if(ev.event_date){
        var d=new Date(ev.event_date+'T09:00:00'),diff=Math.max(0,d.getTime()-Date.now()),days=Math.floor(diff/86400000);
        label=days>0?('IN '+days+' DAY'+(days===1?'':'S')):'TODAY';
      }else label='DATE TBC';
      badge.textContent=label;
      var show=currentDateFilter==='all' || (currentDateFilter==='past'&&isPast90(ev.event_date)) || (currentDateFilter==='upcoming'&&!isPast90(ev.event_date));
      card.style.display=show?'':'none';
    });
  }

  function addEventFilter90(){
    var section=q('#events');if(!section||q('#yyc90EventFilters'))return;
    var head=section.querySelector('.section-head');if(!head)return;
    var wrap=document.createElement('div');wrap.id='yyc90EventFilters';wrap.className='yyc90-filter-row';
    wrap.innerHTML='<button type="button" class="yyc90-filter active" data-event-filter="all">ALL</button><button type="button" class="yyc90-filter" data-event-filter="upcoming">UPCOMING</button><button type="button" class="yyc90-filter" data-event-filter="past">PAST EVENTS</button>';
    head.appendChild(wrap);
    wrap.addEventListener('click',function(e){
      var b=e.target.closest('[data-event-filter]');if(!b)return;
      qa('#yyc90EventFilters .yyc90-filter').forEach(function(x){x.classList.toggle('active',x===b);});
      var grid=q('#eventsGrid');if(grid)grid.setAttribute('data-yyc90-event-filter',b.getAttribute('data-event-filter'));
      decorateEvents90();
    });
  }

  function addGalleryFilters90(){
    var section=q('#gallery'),grid=q('#galleryGrid'),pd=window.publicData||{},items=pd.gallery||[];
    if(!section||!grid||!items.length)return;
    var albums=[],seen={};
    items.forEach(function(g,i){var album=g.album||'GENERAL';if(!seen[album]){seen[album]=1;albums.push(album);}var card=grid.children[i];if(card&&card.classList.contains('gallery-card'))card.setAttribute('data-yyc90-album',album);});
    var old=q('#yyc90GalleryFilters');if(old)old.remove();
    var wrap=document.createElement('div');wrap.id='yyc90GalleryFilters';wrap.className='yyc90-filter-row';
    wrap.innerHTML='<button type="button" class="yyc90-filter active" data-album="*">ALL</button>'+albums.map(function(a){return '<button type="button" class="yyc90-filter" data-album="'+esc90(a)+'">'+esc90(a)+'</button>';}).join('');
    var head=section.querySelector('.section-head');if(head)head.appendChild(wrap);
    wrap.addEventListener('click',function(e){
      var b=e.target.closest('[data-album]');if(!b)return;
      qa('#yyc90GalleryFilters .yyc90-filter').forEach(function(x){x.classList.toggle('active',x===b);});
      var a=b.getAttribute('data-album');
      qa('#galleryGrid .gallery-card').forEach(function(card){card.style.display=(a==='*'||card.getAttribute('data-yyc90-album')===a)?'':'none';});
    });
  }

  function render90Public(){
    setMeta90();installStructuredData90();installAnnouncement90();installBackTop90();installSkipLink90();
    renderImpact90();addVolunteerButton90();addContactButton90();addEventFilter90();decorateEvents90();addGalleryFilters90();
  }

  function recordView90(){
    var key='yyc90_view_'+location.pathname+location.search;
    try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch(e){}
    rpc90('public_record_page_view',{p_payload:{path:location.pathname,referrer:document.referrer||'',device:window.innerWidth<700?'mobile':(window.innerWidth<1100?'tablet':'desktop')}}).catch(function(){});
  }

  function profileCompletion90(){
    if(portalFetchBusy)return;
    var modal=q('#modal');if(!modal||!modal.classList.contains('open'))return;
    var memberBtn=q('#memberEditProfileBtn'),leaderBtn=q('#leaderEditProfileBtn');
    if(!memberBtn&&!leaderBtn)return;
    var kind=memberBtn?'member':'leader';
    var token=kind==='member'?window.memberToken:window.leaderToken;
    if(!token)return;
    var meterKey='yyc90_profile_meter_'+kind;
    if(modal.getAttribute('data-yyc90-profile-meter')===meterKey)return;
    modal.setAttribute('data-yyc90-profile-meter',meterKey);
    portalFetchBusy=true;
    rpc90(kind==='member'?'member_me':'leader_me',{p_token:token}).then(function(r){
      portalFetchBusy=false;
      var d=r&&(r.member||r.leader);if(!d)return;
      var fields=kind==='member'?['name','dob','phone','email','photo_url']:['name','dob','phone','email','photo_url','role'];
      var done=fields.filter(function(k){return String(d[k]||'').trim()!=='';}).length,pct=Math.round(done/fields.length*100);
      var host=memberBtn.parentNode&&memberBtn.parentNode.parentNode?memberBtn.parentNode.parentNode:null;
      if(!host||q('#yyc90ProfileMeter'))return;
      var meter=document.createElement('div');meter.id='yyc90ProfileMeter';meter.className='yyc90-profile-meter';
      meter.innerHTML='<div><b>PROFILE COMPLETION</b><strong>'+pct+'%</strong></div><div class="yyc90-meter-track"><span style="width:'+pct+'%"></span></div>';
      host.parentNode.insertBefore(meter,host);
    }).catch(function(){portalFetchBusy=false;});
  }

  function wrapCloseModal90(){
    if(typeof window.closeModal!=='function'||window.__yyc90OriginalCloseModal)return;
    window.__yyc90OriginalCloseModal=window.closeModal;
    window.__yyc90AllowClose=false;
    window.closeModal=function(){
      var dirty=q('#modal form[data-yyc90-dirty="1"]');
      if(dirty&&!window.__yyc90AllowClose){
        if(!confirm('You have unsaved changes. Close without saving?'))return;
      }
      window.__yyc90AllowClose=false;
      window.__yyc90OriginalCloseModal();
    };
  }

  function markForms90(){
    qa('#modal form').forEach(function(form){
      if(form.getAttribute('data-yyc90-bound')==='1')return;
      form.setAttribute('data-yyc90-bound','1');
      form.setAttribute('data-yyc90-dirty','0');
      var handler=function(){form.setAttribute('data-yyc90-dirty','1');};
      form.addEventListener('input',handler);form.addEventListener('change',handler);
      form.addEventListener('submit',function(){form.setAttribute('data-yyc90-dirty','0');window.__yyc90AllowClose=true;},true);
    });
  }

  function duplicateWarning90(form){
    var data=window.__yycAdminLastData||window.adminData||{};
    var fields=[];
    if(form.id==='adminMemberForm') fields=[q('#amName'),q('#amEmail')];
    if(form.id==='adminLeaderForm') fields=[q('#alName'),q('#alEmail')];
    if(form.id==='adminUpdateForm') fields=[q('#auTitle')];
    if(form.id==='adminGalleryForm') fields=[q('#agTitle')];
    if(form.id==='adminSwagForm') fields=[q('#swName')];
    if(!fields.length)return;
    var name=fields[0]&&fields[0].value.trim().toLowerCase(),email=fields[1]&&fields[1].value.trim().toLowerCase();
    var arr=form.id==='adminMemberForm'?data.members:form.id==='adminLeaderForm'?data.leaders:form.id==='adminUpdateForm'?data.updates:form.id==='adminGalleryForm'?data.gallery:data.swags;
    if(!arr)return;
    var hit=arr.some(function(x){
      var xn=String(x.name||x.title||'').toLowerCase(),xe=String(x.email||'').toLowerCase();
      return (name && xn===name) || (email && xe===email);
    });
    var old=form.querySelector('.yyc90-duplicate-warning');
    if(hit&&!old){
      old=document.createElement('div');old.className='yyc90-duplicate-warning';old.textContent='Possible duplicate detected. Review the existing record before saving.';
      form.prepend(old);
    }else if(!hit&&old)old.remove();
  }

  function addPreviewButton90(form){
    if(!form||form.getAttribute('data-yyc90-preview')==='1')return;
    if(!/admin(Event|Update|Gallery|Swag|Achievement|History)Form/.test(form.id))return;
    var actions=form.querySelector('.form-actions');if(!actions)return;
    var b=document.createElement('button');b.type='button';b.className='btn glass yyc90-preview-btn';b.textContent='PREVIEW';
    b.onclick=function(){previewForm90(form);};actions.insertBefore(b,actions.firstChild);
    form.setAttribute('data-yyc90-preview','1');
  }

  function previewForm90(form){
    var id=form.id, title='', body='', img='', meta='';
    if(id==='adminEventForm'){title=q('#aeTitle')?.value||'Event preview';body=q('#aeDesc')?.value||'';img=q('#aeImage')?.value||'';meta=(q('#aeDate')?.value||'')+' · '+(q('#aeLocation')?.value||'');}
    if(id==='adminUpdateForm'){title=q('#auTitle')?.value||'Update preview';body=q('#auBody')?.value||'';img=(q('#auExternal')?.value||'');meta=q('#auDate')?.value||'';}
    if(id==='adminGalleryForm'){title=q('#agTitle')?.value||'Gallery preview';body=q('#agCaption')?.value||'';img=q('#agPrev')?.src||'';meta=q('#agAlbum')?.value||'GENERAL';}
    if(id==='adminSwagForm'){title=q('#swName')?.value||'Swag preview';body=q('#swDescription')?.value||'';img=q('#swPrev')?.src||'';meta=q('#swCategory')?.value||'';}
    if(!title&&form.id==='adminAchievementForm'){title=q('#a90Title')?.value||'Achievement preview';body=q('#a90Description')?.value||'';img=q('#a90Image')?.value||'';meta=q('#a90Date')?.value||'';}
    if(!title&&form.id==='adminHistoryForm'){title=q('#h90Title')?.value||'History preview';body=q('#h90Body')?.value||'';meta=q('#h90Year')?.value||'';}
    open90('<div class="modal-kicker">ADMIN PREVIEW LAB</div><div class="yyc90-preview-toggle"><button type="button" class="yyc90-device active" data-dev="desktop">DESKTOP</button><button type="button" class="yyc90-device" data-dev="mobile">MOBILE</button></div>'+
      '<div id="yyc90PreviewFrame" class="yyc90-preview-frame"><article class="yyc90-content-preview"><div class="yyc90-preview-media">'+(img?'<img src="'+esc90(img)+'" alt="">':'<span>YYC</span>')+'</div><div class="yyc90-preview-copy"><span>'+esc90(meta)+'</span><h3>'+esc90(title)+'</h3><p>'+esc90(body)+'</p></div></article></div>');
    qa('.yyc90-device').forEach(function(b){b.onclick=function(){qa('.yyc90-device').forEach(function(x){x.classList.toggle('active',x===b);});q('#yyc90PreviewFrame').classList.toggle('mobile',b.getAttribute('data-dev')==='mobile');};});
  }

  function admin90Data(){
    if(featureData)return Promise.resolve(featureData);
    return rpc90('admin_feature_data',{p_token:window.adminToken}).then(function(r){
      if(!r||!r.ok)throw new Error(r&&r.error||'Unable to load YYC feature data');
      featureData=r;return r;
    });
  }

  function renderCustomAdminTabs90(){
    var tabs=q('.admin-tabs');if(!tabs||q('[data-yyc90-tab="volunteers"]'))return;
    [
      ['volunteers','Volunteers'],['achievements','Achievements'],['history','History'],
      ['attendance','Attendance'],['finance','Finance'],['messages','Messages'],
      ['analytics','Analytics'],['backup','Backup'],['sitepro','Site Pro']
    ].forEach(function(t){
      var b=document.createElement('button');b.type='button';b.className='admin-tab yyc90-admin-tab';b.setAttribute('data-yyc90-tab',t[0]);b.textContent=t[1];tabs.appendChild(b);
    });
  }

  function adminHeader90(tabName){
    return '<div class="admin-top"><div><div class="modal-kicker">YYC 90-FEATURE PLATFORM</div><h2 class="modal-title">'+esc90(tabName)+'</h2></div><div class="admin-top-actions"><button class="mini-btn" data-yyc90-back>← BACK TO ADMIN</button></div></div>';
  }

  function renderVolunteers90(d){
    var rows=d.volunteers||[];
    return adminHeader90('Volunteers')+'<div class="admin-toolbar"><input id="v90Search" class="admin-search" placeholder="Search volunteer, area or skill"><select id="v90Status"><option value="">All status</option><option>pending</option><option>approved</option><option>denied</option><option>archived</option></select><span class="admin-result-count" id="v90Count"></span></div>'+
      '<div class="admin-card-list">'+(rows.length?rows.map(function(v){return '<div class="approval-card yyc90-volunteer-row" data-status="'+esc90(v.status)+'"><div class="meta"><strong>'+esc90(v.name)+'</strong><small>'+esc90(v.area||'Area not set')+' · '+esc90(v.skills||'')+'</small><small>'+esc90(v.email||'')+' · '+esc90(v.phone||'')+'</small><small>'+esc90(v.availability||'')+'</small><p>'+esc90(v.message||'')+'</p></div><div class="admin-actions">'+(v.status==='pending'?'<button class="mini-btn gold" data-v90-action="approve" data-v90-id="'+v.id+'">Approve</button><button class="mini-btn" data-v90-action="deny" data-v90-id="'+v.id+'">Deny</button>':'<button class="mini-btn" data-v90-action="pending" data-v90-id="'+v.id+'">Set Pending</button>')+'<button class="mini-btn" data-v90-action="archive" data-v90-id="'+v.id+'">Archive</button></div></div>';}).join(''):'<div class="empty">No volunteer applications yet.</div>')+'</div>';
  }

  function renderAchievements90(d){
    var rows=d.achievements||[];
    return adminHeader90('Achievements')+'<div class="admin-top-actions" style="justify-content:flex-start;margin-bottom:12px"><button class="mini-btn gold" id="a90Add">+ Add achievement</button></div><div class="admin-card-list">'+(rows.length?rows.map(function(a){return '<div class="approval-card"><div class="meta"><strong>'+esc90(a.title)+'</strong><small>'+esc90(a.category||'GENERAL')+' · '+esc90(a.status||'published')+' · '+esc90(format90Date(a.achieved_on))+'</small><p>'+esc90(a.description||'')+'</p></div><div class="admin-actions"><button class="mini-btn gold" data-a90-edit="'+a.id+'">Edit</button><button class="mini-btn" data-a90-del="'+a.id+'">Delete</button></div></div>';}).join(''):'<div class="empty">No achievements yet.</div>')+'</div>';
  }

  function renderHistory90(d){
    var rows=d.history||[];
    return adminHeader90('YYC History')+'<div class="admin-top-actions" style="justify-content:flex-start;margin-bottom:12px"><button class="mini-btn gold" id="h90Add">+ Add history item</button></div><div class="admin-card-list">'+(rows.length?rows.map(function(h){return '<div class="approval-card"><div class="meta"><strong>'+esc90(h.year_label)+' · '+esc90(h.title)+'</strong><small>'+esc90(h.status||'published')+'</small><p>'+esc90(h.body||'')+'</p></div><div class="admin-actions"><button class="mini-btn gold" data-h90-edit="'+h.id+'">Edit</button><button class="mini-btn" data-h90-del="'+h.id+'">Delete</button></div></div>';}).join(''):'<div class="empty">No history items yet.</div>')+'</div>';
  }

  function renderAttendance90(d){
    var events=(window.__yycAdminLastData||{}).events||[];
    return adminHeader90('Attendance')+
      '<div class="form-grid">'+
        '<div class="field"><label>Event</label><select id="at90Event">'+
          (events.length?events.map(function(e){return '<option value="'+e.id+'">'+esc90(e.title)+' · '+esc90(e.event_date||'')+'</option>';}).join(''):'<option value="">No events</option>')+
        '</select></div>'+
        '<div class="field"><label>Search</label><input id="at90MemberSearch" placeholder="Name or role number"></div>'+
      '</div>'+
      '<div class="yyc90-attendance-mode" role="tablist" aria-label="Attendance type">'+
        '<button type="button" class="yyc90-filter active" data-at90-kind="member">MEMBERS</button>'+
        '<button type="button" class="yyc90-filter" data-at90-kind="leader">LEADERS</button>'+
      '</div>'+
      '<div id="at90Rows" class="yyc90-attendance-list"></div>';
  }

  function renderAttendanceRows90(d){
    var adminData=window.__yycAdminLastData||{};
    var events=adminData.events||[];
    var members=adminData.members||[];
    var leaders=adminData.leaders||[];
    var att=d.attendance||[];
    var eId=q('#at90Event')?.value || (events[0]&&events[0].id) || '';
    var kind=q('[data-at90-kind].active')?.getAttribute('data-at90-kind') || 'member';
    var search=(q('#at90MemberSearch')?.value||'').toLowerCase();
    var rows=(kind==='leader'?leaders:members).filter(function(p){
      return !search ||
        String(p.name||'').toLowerCase().indexOf(search)>=0 ||
        String(p.role_number||p.role||'').toLowerCase().indexOf(search)>=0;
    });
    q('#at90Rows').innerHTML=rows.length?rows.map(function(p){
      var a=att.find(function(x){
        var matchesTarget=kind==='leader'
          ? String(x.leader_id)===String(p.id)
          : String(x.member_id)===String(p.id);
        return matchesTarget && String(x.event_id)===String(eId);
      });
      var attr=kind==='leader'?'data-at90-leader':'data-at90-member';
      var role=kind==='leader'?(p.role_number||p.role||'LEADER'):(p.role_number||'PENDING');
      return '<div class="yyc90-attendance-row"><div><strong>'+esc90(p.name)+'</strong><small>'+esc90(role)+'</small></div><label><input type="checkbox" '+attr+'="'+p.id+'" '+(a&&a.present?'checked':'')+'> Present</label></div>';
    }).join(''):'<div class="empty">No matching '+(kind==='leader'?'leaders':'members')+'.</div>';

    if(!q('#at90Save')){
      var b=document.createElement('button');
      b.id='at90Save';b.className='btn gold';b.type='button';b.textContent='SAVE ATTENDANCE';
      b.onclick=function(){
        var eventId=q('#at90Event').value;
        var activeKind=q('[data-at90-kind].active')?.getAttribute('data-at90-kind')||'member';
        var checks=qa(activeKind==='leader'?'[data-at90-leader]':'[data-at90-member]');
        var newlyPresent=checks.filter(function(c){
          if(!c.checked)return false;
          var id=c.getAttribute(activeKind==='leader'?'data-at90-leader':'data-at90-member');
          var prior=att.find(function(x){
            var matchesTarget=activeKind==='leader'
              ? String(x.leader_id)===String(id)
              : String(x.member_id)===String(id);
            return matchesTarget && String(x.event_id)===String(eventId);
          });
          return !(prior&&prior.present);
        });

        var promises=checks.map(function(c){
          var id=c.getAttribute(activeKind==='leader'?'data-at90-leader':'data-at90-member');
          if(activeKind==='leader'){
            return rpc90('admin_record_leader_attendance',{
              p_token:window.adminToken,
              p_leader_id:id,
              p_event_id:eventId,
              p_present:c.checked
            });
          }
          return rpc90('admin_record_attendance',{
            p_token:window.adminToken,
            p_member_id:id,
            p_event_id:eventId,
            p_present:c.checked
          });
        });

        Promise.all(promises).then(function(rs){
          var bad=rs.find(function(r){return !r||r.ok===false;});
          if(bad)throw new Error(bad.error||'Unable to save attendance');
          if(!newlyPresent.length){
            toast90('Attendance saved');
            return;
          }
          if(typeof window.yycSendExternalAlert!=='function'){
            toast90('Attendance saved. Email service is not ready.');
            return;
          }
          return Promise.all(newlyPresent.map(function(c){
            var id=c.getAttribute(activeKind==='leader'?'data-at90-leader':'data-at90-member');
            return window.yycSendExternalAlert({
              event:'attendance',
              admin_token:window.adminToken,
              target_kind:activeKind,
              target_id:id,
              event_id:eventId,
              channels:['email']
            });
          })).then(function(results){
            var who=activeKind==='leader'?'leader':'member';
            var sent=results.filter(function(result){
              return !!(result&&result.ok&&result.delivery&&result.delivery.attendance&&result.delivery.attendance.email&&result.delivery.attendance.email.status==='sent');
            }).length;
            var failed=results.length-sent;
            if(sent&&failed) toast90('Attendance saved · '+sent+' '+who+' attendance emails sent · some failed');
            else if(sent===results.length) toast90('Attendance saved · '+sent+' '+who+' attendance emails sent ✓');
            else if(sent) toast90('Attendance saved · '+sent+' '+who+' attendance emails sent · some failed');
            else toast90('Attendance saved · attendance emails could not be sent');
          });
        }).then(function(){return admin90Data(true);}).then(function(){renderCustomAdminTab90('attendance');}).catch(function(e){toast90(e.message);});
      };
      q('#at90Rows').parentNode.appendChild(b);
    }
  }

  function admin90Data(refresh){
    if(refresh)featureData=null;
    return admin90DataCache();
  }
  function admin90DataCache(){
    if(featureData)return Promise.resolve(featureData);
    return rpc90('admin_feature_data',{p_token:window.adminToken}).then(function(r){if(!r||!r.ok)throw new Error(r&&r.error||'Unauthorized');featureData=r;return r;});
  }

  function renderCustomAdminTab90(tab){
    if(tab==='mediaaudit'){renderMediaAudit90f();return;}
    if(tab==='sitepro'){
      var s=(window.__yycAdminLastData||{}).settings||{};
      q('#adminWorkspace').innerHTML=renderSitePro90(s);q('#spAnn').value=String(!!s.announcement_enabled);q('#spMaint').value=String(!!s.maintenance_mode);
      q('#yyc90SiteProForm').addEventListener('submit',async function(e){
        e.preventDefault();var b=this.querySelector('button[type="submit"]');b.disabled=true;
        try{var r=await rpc90('admin_save_settings',{p_token:window.adminToken,p_payload:{
          announcement_enabled:q('#spAnn').value==='true',announcement_text:q('#spAnnText').value.trim(),announcement_link:q('#spAnnLink').value.trim(),
          contact_email:q('#spEmail').value.trim(),contact_phone:q('#spPhone').value.trim(),contact_address:q('#spAddress').value.trim(),
          meta_title:q('#spMetaTitle').value.trim(),meta_description:q('#spMetaDesc').value.trim(),meta_image:q('#spMetaImage').value.trim(),
          history_intro:q('#spHistoryIntro').value.trim(),maintenance_mode:q('#spMaint').value==='true'
        }});if(!r.ok)throw new Error(r.error||'Unable to save');toast90('Site Pro settings saved');featureData=null;if(typeof window.loadPublic==='function')window.loadPublic();admin90Open('sitepro',true);}
        catch(err){toast90(err.message);b.disabled=false;}
      });
      return;
    }
    admin90DataCache().then(function(d){
      var workspace=q('#adminWorkspace');if(!workspace)return;
      if(tab==='volunteers')workspace.innerHTML=renderVolunteers90(d);
      if(tab==='achievements')workspace.innerHTML=renderAchievements90(d);
      if(tab==='history')workspace.innerHTML=renderHistory90(d);
      if(tab==='attendance'){
        workspace.innerHTML=renderAttendance90(d);
        renderAttendanceRows90(d);
        q('#at90Event').addEventListener('change',function(){renderAttendanceRows90(d);});
        q('#at90MemberSearch').addEventListener('input',function(){renderAttendanceRows90(d);});
        qa('[data-at90-kind]').forEach(function(btn){
          btn.addEventListener('click',function(){
            qa('[data-at90-kind]').forEach(function(x){x.classList.toggle('active',x===btn);});
            renderAttendanceRows90(d);
          });
        });
      }
      if(tab==='finance')workspace.innerHTML=renderFinance90(d);
      if(tab==='messages')workspace.innerHTML=renderMessages90(d);
      if(tab==='analytics')workspace.innerHTML=renderAnalytics90();
      if(tab==='backup')workspace.innerHTML=renderBackup90();
      bindCustomAdmin90(tab,d);
    }).catch(function(e){var w=q('#adminWorkspace');if(w)w.innerHTML=adminHeader90('YYC 90')+'<div class="notice">'+esc90(e.message)+'</div>';});
  }

  function admin90Open(tab,refresh){
    if(refresh)featureData=null;
    renderCustomAdminTab90(tab);
    qa('[data-yyc90-tab]').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-yyc90-tab')===tab);});
    qa('.admin-tab:not([data-yyc90-tab])').forEach(function(b){if(b.classList.contains('active'))b.classList.remove('active');});
  }

  function bindCustomAdmin90(tab,d){
    var w=q('#adminWorkspace');if(!w)return;
    var back=w.querySelector('[data-yyc90-back]');if(back)back.onclick=function(){if(typeof window.adminPanel==='function')window.adminPanel('overview',true);};
    if(tab==='volunteers'){
      var filter=function(){var qv=(q('#v90Search').value||'').toLowerCase(),st=q('#v90Status').value,rows=qa('.yyc90-volunteer-row'),n=0;rows.forEach(function(r){var hit=(!qv||r.textContent.toLowerCase().indexOf(qv)>=0)&&(!st||r.getAttribute('data-status')===st);r.style.display=hit?'':'none';if(hit)n++;});q('#v90Count').textContent=n+' of '+rows.length+' shown';};
      q('#v90Search').addEventListener('input',filter);q('#v90Status').addEventListener('change',filter);filter();
    }
    if(tab==='analytics'){
      rpc90('admin_analytics',{p_token:window.adminToken}).then(function(a){
        var box=q('#yyc90AnalyticsBox');if(!box)return;
        if(!a||!a.ok)throw new Error(a&&a.error||'Unable to load analytics');
        var bars=(a.top_paths||[]).map(function(x){var max=Math.max.apply(null,(a.top_paths||[]).map(function(z){return Number(z.views)||0;}))||1;return '<div class="yyc90-bar-row"><span>'+esc90(x.path)+'</span><div><i style="width:'+Math.round((x.views/max)*100)+'%"></i></div><b>'+esc90(x.views)+'</b></div>';}).join('');
        box.innerHTML='<div class="yyc90-metric-grid"><div><b>'+esc90(a.days_7)+'</b><span>7 DAY VIEWS</span></div><div><b>'+esc90(a.days_30)+'</b><span>30 DAY VIEWS</span></div><div><b>'+esc90(a.volunteer_pending)+'</b><span>PENDING VOLUNTEERS</span></div><div><b>'+esc90(a.messages_new)+'</b><span>NEW MESSAGES</span></div></div><h3 class="yyc90-small-heading">TOP PAGES · 30 DAYS</h3>'+(bars||'<div class="empty">No page-view data yet.</div>');
      }).catch(function(e){var box=q('#yyc90AnalyticsBox');if(box)box.innerHTML='<div class="notice">'+esc90(e.message)+'</div>';});
    }
    if(tab==='backup'){
      q('#yyc90BackupBtn').onclick=async function(){this.disabled=true;try{var r=await rpc90('admin_backup_snapshot',{p_token:window.adminToken});if(!r||!r.ok)throw new Error(r&&r.error||'Backup failed');download90('yyc-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(r,null,2));toast90('Backup snapshot downloaded');}catch(e){toast90(e.message);}finally{this.disabled=false;}};
      q('#yyc90DataExportBtn').onclick=function(){download90('yyc-feature-data-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(d,null,2));toast90('Feature data exported');};
      q('#yyc90HealthTitle').textContent='READY';q('#yyc90HealthText').textContent='Database feature layer is responding.';
    }
    if(tab==='finance'){
      q('#f90Add').onclick=function(){financeForm90(null);};
      qa('[data-f90-edit]').forEach(function(b){b.onclick=function(){financeForm90(b.getAttribute('data-f90-edit'));};});
      qa('[data-f90-del]').forEach(function(b){b.onclick=function(){if(!confirm('Delete finance entry?'))return;rpc90('admin_finance_delete',{p_token:window.adminToken,p_id:b.getAttribute('data-f90-del')}).then(function(){featureData=null;admin90Open('finance',true);toast90('Finance entry deleted');}).catch(function(e){toast90(e.message);});};});
      q('#f90Export').onclick=function(){var rows=[['Date','Description','Type','Amount']].concat((d.finance||[]).map(function(f){return [f.entry_date,f.description,f.entry_type,f.amount];}));var csv=rows.map(function(r){return r.map(function(x){var s=String(x==null?'':x).replace(/"/g,'""');return '"'+s+'"';}).join(',');}).join('\n');download90('yyc-finance.csv',csv,'text/csv;charset=utf-8');};
    }
    if(tab==='messages'){
      var filter=function(){var st=q('#c90StatusFilter').value,rows=qa('.yyc90-message-row'),n=0;rows.forEach(function(r){var hit=!st||r.getAttribute('data-status')===st;r.style.display=hit?'':'none';if(hit)n++;});q('#c90Count').textContent=n+' of '+rows.length+' shown';};
      q('#c90StatusFilter').addEventListener('change',filter);filter();
      qa('[data-c90-action]').forEach(function(sel){sel.onchange=function(){var id=sel.getAttribute('data-c90-action'),action=sel.value;rpc90('admin_contact_action',{p_token:window.adminToken,p_id:id,p_action:action}).then(function(r){if(!r||!r.ok)throw new Error(r&&r.error||'Unable to update');toast90('Message updated');featureData=null;admin90Open('messages',true);}).catch(function(e){toast90(e.message);});};});
    }
    if(tab==='achievements'){
      q('#a90Add').onclick=function(){achievementForm90(null);};
      qa('[data-a90-edit]').forEach(function(b){b.onclick=function(){achievementForm90(b.getAttribute('data-a90-edit'));};});
      qa('[data-a90-del]').forEach(function(b){b.onclick=function(){if(!confirm('Delete achievement?'))return;rpc90('admin_delete_achievement',{p_token:window.adminToken,p_id:b.getAttribute('data-a90-del')}).then(function(r){if(!r.ok)throw new Error(r.error||'Failed');featureData=null;admin90Open('achievements',true);toast90('Achievement deleted');}).catch(function(e){toast90(e.message);});};});
    }
    if(tab==='history'){
      q('#h90Add').onclick=function(){historyForm90(null);};
      qa('[data-h90-edit]').forEach(function(b){b.onclick=function(){historyForm90(b.getAttribute('data-h90-edit'));};});
      qa('[data-h90-del]').forEach(function(b){b.onclick=function(){if(!confirm('Delete history item?'))return;rpc90('admin_delete_history',{p_token:window.adminToken,p_id:b.getAttribute('data-h90-del')}).then(function(r){if(!r.ok)throw new Error(r.error||'Failed');featureData=null;admin90Open('history',true);toast90('History item deleted');}).catch(function(e){toast90(e.message);});};});
    }
  }

  function achievementForm90(id){
    var ex=(featureData.achievements||[]).find(function(x){return String(x.id)===String(id);})||{title:'',description:'',image_url:'',achieved_on:'',status:'published',featured:false,category:'GENERAL',publish_at:'',slug:'',sort_order:0};
    open90('<div class="modal-kicker">ADMIN · ACHIEVEMENTS</div><div class="admin-form-top"><button type="button" class="mini-btn" id="a90Back">← Achievements</button></div><h2 class="modal-title">'+(id?'Edit':'Add')+' Achievement</h2><form id="adminAchievementForm"><div class="form-grid"><div class="field"><label>Title</label><input id="a90Title" value="'+esc90(ex.title)+'" required></div><div class="field"><label>Achieved on</label><input id="a90Date" type="date" value="'+esc90(ex.achieved_on||'')+'"></div><div class="field"><label>Category</label><input id="a90Category" value="'+esc90(ex.category||'GENERAL')+'"></div><div class="field"><label>Status</label><select id="a90Status"><option>published</option><option>draft</option><option>hidden</option></select></div><div class="field"><label>Publish at</label><input id="a90Publish" type="datetime-local"></div><div class="field"><label>Display order</label><input id="a90Sort" type="number" value="'+esc90(ex.sort_order||0)+'"></div><div class="field"><label><input id="a90Featured" type="checkbox" '+(ex.featured?'checked':'')+'> Featured</label></div><div class="field"><label>Slug</label><input id="a90Slug" value="'+esc90(ex.slug||'')+'"></div><div class="field full"><label>Image URL</label><input id="a90Image" value="'+esc90(ex.image_url||'')+'"></div><div class="field full"><label>Description</label><textarea id="a90Description">'+esc90(ex.description||'')+'</textarea></div></div><div class="form-actions"><button type="submit" class="btn gold">SAVE ACHIEVEMENT</button></div></form>');
    q('#a90Status').value=ex.status||'published';q('#a90Slug').value=ex.slug||slug90(ex.title);
    q('#a90Back').onclick=function(){admin90Open('achievements',true);};
    q('#adminAchievementForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc90('admin_upsert_achievement',{p_token:window.adminToken,p_id:id||null,p_payload:{title:q('#a90Title').value.trim(),description:q('#a90Description').value.trim(),image_url:q('#a90Image').value.trim(),achieved_on:q('#a90Date').value,status:q('#a90Status').value,featured:q('#a90Featured').checked,category:q('#a90Category').value.trim(),publish_at:q('#a90Publish').value?new Date(q('#a90Publish').value).toISOString():null,slug:q('#a90Slug').value.trim()||slug90(q('#a90Title').value),sort_order:Number(q('#a90Sort').value||0)}});if(!r.ok)throw new Error(r.error||'Failed');featureData=null;toast90('Achievement saved');admin90Open('achievements',true);}catch(err){toast90(err.message);}});
  }

  function historyForm90(id){
    var ex=(featureData.history||[]).find(function(x){return String(x.id)===String(id);})||{year_label:'2025',title:'',body:'',image_url:'',status:'published',sort_order:0};
    open90('<div class="modal-kicker">ADMIN · HISTORY</div><div class="admin-form-top"><button type="button" class="mini-btn" id="h90Back">← History</button></div><h2 class="modal-title">'+(id?'Edit':'Add')+' History Item</h2><form id="adminHistoryForm"><div class="form-grid"><div class="field"><label>Year / period</label><input id="h90Year" value="'+esc90(ex.year_label)+'" required></div><div class="field"><label>Display order</label><input id="h90Sort" type="number" value="'+esc90(ex.sort_order||0)+'"></div><div class="field full"><label>Title</label><input id="h90Title" value="'+esc90(ex.title)+'" required></div><div class="field full"><label>Body</label><textarea id="h90Body">'+esc90(ex.body||'')+'</textarea></div><div class="field full"><label>Image URL</label><input id="h90Image" value="'+esc90(ex.image_url||'')+'"></div><div class="field"><label>Status</label><select id="h90Status"><option>published</option><option>draft</option><option>hidden</option></select></div></div><div class="form-actions"><button type="submit" class="btn gold">SAVE HISTORY</button></div></form>');
    q('#h90Status').value=ex.status||'published';q('#h90Back').onclick=function(){admin90Open('history',true);};
    q('#adminHistoryForm').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc90('admin_upsert_history',{p_token:window.adminToken,p_id:id||null,p_payload:{year_label:q('#h90Year').value.trim(),title:q('#h90Title').value.trim(),body:q('#h90Body').value.trim(),image_url:q('#h90Image').value.trim(),status:q('#h90Status').value,sort_order:Number(q('#h90Sort').value||0)}});if(!r.ok)throw new Error(r.error||'Failed');featureData=null;toast90('History item saved');admin90Open('history',true);}catch(err){toast90(err.message);}});
  }

  function financeForm90(id){
    var ex=(featureData.finance||[]).find(function(x){return String(x.id)===String(id);})||{entry_date:new Date().toISOString().slice(0,10),description:'',amount:'',entry_type:'expense'};
    open90('<div class="modal-kicker">ADMIN · FINANCE</div><h2 class="modal-title">'+(id?'Edit':'Add')+' Finance Entry</h2><form id="adminFinance90Form"><div class="form-grid"><div class="field"><label>Date</label><input id="f90Date" type="date" value="'+esc90(ex.entry_date||'')+'" required></div><div class="field"><label>Type</label><select id="f90Type"><option>expense</option><option>income</option></select></div><div class="field full"><label>Description</label><input id="f90Desc" value="'+esc90(ex.description||'')+'" required></div><div class="field"><label>Amount (₹)</label><input id="f90Amount" type="number" min="0" step="0.01" value="'+esc90(ex.amount||'')+'" required></div></div><div class="form-actions"><button class="btn gold" type="submit">SAVE ENTRY</button></div></form>');
    q('#f90Type').value=ex.entry_type||'expense';q('#adminFinance90Form').addEventListener('submit',async function(e){e.preventDefault();try{var r=await rpc90('admin_finance_upsert',{p_token:window.adminToken,p_id:id||null,p_payload:{entry_date:q('#f90Date').value,description:q('#f90Desc').value.trim(),amount:q('#f90Amount').value,entry_type:q('#f90Type').value}});if(!r.ok)throw new Error(r.error||'Failed');featureData=null;toast90('Finance entry saved');admin90Open('finance',true);}catch(err){toast90(err.message);}});
  }

  function mountAdmin90(){
    var tabs=q('.admin-tabs');if(!tabs||!q('#adminWorkspace'))return;
    renderCustomAdminTabs90();markForms90();
  }

  function poll90(){
    render90Public();
    mountAdmin90();
    markForms90();
    profileCompletion90();
    var forms=qa('#modal form');forms.forEach(function(f){duplicateWarning90(f);addPreviewButton90(f);});
  }

  function bindGlobal90(){
    wrapCloseModal90();
    document.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('[data-yyc90-tab]');
      if(b){
        e.preventDefault();e.stopImmediatePropagation();
        admin90Open(b.getAttribute('data-yyc90-tab'));
        return;
      }
      var v=e.target.closest&&e.target.closest('[data-v90-action]');
      if(v){
        e.preventDefault();e.stopImmediatePropagation();
        rpc90('admin_volunteer_action',{p_token:window.adminToken,p_id:v.getAttribute('data-v90-id'),p_action:v.getAttribute('data-v90-action')}).then(function(r){if(!r||!r.ok)throw new Error(r&&r.error||'Unable to update volunteer');toast90('Volunteer updated');featureData=null;admin90Open('volunteers',true);}).catch(function(err){toast90(err.message);});
        return;
      }
      var dev=e.target.closest&&e.target.closest('[data-dev]');
      if(dev)e.stopPropagation();
    },true);

    document.addEventListener('input',function(e){
      var f=e.target.closest&&e.target.closest('#modal form');if(f)duplicateWarning90(f);
    },true);

    document.addEventListener('keydown',function(e){
      if(e.key==='Escape')return;
      if((e.key==='/'||e.key==='s'||e.key==='S')&&!/input|textarea|select/i.test(document.activeElement.tagName||'')){
        var inp=q('#yycSearchInput')||q('#adminMemberSearch')||q('#adminEventSearch')||q('#adminUpdateSearch');
        if(inp){e.preventDefault();inp.focus();}
      }
      if((e.key==='t'||e.key==='T')&&!/input|textarea|select/i.test(document.activeElement.tagName||''))window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});
    });

    window.addEventListener('beforeunload',function(e){
      if(q('#modal form[data-yyc90-dirty="1"]')){e.preventDefault();e.returnValue='';}
    });

    window.addEventListener('online',function(){document.body.classList.remove('yyc90-offline');toast90('Back online');});
    window.addEventListener('offline',function(){document.body.classList.add('yyc90-offline');toast90('You are offline. Saved site data remains available where cached.');});
  }

  function addPwa90(){
    if(!q('#yyc90Manifest')){
      var link=document.createElement('link');link.id='yyc90Manifest';link.rel='manifest';link.href='./manifest.webmanifest';document.head.appendChild(link);
    }
    /* Service workers are intentionally disabled for production stability.
       GitHub Pages + Supabase already provide the required app runtime. */
    return;
  }

  function wrapUpload90(){
    if(typeof window.uploadYYCImage!=='function'||window.__yyc90UploadWrapped)return;
    var original=window.uploadYYCImage;window.__yyc90UploadWrapped=true;
    window.uploadYYCImage=async function(data,kind,token,id,oldUrl){
      try{
        if(/^data:image\//i.test(String(data)) && String(data).length>1800000){
          var img=new Image();
          img.src=String(data);
          await new Promise(function(resolve,reject){img.onload=resolve;img.onerror=reject;});
          var max=1600,scale=Math.min(1,max/Math.max(img.width,img.height));
          var c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
          var ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);data=c.toDataURL('image/webp',.82);
        }
      }catch(e){}
      return original(data,kind,token,id,oldUrl);
    };
  }

  window.YYC90MountAdmin=function(){
    mountAdmin90();
    markForms90();
  };

  function init90(){
    bindGlobal90();
    wrapUpload90();
    addPwa90();
    /* Feature extensions are intentionally background work; protect first paint and navigation. */
    var idle=window.requestIdleCallback||function(fn){return window.setTimeout(fn,1500);};
    idle(function(){load90Public();});
    idle(function(){poll90();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init90);else init90();
})();

