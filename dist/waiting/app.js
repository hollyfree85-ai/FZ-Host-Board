'use strict';
const API='https://juicy-huntsville-reservations.hollyfree85.chatgpt.site';
const el=id=>document.getElementById(id),form=el('waiting-form'),KEY='juicy_guest_waiting_v1';
const storage={read(){try{return JSON.parse(sessionStorage.getItem(KEY));}catch{return null;}},write(value){try{sessionStorage.setItem(KEY,JSON.stringify(value));}catch{}}};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
let pending=storage.read(),saving=false;
const day=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));const d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');if(+p.hour<4)d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
function showConfirmed(data){el('confirmed-name').textContent=data.name;el('confirmed-people').textContent=data.people+(data.people===1?' guest':' guests');el('confirmed-phone').textContent=data.phone;el('form-panel').hidden=true;el('confirmation').hidden=false;el('confirmation').focus();}
if(pending?.day!==day()){pending=null;storage.write(null);}else if(pending?.confirmed&&pending.data)showConfirmed(pending.data);else if(pending?.data){for(const key of ['name','people','phone'])el(key).value=pending.data[key];}
async function request(path,init={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);try{const response=await fetch(API+path,{...init,signal:controller.signal,cache:'no-store'}),result=await response.json();if(!response.ok){const error=Error(result.error||'Please try again shortly.');error.status=response.status;throw error;}return result;}finally{clearTimeout(timer);}}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(saving)return;
 const data={name:el('name').value.trim(),people:Number(el('people').value),phone:el('phone').value.trim()};
 if(!/^\+?1?[2-9]\d{9}$/.test(data.phone.replace(/[\s().-]/g,''))){el('error').textContent='Please enter a valid 10-digit US phone number.';el('error').hidden=false;el('phone').focus();return;}
 // Keep the same request identity across retries, reloads, and a lost response.
 if(pending?.data&&JSON.stringify(pending.data)!==JSON.stringify(data)){el('error').textContent='An earlier submission is awaiting confirmation. Please retry with the original details or check with our host team.';el('error').hidden=false;return;}
 if(!pending)pending={id:uuid(),data,day:day()};storage.write(pending);
 saving=true;el('submit').disabled=true;el('submit').textContent='Joining the list…';el('error').hidden=true;el('status').textContent='Saving. Please keep this page open.';
 try{
  const session=await request('/api/session?id='+encodeURIComponent(pending.id));
  const result=await request('/api/wait',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,day:pending.day,requestId:pending.id,token:session.token,website:el('website').value})});
  if(result.status!=='joined')throw Error('We could not confirm the save. Please try again with the same details.');
  pending.confirmed=true;storage.write(pending);showConfirmed(data);
 }catch(error){if(error.status===400||error.status===429){pending=null;storage.write(null);}el('error').textContent=['AbortError','TypeError'].includes(error.name)?'Connection interrupted. Please retry with the same details or check with our host team. Your details will not be added twice.':error.message;el('error').hidden=false;el('status').textContent='Not confirmed. Please review the message and retry.';}
 finally{saving=false;el('submit').disabled=false;el('submit').textContent='Join Waiting List →';}
});
