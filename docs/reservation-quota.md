## Unlimited reservations (v1.2.84)

Host and online reservations can be saved, edited and restored without any numeric quota, READY-table requirement, formation requirement or table-combination capacity gate. Existing reservations do not close a time slot. Guest totals are informational only; records are retained without migration.

Reservation intake keeps the existing party-size validation (6–120 whole guests), contact validation and seating hours. The last seating remains 9:20 PM Sunday–Thursday and 10:20 PM Friday/Saturday. Time windows only group informational totals.

GET /api/availability validates booking details without consulting Floor capacity. POST /api/book and host edits still save against the latest Firebase Board revision, preserve concurrent changes and confirm only after an acknowledged save. Duplicate retries remain idempotent. Deletion, restoration and SMS handling keep their existing behavior.

READY status, suitable approved combinations, server ownership, section rules and competing table claims are checked when the host seats the guest through Floor/PARTY or reservation ACCEPT. Recording a reservation does not seat anyone or consume a table. No customer records or runtime credentials are changed by this release.

## Approved large combinations (November 18, 2026)

| Tables | Capacity |
| --- | --- |
| L5 + L6 | 12–14 |
| L3 + L4 + L5 + L6 | 22–24 |
| L1 through L6 | 28–30 |
| A4 + L1 through L6 | 35–36 |
| R5 + R6 + R7 | 21 |
| R3 through R7 | 28–29 |
| R1 through R7 | 39–40 |
| C2 + C3 + C4 | 18 |
| E2 + E3 + E4 | 18 |
| M1 + M2 + H1 through H4 | 30–34 |
| B1 + B2 + B3 | 15 |

Previously approved combinations remain available. These are limits for the complete listed group, not permission to generate arbitrary adjacent combinations. Combined capacity overrides individual seat sums. Overlapping groups cannot contribute capacity twice or seat two parties simultaneously. Floor PARTY includes eligible cross-section options automatically for 13+ guests, prefers same-section matches, identifies every participating server and shows the lead server before ACCEPT. Acceptance rechecks the latest Floor and saves all member tables in a single Board operation.

### Manual reservation saves and undo recovery (v1.2.75)

Online and host-entered reservations remain in the same reservation collection.
Manual SAVE, edits, DONE, DELETE and RESTORE use a temporary listener on the
complete Board root before starting the existing atomic transaction. The listener
stays attached until acknowledgement and is removed on success or failure. A
standalone Firebase `get()` is insufficient: the shipped SDK removes that root
cache before the first transaction callback, which can then receive `null` even
when child listeners show LIVE data. The same correction covers linked-reservation
seating operations. Reservation detail validation still runs against the current
transaction snapshot, preserving concurrent online arrivals and unrelated data.
Physical table checks apply when seating, not when recording a reservation.

The manual form shows SAVING while pending, retains its draft on failure and
shows persistent feedback inside the reservation dialog. Toasts appear within the
open modal rather than behind its backdrop. Cancellation remains explicit; this
fix does not automatically restore deleted reservations.

Only deleting a reservation requires the three confirmations. Floor Seated → READY, Floor party removal, and reservation DONE proceed without those prompts. Linked reservation completion and guest-count release remain atomic, retaining Board rotation history.
