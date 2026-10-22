# FZ Host Board

Operational host app for Board, Floor and Operations. This is a new application; the previous board remains separate.

## First launch

Choose Manager or Owner and create a new manager password once. The previous application's password is not migrated. Set the current formation and servers, then use Host for daily operation. Install through the browser's Add to Home Screen on iPad or Samsung tablet.

## Included operations

Formation & Servers; Breaking Section; Beeper; Edit Table Map; Edit Formation; Correct Wrong AM/PM; Cut/Uncut Employee; Reservations; Manager Chat, voice notes and calls; Team Shout Out; Edit Manager Password; Repair BAR Manual/Auto Skip; Clear All Board + Floor; Undo Delete.

Floor supports Ready, Clean, Move/Change, Edit People, Delete Party/Remove Board and Edit Secondary. Deleting from any member table removes the entire linked party from the Board and makes all its tables READY in one database transaction. Undo restores the same party if its tables are still available and preserves newer entries.

No analytics or long-term party/Beeper history is collected. Bounded Undo and operation receipts are current-day operational data. Table maps, roster, formation templates, reservations and communications are separate from the daily live state.

## Realtime and daily reset

Firebase SDK listeners share committed data across clients. Each Seat, Delete or Undo uses one transaction on the isolated live object. The interface reports success after server acknowledgement; an uncertain pending operation is kept for explicit recovery instead of silently repeating it.

The operational day starts at 04:00 America/Chicago, including daylight saving changes. An open client checks the boundary every 15 seconds. The scheduled GitHub workflow also resets the live Board and Floor during the 04:00 hour, using conditional writes to avoid overwriting concurrent operations. GitHub schedules can be delayed. Templates and reservations are retained.

Firebase uses the existing project, under `juicyTableLive/JUICY-HUNTSVILLE/hostBoardNextV1`. No legacy operational branch is written. Existing database access rules are unchanged. The manager password is an application UI gate; it is not Firebase Authentication or database authorization.

## Build and deploy

Node 22+: `npm install`, `npm run check`, `npm test`. Publish `dist` as static files. The included GitHub Pages workflow runs checks and publishes on pushes to `main`; GitHub Pages must be available for the repository. The daily reset workflow requires GitHub Actions enabled.

Fifty-five automated core and DOM tests cover party links, secondary deletion, Undo, concurrent clients, acknowledgement, day boundaries, formation, BAR auto skips and operational controls. Real-device network latency and microphone/camera calls still require testing on the restaurant's tablets. Calls use STUN; networks requiring TURN need `rtcIceServers` configured. No one-second network guarantee has been verified.

Firebase compatibility SDK 10.14.1 is vendored for consistent loading. Firebase SDK is Apache-2.0 licensed; see LICENSES/Firebase.txt.

## Classic interface (1.1.0)

The previous Quick Board layout is restored: role entry, floating shift and logout, bottom Board/Floor/More tabs, Next in Rotation, 15-column rotation cells, light Floor map, table action dialogs and a three-step Seat wizard. Backend transaction and realtime transport code are unchanged. Rotation cells expand beyond three rows when needed to keep existing entries visible.

Front Host can remove an incorrect seated party without manager sign-in and restore it with Undo. Reservation shortcuts appear on Board and Floor; upcoming reservations are shown by default. PM BAR rows have a visible Auto Skip ON/OFF control; ON inserts one skip after each two real party entries.

## Floor assignment and reminder update (1.2.0)

Floor labels show table plus assigned section, with section numbers, server names and yellow beeper badges. Board MIN/MAX guides track active rotation slots, including skips and large-party continuation cells. New roster names can be added in Formation without losing the current selections, or through More → Add New Server.

Reservations show upcoming dates by default. In-app reminders check every 30 seconds during the two-hour pre-arrival window, using America/Chicago time and one alert per device/reservation schedule. System notifications require the user to enable permission and keep the app running; this version does not implement background Web Push. Reminder content is not written into the hot Board object.

## Fit Floor update (1.2.1)

Floor uses the available viewport without fixed minimum map dimensions or scrolling. Assignment cards sit outside the table canvas, in a right-hand panel on wide screens and a bottom grid on portrait phones. Table text adapts to the measured canvas size; compact views use shorter labels while full table/section/server information remains accessible on tap. ResizeObserver, viewport and orientation changes update the layout. Automated DOM checks exercise six canvas sizes and ensure assignment cards are not children of the map. Physical-device visual testing remains outstanding because the browser inspection service is timing out.


## v1.2.7 — Employee list
Manager and Owner can open More → Manage Server List to add or delete roster names. Deleting a name preserves current shift rows and seated parties. Source checks and all 58 automated tests pass.


## v1.2.8 — Formation changes
Edit Table Map moves tables between sections within an existing formation, or removes membership with UNASSIGNED. Edit Formation selects another formation and reassigns servers while retaining their row identity, rotation entries, skips, beepers, seated parties, secondary tables and Undo. Omitted servers remain CUT with retained entries. Source checks and all 61 tests pass, including three-party/four-party migration and the actual editor flow.


## v1.2.9 — CUT visibility
CUT employees have no Board row or row controls. UNCUT restores the same saved rotation. Active party links remain available on Floor. All 62 tests pass, including two-device CUT and UNCUT propagation.


## v1.2.10 — Board section order
Visible Board rows follow ascending numeric section order, beginning at S1 when present, with BAR last. Combined sections sort by their smallest section. Sorting does not rewrite server rows, rotation entries or next-server selection. All 63 tests pass.


## v1.2.11 — Local Floor labels
Section, server and beeper callouts occupy free space near their tables, with leader lines. Placement excludes rotated table bounds, other labels and service labels. The right sidebar is removed. When small screens lack safe space, excess callouts use a compact bottom area. All 64 tests pass, including collision checks across all formations and five canvas sizes. Physical-device visual verification remains outstanding.


## v1.2.12 — Staggered shift arrivals
Formation & Servers saves each section separately beside its employee selector. No complete-team startup button is required. AM and PM retain separate formations, server rows and rotation entries; later arrivals append without resetting saved parties or skips. Unassigned sections remain empty. All 67 tests pass, including first arrival, late arrivals, stale-section protection and independent AM/PM formations.


## v1.2.13 — Dark theme and shift controls
Darker Board/Floor surfaces and larger bold employee, section and beeper labels. Formation & Servers saves beeper, AM/PM/Double/Long shift, Long start time and extra PM last-cut selection with each section assignment. Cut guidance follows Chicago time; BAR and PM Section 1 remain protected last-cut. Actual CUT requires manager confirmation. All 70 tests pass, including atomic beeper uniqueness and weekday/Long/PM cut rules. Physical-device visual verification remains outstanding.


## v1.2.14 — Navy 5D and nine-server Floor
Deep navy layered surfaces with subtle bevels and shadows. Floor identity fields have separate blue name, teal section and muted-gold beeper panels. Dense formations use compact callouts; any labels without safe map space remain in an adaptive bottom grid. All ten labels in the 9 SERVER plus BAR formation are retained at three tested tablet/desktop canvas sizes. All 71 automated tests pass; physical-device visual verification remains outstanding.
