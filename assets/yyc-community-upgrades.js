/* YYC Community Upgrades — helpful public-site tools with no added data collection. */
(function(){
  'use strict';
  var help=document.getElementById('communityHelp');
  if(!help)return;
  var search=document.getElementById('yycHelpSearch');
  var items=Array.prototype.slice.call(help.querySelectorAll('.yyc-help-item'));
  var filters=Array.prototype.slice.call(help.querySelectorAll('[data-help-filter]'));
  var count=document.getElementById('yycHelpResultCount');
  var empty=document.getElementById('yycHelpEmpty');
  var activeCategory='all';

  function filterHelp(){
    var query=String(search&&search.value||'').trim().toLocaleLowerCase();
    var visible=0;
    items.forEach(function(item){
      var categoryHit=activeCategory==='all'||item.dataset.helpCategory===activeCategory;
      var queryHit=!query||item.textContent.toLocaleLowerCase().indexOf(query)>=0;
      var show=categoryHit&&queryHit;
      item.hidden=!show;
      if(show)visible++;
    });
    if(count)count.textContent='Showing '+visible+' of '+items.length+' questions';
    if(empty)empty.hidden=visible!==0;
  }
  filters.forEach(function(btn){
    btn.addEventListener('click',function(){
      activeCategory=btn.getAttribute('data-help-filter')||'all';
      filters.forEach(function(other){
        var pressed=other===btn;
        other.setAttribute('aria-pressed',pressed?'true':'false');
      });
      filterHelp();
    });
  });
  if(search){
    search.addEventListener('input',filterHelp);
    search.addEventListener('keydown',function(event){
      if(event.key==='Escape'){search.value='';filterHelp();search.blur();}
    });
  }
  var expand=document.getElementById('yycHelpExpandAll');
  var collapse=document.getElementById('yycHelpCollapseAll');
  if(expand)expand.addEventListener('click',function(){items.forEach(function(item){if(!item.hidden)item.open=true;});});
  if(collapse)collapse.addEventListener('click',function(){items.forEach(function(item){item.open=false;});});
  var register=document.getElementById('yycHelpRegisterBtn');
  if(register)register.addEventListener('click',function(){
    var existing=document.getElementById('memberRegisterBtn');
    if(existing)existing.click();
    else window.location.hash='#join';
  });

  var status=document.getElementById('yycHelpStatus');
  function announce(message){
    if(status)status.textContent=message;
    var general=document.getElementById('yycUtilityStatus');
    if(general)general.textContent=message;
  }
  function siteUrl(){return new URL('./',window.location.href).href;}
  function copyText(value){
    if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(value);
    return new Promise(function(resolve,reject){
      var field=document.createElement('textarea');
      field.value=value;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';
      document.body.appendChild(field);field.select();
      var ok=false;try{ok=document.execCommand('copy');}catch(_){}
      field.remove();ok?resolve():reject(new Error('Copy is not available in this browser.'));
    });
  }
  var share=document.getElementById('yycShareSiteBtn');
  if(share)share.addEventListener('click',async function(){
    var data={title:'Yuvakesari Youth Club',text:'Explore YYC events, achievements, community activities and membership.',url:siteUrl()};
    try{
      if(navigator.share)await navigator.share(data);
      else {await copyText(data.url);announce('Website link copied. Share it with your friends.');}
    }catch(error){
      if(error&&error.name==='AbortError')return;
      announce('Sharing is unavailable here. Use Copy website link instead.');
    }
  });
  var copy=document.getElementById('yycCopySiteLinkBtn');
  if(copy)copy.addEventListener('click',async function(){
    try{await copyText(siteUrl());announce('Official YYC website link copied.');copy.textContent='COPIED ✓';window.setTimeout(function(){copy.textContent='Copy website link';},1800);}
    catch(_){announce('Copy is not available in this browser. Please copy the page URL from your address bar.');}
  });
  var copyHelp=document.getElementById('yycCopyHelpLinkBtn');
  if(copyHelp)copyHelp.addEventListener('click',async function(){
    try{var u=new URL(siteUrl());u.hash='communityHelp';await copyText(u.href);announce('Help section link copied.');}
    catch(_){announce('Could not copy the help link in this browser.');}
  });

  var print=document.getElementById('yycPrintHelpBtn');
  if(print)print.addEventListener('click',function(){
    var changed=[];
    items.forEach(function(item){changed.push([item,item.open]);item.open=true;});
    document.body.classList.add('yyc-print-help');
    var cleanup=function(){
      document.body.classList.remove('yyc-print-help');
      changed.forEach(function(entry){entry[0].open=entry[1];});
      window.removeEventListener('afterprint',cleanup);
    };
    window.addEventListener('afterprint',cleanup);
    window.setTimeout(function(){window.print();window.setTimeout(cleanup,1200);},80);
  });

  // Keyboard shortcut: / jumps straight into the FAQ search, unless typing in a field.
  document.addEventListener('keydown',function(event){
    var target=event.target;
    var editing=target&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if(!editing&&event.key==='/'&&search){event.preventDefault();search.focus();help.scrollIntoView({behavior:'smooth',block:'start'});}
  });

  // Accessibility preferences stay only in this browser/device; no profile data is sent.
  var storageKey='yyc-community-accessibility-v1';
  var defaults={text:0,contrast:false,motion:false};
  var prefs={text:0,contrast:false,motion:false};
  try{
    var saved=localStorage.getItem(storageKey);
    if(saved){var parsed=JSON.parse(saved);prefs.text=Math.max(0,Math.min(2,Number(parsed.text)||0));prefs.contrast=parsed.contrast===true;prefs.motion=parsed.motion===true;}
  }catch(_){}
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify(prefs));}catch(_){}}
  function renderPrefs(){
    document.body.classList.toggle('yyc-text-large',prefs.text===1);
    document.body.classList.toggle('yyc-text-larger',prefs.text===2);
    document.body.classList.toggle('yyc-high-contrast',prefs.contrast);
    document.body.classList.toggle('yyc-user-reduce-motion',prefs.motion);
    var contrast=document.getElementById('yycHighContrastToggle');
    var motion=document.getElementById('yycReduceMotionToggle');
    if(contrast)contrast.setAttribute('aria-pressed',prefs.contrast?'true':'false');
    if(motion)motion.setAttribute('aria-pressed',prefs.motion?'true':'false');
    var textState=document.getElementById('yycTextSizeStatus');
    if(textState)textState.textContent=prefs.text===0?'Standard':prefs.text===1?'Large':'Extra large';
  }
  var increase=document.getElementById('yycTextIncrease');
  var decrease=document.getElementById('yycTextDecrease');
  var reset=document.getElementById('yycAccessReset');
  if(increase)increase.addEventListener('click',function(){prefs.text=Math.min(2,prefs.text+1);persist();renderPrefs();});
  if(decrease)decrease.addEventListener('click',function(){prefs.text=Math.max(0,prefs.text-1);persist();renderPrefs();});
  var contrast=document.getElementById('yycHighContrastToggle');
  if(contrast)contrast.addEventListener('click',function(){prefs.contrast=!prefs.contrast;persist();renderPrefs();});
  var motion=document.getElementById('yycReduceMotionToggle');
  if(motion)motion.addEventListener('click',function(){prefs.motion=!prefs.motion;persist();renderPrefs();});
  if(reset)reset.addEventListener('click',function(){prefs={text:0,contrast:false,motion:false};persist();renderPrefs();announce('Accessibility preferences reset.');});
  renderPrefs();

  var toggle=document.getElementById('yycA11yToggle');
  var panel=document.getElementById('yycA11yPanel');
  if(toggle&&panel){
    toggle.addEventListener('click',function(){
      var open=toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded',open?'false':'true');
      panel.hidden=open;
      if(!open){var first=panel.querySelector('button');if(first)first.focus();}
    });
    document.addEventListener('keydown',function(event){
      if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}
    });
    document.addEventListener('click',function(event){
      if(panel.hidden||panel.contains(event.target)||toggle.contains(event.target))return;
      panel.hidden=true;toggle.setAttribute('aria-expanded','false');
    });
  }
  filterHelp();
})();
