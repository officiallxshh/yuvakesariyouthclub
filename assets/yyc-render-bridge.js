/* YYC Render Bridge
   Uses the isolated Render processor only for heavy ID-card export composition.
   The existing browser renderer remains the fallback and no member data is modified. */
(function(){
  'use strict';

  var API='https://yuvakesariyouthclub.onrender.com';
  var BUSY='__yycRenderBusy';

  function q(s){return document.querySelector(s);}
  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function say(msg){
    if(typeof window.toast==='function') window.toast(msg);
  }
  function localDownload(cardButton){
    try{
      if(cardButton && cardButton.id==='memberDownloadBtn' && typeof window.memberDashboard==='function'){
        /* Existing listener already owns the local fallback; invoke the original function directly when exposed. */
      }
      if(typeof window.downloadYYCDigitalCard==='function'){
        var kind=cardButton && cardButton.id==='leaderDownloadBtn'?'leader':'member';
        return window.downloadYYCDigitalCard(window.__yycRenderCurrentData||{},kind,cardButton);
      }
    }catch(e){}
    return Promise.reject(new Error('Local ID-card renderer is unavailable.'));
  }

  function imageData(canvas){
    return canvas.toDataURL('image/png');
  }

  async function captureSide(face,width){
    var clone;
    if(typeof window.yycExportFace==='function'){
      clone=window.yycExportFace(face,width);
    }else{
      clone=face.cloneNode(true);
      clone.classList.remove('yyc-card-front','yyc-card-back');
      clone.classList.add('yyc-export-face');
      clone.style.width=width+'px';
      clone.style.height=Math.round(width/1.72)+'px';
      clone.style.position='relative';
      clone.style.transform='none';
      clone.style.backfaceVisibility='visible';
      clone.style.webkitBackfaceVisibility='visible';
    }
    clone.style.left='auto';
    clone.style.top='auto';
    clone.style.visibility='visible';
    clone.style.opacity='1';
    clone.style.transform='none';
    clone.querySelectorAll('.yyc-live-qr').forEach(function(box){
      var a=box.closest('.yyc-qr-link');
      var href=a ? a.getAttribute('href') : '';
      if(typeof window.yycLoadQrGenerator==='function' && href){
        /* Inline QR SVG removes a network dependency from the export. */
        return window.yycLoadQrGenerator().then(function(qrcodeGenerator){
          var qr=qrcodeGenerator(0,'M');
          qr.addData(String(href));
          qr.make();
          box.innerHTML=qr.createSvgTag({cellSize:5,margin:0});
          var svg=box.querySelector('svg');
          if(svg){
            svg.setAttribute('width','100%');
            svg.setAttribute('height','100%');
            svg.style.display='block';
            svg.style.background='#fff';
          }
          box.style.background='#fff';
          box.style.display='grid';
          box.style.placeItems='center';
          box.style.overflow='hidden';
        });
      }
      return Promise.resolve();
    });
    return clone;
  }

  async function render(button){
    if(window[BUSY]) return;
    window[BUSY]=true;
    var originalText=button.textContent;
    button.disabled=true;
    button.textContent='PREPARING…';
    var holder=null,stage=null;
    try{
      var wrap=document.querySelector('.yyc-digital-card-wrap');
      var card=wrap && wrap.querySelector('.yyc-digital-card');
      var front=card && card.querySelector('.yyc-card-front');
      var back=card && card.querySelector('.yyc-card-back');
      if(!front || !back) throw new Error('Unable to prepare the YYC ID card.');

      var hc;
      if(typeof window.yycLoadHtml2Canvas==='function') hc=await window.yycLoadHtml2Canvas();
      else if(window.html2canvas) hc=window.html2canvas;
      else throw new Error('ID-card rendering engine is unavailable.');

      holder=document.createElement('div');
      holder.style.cssText='position:fixed;left:-10000px;top:0;width:980px;z-index:2147483000;visibility:visible;pointer-events:none;';
      document.body.appendChild(holder);

      var width=900;
      var frontClone=await captureSide(front,width);
      var backClone=await captureSide(back,width);
      holder.appendChild(frontClone);
      var spacer=document.createElement('div');
      spacer.style.height='28px';
      holder.appendChild(spacer);
      holder.appendChild(backClone);

      var imgs=Array.prototype.slice.call(holder.querySelectorAll('img'));
      await Promise.all(imgs.map(function(img){
        if(img.complete && img.naturalWidth>0) return img.decode?img.decode().catch(function(){}):Promise.resolve();
        return new Promise(function(resolve){
          var done=function(){resolve();};
          img.addEventListener('load',done,{once:true});
          img.addEventListener('error',done,{once:true});
          setTimeout(done,8000);
        });
      }));

      await new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});

      var opts={
        backgroundColor:null,
        useCORS:true,
        allowTaint:false,
        scale:2,
        logging:false,
        imageTimeout:15000,
        removeContainer:false
      };
      button.textContent='RENDERING…';
      var frontCanvas=await hc(frontClone,opts);
      var backCanvas=await hc(backClone,opts);

      var controller=new AbortController();
      var timeout=setTimeout(function(){controller.abort();},45000);
      var response;
      try{
        response=await fetch(API+'/api/id-card/compose',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            frontDataUrl:imageData(frontCanvas),
            backDataUrl:imageData(backCanvas),
            gap:28,
            padding:24
          }),
          signal:controller.signal,
          credentials:'omit',
          cache:'no-store'
        });
      }finally{
        clearTimeout(timeout);
      }

      if(!response.ok){
        var detail='';
        try{detail=(await response.json()).error||'';}catch(e){}
        throw new Error(detail||('Render service returned '+response.status+'.'));
      }

      var blob=await response.blob();
      if(!blob.size) throw new Error('Render service returned an empty ID card.');
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');
      var kind=button.id==='leaderDownloadBtn'?'Leader':'Member';
      var id=(card.querySelector('.yyc-id-field b')||{}).textContent||'ID';
      a.href=url;
      a.download='YYC-'+kind+'-ID-'+id.trim().replace(/[^a-z0-9_-]+/gi,'-')+'.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){a.remove();URL.revokeObjectURL(url);},3000);
      say('ID card rendered successfully');
    }catch(e){
      /* Never leave the user stuck: fall back to the existing renderer. */
      say('Server rendering unavailable — using local renderer.');
      try{
        var current=button.id==='leaderDownloadBtn' ? window.__yycLeaderRenderData : window.__yycMemberRenderData;
        if(typeof window.downloadYYCDigitalCard==='function'){
          await window.downloadYYCDigitalCard(current||{},button.id==='leaderDownloadBtn'?'leader':'member',button);
          return;
        }
      }catch(fallbackError){}
      say(e && e.name==='AbortError' ? 'Rendering timed out. Please try again.' : (e.message||'ID card rendering failed.'));
    }finally{
      if(stage) stage.remove();
      if(holder) holder.remove();
      button.disabled=false;
      button.textContent=originalText;
      window[BUSY]=false;
    }
  }

  function install(){
    if(window.__YYC_RENDER_BRIDGE_INSTALLED) return;
    window.__YYC_RENDER_BRIDGE_INSTALLED=true;
    document.addEventListener('click',function(e){
      var btn=e.target && e.target.closest ? e.target.closest('#memberDownloadBtn,#leaderDownloadBtn') : null;
      if(!btn) return;
      if(!document.querySelector('.yyc-digital-card-wrap')) return;
      /* Run before the existing target-bubble listener so the old heavy path isn't started twice. */
      e.preventDefault();
      e.stopImmediatePropagation();
      render(btn);
    },true);
  }

  install();
  window.YYCRenderBridge={api:API,render:render};
})();
