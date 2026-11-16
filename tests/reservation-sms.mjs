import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSms,reconcileAllSms,handleSmsWebhook,smsSignature,smsRevision,smsTime,smsText} from '../server/reservation-sms.mjs';
const id='web_1234567890abcdef12345678',now=Date.parse('2026-11-19T20:00:00Z');
const env={RESERVATION_SMS_ENABLED:'true',FIREBASE_BOARD_URL:'https://db.test/board',TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'fixture-secret',TWILIO_MESSAGING_SERVICE_SID:'MG'+'b'.repeat(32),SMS_PUBLIC_BASE_URL:'https://sms.test'};
const record=()=>({name:'Fixture Guest',people:7,date:'2026-11-19',time:'18:00',at:now,phone:'+12565550123',status:'scheduled',online:{contactConsent:{phone:'+12565550123',at:now,textVersion:'reservation-reminders-v1'}}});
function fake(options={}){
 const data={reservations:{[id]:record()}},sent=[];let seq=0;
 const get=path=>path.reduce((v,k)=>v?.[k],data)??null;
 const put=(path,v)=>{let d=data;for(const k of path.slice(0,-1))d=d[k]??={};d[path.at(-1)]=v;};
 const fetcher=async(url,init={})=>{
  if(url.startsWith('https://api.twilio.com')){sent.push({url,body:new URLSearchParams(init.body)});if(options.unknown)throw Error('lost');if(options.onSend)await options.onSend(data);return new Response(JSON.stringify({sid:'SM'+String(++seq).padStart(32,'0'),status:init.body.get('Status')==='canceled'?'canceled':init.body.get('ScheduleType')?'scheduled':'queued'}),{status:201});}
  const path=url.slice(env.FIREBASE_BOARD_URL.length+1,-5).split('/'),old=get(path),etag=JSON.stringify(old);
  if(init.method==='PUT'){if(init.headers['if-match']!==etag)return new Response(JSON.stringify(old),{status:412});put(path,JSON.parse(init.body));return new Response(init.body);}
  return new Response(JSON.stringify(old),{headers:{etag}});
 };return{data,sent,fetcher};
}
async function incoming(f,body,at,extra={}){
 const url=env.SMS_PUBLIC_BASE_URL+'/api/sms/inbound',params=new URLSearchParams({AccountSid:env.TWILIO_ACCOUNT_SID,MessageSid:'SM'+'c'.repeat(32),From:'+12565550123',To:'+18445550123',Body:body,...extra});
 return handleSmsWebhook(new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':await smsSignature(url,params,env.TWILIO_AUTH_TOKEN)},body:params}),env,at,f.fetcher);
}
function delivered(f){for(const job of Object.values(f.data.reservationSmsJobs[id]))job.status='delivered';}
test('disabled SMS cannot read guests, send messages or accept inbound writes',async()=>{
 assert.equal((await reconcileAllSms({},now,()=>{throw Error('no calls');})).enabled,false);
 assert.equal((await handleSmsWebhook(new Request('https://sms.test/api/sms/inbound',{method:'POST'}),{})).status,503);
});
test('Chicago time, short GSM templates, 1-hour and 10-minute native scheduling',async()=>{
 assert.equal(smsTime('2026-11-19','18:00'),Date.parse('2026-11-20T00:00:00Z'));
 assert.equal(smsTime('2026-07-19','18:00'),Date.parse('2026-07-19T23:00:00Z'));
 assert(Number.isNaN(smsTime('2026-02-30','18:00')));
 const f=fake();await reconcileSms(id,env,now,f.fetcher);assert.equal(f.sent.length,2);
 assert.equal(f.sent[0].body.get('SendAt'),'2026-11-19T23:00:00.000Z');assert.equal(f.sent[1].body.get('SendAt'),'2026-11-19T23:50:00.000Z');
 for(const kind of ['1h','10m'])assert(smsText(id,record(),kind).length<=160);
 assert.match(f.sent[0].body.get('Body'),/CONFIRM/);assert.match(f.sent[1].body.get('Body'),/HERE/);
});
test('concurrent reconciliation and lost responses never duplicate a send',async()=>{
 const f=fake();await Promise.all([reconcileSms(id,env,now,f.fetcher),reconcileSms(id,env,now,f.fetcher)]);await reconcileSms(id,env,now+60000,f.fetcher);assert.equal(f.sent.length,2);
 const uncertain=fake({unknown:true});await reconcileSms(id,env,now,uncertain.fetcher);await reconcileSms(id,env,now+60000,uncertain.fetcher);assert.equal(uncertain.sent.length,2);
});
test('changed contact without renewed consent and deleted bookings cancel existing jobs',async()=>{
 for(const edit of [r=>r.phone='+12565550456',r=>r.status='deleted']){const f=fake();await reconcileSms(id,env,now,f.fetcher);edit(f.data.reservations[id]);await reconcileSms(id,env,now+60000,f.fetcher);assert.equal(f.sent.length,4);assert(f.sent.slice(2).every(x=>x.body.get('Status')==='canceled'));}
});
test('an edit during provider request cancels obsolete schedule',async()=>{
 const f=fake({onSend:data=>{data.reservations[id].status='deleted';}});await reconcileSms(id,env,now,f.fetcher);assert(f.sent.some(x=>x.body.get('Status')==='canceled'));
});
test('15-minute provider boundary: wait until due, never send early or very late',async()=>{
 const f=fake(),arrival=smsTime(record().date,record().time);await reconcileSms(id,env,arrival-20*60000,f.fetcher);assert.equal(f.sent.length,0);
 await reconcileSms(id,env,arrival-9*60000,f.fetcher);assert.equal(f.sent.length,1);assert.equal(f.sent[0].body.has('SendAt'),false);
 const late=fake();await reconcileSms(id,env,arrival-3*60000,late.fetcher);assert.equal(late.sent.length,0);
});
test('signed CONFIRM and HERE update exact reservation, deduplicate and preserve host fields',async()=>{
 const f=fake();await reconcileSms(id,env,now,f.fetcher);delivered(f);const at=smsTime(record().date,record().time)-55*60000;
 let response=await incoming(f,' confirm ',at);assert.match(await response.text(),/attendance is confirmed/);assert.equal(f.data.reservations[id].guestReply.confirmedAt,at);
 response=await incoming(f,'CONFIRM',at+1000);assert.equal(await response.text(),'<Response></Response>');
 response=await incoming(f,'Here',at+50*60000);assert.match(await response.text(),/checked in/);assert(f.data.reservations[id].guestReply.arrivedAt);assert.equal(f.data.reservations[id].people,7);assert.equal(f.data.reservations[id].status,'scheduled');
 assert.equal(f.data.reservations[id].guestReply.revision,smsRevision(f.data.reservations[id]));
});
test('bad signature, wrong account, unmessaged and ambiguous phones never check in a party',async()=>{
 const f=fake(),at=smsTime(record().date,record().time)-5*60000;
 const bad=await handleSmsWebhook(new Request('https://sms.test/api/sms/inbound',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'Body=HERE'}),env,at,f.fetcher);assert.equal(bad.status,403);
 assert.match(await (await incoming(f,'HERE',at)).text(),/could not match/);assert(!f.data.reservations[id].guestReply);
 await reconcileSms(id,env,now,f.fetcher);delivered(f);
 assert.equal((await incoming(f,'HERE',at,{AccountSid:'AC'+'d'.repeat(32)})).status,403);
 const other='web_abcdefabcdefabcdefabcdef';f.data.reservations[other]=record();f.data.reservationSmsJobs[other]=structuredClone(f.data.reservationSmsJobs[id]);
 assert.match(await (await incoming(f,'HERE',at)).text(),/More than one/);assert(!f.data.reservations[id].guestReply);
 await incoming(f,'HERE 345678',at);assert(f.data.reservations[id].guestReply.arrivedAt);assert(!f.data.reservations[other].guestReply);
});
test('STOP cancels unsent reminders and suppresses check-in; START does not reset consent',async()=>{
 const f=fake();await reconcileSms(id,env,now,f.fetcher);await incoming(f,'STOP',now+60000,{OptOutType:'STOP'});assert(Object.values(f.data.reservationSmsJobs[id]).every(j=>j.status==='canceled'));
 await incoming(f,'HERE',now+100000);assert(!f.data.reservations[id].guestReply);
});
test('status callback confirms provider acceptance after an uncertain response and resists replay downgrade',async()=>{
 const f=fake({unknown:true});await reconcileSms(id,env,now,f.fetcher);const key=Object.keys(f.data.reservationSmsJobs[id])[0];
 async function callback(status){const url=env.SMS_PUBLIC_BASE_URL+'/api/sms/status?id='+id+'&job='+key,params=new URLSearchParams({AccountSid:env.TWILIO_ACCOUNT_SID,MessageSid:'SM'+'e'.repeat(32),MessageStatus:status});return handleSmsWebhook(new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':await smsSignature(url,params,env.TWILIO_AUTH_TOKEN)},body:params}),env,now,f.fetcher);}
 await callback('delivered');await callback('queued');assert.equal(f.data.reservationSmsJobs[id][key].status,'delivered');
});
