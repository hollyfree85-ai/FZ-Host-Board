> For the newer 1-hour / 10-minute SMS and CONFIRM / HERE flow, see [reservation-sms.md](reservation-sms.md). Do not activate the old SMS flow alongside it. Email activation remains separate.

# Guest confirmations and reminders

Public guest URL: https://hollyfree85-ai.github.io/FZ-Host-Board/book.html

The booking form saves directly to the Board through its booking API. Firebase remains on Spark. Messages run separately from the Board; no iPad has to stay open. Guest messages are **not activated** until verified sender accounts are connected and an owner-only delivery test passes.

## Sender setup

Use GitHub repository Settings → Secrets and variables → Actions. Do not paste credentials into chat, commit them, or put them in `dist/`.

- Email: create a Resend account, verify a restaurant-owned sending domain, then set `RESEND_API_KEY` and `RESEND_FROM` (for example the restaurant's verified reservation address).
- SMS: create a Twilio account and a Messaging Service with an approved SMS sender, then set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID`. Configure inbound opt-outs in that service before activation. A trial account only sends to verified recipients; guest use requires a suitable live account and sender approval.
- One channel can be activated first; absent channels are skipped. SMS/provider usage can be chargeable. Firebase does not need Blaze.
- First submit an explicitly labelled owner test reservation using only the owner's verified contact details. Verify provider delivery and phone/inbox receipt, clean only that test record, then enable the repository variable `GUEST_REMINDERS_ENABLED=true`.

## Behavior

The workflow checks every five minutes (offset from the hour). GitHub can delay scheduled runs; this is not an exact-to-the-minute timer. It sends fresh booking confirmations, a reminder near two hours before arrival, and one near one hour before arrival. It never sends a late reminder more than fifteen minutes after its intended time or after arrival.

Only new online bookings with the explicit reminder consent version qualify. Previously saved contacts are not retroactively enrolled. If staff changes the phone/email, that channel needs new guest consent. Deleted/cancelled reservations and contact changes are rechecked before sending.

Firebase `reservationMessages` stores deduplication and provider-acceptance records without message bodies/contact details. `queued` means the provider accepted the message, **not** delivered. Provider delivery/bounce status must be checked in the provider console. Email retries use Resend idempotency keys. Uncertain SMS results are not automatically resent; inspect the provider console before any manual recovery. Logs contain counts, not guest contact details.

References: https://resend.com/docs/api-reference/emails/send-email , https://resend.com/docs/dashboard/domains/introduction , https://www.twilio.com/docs/messaging/api/message-resource , https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
