const {test}=require('node:test'),assert=require('node:assert/strict'),{slots}=require('../dist/floor-alerts.js');
test('Manager floor rounds use weekdays 90 minutes and exact last seating',()=>{for(const day of [1,2,3,4])assert.deepEqual(slots(day),[660,750,840,930,1020,1110,1200,1280]);});
test('Friday Saturday hourly rounds finish at 10:20 PM; Sunday at 9:20 PM',()=>{for(const day of [5,6])assert.deepEqual(slots(day),[660,720,780,840,900,960,1020,1080,1140,1200,1260,1320,1340]);assert.deepEqual(slots(0),[660,720,780,840,900,960,1020,1080,1140,1200,1260,1280]);});
