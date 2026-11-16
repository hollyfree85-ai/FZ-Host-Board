// Server-only. Never include sender credentials in dist/ or in logs.
const {createHash}=require('node:crypto');
const ZONE='America/Chicago',MIN=60000;
const ROOT='https://table-live-by-iwanto-zhang-default-rtdb.firebaseio.com/juicyTableLive/JUICY-HUNTSVILLE/hostBoardNextV1';
function arrivalTime(date,time){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}$/.test(time||''))return NaN;
 const target=Date.parse(date+'T'+time+':00Z');let at=target;if(!Number.isFinite(at))return NaN;
 for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(x=>[x.type,x.value]));at+=target-Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':00Z');}
 const back=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
 return back===date+' '+time?at:NaN;
}
function configured(env){return {email:!!(env.RESEND_API_KEY&&env.RESEND_FROM),sms:!!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_MESSAGING_SERVICE_SID)};}
function eventFor(id,r,now){
 if(!/^web_[a-f0-9]{24}$/.test(id)||!r||r.status!=='scheduled'||r.source!=='online'||r.online?.contactConsent?.textVersion!=='reservation-reminders-v1')return null;
 const arrival=arrivalTime(r.date,r.time);if(!Number.isFinite(arrival)||arrival<=now)return null;
 const age=now-Number(r.at),left=arrival-now;
 let kind=null;
 // Send fresh booking confirmations; do not notify old bookings on activation.
 if(age>=0&&age<=15*MIN)kind='confirmation';
 else if(left<=60*MIN&&left>45*MIN&&r.at<=arrival-60*MIN)kind='reminder-1h';
 else if(left<=120*MIN&&left>105*MIN&&r.at<=arrival-120*MIN)kind='reminder-2h';
 if(!kind)return null;
 const consent=r.online.contactConsent;
 const channels={email:!!r.email&&r.email===consent.email,sms:!!r.phone&&r.phone===consent.phone};
 const fingerprint=createHash('sha256').update(JSON.stringify([id,kind,r.date,r.time,r.name,r.people,r.phone,r.email])).digest('hex');
 const formatted=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,dateStyle:'medium',timeStyle:'short'}).format(arrival);
 const text=(kind==='confirmation'?'Your reservation is confirmed.':'Reservation reminder:')+' The Juicy Seafood & Bar, Huntsville. '+r.people+' guests on '+formatted+' (Huntsville time). Reference: '+id+'. Please contact the restaurant if your plans change.';
 return {kind,fingerprint,channels,text,subject:kind==='confirmation'?'Your Juicy Seafood reservation is confirmed':'Your upcoming Juicy Seafood reservation',arrival};
}
async function provider(channel,r,event,env,fetcher){
 let response;
 try{
  if(channel==='email')response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'juicy-'+event.fingerprint},body:JSON.stringify({from:env.RESEND_FROM,to:[r.email],subject:event.subject,text:event.text}),signal:AbortSignal.timeout(15000)});
  else response=await fetcher('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(env.TWILIO_ACCOUNT_SID)+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:r.phone,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID,Body:event.text+' Reply STOP to opt out.'}),signal:AbortSignal.timeout(15000)});
 }catch{return {status:'unknown',reason:'provider_response_not_confirmed'};}
 const data=await response.json().catch(()=>({}));
 if(response.ok&&(data.id||data.sid))return {status:'queued',providerId:data.id||data.sid};
 if(response.status===429)return {status:'retry',reason:'provider_rate_limit'};
 if(response.status>=500)return {status:'unknown',reason:'provider_response_not_confirmed'};
 return {status:'failed',reason:'provider_rejected',httpStatus:response.status};
}
async function run({env=process.env,fetcher=fetch,now=Date.now()}={}){
 const counts={queued:0,failed:0,unknown:0,skipped:0};
 if(env.GUEST_REMINDERS_ENABLED!=='true')return {...counts,enabled:false};
 const senders=configured(env);if(!senders.email&&!senders.sms)throw Error('No verified guest-message sender is configured.');
 const root=(env.FIREBASE_BOARD_URL||ROOT).replace(/\/$/,'');
 async function db(path,options={}){const r=await fetcher(root+'/'+path+'.json',{...options,signal:AbortSignal.timeout(12000)});if(!r.ok&&r.status!==412)throw Error('Reservation reminder database request failed.');return r;}
 const rows=await (await db('reservations')).json()||{};
 for(const [id,reservation]of Object.entries(rows)){
  const event=eventFor(id,reservation,now);if(!event)continue;
  for(const channel of ['email','sms']){
   if(!event.channels[channel]||!senders[channel]){counts.skipped++;continue;}
   const path='reservationMessages/'+event.fingerprint+'/'+channel;
   const read=await db(path,{headers:{'X-Firebase-ETag':'true'}}),old=await read.json(),etag=read.headers.get('etag');
   if(!etag)throw Error('Reservation reminder claim unavailable.');
   // SMS responses that are uncertain require review, never an automatic resend.
   const retryable=old&&(old.status==='retry'||(channel==='email'&&['claimed','unknown'].includes(old.status)))&&now-old.at>=MIN&&now-old.firstAt<15*MIN&&(old.attempts||1)<3;
   if(old&&!retryable){counts.skipped++;continue;}
   const claim={status:'claimed',kind:event.kind,at:now,firstAt:old?.firstAt||now,attempts:(old?.attempts||0)+1};
   const claimed=await db(path,{method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},body:JSON.stringify(claim)});
   if(claimed.status===412){counts.skipped++;continue;}
   // Recheck after the claim, so cancelled/edited records are not sent from a stale list.
   const latest=await (await db('reservations/'+id)).json(),current=eventFor(id,latest,now);
   let outcome;
   if(!current||current.fingerprint!==event.fingerprint||!current.channels[channel])outcome={status:'cancelled'};
   else outcome=await provider(channel,latest,event,env,fetcher);
   // A claimed record is retained if the final write fails. Retrying SMS is unsafe.
   await db(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...claim,...outcome,updatedAt:now})});
   if(outcome.status==='queued')counts.queued++;else if(outcome.status==='unknown')counts.unknown++;else if(outcome.status==='failed')counts.failed++;else counts.skipped++;
  }
 }
 return {...counts,enabled:true};
}
module.exports={arrivalTime,configured,eventFor,provider,run};
if(require.main===module)run().then(result=>{console.log(JSON.stringify(result));if(result.failed||result.unknown)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
