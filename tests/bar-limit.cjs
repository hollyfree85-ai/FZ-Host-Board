const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js'),P=require('../dist/party-recommendations.js'),Q=require('../dist/reservation-quota.js');
const at=Date.parse('2026-11-18T20:00:00Z');let seq=0;
function fixture(){
 const form={'1':['L5','L6'],'2':['B2'],BAR:['H2','H3','H4','M1','M2','Bar 1']};
 const config={tables:Object.values(form).flat().map(id=>({id})),formations:{test:form,backup:{'1':['L5','L6','H4'],BAR:['H2','H3','M1','M2','Bar 1']}}};
 const state=C.initial(config,at);state.shifts.PM={formation:'test',rows:Object.keys(form).map(section=>({id:section,section,server:'Server '+section,entries:[],barAuto:true})),assignments:Object.fromEntries(Object.entries(form).flatMap(([section,ids])=>ids.map(id=>[id,section])))};
 return {state,config,shift:'PM',now:at,people:6};
}
const command=(type,values={})=>({id:'bar_limit_'+(++seq),type,at,day:C.dayAt(at),shift:'PM',...values});
const seat=(f,values={})=>C.reduce(f.state,command('SEAT',{table:'H2',rowId:'BAR',people:5,...values}),f.config);
test('manual seating and ACCEPT cannot seat six in BAR, even with a different server selected',()=>{
 const f=fixture(),before=JSON.stringify(f.state);
 for(const rowId of ['BAR','1'])assert.throws(()=>seat(f,{people:6,rowId}),/BAR.*maximum of 5/);
 assert.equal(JSON.stringify(f.state),before);
 const seated=seat(f);assert.equal(C.partyFor(seated,'H2').people,5);
 assert.equal(C.partyFor(seat(f,{table:'L5',rowId:'1',people:6}),'L5').people,6);
 assert.throws(()=>seat(f,{table:'L5',rowId:'BAR',people:6}),/BAR.*maximum of 5/);
});
test('people edits, secondary links and moves enforce the destination BAR limit atomically',()=>{
 const f=fixture();f.state=seat(f);let before=JSON.stringify(f.state);
 assert.throws(()=>C.reduce(f.state,command('PEOPLE',{table:'H2',people:6}),f.config),/maximum of 5/);assert.equal(JSON.stringify(f.state),before);
 f.state=seat(f,{table:'L5',rowId:'1',people:6});before=JSON.stringify(f.state);
 for(const values of [{type:'MOVE',target:'H3',rowId:'1'},{type:'MOVE',target:'L5',rowId:'BAR'},{type:'SECONDARY',secondary:['H3']}])assert.throws(()=>C.reduce(f.state,command(values.type,{table:'L5',...values}),f.config),/maximum of 5/);
 assert.equal(JSON.stringify(f.state),before);
 const moved=C.reduce(f.state,command('MOVE',{table:'H2',target:'M1',rowId:'BAR'}),f.config);assert.equal(C.partyFor(moved,'M1').people,5);
});
test('active and overflow recommendations cap BAR tables at five while bar stools remain one seat',()=>{
 const f=fixture();const five=P.search({...f,people:5}).candidates.filter(c=>c.section==='BAR');assert(five.some(c=>c.tables[0]==='H2'));assert(five.every(c=>c.max<=5));
 for(const people of [6,10,20,34])assert(P.search({...f,people}).candidates.every(c=>!c.tables.some(id=>['H2','H3','H4','M1','M2','Bar 1'].includes(id))));
 const stool=P.search({...f,people:1}).candidates.find(c=>c.tables[0]==='Bar 1');assert.equal(stool.max,1);
 f.state.shifts.PM.rows.find(r=>r.id==='BAR').cut=true;
 assert(P.search(f).candidates.every(c=>!c.tables.includes('H2')&&!c.tables.includes('H4')));
});
test('overflow cards cannot send a six-person party to the BAR server',()=>{
 const f=fixture();delete f.state.shifts.PM.assignments.L6;
 const candidate=P.search(f).candidates.find(c=>c.inactive&&c.tables.join()==='L6');assert(candidate);assert(candidate.serverChoices.length);assert(!candidate.serverChoices.some(r=>r.rowId==='BAR'));
});
test('merged BAR and dining rows preserve dining capacity and Breaking Section overrides the template',()=>{
 const f=fixture(),board=f.state.shifts.PM;
 board.rows=board.rows.filter(r=>r.id!=='1');board.rows.find(r=>r.id==='BAR').section='1 / BAR';board.assignments.L5='BAR';board.assignments.L6='BAR';
 assert.equal(C.partyFor(seat(f,{table:'L5',people:6}),'L5').people,6);
 assert.throws(()=>seat(f,{table:'H2',people:6}),/maximum of 5/);
 assert(P.search(f).candidates.some(c=>c.tables.join()==='L5'));
 board.assignments.H2='2';assert.equal(C.partyFor(seat(f,{table:'H2',rowId:'2',people:6}),'H2').people,6);
 assert(P.search(f).candidates.some(c=>c.tables.join()==='H2'&&c.max===6));
});
test('existing oversized BAR records remain intact and can become READY without a confirmation gate',()=>{
 const f=fixture();f.state=seat(f);const p=C.partyFor(f.state,'H2');p.people=6;f.state.shifts.PM.rows.find(r=>r.id==='BAR').entries[0].people=6;
 const next=C.reduce(f.state,command('STATUS',{table:'H2',status:'ready'}),f.config);assert.equal(next.tables.H2.status,'ready');assert.equal(next.shifts.PM.rows.find(r=>r.id==='BAR').entries[0].people,6);
});
test('online quota cannot promise BAR dining tables for reservations of six or more, today or future',()=>{
 const f=fixture();f.config.formations.test={BAR:['H2','H3','H4','M1','M2','Bar 1']};f.state.shifts.PM.assignments=Object.fromEntries(f.config.formations.test.BAR.map(id=>[id,'BAR']));
 for(const date of ['2026-11-18','2026-11-19']){const result=Q.assess({config:f.config,live:f.state,date,time:'18:00',people:6,now:at});assert.equal(result.available,false);}
 f.config.formations.test['1']=['L5'];f.state.shifts.PM.assignments.L5='1';assert.equal(Q.assess({config:f.config,live:f.state,date:'2026-11-18',time:'18:00',people:6,now:at}).available,true);
});
