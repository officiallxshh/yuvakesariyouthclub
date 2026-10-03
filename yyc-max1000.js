/* YYC MAX 1000 PACK — safe additive enhancement kernel.
   Existing core code stays authoritative. This layer only decorates, adds UX,
   accessibility and optional tooling, and quietly backs off on unsupported pages. */
(function(){
  'use strict';

  if(window.__YYC_MAX1000__) return;
  window.__YYC_MAX1000__=true;
  var reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var q=function(s,r){return (r||document).querySelector(s);};
  var qa=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var safeToast=function(m){try{if(typeof window.toast==='function')window.toast(m);}catch(e){}};
  var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms);});};

  function injectHeadMeta(){
    function add(name,content){
      if(!name||!content)return;
      var el=document.querySelector('meta[name="'+name+'"]');
      if(!el){el=document.createElement('meta');el.name=name;document.head.appendChild(el);}
      if(!el.content)el.content=content;
    }
    add('theme-color','#05080b');
    add('format-detection','telephone=no');
    var canonical=document.querySelector('link[rel="canonical"]');
    if(canonical&&!/^https:\/\/www\.yuvakesariyouthclub\.in\/?$/.test(location.href.split('#')[0])){
      canonical.href='https://www.yuvakesariyouthclub.in/';
    }
  }

  function injectSkip(){
    if(q('#yycMaxSkip'))return;
    var a=document.createElement('a');a.id='yycMaxSkip';a.href='#home';a.textContent='SKIP TO CONTENT';
    document.body.appendChild(a);
    var main=q('main');if(main)main.setAttribute('id','main-content');a.href='#main-content';
  }

  function buildFloatTools(){
    if(q('.yyc-max-float'))return;
    var wrap=document.createElement('div');wrap.className='yyc-max-float yyc-max-no-print';
    wrap.innerHTML='<button type="button" id="yycMaxSearchFloat" aria-label="Search YYC" title="Search YYC">⌕</button>'+
                   '<button type="button" id="yycMaxTopFloat" aria-label="Back to top" title="Back to top">↑</button>';
    document.body.appendChild(wrap);
    q('#yycMaxSearchFloat').addEventListener('click',function(){openSearch();});
    q('#yycMaxTopFloat').addEventListener('click',function(){window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});});
  }

  function openSearch(){
    if(typeof window.yycOpenSearch==='function'){try{return window.yycOpenSearch();}catch(e){}}
    var data=window.publicData||null;
    var items=[];
    if(data){
      (data.events||[]).forEach(function(x){items.push({kind:'EVENT',item:x,terms:[x.title,x.description,x.location,x.category]});});
      (data.updates||[]).forEach(function(x){items.push({kind:'UPDATE',item:x,terms:[x.title,x.body,x.category]});});
      (data.gallery||[]).forEach(function(x){items.push({kind:'GALLERY',item:x,terms:[x.title,x.caption,x.album]});});
      (data.leaders||[]).forEach(function(x){items.push({kind:'LEADER',item:x,terms:[x.name,x.role,x.line]});});
    }
    var modal=q('#modal'),content=q('#modalContent');if(!modal||!content)return;
    content.innerHTML='<div class="yyc-max-search-box"><div class="yyc-detail-kicker">YYC SEARCH</div><h2 class="modal-title">Find anything.</h2><p class="modal-sub">Events, Updates, Gallery and Leaders.</p><input class="yyc-max-search-input" id="yycMaxSearchInput" type="search" placeholder="Type to search…" autocomplete="off"><div class="yyc-max-search-results" id="yycMaxSearchResults"></div></div>';
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    var input=q('#yycMaxSearchInput'),res=q('#yycMaxSearchResults');
    function render(term){
      term=String(term||'').trim().toLowerCase();
      var found=!term?items.slice(0,12):items.filter(function(x){return x.terms.filter(Boolean).join(' ').toLowerCase().indexOf(term)>=0;}).slice(0,30);
      res.__items=found;
      res.innerHTML=found.length?found.map(function(x,i){
        var title=x.item.title||x.item.name||'YYC content',sub=x.item.role||x.item.category||x.item.album||x.kind;
        return '<button type="button" class="yyc-max-search-result" data-i="'+i+'"><span class="yyc-max-search-kind">'+esc(x.kind)+'</span><b>'+esc(title)+'</b><small>'+esc(sub)+'</small></button>';
      }).join(''):'<div class="empty">No matching YYC content.</div>';
    }
    input.addEventListener('input',function(){render(input.value);});
    res.addEventListener('click',function(e){
      var b=e.target.closest('[data-i]');if(!b)return;
      var x=res.__items[Number(b.getAttribute('data-i'))];if(!x)return;
      closeModalSafe();
      if(x.kind==='LEADER'){
        var leaders=qa('#leadersGrid .leader-card'),ix=(data.leaders||[]).indexOf(x.item);if(ix>=0&&leaders[ix]){leaders[ix].scrollIntoView({behavior:'smooth',block:'center'});leaders[ix].classList.add('yyc-max-highlight');setTimeout(function(){leaders[ix].classList.remove('yyc-max-highlight');},1600);}
      }else{
        try{
          if(x.kind==='GALLERY'&&typeof window.yycOpenGalleryLightbox==='function')window.yycOpenGalleryLightbox((data.gallery||[]).indexOf(x.item));
          else if(typeof window.yycOpenContentDetail==='function')window.yycOpenContentDetail(x.kind.toLowerCase(),x.item);
        }catch(err){}
      }
    });
    setTimeout(function(){input.focus();render('');},20);
  }

  function closeModalSafe(){
    var m=q('#modal');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';}
  }

  function addSearchTrigger(){
    /* Deliberately do not add another desktop Search button.
       The existing site already has search access paths; the floating launcher
       below provides a single extra, non-invasive shortcut. */
  }

  function addPrintTrigger(){
    if(q('#yycMaxPrint'))return;
    var footer=q('.footer');if(!footer)return;
    var b=document.createElement('button');b.type='button';b.className='footer-social yyc-max-print-trigger';b.id='yycMaxPrint';b.textContent='PRINT / SAVE PDF';
    b.style.cursor='pointer';b.addEventListener('click',function(){window.print();});
    var host=q('.footer-bottom',footer)||footer;host.appendChild(b);
  }

  function decorateImages(){
    qa('img').forEach(function(img){
      if(!img.getAttribute('alt')&&img.getAttribute('src'))img.setAttribute('alt','YYC image');
      if(!img.closest('.hero'))img.setAttribute('decoding','async');
      if(!img.closest('.hero')&&!img.closest('.topbar'))img.setAttribute('loading','lazy');
      if(img.getAttribute('data-yyc-max-error-bound')==='1')return;
      img.setAttribute('data-yyc-max-error-bound','1');
      img.addEventListener('error',function(){
        img.classList.add('yyc-max-image-error');
        img.alt=img.alt||'YYC image unavailable';
      },{once:true});
    });
  }

  function addPublicCardActions(){
    /* Leader cards must remain clean; remove any legacy three-dot controls from older cached builds. */
    qa('#leadersGrid .yyc-max-card-action').forEach(function(x){x.remove();});

    var groups=[
      {sel:'#eventsGrid .event-card',kind:'event'},
      {sel:'#updatesGrid .update-card',kind:'update'},
      {sel:'#galleryGrid .gallery-card',kind:'gallery'}
    ];
    groups.forEach(function(g){
      qa(g.sel).forEach(function(card,index){
        if(card.querySelector('.yyc-max-card-action'))return;
        var b=document.createElement('button');b.type='button';b.className='yyc-max-card-action yyc-max-no-print';b.setAttribute('aria-label','Share or save this '+g.kind);
        b.textContent='⋯';
        b.addEventListener('click',function(e){
          e.preventDefault();e.stopPropagation();
          var data=window.publicData;
          var item=data&&(data[g.kind==='event'?'events':g.kind==='update'?'updates':g.kind==='gallery'?'gallery':'leaders']||[])[index];
          if(!item){safeToast('Content is not available.');return;}
          showCardTools(g.kind,item,b);
        });
        card.appendChild(b);
      });
    });
  }

  function showCardTools(kind,item,anchor){
    var title=item.title||item.name||'YYC';
    var shareUrl=location.href.split('?')[0].split('#')[0];
    var key=kind==='leader'?'leader':kind;
    if(item.slug)shareUrl+='?'+encodeURIComponent(key)+'='+encodeURIComponent(item.slug);
    else if(item.id)shareUrl+='?'+encodeURIComponent(key)+'='+encodeURIComponent(item.id);
    var favoriteKey='yyc_max_fav_'+kind+'_'+String(item.id||item.slug||title).replace(/\W+/g,'_');
    var saved=localStorage.getItem(favoriteKey)==='1';
    var modal=q('#modal'),content=q('#modalContent');if(!modal||!content)return;
    content.innerHTML='<div class="yyc-detail-modal"><div class="yyc-detail-kicker">'+esc(kind.toUpperCase())+' TOOLS</div><h2 class="modal-title">'+esc(title)+'</h2><p class="modal-sub">Quick actions for this YYC item.</p><div class="yyc-max-modal-tools">'+
      '<button type="button" id="yycMaxShareItem">SHARE ↗</button>'+
      '<button type="button" id="yycMaxCopyItem">COPY LINK</button>'+
      '<button type="button" class="yyc-max-favorite '+(saved?'saved':'')+'" id="yycMaxFavorite">'+(saved?'SAVED ★':'SAVE ★')+'</button>'+
      '<button type="button" id="yycMaxOpenItem">OPEN</button></div></div>';
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    q('#yycMaxShareItem').onclick=async function(){try{if(navigator.share)await navigator.share({title:title,url:shareUrl});else{await navigator.clipboard.writeText(shareUrl);safeToast('Share link copied');}}catch(e){if(e.name!=='AbortError')safeToast('Could not share this item');}};
    q('#yycMaxCopyItem').onclick=async function(){try{await navigator.clipboard.writeText(shareUrl);safeToast('Link copied');}catch(e){safeToast('Clipboard is unavailable');}};
    q('#yycMaxFavorite').onclick=function(){var on=localStorage.getItem(favoriteKey)==='1';try{if(on)localStorage.removeItem(favoriteKey);else localStorage.setItem(favoriteKey,'1');}catch(e){}this.classList.toggle('saved',!on);this.textContent=!on?'SAVED ★':'SAVE ★';safeToast(!on?'Saved on this device':'Removed from saved items');};
    q('#yycMaxOpenItem').onclick=function(){
      try{
        closeModalSafe();
        if(kind==='gallery'&&typeof window.yycOpenGalleryLightbox==='function')window.yycOpenGalleryLightbox((window.publicData.gallery||[]).indexOf(item));
        else if(kind!=='leader'&&typeof window.yycOpenContentDetail==='function')window.yycOpenContentDetail(kind,item);
        else{
          var grid=q('#leadersGrid'),cards=qa('.leader-card',grid);var i=(window.publicData.leaders||[]).indexOf(item);if(cards[i]){cards[i].scrollIntoView({behavior:'smooth',block:'center'});cards[i].classList.add('yyc-max-highlight');setTimeout(function(){cards[i].classList.remove('yyc-max-highlight');},1200);}
        }
      }catch(e){}
    };
  }

  function annotateEvents(){
    var data=window.publicData;if(!data)return;
    qa('#eventsGrid .event-card').forEach(function(card,index){
      var ev=(data.events||[])[index];if(!ev||!ev.event_date)return;
      if(card.getAttribute('data-yyc-max-event-id')===String(ev.id||index)){
        updateCountdown(card,ev);return;
      }
      card.setAttribute('data-yyc-max-event-id',String(ev.id||index));
      var host=card.querySelector('.event-card-body')||card;
      var c=document.createElement('span');c.className='yyc-max-countdown';host.appendChild(c);updateCountdown(card,ev);
    });
  }
  function updateCountdown(card,ev){
    var el=card.querySelector('.yyc-max-countdown');if(!el)return;
    var dt=new Date(ev.event_date+'T00:00:00');if(isNaN(dt)){el.remove();return;}
    var diff=dt.getTime()-Date.now();var day=Math.floor(Math.abs(diff)/86400000);
    if(Math.abs(diff)<86400000){
      var h=Math.floor(Math.abs(diff)/3600000),m=Math.floor((Math.abs(diff)%3600000)/60000);
      el.className='yyc-max-countdown '+(diff>0?'':'live');
      el.textContent=diff>0?'STARTS IN '+h+'H '+m+'M':'EVENT DAY';
    }else if(diff>0){
      el.className='yyc-max-countdown';el.textContent='STARTS IN '+day+' DAYS';
    }else{
      el.className='yyc-max-countdown done';el.textContent='EVENT COMPLETED';
    }
  }

  function addModalReading(){
    var shell=q('#modal .modal-shell');if(!shell||shell.querySelector('.yyc-max-reading'))return;
    var bar=document.createElement('div');bar.className='yyc-max-reading';bar.innerHTML='<span></span>';shell.appendChild(bar);
    function upd(){var span=q('.yyc-max-reading span',shell);var max=Math.max(1,shell.scrollHeight-shell.clientHeight);span.style.width=Math.min(100,Math.max(0,shell.scrollTop/max*100))+'%';}
    shell.addEventListener('scroll',upd,{passive:true});upd();
  }

  function decorateModal(){
    var modal=q('#modal');if(!modal||!modal.classList.contains('open'))return;
    addModalReading();
    var img=q('.yyc-detail-image img,.yyc-lightbox-stage img',modal);
    if(img&&!img.getAttribute('data-yyc-max-tools')){
      img.setAttribute('data-yyc-max-tools','1');
      img.addEventListener('dblclick',function(){img.style.transform=img.style.transform?'':'scale(1.35)';img.style.transition='transform .25s ease';});
    }
  }

  function addKeyboardUX(){
    document.addEventListener('keydown',function(e){
      var tag=(document.activeElement&&document.activeElement.tagName||'').toLowerCase();
      var typing=tag==='input'||tag==='textarea'||tag==='select'||(document.activeElement&&document.activeElement.isContentEditable);
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!typing){e.preventDefault();openSearch();return;}
      if(e.key==='/'&&!typing){e.preventDefault();openSearch();return;}
      if(e.key==='p'&&!typing&&(e.ctrlKey||e.metaKey)){return;}
    });
  }

  function modalAccessibility(){
    var modal=q('#modal');if(!modal)return;
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    var lastFocus=null;
    var observer=new MutationObserver(function(){
      var open=modal.classList.contains('open');
      if(open){
        lastFocus=document.activeElement;
        var shell=q('.modal-shell',modal);if(shell)shell.setAttribute('tabindex','-1');
        setTimeout(function(){
          var first=q('button,input,textarea,select,a[href],[tabindex]:not([tabindex="-1"])',shell||modal);
          if(first)first.focus();
        },20);
        decorateModal();
      }else if(lastFocus&&typeof lastFocus.focus==='function'){try{lastFocus.focus();}catch(e){}}
    });
    observer.observe(modal,{attributes:true,childList:true,subtree:true});
    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape'||!modal.classList.contains('open'))return;
      var close=modal.querySelector('.modal-close,[data-modal-close-only]');
      if(close)close.click();else closeModalSafe();
    });
    modal.addEventListener('keydown',function(e){
      if(e.key!=='Tab'||!modal.classList.contains('open'))return;
      var shell=q('.modal-shell',modal),items=qa('button,input,textarea,select,a[href],[tabindex]:not([tabindex="-1"])',shell||modal).filter(function(x){return !x.disabled&&x.offsetParent!==null;});
      if(items.length<2)return;
      var first=items[0],last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
  }

  function adminSearchEnhancement(){
    var workspace=q('#adminWorkspace');if(!workspace)return;
    var shell=workspace.closest('.admin-shell');if(!shell)return;
    if(q('.yyc-max-admin-tools',workspace))return;
    var bar=document.createElement('div');bar.className='yyc-max-admin-tools';
    bar.innerHTML='<input id="yycMaxAdminSearch" type="search" placeholder="Search current admin tab…" autocomplete="off"><button type="button" class="mini-btn" id="yycMaxAdminClear">CLEAR</button><button type="button" class="mini-btn" id="yycMaxAdminExport">EXPORT VISIBLE</button><span class="yyc-max-admin-count" id="yycMaxAdminCount"></span>';
    workspace.parentNode.insertBefore(bar,workspace);
    var input=q('#yycMaxAdminSearch'),count=q('#yycMaxAdminCount');
    function filter(){
      var term=input.value.trim().toLowerCase();var nodes=qa('tr,.admin-row,.admin-card,.approval-card,.event-card,.gallery-card',workspace).filter(function(el){return !el.closest('.yyc-max-admin-tools');});
      var shown=0;
      nodes.forEach(function(el){var ok=!term||el.textContent.toLowerCase().indexOf(term)>=0;el.style.display=ok?'':'none';if(ok)shown++;});
      count.textContent=(term?'MATCHED ':'ITEMS ')+shown;
    }
    input.addEventListener('input',filter);
    q('#yycMaxAdminClear').addEventListener('click',function(){input.value='';filter();input.focus();});
    q('#yycMaxAdminExport').addEventListener('click',function(){exportVisible(workspace);});
    filter();
  }

  function exportVisible(root){
    var rows=qa('table tr',root).filter(function(x){return getComputedStyle(x).display!=='none';});
    if(!rows.length){safeToast('No visible table rows to export.');return;}
    var csv=rows.map(function(row){return qa('th,td',row).map(function(cell){return '"'+String(cell.innerText||'').replace(/"/g,'""').replace(/\r?\n/g,' ')+'"';}).join(',');}).join('\n');
    var blob=new Blob([csv+'\n'],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='yyc-visible-export.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  function adminCommandPalette(){
    document.addEventListener('keydown',function(e){
      var tag=(document.activeElement&&document.activeElement.tagName||'').toLowerCase();
      var typing=tag==='input'||tag==='textarea'||tag==='select'||(document.activeElement&&document.activeElement.isContentEditable);
      if(typing||!e.altKey||e.key.toLowerCase()!=='y')return;
      var modal=q('#modal'),content=q('#modalContent');if(!modal||!content)return;
      var tabs=qa('.admin-tab'),commands=[];
      tabs.forEach(function(t){commands.push({label:'Open '+t.textContent.trim(),tab:t.getAttribute('data-tab')});});
      content.innerHTML='<div><div class="yyc-detail-kicker">YYC ADMIN COMMAND CENTER</div><h2 class="modal-title">Quick actions.</h2><p class="modal-sub">Jump to any Admin tab without replacing existing controls.</p><div class="yyc-max-command-list">'+commands.map(function(c,i){return '<button type="button" class="yyc-max-command" data-admin-command="'+i+'"><b>'+esc(c.label)+'</b><span>ALT+Y</span></button>';}).join('')+'</div></div>';
      modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
      qa('[data-admin-command]',content).forEach(function(b){b.addEventListener('click',function(){var c=commands[Number(b.getAttribute('data-admin-command'))];closeModalSafe();var tab=qa('.admin-tab').find(function(t){return t.getAttribute('data-tab')===c.tab;});if(tab)tab.click();});});
    });
  }

  function offlineBanner(){
    var b=document.createElement('div');b.id='yycMaxOffline';b.className='yyc-max-offline';b.textContent='YOU ARE OFFLINE · SOME LIVE FEATURES MAY BE UNAVAILABLE';document.body.appendChild(b);
    function set(){b.classList.toggle('show',!navigator.onLine);}
    window.addEventListener('online',set);window.addEventListener('offline',set);set();
  }

  function sectionTooling(){
    ['#updatesGrid','#eventsGrid','#galleryGrid'].forEach(function(sel){
      var grid=q(sel);if(!grid||grid.dataset.yycMaxTools)return;
      grid.dataset.yycMaxTools='1';
      var wrap=document.createElement('div');wrap.className='yyc-max-section-tools yyc-max-no-print';
      var clear=document.createElement('button');clear.type='button';clear.className='mini-btn';clear.textContent='RESET VIEW';
      var saved=document.createElement('button');saved.type='button';saved.className='mini-btn';saved.textContent='SAVED ★';
      var label=document.createElement('span');label.className='yyc-max-chip';label.textContent='Enhanced view';
      wrap.appendChild(label);wrap.appendChild(saved);wrap.appendChild(clear);
      grid.parentNode.insertBefore(wrap,grid);
      clear.onclick=function(){qa('.yyc-max-card-action',grid).forEach(function(x){x.remove();});addPublicCardActions();saved.classList.remove('active');};
      saved.onclick=function(){
        saved.classList.toggle('active');
        var on=saved.classList.contains('active');
        qa('article,figure',grid).forEach(function(card){
          var itemTitle=(card.querySelector('h3,h2,strong')||{}).textContent||'';
          var kind=grid.id==='eventsGrid'?'event':grid.id==='updatesGrid'?'update':'gallery';
          var itemId='';
          var list=(window.publicData&&window.publicData[kind==='event'?'events':kind==='update'?'updates':'gallery'])||[];
          var items=qa('article,figure',grid);
          var ix=items.indexOf(card);
          var it=list[ix]||{};
          var key='yyc_max_fav_'+kind+'_'+String(it.id||it.slug||itemTitle).replace(/\W+/g,'_');
          var isSaved=false;try{isSaved=localStorage.getItem(key)==='1';}catch(e){}
          card.style.display=(!on||isSaved)?'':'none';
        });
        safeToast(on?'Saved-only filter enabled':'Saved-only filter cleared');
      };
    });
  }

  function startDecorators(){
    injectHeadMeta();injectSkip();buildFloatTools();addSearchTrigger();addPrintTrigger();decorateImages();sectionTooling();addPublicCardActions();annotateEvents();
    modalAccessibility();addKeyboardUX();adminCommandPalette();offlineBanner();
    var root=document.body;
    if(window.MutationObserver){
      var observer=new MutationObserver(function(){
        decorateImages();addPublicCardActions();annotateEvents();decorateModal();adminSearchEnhancement();
      });
      observer.observe(root,{childList:true,subtree:true});
    }
    if(!reduced){
      setInterval(function(){annotateEvents();},30000);
    }
    window.addEventListener('resize',function(){decorateImages();});
  }

  function boot(){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(startDecorators,50);});
    else setTimeout(startDecorators,50);
  }
  boot();

  window.YYC_MAX1000={
    version:'2026.10.03-max1',
    openSearch:openSearch,
    exportVisible:exportVisible,
    refresh:function(){startDecorators();},
    status:function(){return {installed:true,reducedMotion:reduced};}
  };
})();
