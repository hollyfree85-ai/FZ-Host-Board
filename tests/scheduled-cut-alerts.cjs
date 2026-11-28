const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const C=require('../dist/core');
const code=readFileSync(require.resolve('../dist/cut-alerts'),'utf8');
const day='2026-11-27', time=t=>C.cutTimeAt(day,t);
function screen(state,clock){
 const dom=new JSDOM('<dialog id="formation" open></dialog>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document,alarms=new Map();
 const controls={entered:true,live:true,rings:0};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HostCore=C;w.setTimeout=(fn,delay)=>{const token={};alarms.set(token,{fn,delay});return token;};
 w.clearTimeout=key=>alarms.delete(key);
 w.eval(code);
 const alerts=new w.CutAlerts({state:()=>state,now:()=>clock.now,enabled:()=>controls.entered,live:()=>controls.live,
  sound:()=>controls.rings++,decide:async decision=>{
   const row=state.shifts[decision.shift].rows.find(r=>r.id===decision.rowId);
   row.reviewedCutTime=row.cutTime;row.cut=decision.cut;
   controls.onDecision?.();return true;
  }});
 return {d,w,controls,alerts,alarms,close:()=>dom.window.close()};
}
function staffState(){
 const staff=(id,cutTime)=>({id,section:id,server:'Employee '+id,cutTime});
 return {day,shifts:{AM:{rows:[staff('1','15:45')]},PM:{rows:[staff('2','15:45')]}}};
}
test('scheduled alert fires at exactly five minutes in both shifts and syncs decisions across open hosts',async()=>{
 const clock={now:time('15:39')},state=staffState(),a=screen(state,clock),b=screen(state,clock);
 try{
  for(const device of [a,b]){
   device.controls.onDecision=()=>{a.alerts.check();b.alerts.check();};
   device.alerts.check();assert.equal(device.d.querySelector('#scheduledCutAlert'),null);
   assert.equal([...device.alarms.values()][0].delay,60000);
  }
  clock.now=time('15:40');
  for(const device of [a,b]){
   [...device.alarms.values()][0].fn();
   assert.equal(device.d.querySelectorAll('[data-cut-row]').length,2);
   assert.match(device.d.querySelector('#scheduledCutAlert').textContent,/3:45 PM/);
   assert.equal(device.controls.rings,1);device.alerts.check();assert.equal(device.controls.rings,1);
  }
  b.d.querySelector('[data-cut-row="1"] [data-cut-decision="false"]').click();
  await new Promise(setImmediate);
  assert.equal(a.d.querySelector('[data-cut-row="1"]'),null);
  a.d.querySelector('[data-cut-row="2"] [data-cut-decision="true"]').click();
  await new Promise(setImmediate);
  for(const device of [a,b]){assert.equal(device.d.querySelector('#scheduledCutAlert'),null);assert(device.d.querySelector('#formation').open);}
  assert.equal(state.shifts.AM.rows[0].cut,false);assert.equal(state.shifts.PM.rows[0].cut,true);
 }finally{a.close();b.close();}
});
test('rescheduling cancels the original timer; login, reconnect and snooze honor the new time',()=>{
 const state=staffState(),clock={now:time('15:39')};state.shifts.AM.rows=[];
 const device=screen(state,clock),{d,alerts,alarms,controls}=device;
 try{
  alerts.check();const first=[...alarms.keys()][0];state.shifts.PM.rows[0].cutTime='15:50';
  alerts.check();assert(!alarms.has(first));assert.equal([...alarms.values()][0].delay,360000);
  clock.now=time('15:45');controls.entered=false;alerts.check();assert.equal(d.querySelector('#scheduledCutAlert'),null);
  controls.entered=true;controls.live=false;alerts.check();assert.equal(d.querySelector('#scheduledCutAlert'),null);
  controls.live=true;device.w.dispatchEvent(new device.w.Event('focus'));assert(d.querySelector('#scheduledCutAlert').open);
  d.querySelector('#scheduledCutAlert > button').click();assert.equal(d.querySelector('#scheduledCutAlert'),null);
  clock.now+=300000;alerts.check();assert(d.querySelector('#scheduledCutAlert').open);
  state.shifts.PM.rows[0].cutTime='';alerts.check();assert.equal(d.querySelector('#scheduledCutAlert'),null);
 }finally{device.close();}
});
