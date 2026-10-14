(function(){
  'use strict';
  var URL='https://vrllozfzheikjbhxvpkx.supabase.co';
  var KEY='sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt';
  var client=null, sdkPromise=null;

  function loadSdk(){
    if(window.supabase&&typeof window.supabase.createClient==='function')return Promise.resolve();
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise(function(resolve,reject){
      var script=document.querySelector('script[data-yyc-member-auth-sdk]');
      if(script){
        script.addEventListener('load',resolve,{once:true});
        script.addEventListener('error',function(){reject(new Error('Could not load secure sign-in. Please try again.'));},{once:true});
        return;
      }
      script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/dist/umd/supabase.min.js';
      script.async=true;
      script.dataset.yycMemberAuthSdk='1';
      script.onload=resolve;
      script.onerror=function(){reject(new Error('Could not load secure sign-in. Please try again.'));};
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  async function authClient(){
    await loadSdk();
    if(!client){
      client=window.supabase.createClient(URL,KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}
      });
    }
    return client;
  }

  function getOAuthRole(){
    try{return sessionStorage.getItem('yyc_google_signin_role_v1')==='leader'?'leader':'member';}
    catch(_){return 'member';}
  }

  async function exchangeIdentity(session,role){
    if(!session||!session.access_token)throw new Error('Verified sign-in did not return a session.');
    role=role==='leader'?'leader':'member';
    var rpcName=role==='leader'?'leader_login_verified_identity':'member_login_verified_identity';
    var response=await fetch(URL+'/rest/v1/rpc/'+rpcName,{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'apikey':KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({p_device_name:'Google '+role+' sign-in'})
    });
    var result=null;
    try{result=await response.json();}catch(_){}
    if(!response.ok||!result||result.ok!==true)throw new Error(result&&result.error||'This Google account is not linked to an active YYC '+role+' account.');
    return result;
  }

  async function finishWithSession(session,role){
    var auth=await authClient();
    try{return await exchangeIdentity(session,role);}
    finally{try{await auth.auth.signOut({scope:'local'});}catch(_){}}
  }

  function isOAuthCallback(){
    try{
      var query=new URLSearchParams(location.search);
      return query.has('code')||query.has('error')||/access_token=|error_description=/.test(location.hash||'');
    }catch(_){return false;}
  }

  function clearCallback(){
    try{
      var url=new URL(location.href);
      ['code','error','error_description','error_code','state'].forEach(function(key){url.searchParams.delete(key);});
      url.hash='';
      history.replaceState({},document.title,url.pathname+url.search);
      try{sessionStorage.removeItem('yyc_google_signin_role_v1');}catch(_){};
    }catch(_){}
  }

  window.YYCMemberAuth={
    isOAuthCallback:isOAuthCallback,
    clearCallback:clearCallback,
    startGoogle:async function(){
      var auth=await authClient();
      var redirectTo=location.origin+location.pathname;
      var role=arguments[0]==='leader'?'leader':'member';
      try{sessionStorage.setItem('yyc_google_signin_role_v1',role);}catch(_){}
      var result=await auth.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo,queryParams:{prompt:'select_account'}}});
      if(result.error){try{sessionStorage.removeItem('yyc_google_signin_role_v1');}catch(_){}throw result.error;}
    },
    completeOAuth:async function(){
      var auth=await authClient();
      var result=await auth.auth.getSession();
      if(result.error)throw result.error;
      if(!result.data||!result.data.session)return null;
      return finishWithSession(result.data.session,getOAuthRole());
    }
  };

  if(isOAuthCallback()){
    var open= function(){
      var role=getOAuthRole();
      var method=role==='leader'?'leaderLogin':'memberLogin';
      if(window.YYC&&typeof window.YYC[method]==='function'){
        window.YYC[method]();
        return;
      }
      window.setTimeout(open,100);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',open,{once:true});
    else window.setTimeout(open,0);
  }
})();