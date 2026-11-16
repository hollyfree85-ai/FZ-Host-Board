'use strict';
const {createHash}=require('node:crypto');
const {validate}=require('./validate.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function makeBookingHandler({reservations,verifyHuman,now=Date.now}){
 return async function book(body,context){
  const stamp=now();
  const b=validate(body,stamp);
  if(!await verifyHuman(body.challenge,context))throw Error('Verification failed');
  const id='web_'+hash(b.requestId.toLowerCase()).slice(0,24);
  const fingerprint=hash(JSON.stringify([b.name,b.people,b.date,b.time,b.channel,b.contact]));
  const record={name:b.name,people:b.people,date:b.date,time:b.time,table:'',note:'',at:stamp,status:'scheduled',source:'online',
   ...(b.channel==='email'?{email:b.contact}:{phone:b.contact}),
   online:{fingerprint,channel:b.channel,consentAt:stamp}};
  const result=await reservations.child(id).transaction(current=>current===null?record:undefined);
  const saved=result.snapshot.val();
  if(saved?.status!=='scheduled'||saved.online?.fingerprint!==fingerprint)throw Error('Confirmation unavailable');
  return {status:'confirmed',reference:id};
 };
}
function dueReminder(r,now,reservationTime){
 if(r?.status!=='scheduled'||r.source!=='online'||!r.online?.consentAt)return null;
 const arrival=reservationTime(r.date,r.time),remaining=arrival-now;
 if(!Number.isFinite(remaining)||remaining<=0||remaining>7200000)return null;
 const minutes=remaining<=3600000?60:120,dueAt=arrival-minutes*60000;
 const channel=r.online.channel,to=channel==='email'?r.email:channel==='sms'?r.phone:null;
 if(!to||dueAt<=r.online.consentAt)return null;
 return {channel,to,minutes,date:r.date,time:r.time,people:r.people,key:hash(JSON.stringify([arrival,minutes,channel,to]))};
}
module.exports={makeBookingHandler,dueReminder};
