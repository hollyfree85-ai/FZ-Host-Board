const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../dist/core.js'),F=require('../dist/reservation-flow.js');
const now=Date.parse('2026-11-19T23:00:00Z'),r=()=>({date:'2026-11-19',time:'18:00',name:'Fixture Guest',people:7,phone:'+12565550123',at:now-3600000,smsConsent:{phone:'+12565550123',at:now-3600000,textVersion:'reservation-sms-v2'}});
test('host alerts at 1 hour and 10 minutes, with English reply alerts and immutable inputs',()=>{
 const records={test:r()},before=JSON.stringify(records);assert.equal(F.alerts(records,now)[0].title,'RESERVATION IN 1 HOUR');assert.equal(F.alerts(records,now+50*60000)[0].title,'RESERVATION IN 10 MINUTES');assert.equal(F.alerts(records,now+20*60000).length,0);
 assert.equal(JSON.stringify(records),before);records.test.guestReply={confirmedAt:now,revision:F.revision(records.test)};assert.match(F.replyStatus(records.test),/^CONFIRMED/);assert(F.alerts(records,now+10000).some(a=>a.title==='GUEST CONFIRMED'));
 records.test.guestReply.arrivedAt=now+10*60000;assert.match(F.replyStatus(records.test),/^ARRIVED/);assert(F.alerts(records,now+11*60000).some(a=>/PARTY ARRIVED/.test(a.title)));
 records.test.date='2026-11-20';assert.equal(F.replyStatus(records.test),'Awaiting confirmation');assert.equal(F.alerts(records,now+11*60000).length,0);
 records.test.status='deleted';assert.equal(F.alerts(records,now).length,0);
});
test('candidate snapshot respects holds, cuts, capacities, actual rotation turns and active volume without mutation',()=>{
 const config={tables:['A1','A2','A3','A4','B1','B2','B3'].map(id=>({id,capacity:id==='A1'?2:id==='A3'?undefined:8}))},state=C.initial(config,now);
 state.shifts.PM={rows:[{id:'a',server:'Angela',section:'2',entries:[]},{id:'b',server:'Ashley',section:'3',entries:[]},{id:'cut',server:'Cut Server',section:'4',entries:[],cut:true}],assignments:{A1:'a',A2:'a',A3:'a',A4:'a',B1:'b',B2:'cut',B3:'b'}};
 state.tables.A4.status='reserved';state.tables.B3={status:'seated',partyId:'party'};state.parties.party={id:'party',rowId:'b',shift:'PM',people:4,primary:'B3'};
 const record=r(),before=JSON.stringify(state),list=F.candidates(state,config,record,'x','PM',{},now);
 assert.equal(list[0].table,'A2');assert(!list.some(c=>['A1','A4','B2','B3'].includes(c.table)));assert.equal(list.find(c=>c.table==='B1').afterGuests,11);assert(!list.some(c=>c.table==='A3'),'A3 now has the confirmed four-seat capacity');assert.equal(JSON.stringify(state),before);
 const held=F.candidates(state,config,record,'x','PM',{other:{...record,table:'A2'}},now);assert(!held.some(c=>c.table==='A2'));
 state.shifts.PM.rows[0].entries=[{id:'e',kind:'party',people:8,at:now-600000}];assert.equal(F.candidates(state,config,record,'x','PM',{},now)[0].table,'B1');
 assert.deepEqual(F.candidates(state,config,{...record,date:'2026-11-20'},'x','PM',{},now),[]);
});
