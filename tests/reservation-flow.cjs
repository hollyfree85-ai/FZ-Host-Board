const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../dist/core.js'),F=require('../dist/reservation-flow.js');
const now=Date.parse('2026-11-19T23:00:00Z'),r=()=>({date:'2026-11-19',time:'18:00',name:'Fixture Guest',people:7,phone:'+12565550123',at:now-3600000,smsConsent:{phone:'+12565550123',at:now-3600000,textVersion:'reservation-sms-v2'}});
test('reminder boundaries catch up sleeping tablets without adding a ten-minute stage',()=>{
 const records={test:r()};assert.equal(F.alerts(records,now-1).length,0);
 assert.equal(F.alerts(records,now+30*60000-1)[0].title,'RESERVATION IN 1 HOUR');
 assert.equal(F.alerts(records,now+30*60000)[0].title,'RESERVATION IN 30 MINUTES');
 assert.equal(F.alerts(records,now+59*60000)[0].key,F.alerts(records,now+30*60000)[0].key);
 assert.equal(F.alerts(records,now+60*60000).length,0);
 for(const status of ['cancelled','seated','completed','no-show','deleted'])assert.equal(F.alerts({test:{...r(),status}},now).length,0);
});
test('upcoming online booking alerts have stable identity and include the actual date and party size',()=>{
 const online={...r(),date:'2026-11-25',source:'online'};
 const first=F.alerts({web:online,manual:{...online,source:'host'}},now);assert.equal(first.length,1);assert.equal(first[0].title,'NEW ONLINE BOOKING');assert.equal(first[0].date,online.date);assert.equal(first[0].people,7);
 const next=F.alerts({web:{...online,people:9,updatedAt:now+5000}},now+5000);assert.equal(next[0].key,first[0].key);assert.equal(next[0].people,9);
 assert.equal(F.alerts({web:{...online,status:'deleted'}},now).length,0);
 assert.equal(F.alerts({web:online},C.reservationTime(online.date,online.time)+1).length,0);
});
test('manual reminder contains saved guest details and safely encodes Android and Apple SMS links',()=>{
 const guest={...r(),name:'Hailey & family',people:8,phone:'(256) 555-0123'},text=F.reminderText(guest);
 assert.match(text,/Hi Hailey & family/);assert.match(text,/The Juicy Seafood & Bar Huntsville/);assert.match(text,/8 guests/);assert.match(text,/Nov 19, 2026/);assert.match(text,/6:00 PM/);assert(!/CONFIRM|HERE|automatically sent/.test(text));
 for(const apple of [false,true]){const link=F.smsLink(guest.phone,text,apple);assert(link.startsWith('sms:+12565550123'+(apple?'&':'?')+'body='));assert.equal(decodeURIComponent(link.split('body=')[1]),text);}
 assert.equal(F.smsLink('bad-number',text),'');assert.equal(F.smsLink('',text),'');
});
test('host alerts at 1 hour and 30 minutes, with English reply alerts and immutable inputs',()=>{
 const records={test:r()},before=JSON.stringify(records);assert.equal(F.alerts(records,now)[0].title,'RESERVATION IN 1 HOUR');assert.equal(F.alerts(records,now+30*60000)[0].title,'RESERVATION IN 30 MINUTES');assert.equal(F.alerts(records,now+20*60000)[0].title,'RESERVATION IN 1 HOUR');
 assert.equal(JSON.stringify(records),before);records.test.guestReply={confirmedAt:now,revision:F.revision(records.test)};assert.match(F.replyStatus(records.test),/^CONFIRMED/);assert(F.alerts(records,now+10000).some(a=>a.title==='GUEST CONFIRMED'));
 records.test.guestReply.arrivedAt=now+10*60000;assert.match(F.replyStatus(records.test),/^ARRIVED/);assert(F.alerts(records,now+11*60000).some(a=>/PARTY ARRIVED/.test(a.title)));
 records.test.date='2026-11-20';assert.equal(F.replyStatus(records.test),'Awaiting confirmation');assert.equal(F.alerts(records,now+11*60000).length,0);
 records.test.status='deleted';assert.equal(F.alerts(records,now).length,0);
});
test('reservation candidates use the current formation, approved groups, workload and holds without mutation',()=>{
 const config={tables:['L5','L6','R5','R6','A1'].map(id=>({id})),formations:{test:{'4':['L5','L6'],'5':['R5'],'6':['R6'],'2':['A1']}}},state=C.initial(config,now);
 state.shifts.PM={formation:'test',rows:[{id:'a',server:'Angela',section:'4',entries:[]},{id:'b',server:'Ashley',section:'5',entries:[]},{id:'cut',server:'Cut Server',section:'6',entries:[],cut:true}],assignments:{L5:'a',L6:'a',R5:'b',R6:'cut',A1:'a'}};
 state.tables.L6.status='reserved';state.tables.A1={status:'seated',partyId:'party'};state.parties.party={id:'party',rowId:'b',shift:'PM',people:4,primary:'A1'};
 const record=r(),before=JSON.stringify(state),list=F.candidates(state,config,record,'x','PM',{},now);
 assert.equal(list[0].table,'L5');assert(!list.some(c=>['A1','L6'].includes(c.table)));assert.equal(list.find(c=>c.table==='R6').inactive,true);assert.equal(list.find(c=>c.table==='R5').afterGuests,11);assert(list.every(c=>c.capacity>=record.people));assert.equal(JSON.stringify(state),before);
 const held=F.candidates(state,config,record,'x','PM',{other:{...record,table:'L5'}},now);assert(!held.some(c=>c.table==='L5'));
 assert(F.candidates(state,config,record,'x','PM',{x:{...record,table:'L5'}},now).some(c=>c.table==='L5'),'own table assignment is not a competing hold');
 state.shifts.PM.rows[0].entries=[{id:'e',kind:'party',people:8,at:now-600000}];assert.equal(F.candidates(state,config,record,'x','PM',{},now)[0].table,'R5');
 state.tables.L6.status='ready';assert.equal(F.candidates(state,config,{...record,people:11},'x','PM',{},now)[0].table,'L5 + L6');
 assert.deepEqual(F.candidates(state,config,{...record,date:'2026-11-20'},'x','PM',{},now),[]);
});
test('eleven-guest reservation cannot use bar stools or unknown capacity, including erroneous old config capacities',()=>{
 const stools=Array.from({length:12},(_,n)=>'Bar '+(n+1)),config={tables:[...stools,'Unknown','A4','L5'].map(id=>({id,capacity:99})),formations:{test:{BAR:[...stools,'Unknown'],'4':['A4','L5']}}},state=C.initial(config,now);
 state.shifts.PM={formation:'test',rows:[{id:'bar',server:'Bartender',section:'BAR',entries:[]},{id:'l',server:'Dining Server',section:'4',entries:[{kind:'manual'}]}],assignments:Object.fromEntries([...stools.map(id=>[id,'bar']),['Unknown','bar'],['A4','l'],['L5','l']])};
 const record={...r(),people:11},list=F.candidates(state,config,record,'x','PM',{},now);assert.equal(list.length,1);assert.deepEqual(list[0].tables,['A4','L5']);assert.equal(list[0].capacity,11);state.tables.A4.status='reserved';assert.deepEqual(F.candidates(state,config,record,'x','PM',{},now),[]);
});

test('reservation details retain outside options even when three or more active matches fit',()=>{
 const ids=['L5','L6','R5','R6','C2'],config={tables:ids.map(id=>({id})),formations:{test:{'4':['L5','L6','R5','R6'],'6':['C2']}}},state=C.initial(config,now);
 state.shifts.PM={formation:'test',rows:[{id:'a',server:'Active Server',section:'4',entries:[]}],assignments:Object.fromEntries(ids.filter(id=>id!=='C2').map(id=>[id,'a']))};
 const list=F.candidates(state,config,{...r(),people:6},'x','PM',{},now);assert.equal(list.filter(c=>!c.inactive).length,3);assert.equal(list.filter(c=>c.inactive).length,1);assert.equal(list.at(-1).table,'C2');assert.equal(list.at(-1).serverChoices[0].rowId,'a');
});
