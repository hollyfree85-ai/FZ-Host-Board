# Reservation check-in SMS

Guest URL: https://hollyfree85-ai.github.io/FZ-Host-Board/book.html

Firebase remains on Spark. SMS execution and signed Twilio webhooks run in the existing reservation Worker. The iPad/Samsung do not send carrier SMS themselves. All messages and host alerts are in English.

## Delivered behavior

- One hour before arrival: host reminder; guest text asks for `CONFIRM`.
- `CONFIRM`: records attendance confirmation and shows a named host alert.
- Ten minutes before arrival: guest text asks for `HERE` after the whole party arrives; host reminder also appears.
- `HERE`: records arrival, acknowledges the guest and alerts the host with name and guest count. It does not claim that a physical table is ready.
- Reservation Details shows up to three current table candidates, using rotation turns, active guest volume and READY status. Held, occupied, cut/unassigned-server tables are excluded. Known insufficient capacities are excluded. Missing capacities are explicitly marked; section numbers are never interpreted as seat counts. Selection does not alter rotation or seat/hold tables.
- Guest consent is optional. Host-created bookings can be enrolled only when the host checks the guest-consent box. Changed contact details do not inherit consent.
- Duplicate callbacks do not duplicate a confirmation/arrival. Ambiguous phone matches require the six-character reference from the text. Cancelled/deleted/completed reservations are excluded. HTTP signatures and Account SID are checked before writes.
- Twilio delivery callbacks update job state. Provider acceptance is not delivery. Uncertain sends require review; they are never blindly retried.

## Activation (not active until configured)

1. A paid Twilio account and an approved SMS-capable sender are required. A verified US toll-free number is one option. Add the sender to a Messaging Service and enable Advanced Opt-Out (STOP/START/HELP). Configure HELP with the restaurant's verified support contact. Complete the provider's business/consent verification first.
2. In Sites production runtime, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, and `SMS_PUBLIC_BASE_URL=https://juicy-huntsville-reservations.hollyfree85.chatgpt.site`. Existing `FIREBASE_BOARD_URL` and `BOOKING_SECRET` remain. Leave `RESERVATION_SMS_ENABLED` off until sender verification and owner test readiness. Never put secrets in frontend files or chat.
3. Configure the Messaging Service's incoming request URL (POST): `https://juicy-huntsville-reservations.hollyfree85.chatgpt.site/api/sms/inbound`. Per-message status callbacks are attached automatically at `/api/sms/status`; retain the exact query string and public origin for signature validation.
4. Configure the same three Twilio secrets in GitHub Actions. The `Guest reservation reminders` workflow reconciles schedules every five minutes; it uses `vars.RESERVATION_SMS_ENABLED`. The new SMS path disables the older SMS sender when enabled, so only one SMS flow runs. Existing email activation is separate.
5. Set `RESERVATION_SMS_ENABLED=true` in the Worker and redeploy, then enable the GitHub variable. Use an expressly labelled reservation with only the owner's consenting phone for the first delivery/reply test. Confirm receipt of both messages, CONFIRM/HERE alerts on two host tablets, STOP handling, and cancellation after edit/delete before enrolling real guests.

## Timing and limits

Twilio schedules eligible messages in advance, including when all host tablets are closed. Its API requires 15 minutes' scheduling lead time and supports at most 35 days ahead; the reconciler uses a 16-minute margin and 34-day horizon. A new web booking and a host save request reconciliation immediately. The unattended job fills the horizon and handles short-notice bookings. Messages already past their intended time by over five minutes are skipped.

GitHub Actions schedules can be delayed. For last-minute bookings inside the native scheduling lead-time window, this is a fallback rather than an exact-minute guarantee. Carrier delivery can also be delayed. A dedicated reliable scheduler must be configured if strict timing for those last-minute cases is required. Host reminders/reply alerts appear while the Board is open, and recent replies appear after reconnection; closed-device push is not implemented.

Cancellation is attempted on obsolete scheduled jobs before replacements. A message already handed to the carrier cannot be withdrawn. Review unresolved/failed jobs under `reservationSmsJobs` and the Twilio Console. `reservationSmsOptOuts` stores opt-out state by hashed phone; guest replies stay with the reservation. No changes are made to `/live` by SMS processing.

## Cost reference (checked November 16, 2026)

Twilio US toll-free number: $2.15/month; base SMS send/receive: $0.0083 per segment plus carrier fees. Two reminders, two guest replies and two automated acknowledgements typically total six single-segment messages per fully participating reservation. Taxes, extra segments, additional replies and optional features can increase cost. Under $10/month depends on actual volume, not a fixed subscription guarantee. Toll-free verification is required before sending.

Official references: https://www.twilio.com/en-us/sms/pricing/us ; https://www.twilio.com/docs/messaging/features/message-scheduling ; https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding ; https://www.twilio.com/docs/usage/security
