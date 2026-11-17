const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js'),P=require('../dist/party-recommendations.js');
const NOW=Date.parse('2026-11-16T23:00:00Z');let sequence=0;
function fixture(){
 const form={'1':['A1','A2','A3','H2'],'2':['L5','L6'],'3':['R5','R6'],'BAR':['Bar 1']};
 const config={tables:Object.values(form).flat().map(id=>({id})),formations:{test:form}};
 const state=C.initial(config,NOW),names=['Angela','Bobby','Casey','Bartender'];
 state.shifts.PM={formation:'test',rows:Object.keys(form).map((section,i)=>({id:section,server:names[i],section,cut:false,barAuto:true,entries:[]})),assignments:Object.fromEntries(Object.entries(form).flatMap(([section,ids])=>ids.map(id=>[id,section])))};
 const rows=state.shifts.PM.rows;
 rows[0].entries=[{id:'angela1',kind:'party',people:2,primary:'A2',at:NOW-120000},{id:'angela2',kind:'party',people:2,primary:'A3',at:NOW-60000}];
 for(const row of rows.slice(1))row.entries=Array.from({length:3},(_,i)=>({id:row.id+'_'+i,kind:'party',people:2,primary:'old',at:NOW-3600000+i}));
 return {state,config,shift:'PM',people:3,now:NOW};
}
function run(f,type,values={},at=f.now){const command={id:'command_'+(++sequence),type,day:f.state.day,shift:'PM',at,...values};f.state=C.reduce(f.state,command,f.config,at);return command;}
const row=(f,id='1')=>f.state.shifts.PM.rows.find(r=>r.id===id);
const rec=f=>P.recommend(f);
const seatOther=f=>run(f,'SEAT',{table:'L5',rowId:'2',people:3,secondary:[]});
test('passing a recently seated next server holds the turn until exactly ten minutes after the last seating',()=>{
 const f=fixture();assert.equal(rec(f).candidates[0].server,'Angela');seatOther(f);
 assert.equal(f.state.shifts.PM.deferredTurns['1'].reason,'recovery');
 assert(!rec(f).candidates.some(c=>c.server==='Angela'));
 assert.equal(rec(f).recovering[0].until,NOW+540000);
 f.now=NOW+539999;assert(!rec(f).candidates.some(c=>c.server==='Angela'));
 f.now++;const top=rec(f).candidates[0];assert.equal(top.server,'Angela');assert(top.returnPriority);assert.equal(top.seatingType,'BOOTH');
});
test('avoiding a double seat after one recent party also preserves a recovery turn',()=>{
 const f=fixture();row(f).entries=row(f).entries.slice(1);seatOther(f);
 assert.equal(f.state.shifts.PM.deferredTurns['1'].reason,'recovery');assert(!rec(f).candidates.some(c=>c.rowId==='1'));
});
test('a third recent party sets recovery from the latest seat, not the bypass or first party',()=>{
 const f=fixture();row(f).entries.push({id:'third',kind:'party',people:2,primary:'A1',at:NOW-10000});seatOther(f);
 assert.equal(rec(f).recovering[0].until,NOW+590000);
 run(f,'SEAT',{table:'R5',rowId:'3',people:3},NOW+120000);f.now=NOW+120000;
 assert.equal(rec(f).recovering[0].until,NOW+590000);
});
test('no-ready bypass returns immediately when a fitting table becomes ready, without a timer penalty',()=>{
 const f=fixture();for(const id of ['A1','A2','A3','H2'])f.state.tables[id]={status:'cleaning'};
 seatOther(f);assert.equal(f.state.shifts.PM.deferredTurns['1'].reason,'no_ready');
 assert(!rec(f).candidates.some(c=>c.rowId==='1'));
 run(f,'STATUS',{table:'A1',status:'ready'},NOW+1000);f.now=NOW+1000;
 const top=rec(f).candidates[0];assert.equal(top.tables[0],'A1');assert(top.returnPriority);
});
test('held turns do not bypass capacity, reservations, formation or ready status for a new party size',()=>{
 const f=fixture();for(const id of ['A1','A2','A3','H2'])f.state.tables[id]={status:'cleaning'};seatOther(f);
 run(f,'STATUS',{table:'A1',status:'ready'});f.people=5;assert(!rec(f).candidates.some(c=>c.rowId==='1'));
 run(f,'STATUS',{table:'H2',status:'ready'});assert.equal(rec(f).candidates[0].rowId,'1');
 f.records={held:{table:'H2',date:f.state.day,time:'18:00'}};assert(!rec(f).candidates.some(c=>c.rowId==='1'));delete f.records;
 delete f.state.shifts.PM.assignments.H2;assert(!rec(f).candidates.some(c=>c.rowId==='1'));
});
test('a returned turn outranks party area preference, but only for fitting options',()=>{
 const f=fixture();seatOther(f);f.now=NOW+540000;f.people=6;
 assert.equal(rec(f).candidates[0].tables[0],'H2');assert(rec(f).candidates[0].returnPriority);
 f.people=7;assert(!rec(f).candidates.some(c=>c.rowId==='1'));
});
test('manual SKIP while blocked preserves the turn without changing skip counts or BAR auto skips',()=>{
 const f=fixture();run(f,'SKIP',{rowId:'1',count:3});assert.equal(C.slots(row(f)),5);
 assert.equal(f.state.shifts.PM.deferredTurns['1'].reason,'recovery');f.now=NOW+540000;
 assert.equal(rec(f).candidates[0].rowId,'1');assert.equal(C.slots(row(f)),5);
 const fresh=fixture();row(fresh).entries=[];run(fresh,'SKIP',{rowId:'1'});assert(!fresh.state.shifts.PM.deferredTurns?.['1']);
});
test('confirmed seating clears priority once; retries neither duplicate the party nor restore the held turn',()=>{
 const f=fixture();seatOther(f);f.now=NOW+540000;
 const command=run(f,'SEAT',{table:'A1',rowId:'1',people:3});assert(!f.state.shifts.PM.deferredTurns['1']);
 const before=JSON.stringify(f.state);f.state=C.reduce(f.state,command,f.config,f.now);assert.equal(JSON.stringify(f.state),before);
 assert(!rec(f).candidates.some(c=>c.rowId==='1'&&c.returnPriority));
});
test('failed seating does not clear the held turn or record any new bypass',()=>{
 const f=fixture();seatOther(f);f.now=NOW+540000;const before=JSON.stringify(f.state);
 assert.throws(()=>run(f,'SEAT',{table:'L5',rowId:'1',people:3}),/READY/);assert.equal(JSON.stringify(f.state),before);
});
test('priority survives JSON round trips and uses oldest eligible bypass before ordinary rotation',()=>{
 const f=fixture();seatOther(f);run(f,'SKIP',{rowId:'2',count:1},NOW+30000);
 f.state=C.normalize(JSON.parse(JSON.stringify(f.state)),f.config);f.now=NOW+600000;
 assert.equal(rec(f).candidates[0].rowId,'1');
 run(f,'SEAT',{table:'A1',rowId:'1',people:3});assert.equal(rec(f).candidates[0].rowId,'2');
});
test('cut, changed server, cleared shift and daily reset cannot transfer a held turn',()=>{
 for(const [type,values]of [['CUT',{rowId:'1',cut:true}],['ROW_EDIT',{rowId:'1',server:'Replacement'}],['CLEAR_SHIFT',{}]]){
  const f=fixture();seatOther(f);run(f,type,values);f.now=NOW+540000;assert(!rec(f).candidates.some(c=>c.returnPriority));
 }
 const f=fixture();seatOther(f);run(f,'DAILY_RESET',{},NOW+86400000);assert.equal(f.state.shifts.PM.deferredTurns,undefined);
});
test('AM carryover counts for recovery, while separate AM and PM held turns remain isolated',()=>{
 const f=fixture();row(f).entries=[];f.state.shifts.AM.rows=[{id:'am_angela',server:'Angela',section:'1',entries:[{id:'am_last',kind:'party',people:2,primary:'A1',at:NOW-5000}]}];
 seatOther(f);assert.equal(rec(f).recovering[0].until,NOW+595000);assert.equal(f.state.shifts.AM.deferredTurns,undefined);
});
test('seating from an older client satisfies priority even when it does not remove the metadata',()=>{
 const f=fixture();seatOther(f);row(f).entries.push({id:'older_client_seat',kind:'party',people:2,primary:'A1',at:NOW+1000});f.now=NOW+540000;
 assert(!rec(f).candidates.some(c=>c.rowId==='1'&&c.returnPriority));
});
