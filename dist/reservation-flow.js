(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.HostCore,typeof module==='object'&&module.exports?require('./party-recommendations.js'):root.PartyRecommendations);if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationFlow=api;})(globalThis,function(C,P){
'use strict';
const active=r=>!!r&&!/cancel|complete|seated|no.?show|deleted/i.test(r.status||'');
const phone=value=>{const d=String(value||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');return /^[2-9]\d{9}$/.test(d)?'+1'+d:'';};
const revision=r=>JSON.stringify([r?.date,r?.time,r?.name,r?.people,phone(r?.phone),(r?.smsConsent||r?.online?.contactConsent)?.at,r?.smsRevisionAt||0]);
function replyStatus(r){if(!active(r)||r.guestReply?.revision!==revision(r))return 'Awaiting confirmation';return r.guestReply.arrivedAt?'ARRIVED · PARTY READY':r.guestReply.confirmedAt?'CONFIRMED':'Awaiting confirmation';}
function alerts(records,now){const result=[];for(const[id,r]of Object.entries(records||{})){if(!active(r))continue;const at=C.reservationTime(r.date,r.time);if(!Number.isFinite(at))continue;
 for(const[kind,minutes]of [['1h',60],['10m',10]]){const due=at-minutes*60000;if(now>=due&&now<Math.min(at,due+10*60000)&&!(r.guestReply?.revision===revision(r)&&r.guestReply.arrivedAt))result.push({id,key:id+'_'+r.date+'_'+r.time+'_'+kind,title:kind==='1h'?'RESERVATION IN 1 HOUR':'RESERVATION IN 10 MINUTES',name:r.name,people:r.people,time:r.time,detail:'Prepare a suitable table.'});}
 if(r.guestReply?.revision===revision(r))for(const[field,title]of [['confirmedAt','GUEST CONFIRMED'],['arrivedAt','PARTY ARRIVED · READY TO BE SEATED']]){const value=r.guestReply[field];if(value&&now>=value&&now-value<2*3600000&&Math.abs(now-at)<2*3600000)result.push({id,key:id+'_'+field+'_'+value,title,name:r.name,people:r.people,time:r.time,detail:field==='arrivedAt'?'The guest replied HERE. Check table availability.':'The guest replied CONFIRM.'});}
}return result;}
function candidates(state,config,reservation,id,shift,records={},now=Date.now()){
 if(!active(reservation)||!state||reservation.date!==state.day||!Number.isInteger(reservation.people))return [];
 // Use the same confirmed capacities, approved combinations and formation rules as
 // Floor PARTY. Unknown capacity is never a usable candidate for a large party.
 const otherReservations=Object.fromEntries(Object.entries(records||{}).filter(([other])=>other!==id));
 return P.recommend({state,config,shift,people:reservation.people,records:otherReservations,now}).candidates.slice(0,3).map(c=>({...c,table:c.tables.join(' + '),capacity:c.max,recent:c.recentParties>0}));
}
return{active,phone,revision,replyStatus,alerts,candidates};
});
