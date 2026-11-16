'use strict';
const form=document.querySelector('#booking'), statusBox=document.querySelector('#status'), submit=form.querySelector('button');
let endpoint, pending;
form.elements.channel.onchange=()=>{
 const sms=form.elements.channel.value==='sms';
 for(const [name,show] of [['phone',sms],['email',!sms]]){
  document.getElementById(name).hidden=!show;
  form.elements[name].disabled=!show;
  form.elements[name].required=show;
 }
};
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!endpoint||submit.disabled||!form.reportValidity())return;
 const data=Object.fromEntries(new FormData(form));
 data.people=Number(data.people);data.consent=data.consent==='on';
 const snapshot=JSON.stringify(data);
 if(pending?.snapshot!==snapshot)pending={snapshot,key:crypto.randomUUID()};
 submit.disabled=true;statusBox.textContent='Saving your reservation…';
 try{
  const res=await fetch(endpoint,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId:pending.key}),signal:AbortSignal.timeout(15000)});
  const result=await res.json();
  if(!res.ok||result.status!=='confirmed'||typeof result.reference!=='string'||!result.reference)throw Error();
  statusBox.textContent='Reservation confirmed for '+data.people+' guests on '+data.date+' at '+data.time+' (Huntsville). Confirmation: '+result.reference;
  form.hidden=true;form.reset();
 }catch{statusBox.textContent='We could not verify your reservation. Retry with the same details or contact the restaurant.';}
 finally{submit.disabled=false;}
});
(async()=>{
 try{
  const res=await fetch('./booking-config.json',{cache:'no-store'});
  if(!res.ok)return;
  const cfg=await res.json();
  if(cfg.enabled!==true)return;
  const url=new URL(cfg.endpoint);
  if(url.protocol!=='https:'||url.username||url.password)return;
  endpoint=url.href;form.hidden=false;statusBox.textContent='';
 }catch{}
})();
