(function(){
  'use strict';
  if(window.__YYCSmoothDataInstalled) return;
  window.__YYCSmoothDataInstalled=true;

  var gridSelectors=['#leadersGrid','#updatesGrid','#eventsGrid','#galleryGrid','#swagsGrid'];
  var cardSelector='.leader-card,.update-card,.event-card,.gallery-card,.swag-card';
  var enterObserver=null;

  function reduced(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function getCards(grid){
    return Array.prototype.filter.call(grid.children||[],function(el){
      return el.matches && el.matches(cardSelector);
    });
  }

  function animateCard(card,index){
    if(!card || card.dataset.yycSmoothItem==='1') return;
    card.dataset.yycSmoothItem='1';
    card.style.setProperty('--yyc-data-delay',Math.min(index,7)*42+'ms');

    if(reduced()){
      card.classList.add('yyc-data-ready');
      return;
    }

    if(enterObserver){
      enterObserver.observe(card);
    }else{
      requestAnimationFrame(function(){card.classList.add('yyc-data-ready');});
    }
  }

  function prepareGrid(grid){
    if(!grid) return;
    var cards=getCards(grid);
    cards.forEach(animateCard);
  }

  function init(){
    if('IntersectionObserver' in window && !reduced()){
      enterObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(!entry.isIntersecting) return;
          var card=entry.target;
          card.classList.add('yyc-data-ready');
          enterObserver.unobserve(card);
        });
      },{root:null,rootMargin:'0px 0px -5% 0px',threshold:.08});
    }

    gridSelectors.forEach(function(selector){
      var grid=document.querySelector(selector);
      if(!grid) return;

      prepareGrid(grid);

      if('MutationObserver' in window){
        var observer=new MutationObserver(function(){
          requestAnimationFrame(function(){prepareGrid(grid);});
        });
        observer.observe(grid,{childList:true,subtree:false});
      }
    });

    document.documentElement.classList.add('yyc-smooth-data');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
