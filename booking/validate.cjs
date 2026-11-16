'use strict';
const C=require('../dist/core.js');
function validate(data,now=Date.now()){
 const name=typeof data?.name==='string'?data.name.trim():'';
 const {people,date,time,channel,consent,requestId}=data||{};
 if(!name||name.length>100||!Number.isInteger(people)||people<6||people>120||consent!==true)throw Error('Invalid booking details');
 if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId))throw Error('Invalid request ID');
 const at=C.reservationTime(date,time);
 if(!Number.isFinite(at)||at<=now)throw Error('Choose a future date and time');
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
 if(local!==date+' '+time)throw Error('Invalid local date and time');
 const day=new Date(date+'T12:00:00Z').getUTCDay();
 if(time<'11:00'||time>(day===5||day===6?'22:20':'21:20'))throw Error('Outside reservation hours');
 const raw=channel==='email'?data.email:data.phone;
 if(typeof raw!=='string')throw Error('Contact required');
 const contact=channel==='email'?raw.trim():raw.replace(/[\s().-]/g,'');
 if(channel==='email'?contact.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(contact):channel!=='sms'||!/^\+?1?[2-9]\d{9}$/.test(contact))throw Error('Invalid contact');
 return {name,people,date,time,at,channel,contact,requestId,reminders:[120,60].map(minutes=>({minutes,dueAt:at-minutes*60000})).filter(x=>x.dueAt>now)};
}
module.exports={validate};
