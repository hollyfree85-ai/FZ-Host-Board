const test=require('node:test'),assert=require('node:assert/strict'),C=require('../dist/core.js'),Q=require('../dist/reservation-quota.js');
const now=Date.parse('2026-11-18T20:00:00Z'),date='2026-11-18';
function fixture(ids=['L5','L6','R5','R6','H2','H3']){const config={tables:ids.map(id=>({id})),formations:{test:{'4':ids.filter(id=>!id.startsWith('R')),'5':ids.filter(id=>id.startsWith('R'))}}};const live=C.initial(config,now);live.shifts.PM={formation:'test',rows:[{id:'l',section:'4',server:'Server L',entries:[]},{id:'r',section:'5',server:'Server R',entries:[]}],assignments:Object.fromEntries(ids.map(id=>[id,id.startsWith('R')?'r':'l']))};live.shifts.AM=C.copy(live.shifts.PM);return {live,config,records:{},date,time:'17:00',people:6,now};}
test('quota windows use Chicago calendar weekdays, exact boundaries and last seating grace',()=>{
 for(const d of ['2026-11-15','2026-11-16','2026-11-17','2026-11-18','2026-11-19']){
  assert.equal(Q.windowFor(d,'14:59').limit,null);assert.equal(Q.windowFor(d,'15:00').limit,60);assert.equal(Q.windowFor(d,'16:59').limit,60);assert.equal(Q.windowFor(d,'17:00').limit,50);assert.equal(Q.windowFor(d,'19:00').limit,50);assert.equal(Q.windowFor(d,'21:20').limit,50);assert.equal(Q.windowFor(d,'21:21'),null);
 }
 for(const d of ['2026-11-20','2026-11-21']){assert.equal(Q.windowFor(d,'15:00').limit,60);assert.equal(Q.windowFor(d,'17:00').limit,50);assert.equal(Q.windowFor(d,'19:00').limit,40);assert.equal(Q.windowFor(d,'21:00').limit,60);assert.equal(Q.windowFor(d,'22:20').limit,60);assert.equal(Q.windowFor(d,'22:21'),null);}
});
test('all host/online reservations count people including seated until completed; release only this party',()=>{
 const records=Object.fromEntries(['scheduled','confirmed','arrived','seated','completed','deleted'].map((status,i)=>[i,{date,time:'17:00',people:10,status,source:i%2?'online':'host'}]));
 assert.equal(Q.usage(records,date,'18:00').used,40);assert.equal(Q.usage(records,date,'18:00').remaining,10);records[3].status='completed';assert.equal(Q.usage(records,date,'18:00').remaining,20);assert.equal(Q.usage(records,date,'19:00').used,0);assert.equal(Q.assess({...fixture(),records,people:21}).reason,'quota');
});
test('quota alone cannot accept when suitable tables are occupied, cleaning, reserved or too small',()=>{
 for(const status of ['seated','cleaning','reserved']){const f=fixture(['L5']);f.live.tables.L5={status};assert.equal(Q.assess(f).reason,'tables');}
 assert.equal(Q.assess(fixture(['A1','A2','A3'])).available,false);
 const f=fixture(['L5']);assert.equal(Q.assess(f).available,true);assert.equal(Q.assess({...f,people:8}).available,false);
});
test('existing reservations consume disjoint fitting tables and assigned holds cannot be reused',()=>{
 const f=fixture(['L5','L6']);f.records.a={date,time:'17:15',people:7};assert.equal(Q.assess({...f,people:13}).available,false);assert.equal(Q.assess({...f,people:7}).available,true);
 f.records.b={date,time:'18:00',people:7};assert.equal(Q.assess(f).available,false);f.records.a.status='completed';assert.equal(Q.assess(f).available,true);
 f.records.b.table='L6';assert.equal(Q.assess({...f,people:12}).available,false);
});
test('approved cross-section groups start above twelve and bar stools never form a party',()=>{
 const f=fixture(['L5','L6']);assert.equal(Q.assess({...f,people:13}).available,true);f.config.formations.test={'4':['L5'],'5':['L6']};f.live.shifts.PM.assignments.L6='r';assert.equal(Q.assess({...f,people:13}).available,true);assert.equal(Q.assess({...f,people:12}).available,false);
 assert.equal(Q.assess(fixture(['Bar 1','Bar 2','Bar 3','Bar 4','Bar 5','Bar 6'])).available,false);
});
test('future dates use formation capacity, today uses READY, and a linked seated reservation is not counted twice physically',()=>{
 const f=fixture(['L5','L6']);f.records.a={date,time:'17:00',people:7,status:'seated',partyId:'p'};f.live.parties.p={id:'p',primary:'L5',people:7,reservationId:'a'};f.live.tables.L5={status:'seated',partyId:'p'};assert.equal(Q.assess(f).available,true);assert.equal(Q.assess(f).used,7);
 f.live.tables.L6={status:'cleaning'};assert.equal(Q.assess(f).available,false);assert.equal(Q.assess({...f,date:'2026-11-19'}).available,true);
 f.live.day='2026-11-17';assert.equal(Q.assess(f).reason,'floor');
});
test('reservation deletion requires three acknowledgements and cancel at any step stops immediately',()=>{
 for(const stop of [0,1,2]){let calls=0;assert.equal(Q.confirmReservationDelete(()=>calls++!==stop,'Party'),false);assert.equal(calls,stop+1);}
 const texts=[];assert.equal(Q.confirmReservationDelete(t=>{texts.push(t);return true;},'Party'),true);assert.equal(texts.length,3);assert.match(texts[0],/DELETE RESERVATION/);assert.match(texts[1],/quota/);assert.match(texts[2],/manager/i);
});
test('atomic linked party completion updates quota once, preserves rotation and undo can restore usage',()=>{
 const f=fixture(),b={live:f.live,config:f.config,reservations:{a:{date,time:'17:00',people:6,status:'scheduled'}}};
 let s=Q.reduceBoard(b,{id:'seat',type:'SEAT',day:date,shift:'PM',at:now,table:'L5',people:6,rowId:'l',reservationId:'a'},now);assert.equal(s.reservations.a.status,'seated');
 const cmd={id:'del',type:'DELETE',day:date,shift:'PM',at:now+1,table:'L5',partyId:'seat'};s=Q.reduceBoard(s,cmd,now+1);assert.equal(s.reservations.a.status,'completed');assert.equal(Q.usage(s.reservations,date,'17:00').used,0);assert.deepEqual(Q.reduceBoard(s,cmd,now+2),s);
 s=Q.reduceBoard(s,{id:'undo',type:'UNDO',day:date,shift:'PM',at:now+3,undoId:'del'},now+3);assert.equal(s.reservations.a.status,'seated');assert.equal(Q.usage(s.reservations,date,'17:00').used,6);assert.equal(s.live.tables.L5.status,'seated');
});

test('large approved capacity overrides standalone sums without bypassing READY or quota',()=>{
 for(const [ids,people]of [['L3 L4 L5 L6',24],['L1 L2 L3 L4 L5 L6',30],['A4 L1 L2 L3 L4 L5 L6',36],['R5 R6 R7',21],['R3 R4 R5 R6 R7',29],['R1 R2 R3 R4 R5 R6 R7',40],['C2 C3 C4',18],['E2 E3 E4',18],['M1 M2 H1 H2 H3 H4',34],['B1 B2 B3',15]]){
  const f=fixture(ids.split(' '));f.people=people;assert.equal(Q.assess(f).available,true,ids+' capacity');assert.equal(Q.assess({...f,people:people+1}).available,false,ids+' above capacity');
  f.live.tables[ids.split(' ')[0]].status='cleaning';assert.equal(Q.assess(f).available,false,ids+' READY');
 }
 const f=fixture('R1 R2 R3 R4 R5 R6 R7'.split(' '));f.people=40;f.records.other={date,time:'17:00',people:11,status:'seated'};assert.equal(Q.assess(f).reason,'quota');
});
test('cross-section permission is checked per existing and new party and never shares a table',()=>{
 const f=fixture(['L5','L6','R5','R6']);f.config.formations.test={'4':['L5','R5'],'5':['L6','R6']};f.live.shifts.PM.assignments={L5:'l',R5:'l',L6:'r',R6:'r'};
 f.records.old={date,time:'17:00',people:13,table:'L5',secondary:['L6']};
 assert.equal(Q.assess({...f,people:13}).available,true);assert.equal(Q.assess({...f,people:12}).available,false);
 f.records.old.people=12;assert.equal(Q.assess({...f,people:13}).available,false);
 f.records.old.people=13;f.records.old.secondary=['R6'];assert.equal(Q.assess({...f,people:13}).available,false,'unapproved pinned combination');
 const overlap=fixture(['E2','E3','E4']);overlap.records.old={date,time:'17:00',people:6};assert.equal(Q.assess({...overlap,people:12}).available,false,'18 seats cannot promise two parties using the same tables');
});
