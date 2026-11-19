(function(root){'use strict';
const C=root.HostCore,clock=time=>{const [h,m]=time.split(':');return (Number(h)-12)+':'+m+' PM';};
class CutAlerts{
 constructor(options){this.options=options;this.dialog=null;this.busy=false;this.error='';this.snooze={};this.timer=setInterval(()=>this.check(),15000);document.addEventListener('visibilitychange',()=>this.check());}
 context(){const state=this.options.state();return state?C.pmCutPlan(state,this.options.now()):null;}
 preserveToast(){const toast=this.dialog?.querySelector('#toast');if(toast)document.body.appendChild(toast);}
 close(snooze=true){if(snooze&&this.stageKey)this.snooze[this.stageKey]=this.options.now()+5*60000;if(this.dialog){this.preserveToast();this.dialog.close();this.dialog.remove();}this.dialog=null;this.renderKey='';}
 check(){
  if(!this.options.enabled()){this.close(false);return;}
  if(this.busy)return;
  if(this.dialog){if(!this.dialog.open){this.close();return;}this.render();return;}
  const plan=this.context();if(!plan?.current||!plan.current.candidates.length||!this.options.live()||document.hidden||document.querySelector('dialog[open]'))return;
  const key=this.options.state().day+'_'+plan.current.id;if(this.snooze[key]>this.options.now())return;this.show();
 }
 show(){if(!this.options.enabled()||this.dialog)return;const plan=this.context();if(!plan)return;this.error='';this.dialog=document.createElement('dialog');this.dialog.id='pmCutAlert';this.dialog.setAttribute('aria-label','PM cut review');document.body.appendChild(this.dialog);this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});this.render();this.dialog.showModal();this.options.sound?.();}
 render(){
  const plan=this.context();if(!plan||!this.dialog)return;
  const stage=plan.current||plan.stages[0],state=this.options.state(),key=JSON.stringify([plan.key,stage.id,stage.reviewReady,this.options.live(),this.error]);if(key===this.renderKey)return;this.renderKey=key;this.stageKey=state.day+'_'+stage.id;
  this.preserveToast();this.dialog.replaceChildren();const add=(tag,text,parent=this.dialog,cls='')=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.appendChild(el);return el;};
  add('h2','PM CUT REVIEW · '+clock(stage.time));
  add('p',stage.reviewReady?'Review each name. Choose CUT or NOT CUT. No employee is cut automatically.':'This review opens at '+new Date(stage.alertAt).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'})+'.');
  add('p',plan.weekend?'Friday / Saturday: first cut targets 3–4 eligible employees; keep 4 employees, including BAR, for closing.':'Sunday–Thursday: first cut is for Double, Long Shift or Work tomorrow AM; keep 3 employees, including BAR, for closing.',this.dialog,'helper');
  if(plan.closerMissing)add('p','No closer selected. Set Closer in PM Formation & Servers before choosing who to cut.',this.dialog,'cut-warning');
  if(plan.shortStaff)add('p','Only '+plan.rows.length+' employees are active. Keep the available closing team.',this.dialog,'cut-warning');
  add('h3','KEEP FOR CLOSING');
  for(const {row,reasons}of plan.closing)add('p',row.server+' · '+(row.section==='BAR'?'BAR':'S'+row.section)+' · '+reasons.join(' / '),this.dialog,'cut-keep');
  add('h3',stage.id==='first'?'FIRST CUT · '+stage.candidates.length+' TO REVIEW':'SECOND CUT · '+stage.candidates.length+' TO REVIEW');
  if(plan.weekend&&stage.id==='first')add('p',plan.firstCuts+' already cut in this review. Up to '+Math.max(0,4-plan.firstCuts)+' more; closing coverage stays protected.',this.dialog,'helper');
  if(!stage.candidates.length)add('p','No pending cut decisions. Review complete, or no eligible employees remain.',this.dialog,'cut-empty');
  for(const row of stage.candidates){
   const box=add('section','',this.dialog,'cut-review-row');box.dataset.cutRow=row.id;
   add('h3',row.server+' · '+(row.section==='BAR'?'BAR':'S'+row.section),box);
   add('p',(row.workShift||'PM')+(row.workTomorrowAM?' · Work tomorrow AM':''),box);
   const tables=Object.entries(state.shifts.PM.assignments||{}).filter(([,id])=>id===row.id).map(([id])=>id);add('p','Tables: '+(tables.join(', ')||'None assigned'),box,'helper');
   const actions=add('div','',box,'cut-review-actions');
   for(const cut of [true,false]){const button=add('button',cut?'CUT':'NOT CUT',actions,cut?'danger':'primary');button.dataset.cutDecision=String(cut);button.disabled=!stage.reviewReady||!this.options.live();button.onclick=()=>this.decide(row,cut,stage.id,plan.key);}
  }
  if(this.error)add('p',this.error,this.dialog,'cut-warning');
  add('p','CUT removes the server from new seating rotation. Existing guests and table status stay unchanged.',this.dialog,'helper');
  const close=add('button',stage.candidates.length?'REVIEW LATER · 5 MIN':'CLOSE',this.dialog,'full');close.onclick=()=>this.close();
 }
 async decide(row,cut,stage,expectedRoster){
  if(this.busy||!this.options.enabled()||!this.options.live())return;this.busy=true;this.error='';this.dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await this.options.decide({rowId:row.id,cut,stage,expectedRoster});if(!result)this.error='The decision was not saved. Wait until LIVE and try again.';}catch(error){this.error=error.message;}finally{this.busy=false;this.renderKey='';if(!this.options.enabled())this.close(false);else this.render();}
 }
}
root.CutAlerts=CutAlerts;
})(globalThis);
