const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/party-recommendations.js'),C=require('../dist/core.js');
const now=Date.parse('2026-11-16T19:00:00Z');
function fixture(sections={'1':['L1','L2'],'2':['R1','R2'],'3':['B1','B2','B3'],'4':['C1','C2','C3','C4'],'5':['E2','E3','E4'],'6':['H3','M1']}){
 const tables=[...new Set(Object.values(sections).flat())].map(id=>({id})),config={tables,formations:{test:sections}},state=C.initial(config,now);
 state.shifts.PM={formation:'test',rows:Object.keys(sections).map(section=>({id:section,section,server:'Server '+section,beeper:section,entries:[]})),assignments:Object.fromEntries(Object.entries(sections).flatMap(([section,ids])=>ids.map(id=>[id,section])))};
 return{state,config,shift:'PM',people:8,now};
}
const tableSets=result=>result.candidates.map(c=>c.tables.join('+'));
test('all owner-supplied single capacities and explicit exceptions are retained',()=>{
 assert.equal(Object.keys(P.capacities).length,56);for(const id of ['A1','A2','A3','A4','F1','F6','D1'])assert.deepEqual(P.capacities[id],{min:4,max:4});
 for(const id of ['B2','B3'])assert.equal(P.capacities[id].max,6);for(const id of ['L5','L6','R5','R6','R7'])assert.deepEqual(P.capacities[id],{min:6,max:7});assert.equal(P.capacities.M2.max,5);assert.equal(P.capacities['Bar 1'].max,1);
 const max=ids=>P.groups.find(g=>g.tables.join('+')===ids)?.max;assert.equal(max('C2+C3'),12);assert.equal(max('A4+L5+L6'),20);assert.equal(max('B1+B2+B3'),15);assert.equal(max('E1+F1'),8);assert.equal(max('M1+H3'),10);
 for(const ids of ['A1+A2','F1+F2','H2+H3','C1+C2+C3+C4','D1+D2','E2+E3+E4+E5'])assert.equal(max(ids),undefined);
});
test('party ten respects approved capacity instead of summing seats or inventing adjacent groups',()=>{
 const f=fixture();f.people=10;const list=tableSets(P.recommend(f));assert(list.includes('L1+L2'));assert(!list.includes('R1+R2'));assert(list.includes('C1+C2'));assert(!list.includes('C1+C2+C3'));f.people=13;assert(!tableSets(P.recommend(f)).includes('C2+C3'));
});
test('every approved group fits up to its exact limit and disappears over the limit',()=>{
 for(const group of P.groups){const f=fixture({'1':group.tables});f.people=group.max;const ids=group.tables.join('+');assert(tableSets(P.recommend(f)).includes(ids),ids);f.people++;assert(!tableSets(P.recommend(f)).includes(ids),ids+' over max');}
});
test('suggestions never mutate state, config, reservations or rotation',()=>{const f=fixture();const before=JSON.stringify(f);P.recommend(f);assert.equal(JSON.stringify(f),before);});
test('ready is required for every member; held, cleaning, seated and dangling party links are excluded',()=>{
 for(const status of ['reserved','cleaning','seated','missing']){const f=fixture();f.state.tables.L1.status=status;assert(!tableSets(P.recommend(f)).includes('L1+L2'));}
 const f=fixture();f.state.tables.L1.partyId='pending';assert(!tableSets(P.recommend(f)).includes('L1+L2'));
});
test('today reservation holds block tables until released, while unrelated days do not',()=>{
 const f=fixture();f.records={x:{table:'L1',date:f.state.day,time:'19:00'}};assert(!tableSets(P.recommend(f)).includes('L1+L2'));f.records.x.status='deleted';assert(tableSets(P.recommend(f)).includes('L1+L2'));delete f.records.x.status;f.records.x.date='2026-11-17';assert(tableSets(P.recommend(f)).includes('L1+L2'));
});
test('only assigned active servers in the current formation with enough Board room qualify',()=>{
 const f=fixture();f.state.shifts.PM.rows[0].cut=true;assert(!tableSets(P.recommend(f)).includes('L1+L2'));f.state.shifts.PM.rows[0].cut=false;delete f.state.shifts.PM.assignments.L2;assert(!tableSets(P.recommend(f)).includes('L1+L2'));
 f.state.shifts.PM.assignments.L2='1';f.state.shifts.PM.rows[0].entries=Array.from({length:59},()=>({kind:'manual'}));assert(!tableSets(P.recommend(f)).includes('L1+L2'));
 delete f.config.formations.test;assert.match(P.recommend(f).reason,/formation/);
});
test('cross-section combinations start at thirteen guests and respect merged physical sections',()=>{
 const f=fixture({'1':['L5'],'2':['L6']});f.state.shifts.PM.rows=[{id:'both',server:'Both',section:'1 / 2',entries:[]}];f.state.shifts.PM.assignments={L5:'both',L6:'both'};
 for(const people of [8,12])for(const allowCrossSection of [false,true]){const r=P.recommend({...f,people,allowCrossSection});assert.equal(r.candidates.length,0);assert.equal(r.crossSectionCount,0);}
 let r=P.recommend({...f,people:13});assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].crossSection,true);assert.equal(r.candidates[0].section,'1 / 2');
 r=P.recommend({...f,people:13,allowCrossSection:false});assert.equal(r.candidates.length,0);assert.equal(r.crossSectionCount,1);
});
test('large combinations require every READY member and retain all participating servers',()=>{
 const f=fixture({'4':['L3','L4','L5','L6'],'5':['L1','L2'],'2':['A4']});f.people=36;
 let r=P.recommend(f);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].max,36);assert.equal(r.candidates[0].servers.length,3);
 for(const id of ['A4','L1','L2','L3','L4','L5','L6'])for(const status of ['seated','cleaning','reserved']){f.state.tables[id].status=status;assert.equal(P.recommend(f).candidates.length,0,id+' '+status);f.state.tables[id].status='ready';}
 f.state.shifts.PM.rows.find(r=>r.id==='5').cut=true;assert.equal(P.recommend(f).candidates.length,0);
});
test('owner large-party maxima and total capacity do not sum overlapping combination bonuses',()=>{
 const sizes={'L5+L6':14,'L3+L4+L5+L6':24,'L1+L2+L3+L4+L5+L6':30,'A4+L1+L2+L3+L4+L5+L6':36,'R5+R6+R7':21,'R3+R4+R5+R6+R7':29,'R1+R2+R3+R4+R5+R6+R7':40,'C2+C3+C4':18,'E2+E3+E4':18,'M1+M2+H1+H2+H3+H4':34,'B1+B2+B3':15};
 for(const [ids,max]of Object.entries(sizes))assert.equal(P.groups.find(g=>g.tables.join('+')===ids)?.max,max,ids);
 assert.equal(P.totalCapacity('A4 L1 L2 L3 L4 L5 L6'.split(' ')),38);
 assert.equal(P.totalCapacity('R1 R2 R3 R4 R5 R6 R7'.split(' ')),40);
 assert.equal(P.totalCapacity('E2 E3 E4'.split(' ')),18);
 assert.equal(P.totalCapacity('E2 E3 E4 R1 R2 R3 R4 R5 R6 R7'.split(' ')),58);
 assert.equal(P.totalCapacity('L1 L2 L3 L4 L5'.split(' ')),25);
});
test('changing formation and breaking section changes eligibility immediately',()=>{
 const f=fixture({'1':['L1','L2'],'2':['L3']});assert(tableSets(P.recommend(f)).includes('L1+L2'));f.state.shifts.PM.assignments.L2='2';assert(!tableSets(P.recommend(f)).includes('L1+L2'));assert(tableSets(P.recommend(f)).includes('L2+L3'));
 f.config.formations.other={'1':['L1'],'2':['L3']};f.state.shifts.PM.formation='other';assert.equal(P.recommend(f).candidates.length,0);
});
test('a joined D party blocks C combinations, and release permits them again',()=>{
 const f=fixture();f.state.parties.old={primary:'D1',secondary:['D2'],rowId:'x',shift:'AM',people:8};assert(!tableSets(P.recommend(f)).includes('C2+C3'));delete f.state.parties.old;assert(tableSets(P.recommend(f)).includes('C2+C3'));
});
test('five or more guests use nearest turn count, area preference and workload before section tie order',()=>{
 const f=fixture();assert.equal(P.recommend(f).candidates[0].tables.join('+'),'L1+L2');
 f.state.shifts.PM.rows[0].entries=[{kind:'party',people:4,at:now-600000}];assert.equal(P.recommend(f).candidates[0].tables.join('+'),'R1+R2');
 f.state.tables.R1.status='reserved';assert.equal(P.recommend(f).candidates[0].tables.join('+'),'C1+C2');
 const g=fixture({'1':['L1','L2'],'2':['R1','R2']});g.state.parties.old={primary:'A1',secondary:[],rowId:'1',shift:'PM',people:4};assert.equal(P.recommend(g).candidates[0].server,'Server 2');
 g.state.shifts.PM.rows.forEach(r=>r.entries=[{id:r.id,kind:'party',people:4,at:now-600000}]);g.state.shifts.PM.rows[1].entries[0].at=now-60000;assert.equal(P.recommend(g).candidates[0].server,'Server 1');
});
test('Breanna S3 stays ahead of Megan Sisk S4 for three guests at equal turns; seating or no fitting table advances the choice',()=>{
 const f=fixture({'2':['A1'],'3':['F2','F3'],'4':['L1','L2']});f.people=3;const board=f.state.shifts.PM;
 board.rows[0].entries=[{kind:'manual'},{kind:'manual'}];board.rows[1].server='Breanna';board.rows[2].server='Megan Sisk';
 for(const row of board.rows.slice(1))row.entries=[{id:row.id,kind:'party',people:3,at:now-60000}];
 assert.equal(C.rotationRows(board)[0].server,'Breanna');assert.equal(P.recommend(f).candidates[0].server,'Breanna');assert.equal(P.recommend(f).candidates[0].tables.length,1);
 board.rows[1].entries.push({kind:'party',people:3,at:now});assert.equal(C.rotationRows(board)[0].server,'Megan Sisk');assert.equal(P.recommend(f).candidates[0].server,'Megan Sisk');board.rows[1].entries.pop();
 f.state.tables.F2.status='seated';assert.equal(P.recommend(f).candidates[0].server,'Breanna');f.state.tables.F3.status='cleaning';assert.equal(P.recommend(f).candidates[0].server,'Megan Sisk');
 f.state.tables.F2.status='ready';f.people=5;assert.equal(P.recommend(f).candidates[0].server,'Megan Sisk');assert.deepEqual(P.recommend(f).candidates[0].tables,['L1','L2']);
});
test('a small group uses one fitting table and only combines when that table is unavailable',()=>{
 const f=fixture({'3':['C2','L1','L2']});f.people=3;assert.deepEqual(P.recommend(f).candidates[0].tables,['L1']);f.state.tables.L1.status='reserved';f.state.tables.L2.status='reserved';assert.deepEqual(P.recommend(f).candidates[0].tables,['C2']);
});
test('five-guest boundary switches from exact rotation to L/R party preference',()=>{
 const f=fixture({'3':['E3','E4'],'4':['L5']});f.people=4;assert.equal(P.recommend(f).candidates[0].rowId,'3');assert.equal(P.recommend(f).candidates[0].tables.length,1);f.people=5;assert.equal(P.recommend(f).candidates[0].rowId,'4');assert.deepEqual(P.recommend(f).candidates[0].tables,['L5']);
 const g=fixture({'3':['C2','L5']});g.people=6;assert.deepEqual(P.recommend(g).candidates[0].tables,['L5']);g.people=3;assert.equal(P.recommend(g).candidates[0].max,6);
});
test('workload includes active AM carryover for a PM server without changing rotation',()=>{
 const f=fixture();f.state.shifts.AM.rows=[{id:'am',server:'Server 1',section:'1',entries:[]}];f.state.parties.old={primary:'A1',secondary:['A2'],rowId:'am',shift:'AM',people:7};const c=P.recommend(f).candidates.find(c=>c.rowId==='1');assert.equal(c.activeGuests,7);assert.equal(c.activeTables,2);assert.equal(c.afterGuests,15);assert.equal(c.turns,0);
});
test('invalid sizes, missing formation and empty sections explain why no result is offered',()=>{for(const people of [0,-1,121,2.5,NaN])assert.match(P.recommend({...fixture(),people}).reason,/whole number/);const f=fixture();f.state.shifts.PM.rows=[];assert.match(P.recommend(f).reason,/active server/);});

test('PM BAR capacity includes the next automatic skip and stale service days cannot produce suggestions',()=>{
 const f=fixture({'BAR':['M1','M2']});f.people=8;const row=f.state.shifts.PM.rows[0];row.barAuto=true;row.entries=[{kind:'party',people:4,at:now-600000},...Array.from({length:57},()=>({kind:'manual'}))];assert.equal(P.recommend(f).candidates.length,0);row.barAuto=false;assert.equal(P.recommend(f).candidates.length,1);f.state.day='2026-11-15';assert.match(P.recommend(f).reason,/current service day/);
});


test('all twelve bar stools seat one only and never combine, including compact Bar1 IDs',()=>{
 const ids=Array.from({length:12},(_,n)=>'Bar '+(n+1));const f=fixture({'BAR':ids});f.people=1;assert.equal(P.recommend(f).candidates.length,12);for(const c of P.recommend(f).candidates){assert.equal(c.max,1);assert.equal(c.tables.length,1);}for(const people of [2,6,11,12,20])assert.equal(P.recommend({...f,people}).candidates.length,0);
 const compact=fixture({'BAR':['Bar1','Bar12']});compact.people=1;assert.equal(P.recommend(compact).candidates.length,2);assert.equal(P.capacityFor('Bar13'),null);
});


test('under-five groups prefer next server booths, then that server regular tables before another server booth',()=>{
 const f=fixture({'2':['B1','B2','B3','A1','A2','A3'],'3':['F1']});f.people=3;const board=f.state.shifts.PM;board.rows[0].server='Breanna';
 let list=P.recommend(f).candidates;assert(list.every(c=>c.tables.length===1),'under-five recommendations use single tables only');assert.deepEqual(list.slice(0,3).map(c=>c.tables[0]),['A1','A2','A3']);assert(list.slice(0,3).every(c=>c.booth&&c.seatingType==='BOOTH'));assert.equal(list[3].tables[0],'B1');
 f.state.tables.A1.status='seated';assert.equal(P.recommend(f).candidates[0].tables[0],'A2');f.state.tables.A2.status='cleaning';f.state.tables.A3.status='reserved';list=P.recommend(f).candidates;assert.equal(list[0].tables[0],'B1');assert.equal(list[0].rowId,'2');assert.equal(list[0].seatingType,'TABLE');assert(list.find(c=>c.tables[0]==='F1').booth);
});
test('booth preference applies only under five and never recommends an undersized booth',()=>{
 const f=fixture({'2':['H2','L5']});f.people=4;assert.equal(P.recommend(f).candidates[0].tables[0],'H2');f.people=5;assert.equal(P.recommend(f).candidates[0].tables[0],'L5');
 const g=fixture({'2':['A1','B2']});g.people=5;assert.equal(P.recommend(g).candidates[0].tables[0],'B2');assert.equal(P.booths.length,13);
});

test('twenty guests prefer the fitting Section 4 L combination before a cross-section A4 combination',()=>{
 const f=fixture({'4':['L1','L2','L3','L4','L5','L6'],'2':['A4']});
 const twenty=P.recommend({...f,people:20}).candidates;assert.deepEqual(twenty[0].tables,['L3','L4','L5','L6']);assert.equal(twenty[0].section,'4');assert.equal(twenty[0].crossSection,false);
 assert.deepEqual(P.recommend({...f,people:30}).candidates[0].tables,['L1','L2','L3','L4','L5','L6']);
 assert.deepEqual(P.recommend({...f,people:36}).candidates[0].tables,['A4','L1','L2','L3','L4','L5','L6']);
});
