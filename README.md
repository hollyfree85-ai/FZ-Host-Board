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

Forty-eight automated core and DOM tests cover party links, secondary deletion, Undo, concurrent clients, acknowledgement, day boundaries, formation, BAR auto skips and operational controls. Real-device network latency and microphone/camera calls still require testing on the restaurant's tablets. Calls use STUN; networks requiring TURN need `rtcIceServers` configured. No one-second network guarantee has been verified.

Firebase compatibility SDK 10.14.1 is vendored for consistent loading. Firebase SDK is Apache-2.0 licensed; see LICENSES/Firebase.txt.

## Classic interface (1.1.0)

The previous Quick Board layout is restored: role entry, floating shift and logout, bottom Board/Floor/More tabs, Next in Rotation, 15-column rotation cells, light Floor map, table action dialogs and a three-step Seat wizard. Backend transaction and realtime transport code are unchanged. Rotation cells expand beyond three rows when needed to keep existing entries visible.

Front Host can remove an incorrect seated party without manager sign-in and restore it with Undo. Reservation shortcuts appear on Board and Floor; upcoming reservations are shown by default. PM BAR rows have a visible Auto Skip ON/OFF control; ON inserts one skip after each two real party entries.
