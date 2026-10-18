(function () {
  'use strict';

  var routeParams = new URLSearchParams(window.location.search);
  var homeEmbed = routeParams.get('home_embed') === '1';
  var adminEmbed = routeParams.get('admin_embed') === '1';

  var SUPABASE_URL = 'https://vrllozfzheikjbhxvpkx.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_t8IqzrrcnMozqVPc252cjg_n5pBp_Pt';
  var TOKEN_KEYS = [
    { key: 'yyc_admin_session_v1', kind: 'admin' },
    { key: 'yyc_leader_session_v1', kind: 'leader' },
    { key: 'yyc_member_session_v1', kind: 'member' }
  ];
  var state = {
    session: null,
    meetings: [],
    activeMeeting: null,
    api: null,
    rtcClient: null,
    roomChannel: null,
    localStream: null,
    localVideo: null,
    screenStream: null,
    participantId: null,
    peers: new Map(),
    meetingWatchTimer: null,
    leaving: false,
    toastTimer: null,
    qualityMode: 'auto',
    qualityTimer: null,
    qualityBadSamples: 0,
    qualityGoodSamples: 0,
    appliedQuality: 720,
    callStartupTimer: null,
    rtcReady: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var dashboard = $('dashboardView');
  var callView = $('callView');
  var alertBox = $('meetAlert');
  var mount = $('rtcMount');

  function safeText(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  function tokens() {
    var out = [];
    TOKEN_KEYS.forEach(function (item) {
      try {
        var token = localStorage.getItem(item.key);
        if (token) out.push({ token: token, kind: item.kind });
      } catch (_) {}
    });
    return out;
  }

  function rpc(name, payload) {
    return fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload || {})
    }).then(function (response) {
      return response.text().then(function (body) {
        var data = {};
        try { data = body ? JSON.parse(body) : {}; } catch (_) {}
        if (!response.ok) {
          var message = data && (data.message || data.error_description || data.hint);
          throw new Error(message || 'The meeting service returned HTTP ' + response.status + '.');
        }
        return data;
      });
    });
  }

  function portal(action, payload, token) {
    return rpc('yyc_meet_portal', {
      p_token: token || (state.session && state.session.token) || '',
      p_action: action,
      p_payload: payload || {}
    });
  }

  function notify(message, type) {
    var toast = $('meetToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'meet-toast show' + (type ? ' ' + type : '');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { toast.classList.remove('show'); }, 3100);
  }

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.hidden = !message;
  }

  function dateForInput(date) {
    var d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  function formatDate(value) {
    if (!value) return 'Time to be confirmed';
    var d = new Date(value);
    if (isNaN(d.getTime())) return 'Time to be confirmed';
    return d.toLocaleString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function formatTime(value) {
    return value ? formatDate(value) : '—';
  }

  function cleanCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-F0-9]/g, '');
  }

  function extractInviteCode(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';

    // Accept complete copied YYC links as well as direct invite codes.
    var queryMatch = raw.match(/[?&](?:join|invite_code|inviteCode|code)=([A-Fa-f0-9]{32})(?=$|[#&\s])/i);
    if (queryMatch) return queryMatch[1].toUpperCase();

    try {
      var parsed = new URL(raw, window.location.href);
      var names = ['join', 'invite_code', 'inviteCode', 'code'];
      for (var i = 0; i < names.length; i++) {
        var fromSearch = parsed.searchParams.get(names[i]);
        if (fromSearch && /^[A-Fa-f0-9]{32}$/.test(fromSearch)) return fromSearch.toUpperCase();
      }
      // Also tolerate invite links that put a query string after #meet.
      var hashQueryAt = parsed.hash.indexOf('?');
      if (hashQueryAt >= 0) {
        var hashParams = new URLSearchParams(parsed.hash.slice(hashQueryAt + 1));
        for (var h = 0; h < names.length; h++) {
          var fromHash = hashParams.get(names[h]);
          if (fromHash && /^[A-Fa-f0-9]{32}$/.test(fromHash)) return fromHash.toUpperCase();
        }
      }
    } catch (_) {}

    // Accept a raw 32-character code with optional spaces/hyphens for readability.
    if (/^[A-Fa-f0-9\s-]+$/.test(raw)) {
      var compact = raw.replace(/[\s-]/g, '').toUpperCase();
      if (/^[A-F0-9]{32}$/.test(compact)) return compact;
    }
    return '';
  }

  function isAdminSession(session) {
    return !!(session && session.actor && session.actor.kind === 'admin' && session.token);
  }

  function inviteUrl(code) {
    // Private invite links open the full-page YYC Meet view rather than the nested homepage iframe.
    var u = new URL('./', window.location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('join', code);
    return u.href;
  }

  function setProfile(session) {
    var name = session && session.actor && session.actor.name ? session.actor.name : 'Welcome to YYC Meet';
    if (session && session.actor && session.actor.name && !$('participantName').value.trim()) $('participantName').value = session.actor.name;
    $('profileName').textContent = name;
    $('profileAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'Y';
    $('profileRole').textContent = session && session.actor ? session.actor.kind + ' account' : 'Invite guests can join without an account';
    $('profileStatus').textContent = session ? 'Signed in' : 'Guest access';
    $('actorBadge').textContent = session ? 'Signed in as ' + name : 'Account required';
  }

  function hostCanManage(meeting) {
    if (!state.session || !state.session.actor || !meeting) return false;
    var actor = state.session.actor;
    if (actor.kind === 'admin') return true;
    return actor.kind === meeting.host_kind && actor.id && meeting.host_id && actor.id === meeting.host_id;
  }

  function statusLabel(status) {
    if (status === 'live') return 'Live now';
    if (status === 'ended') return 'Ended';
    if (status === 'cancelled') return 'Cancelled';
    return 'Scheduled';
  }

  function renderMeetings() {
    var root = $('meetingList');
    if (!isAdminSession(state.session)) {
      root.innerHTML = '<div class="empty-meetings"><span class="empty-orbit">⌑</span><b>Private meetings are not listed here</b><p>Open the exact invite link shared by the YYC administrator.</p></div>';
      return;
    }
    if (!state.meetings.length) {
      root.innerHTML = '<div class="empty-meetings"><span class="empty-orbit">◷</span><b>No meetings scheduled yet</b><p>Create an instant room or schedule the next team check-in.</p></div>';
      return;
    }
    root.innerHTML = state.meetings.map(function (m, index) {
      var status = String(m.status || 'scheduled');
      var canManage = hostCanManage(m);
      var desc = String(m.description || '').trim();
      var codeText = m.invite_code ? 'Code ' + m.invite_code : '';
      var joinDisabled = status === 'ended' || status === 'cancelled';
      var actions = adminEmbed ? '' : '<button type="button" class="meet-btn meet-btn-gold" data-action="join" data-code="' + safeText(m.invite_code) + '"' + (joinDisabled ? ' disabled' : '') + '>' + (status === 'live' ? 'Join live room ↗' : 'Join room ↗') + '</button>';
      if (m.invite_code) actions += '<button type="button" class="text-action" data-action="copy" data-code="' + safeText(m.invite_code) + '">Copy invite</button>';
      if (canManage && status !== 'cancelled' && status !== 'ended') {
        if (status !== 'live') actions += '<button type="button" class="text-action" data-action="manage-start" data-id="' + safeText(m.id) + '">Start</button>';
        actions += '<button type="button" class="text-action" data-action="manage-end" data-id="' + safeText(m.id) + '">End</button>';
        if (!adminEmbed) actions += '<button type="button" class="text-action" data-action="cancel" data-id="' + safeText(m.id) + '">Cancel</button>';
      }
      return '<article class="meeting-card" style="animation-delay:' + Math.min(index * 40, 240) + 'ms">' +
        '<div class="meeting-card-content">' +
          '<span class="status-chip ' + safeText(status) + '">' + safeText(statusLabel(status)) + '</span>' +
          '<h3>' + safeText(m.title || 'YYC Meeting') + '</h3>' +
          (desc ? '<p class="meeting-description">' + safeText(desc) + '</p>' : '') +
          '<div class="meeting-meta"><span>◷ <b>' + safeText(formatTime(m.starts_at)) + '</b></span><span>◉ ' + safeText(m.host_name || 'YYC Host') + '</span><span>⌁ ' + safeText(String(m.duration_minutes || 60)) + ' min</span><span>♙ ' + safeText(String(m.attendee_count || 0)) + ' joins</span>' + (codeText ? '<span>⌑ ' + safeText(codeText) + '</span>' : '') + '</div>' +
        '</div><div class="meeting-actions">' + actions + '</div></article>';
    }).join('');
  }

  function loadMeetings() {
    if (homeEmbed || !isAdminSession(state.session)) {
      state.meetings = [];
      renderMeetings();
      return Promise.resolve();
    }
    return portal('list', {}).then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.message) || 'Could not load meeting list.');
      state.meetings = Array.isArray(data.meetings) ? data.meetings : [];
      if (data.actor) {
        state.session.actor = data.actor;
        setProfile(state.session);
      }
      renderMeetings();
    }).catch(function (err) {
      showAlert(err.message || 'Meeting list could not be loaded.');
      renderMeetings();
    });
  }

  function discoverSession() {
    var candidates = tokens();
    var chain = Promise.resolve(null);
    candidates.forEach(function (candidate) {
      chain = chain.then(function (found) {
        if (found) return found;
        return portal('me', {}, candidate.token).then(function (data) {
          if (data && data.ok && data.actor) return { token: candidate.token, actor: data.actor };
          return null;
        }).catch(function () { return null; });
      });
    });
    return chain.then(function (session) {
      state.session = session;
      setProfile(session);
      var admin = isAdminSession(session);
      $('loginNeeded').hidden = admin || homeEmbed;
      $('scheduleForm').hidden = !admin || homeEmbed;
      $('instantMeetBtn').hidden = !admin || homeEmbed;
      $('schedulePanel').hidden = homeEmbed;
      $('meetingsPanel').hidden = !admin || homeEmbed;
      $('profileRole').textContent = admin ? 'YYC administrator' : 'Invite-only access · no meeting list';
      $('profileStatus').textContent = admin ? 'Admin session' : 'Invite access';
      return loadMeetings().then(function () { notifyHomeFrameHeight(); });
    });
  }

  function callLookup(code) {
    var cleaned = cleanCode(code);
    if (!/^[A-F0-9]{32}$/.test(cleaned)) {
      showAlert('Use the full private invite link or its 32-character invite code, not the meeting database ID.');
      return Promise.reject(new Error('Invalid meeting code.'));
    }
    return rpc('yyc_meet_lookup', { p_invite_code: cleaned }).then(function (data) {
      if (!data || !data.ok || !data.meeting) throw new Error((data && data.message) || 'This meeting could not be found.');
      showAlert('');
      return data.meeting;
    });
  }

  function loadRealtimeClient() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve();
    if (window.__yycSupabaseSdkPromise) return window.__yycSupabaseSdkPromise;
    window.__yycSupabaseSdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/dist/umd/supabase.js';
      script.async = true;
      script.onload = function () {
        if (window.supabase && typeof window.supabase.createClient === 'function') resolve();
        else {
          window.__yycSupabaseSdkPromise = null;
          reject(new Error('The YYC room-signaling client could not start.'));
        }
      };
      script.onerror = function () {
        window.__yycSupabaseSdkPromise = null;
        reject(new Error('Could not load YYC room signaling. Check your internet connection and retry.'));
      };
      document.head.appendChild(script);
    });
    return window.__yycSupabaseSdkPromise;
  }

  function ensureRealtimeClient() {
    return loadRealtimeClient().then(function () {
      if (!state.rtcClient) {
        state.rtcClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond: 30 } }
        });
      }
      return state.rtcClient;
    });
  }

  function notifyHomeFrameHeight() {
    if (!homeEmbed || window.parent === window) return;
    var height;
    if (callView && !callView.hidden) {
      height = Math.max(760, Math.ceil(window.innerHeight * 1.08));
    } else {
      height = Math.max(420, Math.ceil((dashboard ? dashboard.scrollHeight : 420) + 20));
    }
    try { window.parent.postMessage({ type: 'yyc-meet-frame-height', height: height }, window.location.origin); } catch (_) {}
  }

  function setCallVisible(isVisible) {
    dashboard.hidden = !!isVisible;
    callView.hidden = !isVisible;
    document.body.classList.toggle('in-call', !!isVisible);
    document.documentElement.classList.toggle('in-call-mode', !!isVisible);
    if (!isVisible) {
      callView.classList.remove('panel-open');
      $('toggleChatPanelBtn').textContent = 'Chat';
      $('toggleChatPanelBtn').setAttribute('aria-pressed', 'false');
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.setTimeout(notifyHomeFrameHeight, 80);
  }

  function markStatus(text, isLive) {
    $('videoStatusText').textContent = text;
    $('videoStatusDot').style.background = isLive ? '#8bcea8' : '#d9b770';
  }

  function loadRealtimeClient() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve();
    if (window.__yycSupabaseSdkPromise) return window.__yycSupabaseSdkPromise;
    window.__yycSupabaseSdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/dist/umd/supabase.js';
      script.async = true;
      script.onload = function () {
        if (window.supabase && typeof window.supabase.createClient === 'function') resolve();
        else {
          window.__yycSupabaseSdkPromise = null;
          reject(new Error('The YYC room-signaling client could not start.'));
        }
      };
      script.onerror = function () {
        window.__yycSupabaseSdkPromise = null;
        reject(new Error('Could not load YYC room signaling. Check your internet connection and retry.'));
      };
      document.head.appendChild(script);
    });
    return window.__yycSupabaseSdkPromise;
  }

  function ensureRealtimeClient() {
    return loadRealtimeClient().then(function () {
      if (!state.rtcClient) {
        state.rtcClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          realtime: { params: { eventsPerSecond: 30 } }
        });
      }
      return state.rtcClient;
    });
  }

  function roomPresences() {
    if (!state.roomChannel) return [];
    var presence = state.roomChannel.presenceState() || {};
    return Object.keys(presence).reduce(function (all, key) {
      return all.concat(Array.isArray(presence[key]) ? presence[key] : []);
    }, []);
  }

  function renderRtcTile(participantId, displayName, isLocal, stream) {
    var tile = document.createElement('article');
    tile.className = 'rtc-video-tile' + (isLocal ? ' rtc-self-tile' : '');
    tile.dataset.participantId = participantId;
    var video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = !!isLocal;
    video.srcObject = stream || null;
    var label = document.createElement('div');
    label.className = 'rtc-video-label';
    label.textContent = (displayName || (isLocal ? 'You' : 'YYC Guest')) + (isLocal ? ' · You' : '');
    tile.appendChild(video);
    tile.appendChild(label);
    mount.appendChild(tile);
    if (isLocal) state.localVideo = video;
    return { tile: tile, video: video, label: label };
  }

  function sendRtcSignal(to, kind, data) {
    if (!state.roomChannel || !state.participantId) return Promise.resolve();
    return Promise.resolve(state.roomChannel.send({
      type: 'broadcast',
      event: 'rtc-signal',
      payload: {
        from: state.participantId,
        to: to,
        kind: kind,
        data: data,
        displayName: meetingDisplayName()
      }
    })).catch(function () {});
  }

  function updateRtcStatus() {
    if (!state.activeMeeting || state.leaving) return;
    var connected = 1;
    state.peers.forEach(function (peer) {
      if (peer.pc.connectionState === 'connected') connected += 1;
    });
    if (connected > 1) markStatus('Direct peer-to-peer call · ' + connected + ' connected', true);
    else markStatus('Waiting for participants to connect directly…', false);
  }

  function closeRtcPeer(participantId) {
    var peer = state.peers.get(participantId);
    if (!peer) return;
    try { peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.close(); } catch (_) {}
    if (peer.tile && peer.tile.parentNode) peer.tile.parentNode.removeChild(peer.tile);
    state.peers.delete(participantId);
    updateRtcStatus();
  }

  function ensureRtcPeer(participantId, displayName) {
    var existing = state.peers.get(participantId);
    if (existing) {
      if (displayName && existing.label) existing.label.textContent = displayName;
      return existing;
    }
    if (!state.localStream) throw new Error('Your camera and microphone are not ready yet.');
    var pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    var remoteStream = new MediaStream();
    var view = renderRtcTile(participantId, displayName || 'YYC Guest', false, remoteStream);
    var peer = {
      pc: pc,
      stream: remoteStream,
      tile: view.tile,
      video: view.video,
      label: view.label,
      displayName: displayName || 'YYC Guest',
      pendingCandidates: [],
      offerStarted: false
    };
    state.peers.set(participantId, peer);
    state.localStream.getTracks().forEach(function (track) { pc.addTrack(track, state.localStream); });
    pc.ontrack = function (event) {
      var incoming = event.streams && event.streams[0];
      if (incoming) {
        peer.video.srcObject = incoming;
      } else {
        if (!peer.stream.getTracks().some(function (track) { return track.id === event.track.id; })) peer.stream.addTrack(event.track);
        peer.video.srcObject = peer.stream;
      }
      peer.video.play().catch(function () {});
    };
    pc.onicecandidate = function (event) {
      if (event.candidate) sendRtcSignal(participantId, 'candidate', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
    };
    pc.onconnectionstatechange = updateRtcStatus;
    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'failed') {
        markStatus('Could not connect directly to a participant. Their network may require a YYC-managed TURN relay.', false);
      }
      updateRtcStatus();
    };
    updateRtcStatus();
    return peer;
  }

  function flushRtcCandidates(peer) {
    var queued = peer.pendingCandidates.splice(0);
    return queued.reduce(function (chain, candidate) {
      return chain.then(function () { return peer.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(function () {}); });
    }, Promise.resolve());
  }

  function createRtcOffer(participantId, displayName) {
    var peer;
    try { peer = ensureRtcPeer(participantId, displayName); }
    catch (error) { return Promise.reject(error); }
    if (peer.offerStarted || peer.pc.signalingState !== 'stable') return Promise.resolve();
    peer.offerStarted = true;
    return peer.pc.createOffer().then(function (offer) {
      return peer.pc.setLocalDescription(offer);
    }).then(function () {
      return sendRtcSignal(participantId, 'offer', peer.pc.localDescription);
    }).catch(function (error) {
      peer.offerStarted = false;
      throw error;
    });
  }

  function syncRtcPeers() {
    if (!state.roomChannel || !state.participantId || state.leaving) return;
    var peers = roomPresences();
    peers.forEach(function (presence) {
      var id = presence && presence.participantId;
      if (!id || id === state.participantId) return;
      try { ensureRtcPeer(id, presence.displayName || 'YYC Guest'); } catch (_) {}
      if (state.participantId < id) {
        createRtcOffer(id, presence.displayName || 'YYC Guest').catch(function () {
          markStatus('Could not establish a direct connection to a participant.', false);
        });
      }
    });
    updateRtcStatus();
  }

  function handleRtcSignal(payload) {
    if (!payload || payload.to !== state.participantId || payload.from === state.participantId || !payload.from) return;
    var peer;
    try { peer = ensureRtcPeer(payload.from, payload.displayName || 'YYC Guest'); }
    catch (_) { return; }

    var pc = peer.pc;
    if (payload.kind === 'offer') {
      Promise.resolve().then(function () { return pc.setRemoteDescription(new RTCSessionDescription(payload.data)); })
        .then(function () { return flushRtcCandidates(peer); })
        .then(function () { return pc.createAnswer(); })
        .then(function (answer) { return pc.setLocalDescription(answer); })
        .then(function () { return sendRtcSignal(payload.from, 'answer', pc.localDescription); })
        .catch(function () { markStatus('The incoming call handshake failed. Please leave and rejoin.', false); });
    } else if (payload.kind === 'answer') {
      if (pc.signalingState !== 'have-local-offer') return;
      pc.setRemoteDescription(new RTCSessionDescription(payload.data))
        .then(function () { return flushRtcCandidates(peer); })
        .catch(function () { markStatus('The call answer could not be applied. Please rejoin the room.', false); });
    } else if (payload.kind === 'candidate' && payload.data) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(new RTCIceCandidate(payload.data)).catch(function () {});
      } else {
        peer.pendingCandidates.push(payload.data);
      }
    }
  }

  function addRtcChatMessage(name, message, mine, timestamp) {
    var list = $('chatMessages');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'rtc-chat-message' + (mine ? ' mine' : '');
    var author = document.createElement('b');
    author.textContent = mine ? 'You' : (name || 'YYC Guest');
    var body = document.createElement('p');
    body.textContent = String(message || '').slice(0, 500);
    var time = document.createElement('small');
    time.textContent = new Date(timestamp || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    row.appendChild(author);
    row.appendChild(body);
    row.appendChild(time);
    list.appendChild(row);
    while (list.children.length > 80) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  }

  function cleanupRtcResources() {
    if (state.meetingWatchTimer) window.clearInterval(state.meetingWatchTimer);
    state.meetingWatchTimer = null;
    if (state.screenStream) {
      state.screenStream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
      state.screenStream = null;
    }
    if (state.roomChannel) {
      var channel = state.roomChannel;
      state.roomChannel = null;
      try { channel.untrack(); } catch (_) {}
      if (state.rtcClient) {
        Promise.resolve(state.rtcClient.removeChannel(channel)).catch(function () {});
      } else {
        try { channel.unsubscribe(); } catch (_) {}
      }
    }
    Array.from(state.peers.keys()).forEach(closeRtcPeer);
    if (state.localStream) {
      state.localStream.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
      state.localStream = null;
    }
    state.localVideo = null;
    state.participantId = null;
    state.screenStream = null;
    if (mount) mount.innerHTML = '';
    if ($('rtcControls')) $('rtcControls').hidden = true;
  }

  function startScreenShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      notify('Screen sharing is not supported in this browser.');
      return Promise.resolve();
    }
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(function (screen) {
      var screenTrack = screen.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen video was available to share.');
      state.screenStream = screen;
      state.peers.forEach(function (peer) {
        var sender = peer.pc.getSenders().find(function (item) { return item.track && item.track.kind === 'video'; });
        if (sender) sender.replaceTrack(screenTrack).catch(function () {});
      });
      if (state.localVideo) state.localVideo.srcObject = screen;
      $('shareScreenBtn').textContent = 'Stop sharing';
      $('shareScreenBtn').setAttribute('aria-pressed', 'true');
      screenTrack.onended = function () { stopScreenShare(); };
    }).catch(function (error) {
      if (error && error.name !== 'NotAllowedError') notify(error.message || 'Could not start screen sharing.');
    });
  }

  function stopScreenShare() {
    var screen = state.screenStream;
    state.screenStream = null;
    var cameraTrack = state.localStream && state.localStream.getVideoTracks()[0];
    if (screen) screen.getTracks().forEach(function (track) { try { track.stop(); } catch (_) {} });
    if (cameraTrack) {
      state.peers.forEach(function (peer) {
        var sender = peer.pc.getSenders().find(function (item) { return item.track && item.track.kind === 'video'; });
        if (sender) sender.replaceTrack(cameraTrack).catch(function () {});
      });
    }
    if (state.localVideo && state.localStream) state.localVideo.srcObject = state.localStream;
    if ($('shareScreenBtn')) {
      $('shareScreenBtn').textContent = 'Share screen';
      $('shareScreenBtn').setAttribute('aria-pressed', 'false');
    }
  }

  function startConference(meeting) {
    if (!meeting || !meeting.room_name || !meeting.invite_code) {
      notify('This meeting does not have an active private room yet.');
      return Promise.resolve();
    }
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      notify('This meeting has ended or was cancelled.');
      return Promise.resolve();
    }
    cleanupRtcResources();
    state.activeMeeting = meeting;
    state.leaving = false;
    state.rtcReady = false;
    if (state.callStartupTimer) window.clearTimeout(state.callStartupTimer);
    state.callStartupTimer = window.setTimeout(function () {
      if (!state.activeMeeting || state.leaving || state.rtcReady) return;
      $('callErrorText').textContent = 'YYC could not finish connecting. Allow camera/microphone access and check whether your network supports direct WebRTC calls.';
      $('callError').hidden = false;
      markStatus('Connection timed out', false);
    }, 30000);

    $('callTitle').textContent = meeting.title || 'YYC Meeting';
    $('callMeetingMeta').textContent = formatDate(meeting.starts_at) + ' · Private peer-to-peer room';
    $('railTitle').textContent = meeting.title || 'YYC Meeting';
    $('railDescription').textContent = meeting.description || 'A private YYC conversation using direct browser connections.';
    $('railHost').textContent = meeting.host_name || 'YYC Host';
    $('railDuration').textContent = String(meeting.duration_minutes || 60) + ' minutes';
    $('railCode').textContent = meeting.invite_code || '—';
    $('callError').hidden = true;
    $('chatMessages').innerHTML = '';
    addRtcChatMessage('YYC Meet', 'Room chat is ready. Messages are shared only with people in this invite-only room.', false, Date.now());
    mount.innerHTML = '';
    setCallVisible(true);
    markStatus('Starting your camera and microphone…', false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) {
      $('callErrorText').textContent = 'This browser does not support the camera, microphone, or peer-to-peer features required by YYC Meet. Please use a current version of Chrome, Edge, Firefox, or Safari over HTTPS.';
      $('callError').hidden = false;
      if (state.callStartupTimer) window.clearTimeout(state.callStartupTimer);
      state.callStartupTimer = null;
      return Promise.resolve();
    }

    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
    }).then(function (stream) {
      if (state.leaving || !state.activeMeeting) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      state.localStream = stream;
      state.participantId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      renderRtcTile(state.participantId, meetingDisplayName(), true, stream);
      $('rtcControls').hidden = false;

      return ensureRealtimeClient().then(function (client) {
        if (state.leaving || !state.activeMeeting) return;
        var topic = 'yyc-rtc-' + String(meeting.room_name).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
        var channel = client.channel(topic, {
          config: { broadcast: { self: false }, presence: { key: state.participantId } }
        });
        state.roomChannel = channel;
        channel.on('broadcast', { event: 'rtc-signal' }, function (event) { handleRtcSignal(event && event.payload); });
        channel.on('broadcast', { event: 'rtc-chat' }, function (event) {
          var message = event && event.payload;
          if (!message || message.from === state.participantId || typeof message.message !== 'string') return;
          addRtcChatMessage(String(message.name || 'YYC Guest').slice(0, 80), message.message, false, message.sentAt);
        });
        channel.on('broadcast', { event: 'rtc-room-ended' }, function () {
          notify('The YYC meeting host has ended this room.');
          leaveConference(false);
        });
        channel.on('presence', { event: 'sync' }, function () { syncRtcPeers(); });
        channel.on('presence', { event: 'join' }, function () { window.setTimeout(syncRtcPeers, 150); });
        channel.on('presence', { event: 'leave' }, function (event) {
          (event && event.leftPresences ? event.leftPresences : []).forEach(function (presence) {
            if (presence && presence.participantId) closeRtcPeer(presence.participantId);
          });
        });

        return new Promise(function (resolve, reject) {
          var settled = false;
          var timeout = window.setTimeout(function () {
            if (settled) return;
            settled = true;
            reject(new Error('YYC room signaling timed out. Refresh and try joining again.'));
          }, 12000);
          channel.subscribe(function (status) {
            if (settled) return;
            if (status === 'SUBSCRIBED') {
              settled = true;
              window.clearTimeout(timeout);
              resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              settled = true;
              window.clearTimeout(timeout);
              reject(new Error('YYC could not open the private room signaling channel. Please retry.'));
            }
          });
        }).then(function () {
          return channel.track({
            participantId: state.participantId,
            displayName: meetingDisplayName(),
            joinedAt: new Date().toISOString()
          });
        }).then(function () {
          return new Promise(function (resolve) { window.setTimeout(resolve, 700); });
        }).then(function () {
          if (state.leaving || !state.activeMeeting) return;
          var allPresences = roomPresences();
          if (allPresences.length > 4) {
            throw new Error('This first YYC peer-to-peer version supports up to 4 people per room. A self-hosted media relay is needed for larger meetings.');
          }
          syncRtcPeers();
          markStatus('Room ready · connecting directly to participants…', false);
          state.rtcReady = true;
          if (state.callStartupTimer) window.clearTimeout(state.callStartupTimer);
          state.callStartupTimer = null;

          state.meetingWatchTimer = window.setInterval(function () {
            if (!state.activeMeeting || state.leaving) return;
            rpc('yyc_meet_lookup', { p_invite_code: meeting.invite_code }).then(function (data) {
              if (data && !data.ok && ['NOT_FOUND', 'NOT_STARTED'].indexOf(data.error) >= 0) {
                notify('This YYC meeting has ended or is no longer live.');
                leaveConference(false);
              }
            }).catch(function () {});
          }, 15000);
        });
      });
    }).catch(function (error) {
      cleanupRtcResources();
      if (state.callStartupTimer) window.clearTimeout(state.callStartupTimer);
      state.callStartupTimer = null;
      $('callErrorText').textContent = (error && error.message) || 'Could not start YYC Meet. Check camera/microphone permissions and try again.';
      $('callError').hidden = false;
      markStatus('Could not connect', false);
    });
  }

  function meetingDisplayName() {
    var value = String($('participantName').value || '').trim();
    if (!value && state.session && state.session.actor) value = String(state.session.actor.name || '').trim();
    value = value.slice(0, 80);
    return value || 'YYC Guest';
  }

  function leaveConference(showToast) {
    if (state.leaving) return;
    state.leaving = true;
    cleanupRtcResources();
    state.api = null;
    state.activeMeeting = null;
    state.rtcReady = false;
    if (state.callStartupTimer) window.clearTimeout(state.callStartupTimer);
    state.callStartupTimer = null;
    setCallVisible(false);
    if (showToast !== false) notify('You have left YYC Meet.');
    discoverSession();
  }

  function createMeeting(payload) {
    if (!state.session) {
      notify('Please sign in through the main YYC website first.');
      return Promise.reject(new Error('YYC sign-in required.'));
    }
    return portal('create', payload).then(function (data) {
      if (!data || !data.ok || !data.meeting) throw new Error((data && data.message) || 'The meeting could not be created.');
      return data.meeting;
    });
  }

  function copyText(value, successMessage) {
    if (!value) return;
    var textValue = String(value);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textValue).then(function () { notify(successMessage || 'Copied to clipboard.'); }).catch(function () { copyFallback(textValue, successMessage); });
    } else copyFallback(textValue, successMessage);
  }

  function copyFallback(value, successMessage) {
    var node = document.createElement('textarea');
    node.value = value;
    node.setAttribute('readonly', '');
    node.style.position = 'fixed';
    node.style.opacity = '0';
    document.body.appendChild(node);
    node.select();
    try { document.execCommand('copy'); notify(successMessage || 'Copied to clipboard.'); }
    catch (_) { notify('Copy failed. Select and copy the invite manually.'); }
    node.remove();
  }

  function closeJoinWindow(joinWindow) {
    if (joinWindow && !joinWindow.closed) {
      try { joinWindow.close(); } catch (_) {}
    }
  }

  function openInvitePage(code, joinWindow) {
    var targetUrl = inviteUrl(code);
    if (joinWindow && !joinWindow.closed) {
      try { joinWindow.opener = null; } catch (_) {}
      joinWindow.location.replace(targetUrl);
      return;
    }
    if (window.parent !== window) window.top.location.assign(targetUrl);
    else window.location.assign(targetUrl);
  }

  function goToMeeting(code, joinWindow) {
    return callLookup(code).then(function (meeting) {
      if (meeting.status !== 'live' || !meeting.room_name) {
        closeJoinWindow(joinWindow);
        notify('The YYC Admin must start this meeting before anyone can join. Please try the same invite after it goes live.');
        return;
      }
      if ((homeEmbed || adminEmbed) && window.parent !== window) {
        openInvitePage(code, joinWindow);
        return;
      }
      closeJoinWindow(joinWindow);
      return startConference(meeting);
    }).catch(function (err) {
      closeJoinWindow(joinWindow);
      if (err && err.message !== 'Invalid meeting code.') {
        showAlert((err && err.message) || 'Could not validate this meeting invite.');
      }
    });
  }

  $('meetYear').textContent = String(new Date().getFullYear());
  $('meetingStartsAt').value = dateForInput(new Date(Date.now() + 60 * 60 * 1000));
  $('meetingStartsAt').min = dateForInput(new Date(Date.now() - 10 * 60 * 1000));

  $('joinCodeForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = $('joinCode').value.trim();
    if (!value) return;
    var code = extractInviteCode(value);
    if (!code) {
      var looksLikeMeetingId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
      showAlert(looksLikeMeetingId
        ? 'That looks like a meeting database ID, not the private invite code. Use Copy invite in Admin Panel, then paste the full link here.'
        : 'Paste the full copied invite link or the 32-character private invite code. Admin must start the meeting before guests can join.');
      return;
    }
    var joinWindow = (homeEmbed || adminEmbed) ? window.open('about:blank', '_blank') : null;
    goToMeeting(code, joinWindow);
  });

  $('instantMeetBtn').addEventListener('click', function () {
    if (!isAdminSession(state.session)) {
      notify('Only a YYC Admin can start an instant meeting from Admin Panel.');
      return;
    }
    var hostWindow = adminEmbed ? window.open('about:blank', '_blank') : null;
    var now = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    createMeeting({
      title: 'YYC Quick Meeting',
      description: 'Instant team conversation.',
      starts_at: now,
      duration_minutes: 60,
      visibility: 'invite',
      waiting_room: false
    }).then(function (meeting) {
      return portal('start', { id: meeting.id }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Could not start the meeting.');
        return callLookup(meeting.invite_code).then(function (fullMeeting) {
          loadMeetings();
          if (adminEmbed && hostWindow && !hostWindow.closed) hostWindow.location.replace(inviteUrl(meeting.invite_code));
          else startConference(fullMeeting);
        });
      });
    }).catch(function (err) {
      if (hostWindow && !hostWindow.closed) hostWindow.close();
      notify((err && err.message) || 'Could not create an instant meeting.');
    });
  });

  $('scheduleForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!isAdminSession(state.session)) { notify('Only a YYC Admin can schedule meetings from Admin Panel.'); return; }
    var button = $('scheduleSubmit');
    button.disabled = true;
    button.textContent = 'Scheduling…';
    var startsAt = new Date($('meetingStartsAt').value);
    if (isNaN(startsAt.getTime())) {
      notify('Choose a valid date and time.');
      button.disabled = false;
      button.innerHTML = 'Schedule meeting <span>↗</span>';
      return;
    }
    createMeeting({
      title: $('meetingTitle').value.trim(),
      description: $('meetingDescription').value.trim(),
      starts_at: startsAt.toISOString(),
      duration_minutes: Number($('meetingDuration').value) || 60,
      visibility: $('meetingVisibility').value,
      waiting_room: $('meetingWaitingRoom').checked
    }).then(function (meeting) {
      notify('Meeting scheduled. Copy the invite link to share it.');
      $('meetingTitle').value = '';
      $('meetingDescription').value = '';
      $('meetingStartsAt').value = dateForInput(new Date(Date.now() + 60 * 60 * 1000));
      return loadMeetings().then(function () {
        copyText(inviteUrl(meeting.invite_code), 'Meeting invite link copied.');
      });
    }).catch(function (err) {
      notify((err && err.message) || 'Could not schedule this meeting.');
    }).finally(function () {
      button.disabled = false;
      button.innerHTML = 'Schedule meeting <span>↗</span>';
    });
  });

  $('meetingList').addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    var action = button.getAttribute('data-action');
    var code = button.getAttribute('data-code');
    var id = button.getAttribute('data-id');
    if (action === 'join') {
      var joinWindow = (homeEmbed || adminEmbed) ? window.open('about:blank', '_blank') : null;
      goToMeeting(code, joinWindow);
    } else if (action === 'copy') copyText(inviteUrl(code), 'Invite link copied.');
    else if (action === 'cancel') {
      if (!window.confirm('Cancel this meeting? Its invite will no longer open the room.')) return;
      portal('cancel', { id: id }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Only the host or a YYC admin can cancel this meeting.');
        notify('Meeting cancelled.');
        return loadMeetings();
      }).catch(function (err) { notify((err && err.message) || 'Could not cancel the meeting.'); });
    } else if (action === 'manage-start') {
      var hostWindow = adminEmbed ? window.open('about:blank', '_blank') : null;
      var scheduledMeeting = state.meetings.find(function (item) { return item.id === id; });
      if (!scheduledMeeting) { if (hostWindow && !hostWindow.closed) hostWindow.close(); notify('Refresh the meeting list and try again.'); return; }
      portal('start', { id: id }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Only a YYC Admin can start this meeting.');
        notify('Meeting is live. Opening the custom YYC room…');
        return callLookup(scheduledMeeting.invite_code).then(function (fullMeeting) {
          return loadMeetings().then(function () {
            if (adminEmbed && hostWindow && !hostWindow.closed) hostWindow.location.replace(inviteUrl(scheduledMeeting.invite_code));
            else startConference(fullMeeting);
          });
        });
      }).catch(function (err) {
        if (hostWindow && !hostWindow.closed) hostWindow.close();
        notify((err && err.message) || 'Could not start the meeting.');
      });
    } else if (action === 'manage-end') {
      portal('end', { id: id }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Only a YYC Admin can end this meeting.');
        notify('Meeting ended.');
        return loadMeetings();
      }).catch(function (err) { notify((err && err.message) || 'Could not end the meeting.'); });
    }
  });

  $('refreshMeetingsBtn').addEventListener('click', function () {
    $('refreshMeetingsBtn').style.transform = 'rotate(120deg)';
    discoverSession().finally(function () {
      window.setTimeout(function () { $('refreshMeetingsBtn').style.transform = ''; }, 250);
    });
  });

  $('toggleMicBtn').addEventListener('click', function () {
    if (!state.localStream) return;
    var tracks = state.localStream.getAudioTracks();
    var enabled = tracks.some(function (track) { return !track.enabled; });
    tracks.forEach(function (track) { track.enabled = enabled; });
    $('toggleMicBtn').textContent = enabled ? 'Mute mic' : 'Unmute mic';
    $('toggleMicBtn').setAttribute('aria-pressed', enabled ? 'false' : 'true');
  });
  $('toggleCameraBtn').addEventListener('click', function () {
    if (!state.localStream) return;
    var tracks = state.localStream.getVideoTracks();
    var enabled = tracks.some(function (track) { return !track.enabled; });
    tracks.forEach(function (track) { track.enabled = enabled; });
    $('toggleCameraBtn').textContent = enabled ? 'Turn camera off' : 'Turn camera on';
    $('toggleCameraBtn').setAttribute('aria-pressed', enabled ? 'false' : 'true');
  });
  $('shareScreenBtn').addEventListener('click', function () {
    if (state.screenStream) stopScreenShare();
    else startScreenShare();
  });
  $('toggleChatPanelBtn').addEventListener('click', function () {
    var open = callView.classList.toggle('panel-open');
    $('toggleChatPanelBtn').textContent = open ? 'Close chat' : 'Chat';
    $('toggleChatPanelBtn').setAttribute('aria-pressed', open ? 'true' : 'false');
  });
  $('chatForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var input = $('chatInput');
    var message = String(input.value || '').trim().slice(0, 500);
    if (!message || !state.roomChannel || !state.participantId) return;
    var payload = {
      from: state.participantId,
      name: meetingDisplayName(),
      message: message,
      sentAt: new Date().toISOString()
    };
    addRtcChatMessage(payload.name, payload.message, true, payload.sentAt);
    input.value = '';
    Promise.resolve(state.roomChannel.send({ type: 'broadcast', event: 'rtc-chat', payload: payload })).catch(function () {
      notify('Chat message could not be sent. Check the room connection.');
    });
  });
  $('audioOnlyHintBtn').addEventListener('click', function () {
    if (state.localStream) {
      state.localStream.getVideoTracks().forEach(function (track) { track.enabled = false; });
      $('toggleCameraBtn').textContent = 'Turn camera on';
      $('toggleCameraBtn').setAttribute('aria-pressed', 'true');
      notify('Camera disabled to reduce upload bandwidth. Use the camera button to turn it back on.');
    } else notify('Turn off your camera during the call to reduce bandwidth.');
  });
  $('retryConferenceBtn').addEventListener('click', function () {
    if (state.activeMeeting) startConference(state.activeMeeting);
  });
  $('fullscreenBtn').addEventListener('click', function () {
    var stage = document.querySelector('.video-stage');
    if (!document.fullscreenElement && stage && stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
  });

  $('copyInviteBtn').addEventListener('click', function () {
    if (state.activeMeeting) copyText(inviteUrl(state.activeMeeting.invite_code), 'Meeting invite link copied.');
  });
  $('copyCodeBtn').addEventListener('click', function () {
    if (state.activeMeeting) copyText(state.activeMeeting.invite_code, 'Meeting code copied.');
  });
  $('leaveMeetBtn').addEventListener('click', function () {
    if (window.confirm('Leave this meeting now?')) leaveConference(true);
  });
  $('backToDashboardBtn').addEventListener('click', function () { leaveConference(false); });

  window.addEventListener('resize', notifyHomeFrameHeight);
  window.addEventListener('message', function (event) {
    if (event.origin === window.location.origin && event.source === window.parent && event.data && event.data.type === 'yyc-meet-request-height') notifyHomeFrameHeight();
  });

  window.addEventListener('pagehide', function () { cleanupRtcResources(); });

  var autoJoinCode = '';
  try {
    var params = new URLSearchParams(window.location.search);
    autoJoinCode = params.get('join') || '';
    if (autoJoinCode) $('joinCode').value = autoJoinCode;
  } catch (_) {}

  discoverSession().catch(function () {
    state.session = null;
    setProfile(null);
    renderMeetings();
  }).finally(function () {
    if (autoJoinCode) window.setTimeout(function () { goToMeeting(autoJoinCode, null); }, 150);
  });
})();