# YYC Jitsi Meet

YYC uses its own meeting lobby and Supabase-backed meeting management, then opens the native Jitsi Meet interface for live audio/video.

## Call flow

1. A verified YYC admin creates or schedules a meeting and starts it from the YYC Admin Panel.
2. Participants paste the YYC invite link or private invite code.
3. `meet/meet.js` validates the invite with the `yyc_meet_lookup` RPC and only redirects if the meeting is live and has a room name.
4. The browser opens `https://meet.jit.si/{room_name}` in Jitsi's native meeting interface. For embedded YYC pages, the app opens a top-level browser context instead of nesting Jitsi inside an iframe when possible.
5. Jitsi handles the camera/microphone check, in-call participant layout, meeting toolbar, chat, and screen sharing.

The invite-validation step is a YYC application gate; it is not a Jitsi authentication token and does not make the public Jitsi room itself server-enforced private.

## Moderator and sign-in behavior

The public `meet.jit.si` service requires the person starting a room to authenticate or wait for a moderator. A YYC Admin login is separate from a Jitsi account and does not automatically grant Jitsi moderator privileges. Other participants can normally join once the room has been started according to the service's rules.

This behavior is controlled by the public Jitsi service. Do not attempt to bypass its sign-in or moderator prompts. If YYC later needs a fully controlled host identity, moderation policy, or branded native call experience, evaluate a YYC-managed Jitsi deployment with authentication configured by the server administrator.

Official references:
- [Join a Jitsi Meeting](https://jitsi.github.io/handbook/docs/user-guide/user-guide-join-jitsi-meeting/)
- [Start a Jitsi Meeting](https://jitsi.github.io/handbook/docs/user-guide/user-guide-start-a-jitsi-meeting/)
- [Authentication on meet.jit.si](https://jitsi.org/blog/authentication-on-meet-jit-si/)

## Public-service considerations

- The public Jitsi service determines account, moderator, room, and availability behavior.
- YYC controls scheduled meeting metadata and invite validation; it does not pass YYC sessions to Jitsi as moderator credentials.
- Public `meet.jit.si` calls may end after around 95 minutes, so the YYC scheduling form limits the selected duration to 90 minutes per session. Re-check the provider's current policies if those limits change.
- A Jitsi room URL can be shared independently once someone sees it. Share YYC invite links only with intended participants and do not present invite validation as equivalent to server-enforced access control.

## Verification checklist

1. Create and start a short YYC meeting as an admin.
2. Open its YYC invite from a separate browser/device and confirm it redirects only after the meeting is live.
3. Check that Jitsi shows its normal pre-join screen and toolbar.
4. Confirm the first participant gets the expected Jitsi sign-in/wait-for-moderator behavior and that later participants can join when the room is active.
5. Confirm scheduled, instant, and admin-panel start actions each reach the same Jitsi room.
6. Confirm cancelled, not-yet-live, or invalid invites are rejected by YYC before any redirect.
