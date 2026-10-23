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


## v1.2.8 — Formation changes
Edit Table Map moves table membership between sections. Edit Formation changes formation and sections while preserving each server row, rotation, skips, beeper, active parties, secondary links and Undo. Unassigned servers remain CUT with retained entries. All 61 tests pass.

### 1.2.15
Floor identity cards adapt to available space beside their own sections, including five and nine servers, instead of collecting below the map.

### 1.2.16
White Board, Floor and More backgrounds with blue operational cards and ready table boxes. Occupied and cleaning table status colors stay distinct.

### 1.2.17
Refined white-and-sapphire finish with crisp blue cards, subtle cyan accents and dimensional borders.

### 1.2.18
Black and champagne gold canvas; ready tables white, occupied tables red, assigned current-day reservations blue. Optional reservation table selection updates Floor in realtime; occupied and cleaning status take priority. Reservation blue expires one hour after its scheduled time.

### 1.2.19
Restore a white canvas while retaining white ready tables with clear outlines, red occupied tables and blue assigned reservations.

### 1.2.20
Match classic Quick Board references: navy Board/More, gold next row, blue navigation, white Floor with dark table outlines. Every large-party rotation slot repeats its table number in red and opens the same party. Manual and BAR auto skips remain amber and retain their existing rotation rules.

### 1.2.21
Move/Change now asks for a destination table and previews the old table becoming READY. Joining tables is handled separately by Edit Secondary. Same-server moves preserve party identity and rotation position.

### 1.2.22
Separate Manager/Owner Clear Board + Shift AM and PM actions. Each clears only its shift formation, rows, parties, linked Floor tables, skips and Undo while preserving the opposite shift, reservations and shared configuration.

### 1.2.23
Each Board server row has CLEAR to select an incorrect party entry. Active entries release all linked Floor tables; completed Board entries can be removed without changing a newer party on the same table. Undo restores active or Board-only entries appropriately. Includes separate AM/PM clear controls.

### 1.2.24
Next Server uses the same numeric section order as Board when rotation turns tie. Fewest turns remains the first priority; BAR follows numbered sections.

### 1.2.25
READY closes the Floor status panel after database confirmation without opening a seating dialog. Rotation keeps the same next server when another server is seated out of turn.

### 1.2.26
BAR automatic SKIP cells use black backgrounds and white text, distinct from amber manual skips.

### 1.2.27
Larger Floor identity cards with two-line names and independent section sizing. Reuse unchanged identity DOM and cached label positions across updates and resize events to reduce repeated layout work on tablets.
