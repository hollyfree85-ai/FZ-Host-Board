(function(root){'use strict';
class HostConnection{
 constructor(options){this.options=options;this.config=null;this.state=null;this.connected=false;this.offset=0;this.busy=false;this.onState=()=>{};this.onConfig=()=>{};this.onStatus=()=>{};this.pendingKey='fz_host_next_pending_v1';this.unsub=[];this.app=root.firebase.apps.find(a=>a.name==='fz-host-next')||root.firebase.initializeApp({databaseURL:options.databaseURL},'fz-host-next');this.db=this.app.database();this.ref=this.db.ref(options.path);this.liveRef=this.ref.child('live');}
 now(){return Date.now()+this.offset;}
 status(){this.onStatus({connected:this.connected,ready:!!this.state&&!!this.config,busy:this.busy});}
 start(){
  const attach=(ref,handler)=>{ref.on('value',handler,e=>{this.onStatus({error:e.message,connected:false,ready:false,busy:this.busy});});this.unsub.push(()=>ref.off('value',handler));};
  attach(this.db.ref('.info/connected'),s=>{this.connected=!!s.val();this.status();});
  attach(this.db.ref('.info/serverTimeOffset'),s=>{this.offset=Number(s.val())||0;});
  attach(this.ref.child('config'),s=>{const value=s.val();if(!value){this.onStatus({error:'Host database has not been initialized.',connected:this.connected,ready:false});return;}this.config=value;this.onConfig(value);this.adopt();});
  attach(this.liveRef,s=>{this.raw=s.val();this.adopt();});return this;
 }
 adopt(){if(this.raw&&this.config){this.state=HostCore.normalize(this.raw,this.config);this.onState(this.state);let pending;try{pending=JSON.parse(localStorage.getItem(this.pendingKey)||'null');}catch(_){}if(pending&&this.state.receipts[pending.id])localStorage.removeItem(this.pendingKey);this.status();}}
 command(type,values={}){return {id:'op_'+this.now()+'_'+crypto.randomUUID(),type,at:this.now(),day:this.state?.day,shift:'PM',...values};}
 async run(cmd){
  if(this.busy)throw Error('An operation is still waiting for confirmation.');if(!this.connected||!this.state||!this.config)throw Error('Not connected. Wait for LIVE before changing the Board.');
  let previous;try{previous=JSON.parse(localStorage.getItem(this.pendingKey)||'null');}catch(_){}
  if(previous&&previous.id!==cmd.id&&!this.state.receipts[previous.id])throw Error('A previous operation is unresolved. Use Recheck pending operation in Operations.');
  this.busy=true;this.status();localStorage.setItem(this.pendingKey,JSON.stringify(cmd));const started=performance.now();let reductionError=null;
  try{
   const result=await this.liveRef.transaction(current=>{try{return HostCore.reduce(current,cmd,this.config,this.now());}catch(e){reductionError=e;return undefined;}},undefined,false);
   if(!result.committed)throw reductionError||Error('Operation was not committed. Reload the current table.');
   this.raw=result.snapshot.val();this.adopt();localStorage.removeItem(this.pendingKey);return {state:this.state,elapsed:Math.round(performance.now()-started),id:cmd.id};
  }catch(e){if(reductionError){localStorage.removeItem(this.pendingKey);throw reductionError;}throw Error('Database did not confirm this operation. Recheck before retrying. '+e.message);}
  finally{this.busy=false;this.status();}
 }
 async recoverPending(){let cmd;try{cmd=JSON.parse(localStorage.getItem(this.pendingKey)||'null');}catch(_){}if(!cmd)return {resolved:true};if(this.state.receipts[cmd.id]){localStorage.removeItem(this.pendingKey);return {resolved:true};}return this.run(cmd);}
 updateConfig(change){if(!this.connected)throw Error('Not connected.');return this.ref.child('config').transaction(value=>{if(!value)return;return change(HostCore.copy(value));},undefined,false).then(r=>{if(!r.committed)throw Error('Configuration changed. Try again.');return r.snapshot.val();});}
 close(){this.unsub.forEach(fn=>fn());this.unsub=[];}
}
root.HostConnection=HostConnection;
})(globalThis);
