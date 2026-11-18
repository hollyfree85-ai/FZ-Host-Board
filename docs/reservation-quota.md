## Quota and table availability

All active online and host-entered reservations count their guests, including seated reservations. Only completed, deleted, cancelled or no-show records release their own guest count. No historical records are migrated or deleted by this release.

Sunday–Thursday: 3–5 PM 60 guests, 5–7 PM 50, 7–9 PM 50. Friday/Saturday: 3–5 PM 60, 5–7 PM 50, 7–9 PM 40, 9–10 PM 60. The last window includes the existing last-seating grace (9:20 PM / 10:20 PM); before 3 PM there is no numeric cap, but capacity still applies. Windows start inclusively and end exclusively except the last-seating minute.

Today requires actual READY tables in the selected AM/PM formation. Seated, cleaning and reserved tables cannot be promised to a new guest. Existing unseated reservations in that window are packed into disjoint approved combinations; parties of up to 12 stay in one section, while parties of 13 or more may span sections; overdue uncompleted bookings also retain their table needs. Linked seated parties already occupy the Floor and are not subtracted twice. Future dates use the current formation plan, not today's occupied-table status. This does not guarantee a specific table on a future day. Unknown or unavailable capacity fails closed; no new combinations are inferred, and bar stools are never offered for a party.

GET /api/availability returns only aggregate capacity and a message, never guest details. POST /api/book rechecks the complete current snapshot under Firebase ETag compare-and-swap. A failed save cannot show confirmation. Existing request fingerprints still make retries idempotent. The host app uses the same quota engine for new/edited/restored reservations and three acknowledgements only before DELETE RESERVATION. Release of a linked seated party and reservation status changes are atomic. Firebase remains Spark; no new SMS provider or paid service is enabled.


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

Previously approved combinations remain available. These are limits for the complete listed group, not permission to generate arbitrary adjacent combinations. Combined capacity overrides individual seat sums. Overlapping groups cannot contribute capacity twice or host two reservations simultaneously. Floor PARTY includes eligible cross-section options automatically for 13+ guests, prefers same-section matches, identifies every participating server and shows the lead server before ACCEPT. Acceptance rechecks the latest Floor and saves all member tables in a single Board operation.

### Manual reservation saves and undo recovery (v1.2.75)

Online and host-entered reservations remain in the same reservation collection.
Manual SAVE, edits, DONE, DELETE and RESTORE use a temporary listener on the
complete Board root before starting the existing atomic transaction. The listener
stays attached until acknowledgement and is removed on success or failure. A
standalone Firebase `get()` is insufficient: the shipped SDK removes that root
cache before the first transaction callback, which can then receive `null` even
when child listeners show LIVE data. The same correction covers linked-reservation
seating operations. Quota and capacity checks still run against the current
transaction snapshot, preserving concurrent online arrivals and unrelated data.

The manual form shows SAVING while pending, retains its draft on failure and
shows persistent feedback inside the reservation dialog. Toasts appear within the
open modal rather than behind its backdrop. Cancellation remains explicit; this
fix does not automatically restore deleted reservations.

Only deleting a reservation requires the three confirmations. Floor Seated → READY, Floor party removal, and reservation DONE proceed without those prompts. Linked reservation completion and guest-count release remain atomic, retaining Board rotation history.
