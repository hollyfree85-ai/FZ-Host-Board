const test=require('node:test'),assert=require('node:assert/strict'),C=require('../dist/core.js'),Q=require('../dist/reservation-quota.js');
const now=Date.parse('2026-11-18T20:00:00Z'),date='2026-11-18';
function fixture(ids=['L5','L6','R5','R6','H2','H3']){const config={tables:ids.map(id=>({id})),formations:{test:{'4':ids.filter(id=>!id.startsWith('R')),'5':ids.filter(id=>id.startsWith('R'))}}};const live=C.initial(config,now);live.shifts.PM={formation:'test',rows:[{id:'l',section:'4',server:'Server L',entries:[]},{id:'r',section:'5',server:'Server R',entries:[]}],assignments:Object.fromEntries(ids.map(id=>[id,id.startsWith('R')?'r':'l']))};live.shifts.AM=C.copy(live.shifts.PM);return {live,config,records:{},date,time:'17:00',people:6,now};}
test('all reservation windows are unlimited and retain Chicago seating-hour boundaries',()=>{
 for(const d of ['2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19']){
  assert.equal(Q.windowFor(d,'14:59').limit,null);assert.equal(Q.windowFor(d,'15:00').limit,null);assert.equal(Q.windowFor(d,'16:59').limit,null);assert.equal(Q.windowFor(d,'17:00').limit,null);assert.equal(Q.windowFor(d,'19:00').limit,null);assert.equal(Q.windowFor(d,'21:20').limit,null);assert.equal(Q.windowFor(d,'21:21'),null);
 }
 for(const d of ['2026-11-20','2026-11-21']){assert.equal(Q.windowFor(d,'15:00').limit,null);assert.equal(Q.windowFor(d,'17:00').limit,null);assert.equal(Q.windowFor(d,'19:00').limit,null);assert.equal(Q.windowFor(d,'21:00').limit,null);assert.equal(Q.windowFor(d,'22:20').limit,null);assert.equal(Q.windowFor(d,'22:21'),null);}
});
test('all host/online reservations count people including seated until completed; release only this party',()=>{
 const records=Object.fromEntries(['scheduled','confirmed','arrived','seated','completed','deleted'].map((status,i)=>[i,{date,time:'17:00',people:10,status,source:i%2?'online':'host'}]));
 assert.equal(Q.usage(records,date,'18:00').used,40);assert.equal(Q.usage(records,date,'18:00').remaining,null);records[3].status='completed';assert.equal(Q.usage(records,date,'18:00').remaining,null);assert.equal(Q.usage(records,date,'19:00').used,0);assert.equal(Q.usage(records,date,'18:00').used,30);
});
test('reservation deletion requires three acknowledgements and cancel at any step stops immediately',()=>{
 for(const stop of [0,1,2]){let calls=0;assert.equal(Q.confirmReservationDelete(()=>calls++!==stop,'Party'),false);assert.equal(calls,stop+1);}
 const texts=[];assert.equal(Q.confirmReservationDelete(t=>{texts.push(t);return true;},'Party'),true);assert.equal(texts.length,3);assert.match(texts[0],/DELETE RESERVATION/);assert.match(texts[1],/TABLE STATUS/);assert.match(texts[2],/manager/i);
});
test('atomic linked party completion updates usage once, preserves rotation and undo can restore usage',()=>{
 const f=fixture(),b={live:f.live,config:f.config,reservations:{a:{date,time:'17:00',people:6,status:'scheduled'}}};
 let s=Q.reduceBoard(b,{id:'seat',type:'SEAT',day:date,shift:'PM',at:now,table:'L5',people:6,rowId:'l',reservationId:'a'},now);assert.equal(s.reservations.a.status,'seated');
 const cmd={id:'del',type:'DELETE',day:date,shift:'PM',at:now+1,table:'L5',partyId:'seat'};s=Q.reduceBoard(s,cmd,now+1);assert.equal(s.reservations.a.status,'completed');assert.equal(Q.usage(s.reservations,date,'17:00').used,0);assert.deepEqual(Q.reduceBoard(s,cmd,now+2),s);
 s=Q.reduceBoard(s,{id:'undo',type:'UNDO',day:date,shift:'PM',at:now+3,undoId:'del'},now+3);assert.equal(s.reservations.a.status,'seated');assert.equal(Q.usage(s.reservations,date,'17:00').used,6);assert.equal(s.live.tables.L5.status,'seated');
});

test('linked party undo is allowed above the old numeric quota',()=>{
 const f=fixture(),root={live:f.live,config:f.config,reservations:{a:{date,time:'17:00',people:6,status:'scheduled'}}};
 let state=Q.reduceBoard(root,{id:'seat',type:'SEAT',day:date,shift:'PM',at:now,table:'L5',people:6,rowId:'l',reservationId:'a'},now);
 state=Q.reduceBoard(state,{id:'del',type:'DELETE',day:date,shift:'PM',at:now+1,table:'L5',partyId:'seat'},now+1);
 state.reservations.other={date,time:'17:00',people:60,status:'seated'};
 state=Q.reduceBoard(state,{id:'undo',type:'UNDO',day:date,shift:'PM',at:now+2,undoId:'del'},now+2);
 assert.equal(state.reservations.a.status,'seated');assert.equal(Q.usage(state.reservations,date,'17:00').used,66);
});

test('reservation intake ignores current Floor status, missing formation and party fit',()=>{
 for(const status of ['seated','cleaning','reserved','ready'])for(const people of [6,12,25,40,120]){
  const f=fixture(['A1']);f.people=people;f.live.tables.A1={status,partyId:status==='seated'?'p':undefined};
  f.records.existing={date,time:'18:30',people:25,status:'scheduled',table:'A1'};
  const before=JSON.stringify(f);assert.equal(Q.assess(f).available,true,status+' '+people);assert.equal(JSON.stringify(f),before);
 }
 for(const extra of [{live:null,config:null},{live:{day:'2020-01-01',shifts:{}},config:{formations:{},tables:[]}}])assert.equal(Q.assess({...fixture(),...extra,people:12}).available,true);
});
test('existing bookings never cap today or future reservation intake',()=>{
 for(const day of ['2026-11-18','2026-11-20'])for(const time of ['11:00','15:00','17:00','19:00',...(day==='2026-11-20'?['21:00']:[])]){
  const records=Object.fromEntries(Array.from({length:100},(_,i)=>[i,{date:day,time,people:120,status:'scheduled',table:'L5'}]));
  const result=Q.assess({records,date:day,time,people:12});assert.equal(result.available,true);assert.equal(result.used,12000);assert.equal(result.limit,null);assert.equal(result.remaining,null);
 }
});
test('reservation intake retains valid seating hours and party-size validation',()=>{
 for(const patch of [{people:5},{people:6.5},{people:121},{time:'10:59'},{time:'21:21'},{date:'bad'},{time:'25:00'}])assert.equal(Q.assess({...fixture(),...patch}).reason,'invalid');
});
