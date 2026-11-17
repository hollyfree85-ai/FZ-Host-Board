# Floor party recommendations

Floor → PARTY → enter 1–120 guests → FIND TABLES. The dialog searches the current shift and formation. Each option has ACCEPT to seat exactly the displayed table(s), guest count and server on Board and Floor. State, configuration and reservation changes refresh its results; offline results are suppressed. Searching does not change tables or rotation. ACCEPT uses one atomic SEAT operation, blocks double taps, rechecks the current candidate, and rejects stale state or assignment changes. The same action is available in Reservation Details; its party is linked to the reservation to prevent duplicate acceptance.

Capacity data and the explicit combination list are in `dist/party-recommendations.js`. A4 and F6 each seat four. A1–A3 and F1–F6 have no automatically generated combinations; the explicit E1+F1 exception is supported. H tables do not combine with each other; M1+H3 and M2+H4 are supported. A joined D party excludes C combinations. Bar 1–Bar 12 each have exactly one seat and cannot combine. They are never suggested for groups of two or more. Reservation Details uses this same engine, so it can show approved table combinations and cannot suggest tables with unknown capacity.

Every member must be READY, have no party link or active reservation hold, appear in the selected formation, and belong to an active named server with enough Board slots. This includes the next PM BAR auto-skip when applicable. Current Breaking Section assignments are honored. A single server covering multiple physical sections does not make those sections identical.

After eligible held turns, 1–4 guests use only single tables and ranking follows the exact Board queue using a shared Core function: lowest turn count, then section order. Within that server’s section, a fitting READY booth is preferred, then a fitting regular single table. Booths are A1–A4, H2–H4 and F1–F6. A later server’s booth cannot displace the next server’s fitting regular table. Booth/table labels also identify alternatives for a guest preference. Only if no valid option exists is the next server offered first.

After eligible held turns, 5+ guests use the nearest Board turn count, then area L/R → C → A/B → E → H/M, then recent guest volume, active guests, active tables and section rotation order. A fitting single table wins within equal server/area choices. Workload includes active AM carryover. Cross-section combinations remain separate and hidden until requested; accepting one seats the entire party with the named lead. Recent workload is displayed on the card, and ACCEPT confirms seating with that workload without another dialog.

The search never writes service data. On ACCEPT, a revision/formation/assignment guard prevents stale recommendations from mutating Floor or Board, and normal SEAT checks enforce availability, active server and remaining Board slots. Retries reuse the same command receipt. Reservation acceptance records the reservation ID on the party and updates the reservation to seated after the atomic seat confirms.

Conservative limits pending owner clarification: C2+C3 uses 12 (both 12 and 15 were supplied); full C1–C4 and D combinations have no confirmed total and are not offered. Other E chains are not inferred from “and so on.” Capacity ranges are seat limits, not a minimum party size.

Validation includes all approved group boundaries, immutable searches, holds and statuses, changed formations, cross-section controls, the C/D restriction, rotation and workload ranking, rollover and BAR limits, and actual DOM interactions with live fixture updates and no operational writes.

## Returning a passed turn

Seating another server now remembers earlier Board turns that were passed because the server had no READY assigned table, or had a seating within the last 10 minutes. This is part of the same atomic SEAT transaction and works for the normal seating flow, voice and recommendation ACCEPT. Manual SKIP also remembers a blocked server; its existing Board count and BAR automatic skips are not changed. Searches alone never create held turns.

A turn held for recovery qualifies 10 minutes after the latest seating, not 10 minutes after the bypass; repeated bypasses do not restart the clock. A turn held because no table was READY qualifies as soon as a fitting table is READY. A server with both no READY table and a recent seating is treated as a no-table bypass. Matching AM carryover is included when finding the latest seating.

Eligible held turns rank first for all party sizes, oldest bypass first. Capacity, formation, active-server, reservation, Board-space and same-section checks still apply. Small parties still prefer that server's booths before their regular tables; larger parties retain area and workload ordering for the other options. The dialog labels these options RETURN TURN and shows recovery time while a held server is waiting. Open PARTY results refresh with shared Floor changes and the existing timer.

The held turn is stored under the current shift and syncs across devices. It clears after confirmed seating, a cut, server replacement or shift reset; daily reset also clears it. A later seating from an older client or matching other shift invalidates the old marker. A failed or retried seat cannot consume priority or create a duplicate.
