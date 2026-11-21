'use strict';
const API='https://juicy-huntsville-reservations.hollyfree85.chatgpt.site';
const el=id=>document.getElementById(id),form=el('booking-form');
const dateFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});
const parts=Object.fromEntries(dateFormat.formatToParts(new Date()).map(x=>[x.type,x.value]));
el('date').min=parts.year+'-'+parts.month+'-'+parts.day;
let saving=false,confirmed=null,details=null,availability=null,availabilitySequence=0,availabilityTimer;
const selection=()=>({date:el('date').value,time:el('time').value,people:Number(el('people').value)});
function availabilityStatus(message,state){const box=el('availability');box.textContent=message;box.className='availability '+state;box.hidden=false;}
const formData=()=>({name:el('name').value.trim(),people:Number(el('people').value),date:el('date').value,time:el('time').value,phone:el('phone').value.trim(),email:el('email').value.trim(),note:el('note').value.trim(),consent:el('consent').checked,website:el('website').value});
function pendingRetry(){return pending?.uncertain&&pending.signature===JSON.stringify(formData());}
function submitState(){el('submit').disabled=saving||!availability?.available&&!pendingRetry();if(!saving)el('submit').textContent=pendingRetry()?'CHECK MY RESERVATION':'Confirm reservation →';}
async function checkAvailability(){
 const values=selection(),key=JSON.stringify(values),sequence=++availabilitySequence;availability=null;submitState();
 if(!values.date||!values.time||!Number.isInteger(values.people)||values.people<6){availabilityStatus('Choose your date, time and number of guests to check availability.','pending');return;}
 availabilityStatus('Checking table availability…','pending');
 try{const response=await fetch(API+'/api/availability?'+new URLSearchParams(values),{cache:'no-store'}),result=await response.json();if(sequence!==availabilitySequence||key!==JSON.stringify(selection()))return;
 if(!response.ok)throw Error(result.error||'Availability could not be checked. Please try again.');
 availability=result;availabilityStatus(result.message,result.available?'available':'full');
 }catch(error){if(sequence!==availabilitySequence)return;availabilityStatus(error.message==='Failed to fetch'?'Unable to check availability. Please reconnect and try again.':error.message,'full');}
 finally{if(sequence===availabilitySequence)submitState();}
}
function scheduleAvailability(){clearTimeout(availabilityTimer);++availabilitySequence;availability=null;submitState();availabilityTimer=setTimeout(checkAvailability,350);}
for(const id of ['date','time','people'])el(id).addEventListener('input',scheduleAvailability);
for(const id of ['date','time','people'])el(id).addEventListener('change',scheduleAvailability);
el('check-availability').onclick=()=>void checkAvailability();
window.addEventListener('online',()=>{if(!confirmed)void checkAvailability();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!confirmed)void checkAvailability();});
setInterval(()=>{if(!document.hidden&&!saving&&!confirmed&&el('date').value&&el('time').value)void checkAvailability();},30000);
function hours(){const d=el('date').value,day=new Date(d+'T12:00:00Z').getUTCDay(),late=day===5||day===6;el('time').max=late?'22:20':'21:20';el('time-help').textContent='11:00 AM – '+(late?'10:20 PM':'9:20 PM')+' · Huntsville time';}
el('date').addEventListener('change',hours);
const storage={read(){try{return JSON.parse(sessionStorage.getItem('juicy_booking_request'));}catch{return null;}},write(v){try{sessionStorage.setItem('juicy_booking_request',JSON.stringify(v));}catch{}}};
let pending=storage.read();submitState();
for(const id of ['name','phone','email','note','consent'])el(id).addEventListener('input',submitState);
const uuid=()=>crypto.randomUUID?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
form.addEventListener('submit',async event=>{
 event.preventDefault();if(saving)return;if(!availability?.available&&!pendingRetry()){await checkAvailability();if(!availability?.available&&!pendingRetry())return;}
 const data=formData();
 if(!data.phone&&!data.email){el('form-error').textContent='Please provide a phone number or email address.';el('form-error').hidden=false;el('phone').focus();return;}
 const signature=JSON.stringify(data);
 if(!pending||pending.signature!==signature)pending={signature,id:uuid()};pending.uncertain=true;storage.write(pending);
 saving=true;el('submit').disabled=true;el('submit').textContent='Saving your reservation…';el('form-error').hidden=true;el('save-status').textContent='Saving. Please keep this page open.';
 try{
  const tokenResponse=await fetch(API+'/api/session?id='+encodeURIComponent(pending.id),{cache:'no-store'}),session=await tokenResponse.json();if(!tokenResponse.ok)throw Error(session.error||'Please try again.');
  const response=await fetch(API+'/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId:pending.id,token:session.token})});
  const result=await response.json();if(!response.ok||result.status!=='confirmed'){const error=Error(result.error||'We could not confirm the save. Please try again with the same details.');error.confirmationUnknown=response.status>=500;throw error;}
  confirmed=result;details=data;
  const prettyDate=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'full'}).format(result.arrival),prettyTime=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',timeStyle:'short'}).format(result.arrival);
  const list=el('confirmation-details');for(const [key,value]of [['Guest',data.name],['Party size',data.people+' guests'],['Date',prettyDate],['Time',prettyTime+' · Huntsville'],['Contact',data.phone||data.email]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;list.append(dt,dd);}
  el('reference').textContent=result.reference;el('booking-panel').hidden=true;el('confirmation').hidden=false;el('confirmation').focus();el('confirmation').scrollIntoView({block:'start',behavior:'smooth'});
  pending=null;storage.write(null);
 }catch(error){if(pending){pending.uncertain=error.confirmationUnknown!==false;storage.write(pending);}el('form-error').textContent=error.message==='Failed to fetch'?'Connection interrupted. Please retry with the same details; retrying will not create a duplicate.':error.message;el('form-error').hidden=false;el('save-status').textContent='Not confirmed. Please review the message and retry.';void checkAvailability();}
 finally{saving=false;submitState();}
});
el('print').onclick=()=>window.print();
el('calendar').onclick=()=>{if(!confirmed)return;const stamp=at=>new Date(at).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,'\\$&');const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//The Juicy Seafood Huntsville//Reservations//EN','BEGIN:VEVENT','UID:'+confirmed.reference+'@juicy-huntsville','DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(confirmed.arrival),'DTEND:'+stamp(confirmed.arrival+7200000),'SUMMARY:Reservation at The Juicy Seafood Huntsville','LOCATION:The Juicy Seafood & Bar - Huntsville Alabama','DESCRIPTION:'+escape(details.name+' · '+details.people+' guests. Confirmation: '+confirmed.reference),...['PT1H','PT30M'].flatMap(t=>['BEGIN:VALARM','TRIGGER:-'+t,'ACTION:DISPLAY','DESCRIPTION:Upcoming reservation at The Juicy Seafood Huntsville','END:VALARM']),'END:VEVENT','END:VCALENDAR',''].join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Juicy-Seafood-Reservation.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
