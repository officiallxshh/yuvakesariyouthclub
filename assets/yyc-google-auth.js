(function () {
  'use strict';

  var SUPABASE_URL = (window.YYC_CONFIG && window.YYC_CONFIG.supabaseUrl) || 'https://vrllozfzheikjbhxvpkx.supabase.co';
  var SUPABASE_KEY = (window.YYC_CONFIG && window.YYC_CONFIG.supabaseKey) || '';
  var AUTH_STORAGE_KEY = 'yyc_google_oauth_session_v1';
  var authClientPromise = null;
  var callbackStarted = false;

  function roleFormId(role) {
    if (role === 'member_register') return 'memberRegisterForm';
    return role === 'member' ? 'memberLoginForm' : 'leaderLoginForm';
  }

  function setStatus(role, message, isError) {
    var form = document.getElementById(roleFormId(role));
    var box = form && form.querySelector('.access-login-status');
    if (box) {
      box.textContent = message || '';
      box.classList.toggle('is-error', !!isError);
      box.classList.toggle('is-success', !!message && !isError);
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
    }
    if (typeof window.toast === 'function') window.toast(message);
  }

  function friendlyError(error) {
    var raw = String(error && (error.message || error.error_description || error) || 'Google sign-in failed. Please try again.');
    if (/unsupported provider|provider.*not enabled|provider_disabled|google.*disabled/i.test(raw)) {
      return 'Google sign-in is not configured for YYC yet. The site administrator must enable Google in Supabase Auth and add the Google OAuth Client ID and secret.';
    }
    if (/redirect.*(allow|url|not permitted)|url.*not allowed/i.test(raw)) {
      return 'Google sign-in redirect is not allowlisted yet. Add the YYC homepage to Supabase Auth → URL Configuration, then try again.';
    }
    if (/cancel|access_denied/i.test(raw)) {
      return 'Google sign-in was cancelled. You can try again whenever you are ready.';
    }
    if (/member_not_matched|leader_not_matched|does not match one approved|exactly one active/i.test(raw)) {
      return raw;
    }
    return raw.length > 280 ? raw.slice(0, 277) + '…' : raw;
  }

  function loadSupabaseSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve();
    if (window.__yycGoogleSdkPromise) return window.__yycGoogleSdkPromise;

    window.__yycGoogleSdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/dist/umd/supabase.min.js';
      script.async = true;
      script.dataset.yycGoogleSdk = '1';
      script.onload = function () {
        if (window.supabase && typeof window.supabase.createClient === 'function') resolve();
        else {
          window.__yycGoogleSdkPromise = null;
          reject(new Error('The secure sign-in client did not load. Refresh the page and try again.'));
        }
      };
      script.onerror = function () {
        window.__yycGoogleSdkPromise = null;
        reject(new Error('Could not load the sign-in client. Check your internet connection and try again.'));
      };
      document.head.appendChild(script);
    });
    return window.__yycGoogleSdkPromise;
  }

  function getAuthClient() {
    if (authClientPromise) return authClientPromise;
    authClientPromise = loadSupabaseSdk().then(function () {
      if (!SUPABASE_KEY) throw new Error('YYC sign-in configuration is missing.');
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: AUTH_STORAGE_KEY
        }
      });
    }).catch(function (error) {
      authClientPromise = null;
      throw error;
    });
    return authClientPromise;
  }

  function deviceLabel() {
    return typeof window.yycDeviceLabel === 'function'
      ? window.yycDeviceLabel()
      : (String(navigator.platform || 'Device') + ' · Browser').slice(0, 120);
  }

  function clearOAuthCallbackParams() {
    try {
      var url = new URL(window.location.href);
      ['yyc_google_auth', 'code', 'state', 'error', 'error_description', 'error_code', 'provider', 'type'].forEach(function (key) {
        url.searchParams.delete(key);
      });
      window.history.replaceState(window.history.state, document.title, url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  async function startGoogleSignIn(role, button) {
    if (role !== 'member' && role !== 'leader' && role !== 'member_register') return;
    if (button && button.disabled) return;

    if (button) {
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
    }
    setStatus(role, 'Opening Google sign-in…', false);

    try {
      var client = await getAuthClient();
      var redirectUrl = new URL(window.location.href);
      redirectUrl.search = '';
      redirectUrl.hash = '';
      redirectUrl.searchParams.set('yyc_google_auth', role);

      var result = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl.toString(),
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          }
        }
      });

      if (result && result.error) throw result.error;
      if (result && result.data && result.data.url) {
        window.location.assign(result.data.url);
      } else {
        throw new Error('Google did not return a sign-in URL. Please try again.');
      }
    } catch (error) {
      setStatus(role, friendlyError(error), true);
      if (button && button.isConnected) {
        button.disabled = false;
        button.classList.remove('is-loading');
        button.removeAttribute('aria-busy');
      }
    }
  }

  function saveRoleSession(role, payload) {
    if (!payload || payload.ok !== true || !payload.token) {
      throw new Error((payload && payload.error) || 'YYC could not verify this Google account.');
    }

    if (role === 'member') {
      if (!payload.member || typeof window.memberDashboard !== 'function') {
        throw new Error('The YYC member portal is not ready. Refresh the page and try again.');
      }
      var member = Object.assign({}, payload.member, { approved: true, status: 'approved' });
      window.memberToken = payload.token;
      window.yycSafeSet(window.localStorage, 'yyc_member_session_v1', payload.token);
      window.yycSafeSet(window.localStorage, 'yyc_member_profile_v1', JSON.stringify(member));
      return { kind: 'member', profile: member, open: function () { window.memberDashboard(member); } };
    }

    if (!payload.leader || typeof window.leaderDashboard !== 'function') {
      throw new Error('The YYC leadership portal is not ready. Refresh the page and try again.');
    }
    var leader = Object.assign({}, payload.leader, { status: payload.leader.status || 'active' });
    window.leaderToken = payload.token;
    window.yycSafeSet(window.localStorage, 'yyc_leader_session_v1', payload.token);
    window.yycSafeSet(window.localStorage, 'yyc_leader_profile_v1', JSON.stringify(leader));
    return { kind: 'leader', profile: leader, open: function () { window.leaderDashboard(leader); } };
  }

  function showCallbackError(role, message) {
    if (role === 'member_register') {
      if (window.YYC && typeof window.YYC.memberRegister === 'function') {
        try {
          window.YYC.memberRegister();
          window.setTimeout(function () { setStatus(role, message, true); }, 120);
          return;
        } catch (_) {}
      }
      setStatus(role, message, true);
      return;
    }
    var openLogin = role === 'member' ? window.memberLogin : window.leaderLogin;
    if (typeof openLogin === 'function') {
      try {
        openLogin();
        window.setTimeout(function () { setStatus(role, message, true); }, 120);
        return;
      } catch (_) {}
    }
    setStatus(role, message, true);
  }

  async function handleOAuthCallback() {
    if (callbackStarted) return;
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (_) { return; }
    var role = params.get('yyc_google_auth');
    if (role !== 'member' && role !== 'leader' && role !== 'member_register') return;

    callbackStarted = true;
    var client = null;
    try {
      var providerError = params.get('error_description') || params.get('error');
      if (providerError) throw new Error(providerError);

      client = await getAuthClient();
      var sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      var session = sessionResult.data && sessionResult.data.session;
      if (!session || !session.user || !session.access_token) {
        throw new Error('Google did not return a verified sign-in session. Please try again.');
      }

      if (role === 'member_register') {
        var googleUser = session.user;
        var appMeta = googleUser.app_metadata || {};
        var userMeta = googleUser.user_metadata || {};
        var provider = String(appMeta.provider || '');
        if (provider && provider !== 'google') {
          throw new Error('Please continue with a Google account to register for YYC.');
        }
        if (!googleUser.email) {
          throw new Error('Google did not share an email address. Allow email access and try again.');
        }
        if (googleUser.email_confirmed_at == null) {
          throw new Error('YYC needs a verified Google email to submit a membership application.');
        }
        var profile = {
          googleVerified: true,
          name: String(userMeta.full_name || userMeta.name || ''),
          email: String(googleUser.email),
          picture: String(userMeta.avatar_url || userMeta.picture || '')
        };
        window.__yycGoogleRegistrationActive = true;
        window.__yycGoogleRegistrationProfile = profile;
        clearOAuthCallbackParams();
        if (!window.YYC || typeof window.YYC.memberRegister !== 'function') {
          throw new Error('The YYC registration form is not ready. Refresh the page and try again.');
        }
        window.YYC.memberRegister(profile);
        if (typeof window.toast === 'function') {
          window.toast('Google profile connected. Complete the remaining details to submit your application.');
        }
        return;
      }

      var rpcName = role === 'member' ? 'member_login_verified_identity' : 'leader_login_verified_identity';
      var rpcResult = await client.rpc(rpcName, { p_device_name: deviceLabel() });
      if (rpcResult.error) throw rpcResult.error;
      var result = rpcResult.data;
      if (!result || result.ok !== true) {
        throw new Error((result && result.error) || 'This Google account does not match an eligible YYC account.');
      }

      var signedIn = saveRoleSession(role, result);
      try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
      clearOAuthCallbackParams();

      if (typeof window.closeModal === 'function') window.closeModal();
      signedIn.open();
      if (typeof window.toast === 'function') window.toast('Signed in with Google. Welcome to YYC!');
      if (typeof window.yycSendExternalAlert === 'function') {
        window.yycSendExternalAlert({
          event: 'login',
          kind: role,
          session_token: result.token,
          device_name: deviceLabel(),
          channels: ['email', 'sms']
        }).catch(function () {});
      }
    } catch (error) {
      if (client) {
        try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
      }
      clearOAuthCallbackParams();
      var message = friendlyError(error);
      showCallbackError(role, message);
    }
  }

  async function submitMemberRegistration(payload) {
    if (!window.__yycGoogleRegistrationActive) {
      throw new Error('Your Google registration session has expired. Continue with Google again.');
    }
    var client = await getAuthClient();
    var sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    var session = sessionResult.data && sessionResult.data.session;
    if (!session || !session.user || !session.access_token) {
      window.__yycGoogleRegistrationActive = false;
      throw new Error('Your Google registration session has expired. Continue with Google again.');
    }
    var result = await client.rpc('member_register_verified_google', { p_payload: payload || {} });
    if (result.error) throw result.error;
    var data = result.data;
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || 'Could not submit the membership application.');
    }
    window.__yycGoogleRegistrationActive = false;
    window.__yycGoogleRegistrationProfile = null;
    try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
    return data;
  }

  function cancelPendingRegistration() {
    if (!window.__yycGoogleRegistrationActive) return;
    window.__yycGoogleRegistrationActive = false;
    window.__yycGoogleRegistrationProfile = null;
    getAuthClient().then(function (client) {
      return client.auth.signOut({ scope: 'local' });
    }).catch(function () {});
  }

  window.YYCGoogleAuth = {
    submitMemberRegistration: submitMemberRegistration,
    cancelPendingRegistration: cancelPendingRegistration
  };

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest
      ? event.target.closest('[data-yyc-google-role]')
      : null;
    if (!button) return;
    event.preventDefault();
    startGoogleSignIn(button.getAttribute('data-yyc-google-role'), button);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleOAuthCallback, { once: true });
  } else {
    handleOAuthCallback();
  }
})();
