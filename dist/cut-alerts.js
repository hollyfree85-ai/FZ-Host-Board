(function(root){
'use strict';
const C=root.HostCore;
class CutAlerts {
 constructor(options){
  this.options=options;
  this.snoozed=new Map();
  this.visible=new Set();
  this.busy=false;
  this.error='';
  this.timer=null;
  this.nextAt=null;
  document.addEventListener('visibilitychange',()=>this.check());
  for(const event of ['focus','online'])root.addEventListener(event,()=>this.check());
 }
 schedule(at,now){
  if(at===this.nextAt)return;
  clearTimeout(this.timer);
  this.nextAt=at;
  if(at!==null)this.timer=setTimeout(()=>{this.nextAt=null;this.check();},Math.max(0,at-now));
 }
 close(){
  const toast=this.dialog?.querySelector('#toast');
  if(toast)document.body.appendChild(toast);
  if(this.dialog){this.dialog.close();this.dialog.remove();}
  this.dialog=null;
  this.renderKey='';
  this.visible.clear();
  this.error='';
 }
 later(){
  const until=this.options.now()+5*60000;
  for(const key of this.visible)this.snoozed.set(key,until);
  this.close();
  this.check();
 }
 check(){
  const now=this.options.now();
  if(!this.options.enabled()){
   this.schedule(null,now);
   this.close();
   return;
  }
  if(this.busy||document.hidden)return;
  const live=this.options.live(),state=this.options.state();
  const due=[];
  let nextAt=null;
  for(const [key,until] of this.snoozed)if(until<=now)this.snoozed.delete(key);
  for(const item of C.scheduledCuts(state,now)){
   const key=JSON.stringify([state.day,item.shift,item.row.id,item.row.server,item.at]);
   const alertAt=Math.max(item.alertAt,this.snoozed.get(key)||0);
   if(now>=alertAt)due.push({...item,key});
   else if(nextAt===null||nextAt>alertAt)nextAt=alertAt;
  }
  this.schedule(nextAt,now);
  if(!due.length){this.close();return;}
  if(!live&&!this.dialog)return;
  if(!this.dialog){
   this.dialog=document.createElement('dialog');
   this.dialog.id='scheduledCutAlert';
   this.dialog.setAttribute('aria-label','Scheduled cut reminder');
   this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.later();});
   document.body.appendChild(this.dialog);
   this.dialog.showModal();
  }
  const renderKey=JSON.stringify([due.map(item=>[item.key,item.row.section]),live,this.error]);
  if(renderKey===this.renderKey)return;
  this.renderKey=renderKey;
  const newReminder=due.some(item=>!this.visible.has(item.key));
  this.visible=new Set(due.map(item=>item.key));
  const toast=this.dialog.querySelector('#toast');
  if(toast)document.body.appendChild(toast);
  this.dialog.replaceChildren();
  const add=(parent,tag,text,cls)=>{
   const el=document.createElement(tag);
   el.textContent=text;
   if(cls)el.className=cls;
   parent.appendChild(el);
   return el;
  };
  add(this.dialog,'h2','Scheduled cut reminder');
  for(const {row,shift} of due){
   const entry=add(this.dialog,'section','','cut-review-row');
   entry.dataset.cutRow=row.id;
   add(entry,'h3',C.staffName(row.server)+' · '+C.cutTimeLabel(row.cutTime));
   add(entry,'p',shift+' shift · '+(row.section==='BAR'?'Bar':'Section '+row.section));
   const actions=add(entry,'div','','cut-review-actions');
   for(const cut of [true,false]){
    const button=add(actions,'button',cut?'CUT SERVER':'KEEP ACTIVE',cut?'danger':'primary');
    button.dataset.cutDecision=String(cut);
    button.disabled=!live;
    button.onclick=()=>this.decide({rowId:row.id,server:row.server,cutTime:row.cutTime,shift,day:state.day,cut});
   }
  }
  if(this.error)add(this.dialog,'p',this.error,'cut-warning');
  add(this.dialog,'button','REMIND ME IN 5 MIN','full').onclick=()=>this.later();
  if(live&&newReminder)this.options.sound?.();
 }
 async decide(values){
  if(this.busy||!this.options.enabled()||!this.options.live())return;
  this.busy=true;
  this.error='';
  this.dialog.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
   if(!await this.options.decide(values))this.error='Wait until the board is live and try again.';
  }catch(error){this.error=error.message;}
  finally{this.busy=false;this.renderKey='';this.check();}
 }
}
root.CutAlerts=CutAlerts;
})(globalThis);
