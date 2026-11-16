const {test}=require('node:test'),assert=require('node:assert/strict');
const {arrivalTime,eventFor,run}=require('../scripts/guest-reminders.cjs');
const id='web_1234567890abcdef12345678',root='https://db.test/board',at=Date.parse('2026-11-19T18:00:00Z');
const reservation=()=>({name:'Test Guest',people:6,date:'2026-11-19',time:'18:00',at,phone:'+12565550102',email:'guest@example.com',source:'online',status:'scheduled',online:{contactConsent:{phone:'+12565550102',email:'guest@example.com',at,textVersion:'reservation-reminders-v1'}}});
const env={GUEST_REMINDERS_ENABLED:'true',FIREBASE_BOARD_URL:root,RESEND_API_KEY:'test',RESEND_FROM:'Test <test@example.com>',TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'test',TWILIO_MESSAGING_SERVICE_SID:'MGtest'};
function fake(options={}){
 const rows=new Map([['reservations/'+id,reservation()]]),sent=[],versions=new Map();let allRead=false;
 return {rows,sent,async fetcher(url,init={}){
  if(!url.startsWith(root)){
   sent.push({url,init});if(options.uncertain)throw Error('Lost provider response');
   return new Response(JSON.stringify(url.includes('twilio')?{sid:'SMtest'}:{id:'emailtest'}),{status:201});
  }
  const path=url.slice(root.length+1,-5);
  if(path==='reservations'){allRead=true;return new Response(JSON.stringify({[id]:rows.get('reservations/'+id)}));}
  if(options.cancel&&allRead&&path==='reservations/'+id)rows.get(path).status='deleted';
  const old=rows.get(path)??null,etag=old===null?'null_etag':String(versions.get(path)||1);
  if(init.method==='PUT'){
   if(init.headers['if-match']&&init.headers['if-match']!==etag)return new Response(JSON.stringify(old),{status:412});
   rows.set(path,JSON.parse(init.body));versions.set(path,(versions.get(path)||0)+1);return new Response(init.body);
  }
  return new Response(JSON.stringify(old),{headers:{etag}});
 }};
}
test('reminders use Chicago time, consent, exact current contacts and two windows',()=>{
 assert.equal(arrivalTime('2026-11-19','18:00'),Date.parse('2026-11-20T00:00:00Z'));
 assert.equal(arrivalTime('2026-07-19','18:00'),Date.parse('2026-07-19T23:00:00Z'));
 assert(Number.isNaN(arrivalTime('2026-02-30','18:00')));
 const r=reservation(),arrival=arrivalTime(r.date,r.time);
 assert.equal(eventFor(id,r,at+60000).kind,'confirmation');
 assert.equal(eventFor(id,r,arrival-119*60000).kind,'reminder-2h');
 assert.equal(eventFor(id,r,arrival-59*60000).kind,'reminder-1h');
 assert.equal(eventFor(id,r,arrival-90*60000),null);
 assert.equal(eventFor(id,r,arrival-40*60000),null);
 assert.equal(eventFor(id,r,arrival+1),null);
 assert.equal(eventFor(id,{...r,status:'deleted'},at+60000),null);
 assert.equal(eventFor(id,{...r,online:{}},at+60000),null);
 assert.equal(eventFor(id,{...r,email:'changed@example.com'},at+60000).channels.email,false);
});
test('disabled sender does not read guest records or send',async()=>{
 const r=await run({env:{},fetcher:()=>{throw Error('No calls allowed');}});assert.equal(r.enabled,false);
 await assert.rejects(run({env:{GUEST_REMINDERS_ENABLED:'true'},fetcher:()=>{throw Error('No calls allowed');}}),/No verified/);
});
test('parallel runs and retries send only once per channel, with email idempotency',async()=>{
 const f=fake(),options={env,fetcher:f.fetcher,now:at+60000};await Promise.all([run(options),run(options)]);await run(options);
 assert.equal(f.sent.length,2);assert.equal(f.sent.filter(s=>s.url.includes('resend')).length,1);
 const email=f.sent.find(s=>s.url.includes('resend'));assert(email.init.headers['Idempotency-Key']);assert.deepEqual(JSON.parse(email.init.body).to,['guest@example.com']);
 const sms=f.sent.find(s=>s.url.includes('twilio'));assert.equal(sms.init.body.get('MessagingServiceSid'),'MGtest');assert.match(sms.init.body.get('Body'),/Reply STOP/);
});
test('cancellation after list read is respected before sending',async()=>{
 const f=fake({cancel:true});await run({env,fetcher:f.fetcher,now:at+60000});assert.equal(f.sent.length,0);
});
test('uncertain SMS is never resent; email retry preserves provider idempotency',async()=>{
 const f=fake({uncertain:true});await run({env,fetcher:f.fetcher,now:at+60000});await run({env,fetcher:f.fetcher,now:at+180000});
 assert.equal(f.sent.filter(s=>s.url.includes('twilio')).length,1);const emails=f.sent.filter(s=>s.url.includes('resend'));assert.equal(emails.length,2);assert.equal(emails[0].init.headers['Idempotency-Key'],emails[1].init.headers['Idempotency-Key']);
});
