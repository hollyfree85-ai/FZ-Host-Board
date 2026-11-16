# Floor party recommendations

Floor → PARTY → enter 1–120 guests → FIND TABLES. The dialog is read-only and searches the current shift and formation. State, configuration and reservation changes refresh its results; offline results are suppressed. It does not seat guests, hold tables, or advance rotation.

Capacity data and the explicit combination list are in `dist/party-recommendations.js`. A4 and F6 each seat four. A1–A3 and F1–F6 have no automatically generated combinations; the explicit E1+F1 exception is supported. H tables do not combine with each other; M1+H3 and M2+H4 are supported. A joined D party excludes C combinations. Bar-stool capacities are unknown and excluded.

Every member must be READY, have no party link or active reservation hold, appear in the selected formation, and belong to an active named server with enough Board slots. This includes the next PM BAR auto-skip when applicable. Current Breaking Section assignments are honored. A single server covering multiple physical sections does not make those sections identical.

Ranking is deterministic: same-section options first, lowest Board turn count, then area L/R → C → A/B → E → H/M (F/D singles follow). For equally due servers in the same area tier, lower recent guest volume, active guest volume and table count are preferred; section rotation order and spare capacity finish the ordering. Workload is measured from actual seating, including active AM carryover for the same PM server; no new subjective skill ratings are assigned. Cross-section combinations are hidden until requested and identify every server plus a suggested lead for host coordination.

Conservative limits pending owner clarification: C2+C3 uses 12 (both 12 and 15 were supplied); full C1–C4 and D combinations have no confirmed total and are not offered. Other E chains are not inferred from “and so on.” Capacity ranges are seat limits, not a minimum party size.

Validation includes all approved group boundaries, immutable searches, holds and statuses, changed formations, cross-section controls, the C/D restriction, rotation and workload ranking, rollover and BAR limits, and actual DOM interactions with live fixture updates and no operational writes.
