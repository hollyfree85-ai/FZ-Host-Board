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
 if(!active(reservation)||reservation.date!==state.day||!Number.isInteger(reservation.people))return [];
 const board=state.shifts[shift];if(!board)return [];
 const section=r=>String(r.section).split(/\s*\/\s*/).filter(s=>!/^BAR$/i.test(s)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))[0]||'ZZZ';
 const rows=C.list(board.rows).filter(r=>!r.cut&&r.server&&C.slots(r)<60).sort((a,b)=>C.slots(a)-C.slots(b)||section(a).localeCompare(section(b),undefined,{numeric:true}));
 const held=new Set(Object.entries(records).filter(([other,r])=>other!==id&&active(r)&&r.date===state.day&&C.reservationTime(r.date,r.time)+3600000>now).map(([,r])=>r.table).filter(Boolean));
 return config.tables.flatMap(t=>{const status=state.tables[t.id],row=rows.find(r=>r.id===board.assignments[t.id]);if(!status||status.status!=='ready'||status.partyId||held.has(t.id)||!row||C.slots(row)+Math.ceil(reservation.people/4)>60)return [];
  const capacity=Number(t.capacity||P?.capacities[t.id]?.max),known=Number.isInteger(capacity)&&capacity>0;
  if(known&&capacity<reservation.people)return [];
  const parties=Object.values(state.parties||{}).filter(p=>p.rowId===row.id&&p.shift===shift),guests=parties.reduce((sum,p)=>sum+p.people,0);
  return [{table:t.id,server:row.server,section:row.section,beeper:row.beeper||'—',turns:C.slots(row),rotation:rows.indexOf(row)+1,activeGuests:guests,activeTables:parties.length,afterGuests:guests+reservation.people,capacity:known?capacity:null,recent:C.risk(state,shift,row.id,now).length>0}];
 }).sort((a,b)=>(a.capacity===null)-(b.capacity===null)||a.turns-b.turns||a.activeGuests-b.activeGuests||a.rotation-b.rotation||(a.capacity||0)-(b.capacity||0)||a.table.localeCompare(b.table,undefined,{numeric:true})).slice(0,3);
}
return{active,phone,revision,replyStatus,alerts,candidates};
});
