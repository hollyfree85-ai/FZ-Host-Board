(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.HostCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationQuota=api;})(globalThis,function(C){
'use strict';
const released=r=>!r||/^(done|completed?|deleted|cancelled|canceled|no.?show)$/i.test(r.status||'');
function windowFor(date,time){
 const late=[5,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
 // Keep seating hours and informational totals; booking intake has no capacity gate.
 const ranges=late?[['11:00','15:00'],['15:00','17:00'],['17:00','19:00'],['19:00','21:00'],['21:00','22:21']]:[['11:00','15:00'],['15:00','17:00'],['17:00','19:00'],['19:00','21:21']];
 const range=ranges.find(([start,end])=>time>=start&&time<end);if(!range)return null;
 const [start,end]=range,format=value=>{const [hour,minute]=value.split(':').map(Number);return (hour%12||12)+':'+String(minute).padStart(2,'0')+(hour>=12?' PM':' AM');};return {id:date+'_'+start,start,end,limit:null,label:format(start)+' – '+format(end==='22:21'?'22:20':end==='21:21'?'21:20':end)};
}
function linkedParty(live,id,r){return Object.values(live?.parties||{}).find(p=>p.reservationId===id||r?.partyId&&p.id===r.partyId);}
function usage(records,date,time){const slot=windowFor(date,time);let used=0;const ids=[];if(slot)for(const[id,r]of Object.entries(records||{}))if(!released(r)&&r.date===date&&windowFor(r.date,r.time)?.id===slot.id){used+=Math.max(0,Number(r.people)||0);ids.push(id);}return {slot,used,remaining:null,ids};}
function assess({records={},date,time,people,excludeId=''}){
 const u=usage(Object.fromEntries(Object.entries(records).filter(([id])=>id!==excludeId)),date,time),base={window:u.slot,used:u.used,remaining:null,limit:null,available:false};
 if(!Number.isInteger(people)||people<6||people>120||!u.slot||!Number.isFinite(C.reservationTime(date,time)))return {...base,reason:'invalid',message:'Choose a valid date, time and party size of 6 or more.'};
 // Reservations record intent. READY tables, combinations and servers are checked
 // when the host actually seats the party, never while saving a reservation.
 return {...base,available:true,reason:'available',message:'Reservations are open for this time. Our host team will arrange your seating on arrival.'};
}
function reduceBoard(root,cmd,now){
 if(!root?.live||!root.config)throw Error('Current Board is unavailable.');
 if(root.live.receipts?.[cmd.id]||root.live.tableHistory?.[cmd.id])return root;
 const before=root.live,party=cmd.type==='CLEAR_ENTRY'?before.parties?.[cmd.entryId]:C.partyFor(before,cmd.table),restored=cmd.type==='UNDO'?before.undo?.[cmd.undoId]?.party:cmd.type==='RESTORE_READY'?C.list(before.shifts?.[cmd.shift]?.rows).flatMap(r=>C.list(r.entries)).find(e=>e.id===cmd.entryId):null;
 const records={...root.reservations},id=cmd.reservationId||party?.reservationId||Object.keys(records).find(id=>records[id]?.partyId===party?.id&&party)||restored?.reservationId||Object.keys(records).find(id=>restored&&records[id]?.partyId===restored.id);
 if(cmd.type==='SEAT'&&id){const r=records[id];if(released(r)||r.status==='seated'||r.date!==before.day||r.people!==cmd.people||cmd.reservationStamp&&JSON.stringify(r)!==cmd.reservationStamp)throw Error('Reservation changed. Reopen its details before seating.');}
 const next=C.reduce(before,cmd,root.config,now);
 if(id&&records[id]){
  const r=records[id];
  if(cmd.type==='SEAT')records[id]={...r,status:'seated',seatedAt:cmd.at,partyId:cmd.id,table:cmd.table,secondary:C.list(cmd.secondary),updatedAt:cmd.at};
  else if(party&&!next.parties?.[party.id]&&(cmd.type==='DELETE'||cmd.type==='CLEAR_ENTRY'||cmd.type==='STATUS'&&cmd.status==='ready')){
   if(!released(r))records[id]={...r,status:'completed',completedAt:cmd.at,updatedAt:cmd.at,quotaRelease:{at:cmd.at,partyId:party.id,previousStatus:r.status||'scheduled',acknowledgements:0}};
  }else if(restored&&next.parties?.[restored.id]&&released(r)){
   if(!/^complete/.test(r.status||'')||r.quotaRelease?.partyId!==restored.id)throw Error('Restore the reservation first before restoring this party.');
   records[id]={...r,status:'seated',updatedAt:cmd.at};delete records[id].completedAt;delete records[id].quotaRelease;
   next.parties[restored.id].reservationId=id;
  }
 }
 return {...root,live:next,reservations:records};
}
function confirmReservationDelete(confirm,subject){
 const messages=[`1 OF 3 — DELETE RESERVATION\n\n${subject}\n\nDelete this reservation? Verify that it was cancelled or that the party has finished.`,
 `2 OF 3 — TABLE STATUS\n\nIf the party used tables, confirm ALL of them are READY. Otherwise, verify that the booking is cancelled.`,
 `3 OF 3 — MANAGER ACKNOWLEDGEMENT\n\nPlease consult the manager before continuing. Select OK to acknowledge that you have checked with the manager and confirmed the tables are ready (or the booking is cancelled).`];
 return messages.every(message=>confirm(message));
}
return {released,windowFor,usage,assess,linkedParty,confirmReservationDelete,reduceBoard};
});
