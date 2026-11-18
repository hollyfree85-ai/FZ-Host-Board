(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.HostCore,typeof module==='object'&&module.exports?require('./party-recommendations.js'):root.PartyRecommendations);if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationFlow=api;})(globalThis,function(C,P){
'use strict';
const active=r=>!!r&&!/cancel|complete|seated|no.?show|deleted/i.test(r.status||'');
const phone=value=>{const d=String(value||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');return /^[2-9]\d{9}$/.test(d)?'+1'+d:'';};
const revision=r=>JSON.stringify([r?.date,r?.time,r?.name,r?.people,phone(r?.phone),(r?.smsConsent||r?.online?.contactConsent)?.at,r?.smsRevisionAt||0]);
function replyStatus(r){if(!active(r)||r.guestReply?.revision!==revision(r))return 'Awaiting confirmation';return r.guestReply.arrivedAt?'ARRIVED · PARTY READY':r.guestReply.confirmedAt?'CONFIRMED':'Awaiting confirmation';}
function appointmentLabel(r){const at=C.reservationTime(r?.date,r?.time);return Number.isFinite(at)?new Date(at).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'';}
function reminderText(r){return `Hi ${String(r.name||'Guest').trim()}, this is The Juicy Seafood & Bar Huntsville. A reminder of your reservation for ${r.people} guests on ${appointmentLabel(r)} (Huntsville time). We look forward to seeing you!`;}
function smsLink(value,message,apple=false){const number=phone(value);return number?'sms:'+number+(apple?'&':'?')+'body='+encodeURIComponent(message):'';}
function alerts(records,now){const result=[];for(const[id,r]of Object.entries(records||{})){if(!active(r))continue;const at=C.reservationTime(r.date,r.time);if(!Number.isFinite(at))continue;
 const common={id,name:r.name,people:r.people,date:r.date,time:r.time};
 if(r.source==='online'&&now<at)result.push({...common,key:id+'_online_booking',title:'NEW ONLINE BOOKING',detail:'An online reservation has arrived. Review the guest details.'});
 const arrived=r.guestReply?.revision===revision(r)&&r.guestReply.arrivedAt;
 // Keep the current reminder eligible until the next stage, so a sleeping tablet
 // catches up on wake without showing both old reminders at once.
 for(const[kind,minutes,endMinutes]of [['1h',60,30],['30m',30,0]]){const due=at-minutes*60000;if(now>=due&&now<at-endMinutes*60000&&!arrived)result.push({...common,key:id+'_'+r.date+'_'+r.time+'_'+kind,title:kind==='1h'?'RESERVATION IN 1 HOUR':'RESERVATION IN 30 MINUTES',detail:'Prepare a suitable table. You can text the guest a reminder from Reservations.'});}
 if(r.guestReply?.revision===revision(r))for(const[field,title]of [['confirmedAt','GUEST CONFIRMED'],['arrivedAt','PARTY ARRIVED · READY TO BE SEATED']]){const value=r.guestReply[field];if(value&&now>=value&&now-value<2*3600000&&Math.abs(now-at)<2*3600000)result.push({...common,key:id+'_'+field+'_'+value,title,detail:field==='arrivedAt'?'The guest replied HERE. Check table availability.':'The guest replied CONFIRM.'});}
}return result;}
function candidates(state,config,reservation,id,shift,records={},now=Date.now()){
 if(!active(reservation)||!state||reservation.date!==state.day||!Number.isInteger(reservation.people)||Object.values(state.parties||{}).some(p=>p.reservationId===id))return [];
 // Use the same confirmed capacities, approved combinations and formation rules as
 // Floor PARTY. Unknown capacity is never a usable candidate for a large party.
 const otherReservations=Object.fromEntries(Object.entries(records||{}).filter(([other])=>other!==id));
 const options=P.search({state,config,shift,people:reservation.people,records:otherReservations,now}).candidates;
 return [...options.filter(c=>!c.inactive).slice(0,3),...options.filter(c=>c.inactive).slice(0,3)].map(c=>({...c,table:c.tables.join(' + '),capacity:c.max,recent:c.recentParties>0}));
}
return{active,phone,revision,replyStatus,appointmentLabel,reminderText,smsLink,alerts,candidates};
});
