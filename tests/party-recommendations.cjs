const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../dist/party-recommendations.js'),C=require('../dist/core.js');
const now=Date.parse('2026-11-16T19:00:00Z');
function fixture(sections={'1':['L1','L2'],'2':['R1','R2'],'3':['B1','B2','B3'],'4':['C1','C2','C3','C4'],'5':['E2','E3','E4'],'6':['H3','M1']}){
 const tables=[...new Set(Object.values(sections).flat())].map(id=>({id})),config={tables,formations:{test:sections}},state=C.initial(config,now);
 state.shifts.PM={formation:'test',rows:Object.keys(sections).map(section=>({id:section,section,server:'Server '+section,beeper:section,entries:[]})),assignments:Object.fromEntries(Object.entries(sections).flatMap(([section,ids])=>ids.map(id=>[id,section])))};
 return{state,config,shift:'PM',people:8,now};
}
const tableSets=result=>result.candidates.map(c=>c.tables.join('+'));
test('all owner-supplied single capacities and explicit exceptions are retained',()=>{
 assert.equal(Object.keys(P.capacities).length,44);for(const id of ['A1','A2','A3','A4','F1','F6','D1'])assert.deepEqual(P.capacities[id],{min:4,max:4});
 for(const id of ['B2','B3'])assert.equal(P.capacities[id].max,6);for(const id of ['L5','L6','R5','R6','R7'])assert.deepEqual(P.capacities[id],{min:6,max:7});assert.equal(P.capacities.M2.max,5);assert.equal(P.capacities['Bar 1'],undefined);
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
test('cross-section groups are hidden by default even when one server covers multiple sections',()=>{
 const f=fixture({'1':['L1'],'2':['L2']});f.state.shifts.PM.rows=[{id:'both',server:'Both',section:'1 / 2',entries:[]}];f.state.shifts.PM.assignments={L1:'both',L2:'both'};
 assert.equal(P.recommend(f).candidates.length,0);assert.equal(P.recommend(f).crossSectionCount,1);f.allowCrossSection=true;assert.equal(P.recommend(f).candidates[0].crossSection,true);
});
test('changing formation and breaking section changes eligibility immediately',()=>{
 const f=fixture({'1':['L1','L2'],'2':['L3']});assert(tableSets(P.recommend(f)).includes('L1+L2'));f.state.shifts.PM.assignments.L2='2';assert(!tableSets(P.recommend(f)).includes('L1+L2'));assert(tableSets(P.recommend(f)).includes('L2+L3'));
 f.config.formations.other={'1':['L1'],'2':['L3']};f.state.shifts.PM.formation='other';assert.equal(P.recommend(f).candidates.length,0);
});
test('a joined D party blocks C combinations, and release permits them again',()=>{
 const f=fixture();f.state.parties.old={primary:'D1',secondary:['D2'],rowId:'x',shift:'AM',people:8};assert(!tableSets(P.recommend(f)).includes('C2+C3'));delete f.state.parties.old;assert(tableSets(P.recommend(f)).includes('C2+C3'));
});
test('nearest rotation then area preference, recent seating, active volume and stable section order',()=>{
 const f=fixture();assert.equal(P.recommend(f).candidates[0].tables.join('+'),'L1+L2');
 f.state.shifts.PM.rows[0].entries=[{kind:'party',people:4,at:now-600000}];assert.equal(P.recommend(f).candidates[0].tables.join('+'),'R1+R2');
 f.state.tables.R1.status='reserved';assert.equal(P.recommend(f).candidates[0].tables.join('+'),'C1+C2');
 const g=fixture({'1':['L1','L2'],'2':['R1','R2']});g.state.parties.old={primary:'A1',secondary:[],rowId:'1',shift:'PM',people:4};assert.equal(P.recommend(g).candidates[0].server,'Server 2');
 g.state.shifts.PM.rows.forEach(r=>r.entries=[{id:r.id,kind:'party',people:4,at:now-600000}]);g.state.shifts.PM.rows[1].entries[0].at=now-60000;assert.equal(P.recommend(g).candidates[0].server,'Server 1');
});
test('workload includes active AM carryover for a PM server without changing rotation',()=>{
 const f=fixture();f.state.shifts.AM.rows=[{id:'am',server:'Server 1',section:'1',entries:[]}];f.state.parties.old={primary:'A1',secondary:['A2'],rowId:'am',shift:'AM',people:7};const c=P.recommend(f).candidates.find(c=>c.rowId==='1');assert.equal(c.activeGuests,7);assert.equal(c.activeTables,2);assert.equal(c.afterGuests,15);assert.equal(c.turns,0);
});
test('invalid sizes, missing formation and empty sections explain why no result is offered',()=>{for(const people of [0,-1,121,2.5,NaN])assert.match(P.recommend({...fixture(),people}).reason,/whole number/);const f=fixture();f.state.shifts.PM.rows=[];assert.match(P.recommend(f).reason,/active server/);});

test('PM BAR capacity includes the next automatic skip and stale service days cannot produce suggestions',()=>{
 const f=fixture({'BAR':['M1','M2']});f.people=8;const row=f.state.shifts.PM.rows[0];row.barAuto=true;row.entries=[{kind:'party',people:4,at:now-600000},...Array.from({length:57},()=>({kind:'manual'}))];assert.equal(P.recommend(f).candidates.length,0);row.barAuto=false;assert.equal(P.recommend(f).candidates.length,1);f.state.day='2026-11-15';assert.match(P.recommend(f).reason,/current service day/);
});
