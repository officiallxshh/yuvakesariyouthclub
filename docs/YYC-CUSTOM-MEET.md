# YYC Custom Meet (WebRTC beta)

This version replaces Jitsi/JaaS embeds with a custom YYC call UI and native browser WebRTC peer connections.

## What is custom here

- YYC owns the meeting page, invite UI, private-room lookup, mic/camera toggles, screen sharing, fullscreen controls, room chat, and join/leave lifecycle.
- Supabase is used for the existing YYC invite validation and Realtime signaling (participant presence, WebRTC offer/answer/ICE exchange, and room chat).
- Audio/video tracks are exchanged directly between participants' browsers. The YYC signaling channel carries connection setup metadata and chat, not the video stream.
- A valid currently-live YYC meeting invite is required before a participant joins.

## Current beta limits

- Maximum supported size is **4 participants per room**. This is peer-to-peer mesh: each participant sends media separately to the others, so bandwidth and CPU load increase as people join.
- Initial connectivity uses STUN helpers only. A STUN service helps browsers discover a reachable network address; it does not relay the actual call media. Some NATs, firewalls, school/work networks, or mobile networks require TURN relay and will not connect reliably without it.
- To remove even the public STUN dependency and improve reachability, deploy YYC-managed STUN/TURN infrastructure (for example, a maintained coturn deployment) and configure its credentials through a backend-generated short-lived ICE configuration. Never put permanent TURN credentials in public website source.
- This peer-to-peer beta does not provide centrally enforceable remote mute/kick, server-side recording, transcription, or large-room SFU mixing. Admin invite validation, scheduled start/end, and the existing YYC meeting management remain in the Supabase backend. Ending a meeting stops future joins; already-connected clients detect the end on periodic lookup.
- Realtime channels use the unguessable generated room name as a signaling topic. Share private invite links only with intended participants; a public signaling topic should not be treated as a replacement for a server-enforced participant identity system.

## Browser requirements

Use a current browser over HTTPS and grant camera/microphone permission. Screen sharing depends on browser support and user permission. If a direct WebRTC connection fails due to the network, the UI should explain that a YYC-owned TURN relay is the next infrastructure step rather than falling back to a third-party meeting provider.

## Test plan before enabling for the club

1. Join the same live invite from two different devices and verify both directions of audio/video.
2. Join a third and fourth device; check CPU, network use, ICE recovery, and tile layout.
3. Mute/unmute each participant independently; share and stop sharing a screen; send text in room chat.
4. Deny camera permission, deny screen-share permission, disconnect/reconnect Wi-Fi, and test Chrome, Edge, Firefox, and Safari.
5. End the meeting from the YYC Admin Panel and verify participants leave, then verify the old invite cannot start a new session after the meeting is ended.
6. Test a restrictive NAT/network. Do not call the beta production-ready until a YYC-owned TURN relay has been deployed and verified for those networks.
