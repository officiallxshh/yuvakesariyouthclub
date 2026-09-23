'use strict';

/*
 * YYC ACCESS CONTROLLER
 * This file intentionally has NO dependency on app.js or the Supabase JS client.
 * It owns the three primary login buttons so they always open and submit.
 */
(function(){
  var URL='https://vrllozfzheikjbhxvpkx.supabase.co';
  var KEY='sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt';
  var AUTH_URL=URL+'/functions/v1/yyc-login';
  var modal, contentBox;

  function el(id){ return document.getElementById(id); }
  function openShell(html){
    modal=el('modal'); contentBox=el('modalContent');
    if(!modal||!contentBox) return false;
    contentBox.innerHTML=html;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
    return true;
  }
  function closeShell(){
    modal=modal||el('modal');
    if(modal){
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden','true');
    }
    document.body.style.overflow='';
  }
  function message(form,msg,error){
    if(!form) return;
    var box=form.querySelector('.access-login-status');
    if(!box){
      box=document.createElement('div');
      box.className='access-login-status';
      box.setAttribute('role','status');
      box.setAttribute('aria-live','polite');
      form.appendChild(box);
    }
    box.textContent=msg||'';
    box.classList.toggle('is-error',!!error);
    box.classList.toggle('is-success',!!msg&&!error);
  }
  function setBusy(form,busy,label){
    var btn=form&&form.querySelector('button[type="submit"]');
    if(!btn) return;
    if(busy){
      btn.disabled=true;
      btn.dataset.prevText=btn.textContent;
      btn.textContent=label||'CHECKING…';
      btn.classList.add('is-loading');
    }else{
      btn.disabled=false;
      btn.classList.remove('is-loading');
      btn.textContent=btn.dataset.prevText||'LOGIN →';
    }
  }
  async function rpc(name,args){
    var controller=window.AbortController?new AbortController():null;
    var timer=setTimeout(function(){if(controller)controller.abort();},12000);
    try{
      var res=await fetch(AUTH_URL,{
        method:'POST',
        headers:{
          'apikey':KEY,
          'Content-Type':'application/json',
          'Accept':'application/json'
        },
        body:JSON.stringify(args||{}),
        signal:controller?controller.signal:undefined
      });
      var raw=await res.text();
      var data=null;
      try{data=raw?JSON.parse(raw):null;}catch(_){}
      if(!res.ok){
        var err=(data&&(data.error||data.message||data.hint||data.details))||('Authentication server error ('+res.status+')');
        throw new Error(String(err));
      }
      return data;
    }catch(e){
      if(e&&e.name==='AbortError') throw new Error('YYC authentication timed out. Please try again.');
      throw e;
    }finally{
      clearTimeout(timer);
    }
  }
  function passwordToggle(form){
    var pass=form.querySelector('input[type="password"]');
    var toggle=form.querySelector('.access-password-toggle');
    if(!pass||!toggle) return;
    toggle.addEventListener('click',function(){
      var show=pass.type==='password';
      pass.type=show?'text':'password';
      toggle.textContent=show?'HIDE':'SHOW';
    });
  }

  function loadAppAndDashboard(kind,payload){
    var fn=kind==='memberLogin'?'memberDashboard':kind==='leaderLogin'?'leaderDashboard':'adminPanel';
    if(typeof window[fn]==='function'){
      closeShell();
      if(kind==='adminLogin') window[fn]('overview');
      else window[fn](payload);
      return Promise.resolve(true);
    }

    return new Promise(function(resolve,reject){
      var old=document.querySelector('script[data-yyc-access-app]');
      if(old){
        var wait=0;
        var timer=setInterval(function(){
          if(typeof window[fn]==='function'){
            clearInterval(timer);
            closeShell();
            if(kind==='adminLogin') window[fn]('overview');
            else window[fn](payload);
            resolve(true);
          }else if(++wait>80){
            clearInterval(timer);
            reject(new Error('YYC portal code is not available yet.'));
          }
        },100);
        return;
      }

      var s=document.createElement('script');
      s.src='app.js?v=20260923-14-'+Date.now();
      s.async=false;
      s.dataset.yycAccessApp='1';
      s.onload=function(){
        setTimeout(function(){
          if(typeof window[fn]!=='function'){
            reject(new Error('YYC portal code did not initialize.'));
            return;
          }
          closeShell();
          if(kind==='adminLogin') window[fn]('overview');
          else window[fn](payload);
          resolve(true);
        },0);
      };
      s.onerror=function(){reject(new Error('Could not load the YYC portal code.'));};
      document.head.appendChild(s);
    });
  }

  function open(kind){
    var member=kind==='memberLogin', leader=kind==='leaderLogin';
    var title=member?'Member Login':leader?'Leader Login':'Admin Login';
    var badge=member?'MEMBER':leader?'LEADER':'PRIVATE';
    var identifierLabel=member||leader?'Email or phone':'Admin ID';
    var identifierId=member?'yycAccessMemberId':leader?'yycAccessLeaderId':'yycAccessAdminId';
    var passId=member?'yycAccessMemberPass':leader?'yycAccessLeaderPass':'yycAccessAdminPass';

    openShell(
      '<div class="access-login-screen direct-access-screen '+(member?'member-access-screen':leader?'leader-access-screen':'admin-access-screen')+'">'+
        '<div class="access-login-hero"><div class="access-login-icon">'+(member?'◉':leader?'♛':'⌑')+'</div><div><span class="access-login-kicker">YUVAKESARI YOUTH CLUB</span><h2 class="access-login-title">'+title+'</h2><p class="access-login-sub">Secure access to your YYC portal.</p></div><span class="access-login-badge '+(leader?'leader':kind==='adminLogin'?'admin':'')+'">'+badge+'</span></div>'+
        '<form id="yycDirectAccessForm" class="access-login-form" novalidate>'+
          '<div class="access-form-field"><label for="'+identifierId+'">'+identifierLabel+'</label><div class="access-input-wrap"><span class="access-input-icon">◎</span><input id="'+identifierId+'" type="text" autocomplete="username" placeholder="Enter '+identifierLabel.toLowerCase()+'" required></div></div>'+
          '<div class="access-form-field"><label for="'+passId+'">Password</label><div class="access-password-field"><span class="access-input-icon">⌑</span><input id="'+passId+'" type="password" autocomplete="current-password" placeholder="Enter password" required><button type="button" class="access-password-toggle">SHOW</button></div></div>'+
          '<div class="access-login-meta"><span>✓ Secure YYC access</span><span>'+(member?'Approved members only':leader?'Leadership access':'Administrator access')+'</span></div>'+
          '<div class="form-actions access-login-actions"><button type="submit" class="btn gold access-submit">CONTINUE <span>→</span></button></div>'+
          '<div class="access-login-status" role="status" aria-live="polite"></div>'+
        '</form>'+
        '<div class="access-login-footer">Your credentials are checked securely by the YYC backend.</div>'+
      '</div>'
    );

    var form=el('yycDirectAccessForm');
    if(!form) return;
    passwordToggle(form);

    form.addEventListener('submit',async function(e){
      e.preventDefault();
      e.stopPropagation();
      var id=el(identifierId).value.trim();
      var pass=el(passId).value;
      if(!id||!pass){message(form,'Please enter both fields.',true);return;}
      setBusy(form,true,'CHECKING…');
      message(form,'Connecting securely to YYC…',false);
      try{
        var result;
        if(kind==='memberLogin') result=await rpc('yyc-auth',{kind:'member',identifier:id,password:pass});
        else if(kind==='leaderLogin') result=await rpc('yyc-auth',{kind:'leader',identifier:id,password:pass});
        else result=await rpc('yyc-auth',{kind:'admin',identifier:id,password:pass});

        if(!result||result.ok!==true) throw new Error((result&&result.error)||'Invalid credentials');

        if(kind==='adminLogin'){
          try{sessionStorage.setItem('yyc_admin_session_v1',result.token||'');}catch(_){}
          window.adminToken=result.token||'';
          message(form,'Login successful. Opening admin panel…',false);
          await loadAppAndDashboard(kind,null);
        }else if(kind==='memberLogin'){
          try{localStorage.setItem('yyc_member_session_v1',result.token||'');}catch(_){}
          window.memberToken=result.token||'';
          message(form,'Login successful. Opening member portal…',false);
          await loadAppAndDashboard(kind,result.member);
        }else{
          try{localStorage.setItem('yyc_leader_session_v1',result.token||'');}catch(_){}
          window.leaderToken=result.token||'';
          message(form,'Login successful. Opening leader panel…',false);
          await loadAppAndDashboard(kind,result.leader);
        }
      }catch(err){
        setBusy(form,false);
        message(form,err.message||'Login failed.',true);
      }
    });
  }

  var routes={
    memberLoginBtn:'memberLogin',
    leaderLoginBtn:'leaderLogin',
    adminOpenBtn:'adminLogin',
    memberLoginMobile:'memberLogin',
    leaderLoginMobile:'leaderLogin',
    adminOpenMobile:'adminLogin'
  };

  /* Capture phase: this is the ONLY handler the three login buttons need. */
  document.addEventListener('click',function(e){
    var button=e.target&&e.target.closest?e.target.closest('button[id]'):null;
    if(!button||!routes[button.id]) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(button.id.slice(-6)==='Mobile'){
      var p=el('mobilePanel'),m=el('menuBtn');
      if(p)p.classList.remove('open');
      if(m){m.classList.remove('menu-open');m.setAttribute('aria-expanded','false');}
    }
    open(routes[button.id]);
  },true);

  window.YYCAccess={open:open};
})();
