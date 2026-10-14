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

  async function exchangeIdentity(session){
    if(!session||!session.access_token)throw new Error('Verified sign-in did not return a session.');
    var response=await fetch(URL+'/rest/v1/rpc/member_login_verified_identity',{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'apikey':KEY,'Authorization':'Bearer '+session.access_token,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({p_device_name:'Google sign-in'})
    });
    var result=null;
    try{result=await response.json();}catch(_){}
    if(!response.ok||!result||result.ok!==true)throw new Error(result&&result.error||'This identity is not linked to an approved YYC member.');
    return result;
  }

  async function finishWithSession(session){
    var auth=await authClient();
    try{return await exchangeIdentity(session);}
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
    }catch(_){}
  }

  window.YYCMemberAuth={
    isOAuthCallback:isOAuthCallback,
    clearCallback:clearCallback,
    startGoogle:async function(){
      var auth=await authClient();
      var redirectTo=location.origin+location.pathname;
      var result=await auth.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo,queryParams:{prompt:'select_account'}}});
      if(result.error)throw result.error;
    },
    completeOAuth:async function(){
      var auth=await authClient();
      var result=await auth.auth.getSession();
      if(result.error)throw result.error;
      if(!result.data||!result.data.session)return null;
      return finishWithSession(result.data.session);
    }
  };

  if(isOAuthCallback()){
    var open= function(){
      if(window.YYC&&typeof window.YYC.memberLogin==='function'){
        window.YYC.memberLogin();
        return;
      }
      window.setTimeout(open,100);
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',open,{once:true});
    else window.setTimeout(open,0);
  }
})();