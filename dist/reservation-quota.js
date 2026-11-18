(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.HostCore,typeof module==='object'&&module.exports?require('./party-recommendations.js'):root.PartyRecommendations);if(typeof module==='object'&&module.exports)module.exports=api;else root.ReservationQuota=api;})(globalThis,function(C,P){
'use strict';
const released=r=>!r||/^(done|completed?|deleted|cancelled|canceled|no.?show)$/i.test(r.status||'');
function windowFor(date,time){
 const late=[5,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
 const ranges=late?[['11:00','15:00',null],['15:00','17:00',60],['17:00','19:00',50],['19:00','21:00',40],['21:00','22:21',60]]:[['11:00','15:00',null],['15:00','17:00',60],['17:00','19:00',50],['19:00','21:21',50]];
 const range=ranges.find(([start,end])=>time>=start&&time<end);if(!range)return null;
 const [start,end,limit]=range,format=value=>{const [hour,minute]=value.split(':').map(Number);return (hour%12||12)+':'+String(minute).padStart(2,'0')+(hour>=12?' PM':' AM');};return {id:date+'_'+start,start,end,limit,label:format(start)+' – '+format(end==='22:21'?'22:20':end==='21:21'?'21:20':end)};
}
function linkedParty(live,id,r){return Object.values(live?.parties||{}).find(p=>p.reservationId===id||r?.partyId&&p.id===r.partyId);}
function usage(records,date,time){const slot=windowFor(date,time);let used=0;const ids=[];if(slot)for(const[id,r]of Object.entries(records||{}))if(!released(r)&&r.date===date&&windowFor(r.date,r.time)?.id===slot.id){used+=Math.max(0,Number(r.people)||0);ids.push(id);}return {slot,used,remaining:slot?.limit==null?null:Math.max(0,slot.limit-used),ids};}
function sections(live,config,shift,ignoreCut=false){
 const board=live?.shifts?.[shift],form=config?.formations?.[board?.formation];if(!form)return null;
 const out=new Map();for(const[section,ids]of Object.entries(form))for(const id of C.list(ids))if(!/^bar/i.test(id))out.set(id,section);
 for(const[id,rowId]of Object.entries(board.assignments||{})){const row=C.list(board.rows).find(r=>r.id===rowId);if(row){const section=P.sectionFor(board,config,id,row);if(section)out.set(id,section);if(row.cut&&!ignoreCut)out.delete(id);}}
 // Online reservations start at six guests, beyond every BAR section table.
 for(const[id,section]of out)if(C.isBarSection(section)||/^bar/i.test(id))out.delete(id);
 return out;
}
function assess({records={},live,config,date,time,people,excludeId='',now=Date.now()}){
 const u=usage(Object.fromEntries(Object.entries(records).filter(([id])=>id!==excludeId)),date,time),base={window:u.slot,used:u.used,remaining:u.remaining,limit:u.slot?.limit??null,available:false};
 if(!Number.isInteger(people)||people<6||people>120||!u.slot)return {...base,reason:'invalid',message:'Choose a valid date, time and party size of 6 or more.'};
 if(u.remaining!==null&&people>u.remaining)return {...base,reason:'quota',message:'This time window is temporarily full for your party. Please choose another time or contact our host team.'};
 const today=date===C.dayAt(now),shift=time<'15:00'?'AM':'PM',section=sections(live,config,shift,!today);
 if(!section||!Array.isArray(config?.tables)||today&&live?.day!==date)return {...base,reason:'floor',message:'Table availability is not ready yet. Please contact our host team or try again shortly.'};
 const known=new Set(config.tables.map(t=>t.id)),free=new Set([...section.keys()].filter(id=>known.has(id)&&P.capacityFor(id)&&(!today||live.tables?.[id]?.status==='ready'&&!live.tables[id].partyId)));
 const blockedC=today&&Object.values(live.parties||{}).some(p=>C.members(p).filter(id=>/^D/.test(id)).length>1),blockedD=today&&Object.values(live.parties||{}).some(p=>C.members(p).filter(id=>/^C/.test(id)).length>1);
 const options=[...free].map(id=>({tables:[id],max:P.capacityFor(id).max})).concat(P.groups).filter(o=>o.tables.every(id=>free.has(id))&&!(blockedC&&o.tables.filter(id=>/^C/.test(id)).length>1)&&!(blockedD&&o.tables.filter(id=>/^D/.test(id)).length>1)).map(o=>({...o,crossSection:new Set(o.tables.map(id=>section.get(id))).size>1}));
 const availableSeats=P.totalCapacity(free,options);
 const demands=[];
 for(const[id,r]of Object.entries(records)){
  if(id===excludeId||released(r)||r.date!==date)continue;
  const same=windowFor(r.date,r.time)?.id===u.slot.id,overdue=today&&C.reservationTime(r.date,r.time)<=now&&r.time<u.slot.start;
  if(!same&&!overdue)continue;
  // Seated parties are already removed from READY capacity; never count twice.
  if(today&&(linkedParty(live,id,r)||r.status==='seated'))continue;
  const pinned=r.table?[r.table,...C.list(r.secondary)]:[];
  demands.push({people:Number(r.people)||0,pinned});
 }
 demands.push({people,pinned:[]});
 const full={...base,availableSeats,reason:'tables',message:'Reservations are temporarily full: no suitable READY tables are available for this party. Please choose another time or contact our host team.'};
 if(demands.reduce((n,d)=>n+d.people,0)>availableSeats)return full;
 const choices=demands.map(d=>options.filter(o=>o.max>=d.people&&(!o.crossSection||P.canCrossSections(d.people))&&(!d.pinned.length||d.pinned.length===o.tables.length&&d.pinned.every(t=>o.tables.includes(t)))).sort((a,b)=>a.max-b.max||a.tables.length-b.tables.length));
 if(choices.some(x=>!x.length))return full;
 choices.sort((a,b)=>a.length-b.length);let visits=0;const memo=new Set();
 function fit(i,used){if(i===choices.length)return true;if(++visits>30000)return false;const key=i+':'+[...used].sort().join(',');if(memo.has(key))return false;for(const o of choices[i])if(o.tables.every(id=>!used.has(id))&&fit(i+1,new Set([...used,...o.tables])))return true;memo.add(key);return false;}
 if(!fit(0,new Set()))return full;
 return {...base,available:true,availableSeats,reason:'available',message:today?'Space is currently available. READY tables and quota will be checked again when you confirm.':'Space is available in the current formation plan. Tables and quota will be checked again when you confirm.'};
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
   const u=usage(records,r.date,r.time);if(u.slot?.limit!=null&&u.used+Number(r.people)>u.slot.limit)throw Error('Reservation quota is now full. Consult the manager before restoring this party.');
   records[id]={...r,status:'seated',updatedAt:cmd.at};delete records[id].completedAt;delete records[id].quotaRelease;
   next.parties[restored.id].reservationId=id;
  }
 }
 return {...root,live:next,reservations:records};
}
function confirmReservationDelete(confirm,subject){
 const messages=[`1 OF 3 — DELETE RESERVATION\n\n${subject}\n\nDelete this reservation? Verify that it was cancelled or that the party has finished.`,
 `2 OF 3 — RESERVATION QUOTA\n\nDeleting this reservation restores only its guest count to the booking quota. New guests may book immediately. If the party used tables, confirm ALL of them are READY.`,
 `3 OF 3 — MANAGER ACKNOWLEDGEMENT\n\nPlease consult the manager before continuing. Select OK to acknowledge that you have checked with the manager and confirmed the tables are ready (or the booking is cancelled).`];
 return messages.every(message=>confirm(message));
}
return {released,windowFor,usage,assess,linkedParty,confirmReservationDelete,reduceBoard};
});
