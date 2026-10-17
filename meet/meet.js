(function () {
  'use strict';

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
    attendeeKey: null,
    attendanceSent: false,
    leaving: false,
    toastTimer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var dashboard = $('dashboardView');
  var callView = $('callView');
  var alertBox = $('meetAlert');
  var mount = $('jitsiMount');

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

  function inviteUrl(code) {
    var u = new URL('./', window.location.href);
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
    if (!state.session) {
      root.innerHTML = '<div class="empty-meetings"><span class="empty-orbit">⌑</span><b>Sign in to view your meeting list</b><p>Invite links still work for guest participants.</p></div>';
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
      var actions = '<button type="button" class="meet-btn meet-btn-gold" data-action="join" data-code="' + safeText(m.invite_code) + '"' + (joinDisabled ? ' disabled' : '') + '>' + (status === 'live' ? 'Join live room ↗' : 'Join room ↗') + '</button>';
      if (m.invite_code) actions += '<button type="button" class="text-action" data-action="copy" data-code="' + safeText(m.invite_code) + '">Copy invite</button>';
      if (canManage && status !== 'cancelled' && status !== 'ended') {
        actions += '<button type="button" class="text-action" data-action="manage-start" data-id="' + safeText(m.id) + '">Mark live</button>';
        actions += '<button type="button" class="text-action" data-action="manage-end" data-id="' + safeText(m.id) + '">End</button>';
        actions += '<button type="button" class="text-action" data-action="cancel" data-id="' + safeText(m.id) + '">Cancel</button>';
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
    if (!state.session) {
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
      $('loginNeeded').hidden = !!session;
      $('scheduleForm').hidden = !session;
      return loadMeetings();
    });
  }

  function callLookup(code) {
    var cleaned = cleanCode(code);
    if (cleaned.length !== 16) {
      showAlert('A YYC meeting code has 16 characters. Paste the full invite link or enter the complete code.');
      return Promise.reject(new Error('Invalid meeting code.'));
    }
    return rpc('yyc_meet_lookup', { p_invite_code: cleaned }).then(function (data) {
      if (!data || !data.ok || !data.meeting) throw new Error((data && data.message) || 'This meeting could not be found.');
      showAlert('');
      return data.meeting;
    });
  }

  function loadJitsiScript() {
    if (window.JitsiMeetExternalAPI) return Promise.resolve();
    if (window.__yycMeetJitsiPromise) return window.__yycMeetJitsiPromise;
    window.__yycMeetJitsiPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = function () {
        if (window.JitsiMeetExternalAPI) resolve();
        else reject(new Error('Jitsi Meet loaded, but its conference API was unavailable.'));
      };
      script.onerror = function () { reject(new Error('Could not load the video-meeting service. Check your internet connection or open the meeting directly.')); };
      document.head.appendChild(script);
    });
    return window.__yycMeetJitsiPromise;
  }

  function setCallVisible(isVisible) {
    dashboard.hidden = !!isVisible;
    callView.hidden = !isVisible;
    document.body.classList.toggle('in-call', !!isVisible);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function markStatus(text, isLive) {
    $('videoStatusText').textContent = text;
    $('videoStatusDot').style.background = isLive ? '#8bcea8' : '#d9b770';
  }

  function startConference(meeting) {
    if (!meeting || !meeting.room_name) {
      notify('This meeting does not have an active room yet.');
      return Promise.resolve();
    }
    if (meeting.status === 'ended' || meeting.status === 'cancelled') {
      notify('This meeting has ended or was cancelled.');
      return Promise.resolve();
    }
    state.activeMeeting = meeting;
    state.attendeeKey = (window.crypto && typeof window.crypto.randomUUID === 'function') ? window.crypto.randomUUID() : fallbackUuid();
    state.attendanceSent = false;
    state.leaving = false;
    $('callTitle').textContent = meeting.title || 'YYC Meeting';
    $('callMeetingMeta').textContent = formatDate(meeting.starts_at) + ' · Invite-only access link';
    $('railTitle').textContent = meeting.title || 'YYC Meeting';
    $('railDescription').textContent = meeting.description || 'Welcome to the YYC meeting. Use the in-call controls to collaborate.';
    $('railHost').textContent = meeting.host_name || 'YYC Host';
    $('railDuration').textContent = String(meeting.duration_minutes || 60) + ' minutes';
    $('railCode').textContent = meeting.invite_code || '—';
    $('openExternalMeeting').href = 'https://meet.jit.si/' + encodeURIComponent(meeting.room_name);
    $('callError').hidden = true;
    mount.innerHTML = '';
    setCallVisible(true);
    markStatus('Connecting to conference…', false);

    if (state.session) {
      portal('start', { id: meeting.id }).catch(function () {});
    }

    return loadJitsiScript().then(function () {
      if (state.leaving || !state.activeMeeting) return;
      var displayName = meetingDisplayName();
      var api = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName: meeting.room_name,
        parentNode: mount,
        width: '100%',
        height: '100%',
        lang: 'en',
        userInfo: { displayName: displayName },
        configOverwrite: {
          prejoinPageEnabled: true,
          disableDeepLinking: true,
          enableWelcomePage: false,
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          requireDisplayName: true,
          lobby: { enabled: !!meeting.waiting_room },
          toolbarButtons: [
            'microphone', 'camera', 'desktop', 'chat', 'raisehand',
            'participants-pane', 'tileview', 'select-background',
            'closedcaptions', 'settings', 'hangup', 'fullscreen',
            'shortcuts', 'help', 'invite', 'videoquality', 'filmstrip',
            'reactions', 'noisesuppression', 'audio-mode', 'security',
            'mute-everyone', 'whiteboard', 'sharedvideo'
          ]
        },
        interfaceConfigOverwrite: {
          APP_NAME: 'YYC Meet',
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false
        }
      });
      state.api = api;
      api.addListener('videoConferenceJoined', function (event) {
        markStatus('Connected · ' + (event && event.displayName ? event.displayName : 'You are in the room'), true);
        if (!state.attendanceSent) {
          state.attendanceSent = true;
          recordAttendance('join');
        }
      });
      api.addListener('videoConferenceLeft', function () {
        recordAttendance('leave');
        if (!state.leaving) notify('You left the meeting.');
      });
      api.addListener('readyToClose', function () {
        leaveConference(false);
      });
      api.addListener('participantJoined', function () {
        markStatus('In meeting · participant connected', true);
      });
      api.addListener('participantLeft', function () {
        markStatus('Connected · waiting for participants', true);
      });
      api.addListener('errorOccurred', function () {
        markStatus('Conference reported an issue', false);
      });
      $('fullscreenBtn').onclick = function () {
        var stage = document.querySelector('.video-stage');
        if (!document.fullscreenElement && stage && stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
        else if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
      };
    }).catch(function (err) {
      $('callErrorText').textContent = (err && err.message) || 'The conference service could not be loaded.';
      $('callError').hidden = false;
      markStatus('Could not connect', false);
    });
  }

  function fallbackUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function meetingDisplayName() {
    var value = String($('participantName').value || '').trim();
    if (!value && state.session && state.session.actor) value = String(state.session.actor.name || '').trim();
    value = value.slice(0, 80);
    return value || 'YYC Guest';
  }

  function recordAttendance(action) {
    if (!state.activeMeeting || !state.activeMeeting.invite_code || !state.attendeeKey) return Promise.resolve();
    return rpc('yyc_meet_attendance', {
      p_invite_code: state.activeMeeting.invite_code,
      p_action: action,
      p_participant_key: state.attendeeKey,
      p_display_name: meetingDisplayName(),
      p_token: (state.session && state.session.token) || null
    }).catch(function () {});
  }

  function leaveConference(showToast) {
    if (state.leaving) return;
    state.leaving = true;
    if (state.activeMeeting) recordAttendance('leave');
    if (state.api) {
      try { state.api.dispose(); } catch (_) {}
    }
    state.api = null;
    state.activeMeeting = null;
    state.attendeeKey = null;
    mount.innerHTML = '';
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

  function goToMeeting(code) {
    return callLookup(code).then(function (meeting) {
      if (meeting.status === 'ended' || meeting.status === 'cancelled' || !meeting.room_name) {
        notify('This meeting is no longer active.');
        return;
      }
      return startConference(meeting);
    }).catch(function (err) {
      if (err && err.message !== 'Invalid meeting code.') {
        showAlert(err.message || 'Could not open the meeting invite.');
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
    var fromLink = value.match(/[?&]join=([A-Fa-f0-9]{16})/);
    goToMeeting(fromLink ? fromLink[1] : value);
  });

  $('instantMeetBtn').addEventListener('click', function () {
    if (!state.session) {
      notify('Sign in to YYC first to start a meeting.');
      window.location.href = '../?yyc_access=member-login';
      return;
    }
    var now = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    createMeeting({
      title: 'YYC Quick Meeting',
      description: 'Instant team conversation.',
      starts_at: now,
      duration_minutes: 60,
      visibility: 'invite',
      waiting_room: false
    }).then(function (meeting) {
      return portal('start', { id: meeting.id }).then(function () {
        return callLookup(meeting.invite_code);
      }).then(function (fullMeeting) {
        loadMeetings();
        startConference(fullMeeting);
      });
    }).catch(function (err) {
      notify((err && err.message) || 'Could not create an instant meeting.');
    });
  });

  $('scheduleForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!state.session) { notify('Sign in to YYC first.'); return; }
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
    if (action === 'join') goToMeeting(code);
    else if (action === 'copy') copyText(inviteUrl(code), 'Invite link copied.');
    else if (action === 'cancel') {
      if (!window.confirm('Cancel this meeting? Its invite will no longer open the room.')) return;
      portal('cancel', { id: id }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Only the host or a YYC admin can cancel this meeting.');
        notify('Meeting cancelled.');
        return loadMeetings();
      }).catch(function (err) { notify((err && err.message) || 'Could not cancel the meeting.'); });
    } else if (action === 'manage-start' || action === 'manage-end') {
      var command = action === 'manage-start' ? 'start' : 'end';
      portal(command, { id: id }).then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.message) || 'Only the host or a YYC admin can manage this meeting.');
        notify(command === 'start' ? 'Meeting marked live.' : 'Meeting ended.');
        return loadMeetings();
      }).catch(function (err) { notify((err && err.message) || 'Could not update the meeting.'); });
    }
  });

  $('refreshMeetingsBtn').addEventListener('click', function () {
    $('refreshMeetingsBtn').style.transform = 'rotate(120deg)';
    discoverSession().finally(function () {
      window.setTimeout(function () { $('refreshMeetingsBtn').style.transform = ''; }, 250);
    });
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

  window.addEventListener('pagehide', function () {
    if (state.activeMeeting && state.attendeeKey && state.api) {
      try { state.api.dispose(); } catch (_) {}
    }
  });

  discoverSession().catch(function () {
    state.session = null;
    setProfile(null);
    renderMeetings();
  });

  try {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('join');
    if (code) {
      $('joinCode').value = code;
      window.setTimeout(function () { goToMeeting(code); }, 250);
    }
  } catch (_) {}
})();