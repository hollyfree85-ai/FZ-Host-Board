const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');
const config={tables:['A1','A2'].map(id=>({id})),formations:{two:{1:['A1'],2:['A2']}}};
const day='2026-11-27', at=time=>C.reservationTime(day,time);
let seq=0;
function apply(state,type,values={},now=at('15:00')){
 return C.reduce(state,{day:state.day,shift:'PM',at:now,id:'cut_'+(++seq),type,...values},config);
}
function assign(state,time,values={}){
 return apply(state,'SECTION_SERVER',{formation:'two',section:'1',server:'Megan Meadows',cutTime:time,...values});
}
const fixture=()=>assign(C.initial(config,at('15:00')),'20:00');
const row=s=>s.shifts.PM.rows[0];
const decision=s=>({rowId:row(s).id,cutTime:'20:00',server:row(s).server,cut:true});
test('both shifts support explicit times and old closer or tomorrow flags do not schedule a cut',()=>{
 let s=fixture();s=assign(s,'12:15',{shift:'AM',server:'AM Server'});
 s=apply(s,'SECTION_SERVER',{formation:'two',section:'2',server:'Legacy',closer:true,workTomorrowAM:true});
 const items=C.scheduledCuts(s,at('11:00'));
 assert.deepEqual(items.map(x=>[x.shift,x.row.server,x.alertAt]),[['AM','AM Server',at('12:10')],['PM','Megan Meadows',at('19:55')]]);
 assert.equal(C.cutTimeLabel('00:05'),'12:05 AM');assert.equal(C.cutTimeLabel('12:07'),'12:07 PM');
 for(const bad of ['24:00','00:60','9:00',false])assert.throws(()=>assign(s,bad),/valid cut time/);
});
test('cut times follow a server across sections, clear explicitly and reject stale edits',()=>{
 let s=fixture(); s=apply(s,'FORMATION',{formation:'two',servers:{1:'New Server',2:'Megan Meadows'}});
 assert.equal(row(s).cutTime,'20:00');assert.equal(row(s).section,'2');
 assert.equal(s.shifts.PM.rows.find(x=>x.server==='New Server').cutTime,undefined);
 s=assign(s,'21:00',{section:'2',expectedCutTime:'20:00'});
 assert.throws(()=>assign(s,'22:00',{section:'2',expectedCutTime:'20:00'}),/another device/);
 assert.throws(()=>apply(s,'FORMATION',{formation:'two',servers:{1:'New Server',2:'Megan Meadows'},cutTimes:[{server:'Megan Meadows',time:'21:30',expected:'20:00'}]}),/another device/);
 s=assign(s,'',{section:'2',expectedCutTime:'21:00'});assert.deepEqual(C.scheduledCuts(s,at('19:55')),[]);
});
test('after midnight belongs to the evening workday and reminders expire on rollover',()=>{
 const s=assign(fixture(),'00:02'),next='2026-11-28',item=C.scheduledCuts(s,at('23:56'))[0];
 assert.equal(item.at,C.reservationTime(next,'00:02'));assert.equal(item.alertAt,at('23:57'));
 assert.equal(C.scheduledCuts(s,C.reservationTime(next,'03:59')).length,1);
 assert.equal(C.scheduledCuts(s,C.reservationTime(next,'04:00')).length,0);
 for(const date of ['2026-03-08','2026-11-01'])assert.equal(C.cutTimeAt(date,'20:00'),C.reservationTime(date,'20:00'));
});
test('decisions revalidate the employee, current time and active schedule; existing parties stay seated',()=>{
 let s=fixture();s=apply(s,'SEAT',{table:'A1',rowId:row(s).id,people:2,secondary:[]});
 const original=structuredClone([s.tables,s.parties,row(s).entries]);
 const cmd=decision(s);
 assert.throws(()=>apply(s,'SCHEDULED_CUT_DECISION',cmd,at('19:55')-1),/changed/);
 assert.throws(()=>apply(s,'SCHEDULED_CUT_DECISION',{...cmd,server:'Someone Else'},at('19:55')),/changed/);
 const later=assign(s,'20:10');assert.throws(()=>apply(later,'SCHEDULED_CUT_DECISION',cmd,at('20:15')),/changed/);
 s=apply(s,'SCHEDULED_CUT_DECISION',cmd,at('19:55'));assert.equal(row(s).cut,true);
 assert.deepEqual([s.tables,s.parties,row(s).entries],original);
 assert.throws(()=>apply(s,'SCHEDULED_CUT_DECISION',cmd,at('19:59')),/changed/);
 s=apply(s,'CUT',{rowId:row(s).id,cut:false},at('20:01'));assert.equal(C.scheduledCuts(s,at('20:02')).length,0);
});
test('keep active is shared, same-time saves do not repeat, rescheduling rearms',()=>{
 let s=fixture();
 s=apply(s,'SCHEDULED_CUT_DECISION',{...decision(s),cut:false},at('19:55'));assert.equal(row(s).cut,false);
 s=assign(s,'20:00');assert.equal(C.scheduledCuts(s,at('20:00')).length,0);
 s=assign(s,'20:30');assert.equal(C.scheduledCuts(s,at('20:00'))[0].alertAt,at('20:25'));
 s=apply(s,'ROW_EDIT',{rowId:row(s).id,server:'Replacement'});assert.equal(C.scheduledCuts(s,at('20:00')).length,0);
});
