(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):root.HostCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.PartyRecommendations=api;})(globalThis,function(C){
'use strict';
// Owner-supplied capacities. No capacity is inferred from a section number or map label.
const capacities={};
function singles(ids,min,max=min){for(const id of ids.split(' '))capacities[id]=Object.freeze({min,max});}
singles('A1 A2 A3 A4 B1 L1 L2 L3 L4 R1 R2 R3 R4 H1 C1 D1 D2 D3 F1 F2 F3 F4 F5 F6 E1',4);
singles('B2 B3',4,6);singles('L5 L6 R5 R6 R7',6,7);singles('H2 H3 H4 C2 C3 C4',6);singles('M1 M2 E2 E3 E4 E5',4,5);
for(let n=1;n<=12;n++)capacities['Bar '+n]=Object.freeze({min:1,max:1});
Object.freeze(capacities);
function capacityFor(id){const text=String(id||'').trim(),bar=text.match(/^bar\s*(\d+)$/i);return capacities[bar?'Bar '+Number(bar[1]):text.toUpperCase()]||null;}
const booths=Object.freeze('A1 A2 A3 A4 H2 H3 H4 F1 F2 F3 F4 F5 F6'.split(' '));
// Only explicitly approved combinations. C2+C3 uses the lower supplied limit (12).
// Full C-row and D combinations await confirmed capacities; do not generate them.
const groups=[
 ['B1 B2',10],['B2 B3',10],['B1 B2 B3',15],
 ['L1 L2',8,10],['L2 L3',8],['L3 L4',8],['R1 R2',8],['R2 R3',8],['R3 R4',8],
 ['A4 L5',10,11],['L5 L6',12,14],['A4 L5 L6',20],['R4 R5',10],
 ['L3 L4 L5 L6',22,24],['L1 L2 L3 L4 L5 L6',28,30],['A4 L1 L2 L3 L4 L5 L6',35,36],
 ['R5 R6',12,14],['R6 R7',12,13],['R4 R5 R6',20],['R3 R4 R5',15],
 ['R5 R6 R7',21],['R3 R4 R5 R6 R7',28,29],['R1 R2 R3 R4 R5 R6 R7',39,40],
 ['M1 M2',10],['M1 H3',10],['M2 H4',10],['M1 M2 H1 H2 H3 H4',30,34],
 ['C1 C2',8,10],['C2 C3',12],['C3 C4',10],['C2 C3 C4',18],
 ['E1 F1',8],['E2 E3',8],['E3 E4',8,10],['E4 E5',8,10],['E2 E3 E4',18]
].map(([ids,min,max=min])=>Object.freeze({tables:Object.freeze(ids.split(' ')),min,max}));
Object.freeze(groups);
const canCrossSections=people=>Number.isInteger(people)&&people>12;
// Approved combinations can seat more than their separate tables. Count the
// greatest disjoint capacity increase, never two overlapping combinations.
function totalCapacity(ids,options=groups){
 const tables=new Set(ids),base=[...tables].reduce((n,id)=>n+(capacityFor(id)?.max||0),0);
 const bonuses=options.filter(o=>o.tables.every(id=>tables.has(id))).map(o=>({tables:o.tables,extra:o.max-o.tables.reduce((n,id)=>n+(capacityFor(id)?.max||0),0)})).filter(o=>o.extra>0);
 function best(i,used){if(i===bonuses.length)return 0;const o=bonuses[i],skip=best(i+1,used);return o.tables.some(id=>used.has(id))?skip:Math.max(skip,o.extra+best(i+1,new Set([...used,...o.tables])));}
 return base+best(0,new Set());
}
const serverKey=name=>String(name||'').trim().toLowerCase().replace(/\s+/g,' ');
function sectionFor(board,config,id,row){
 const sections=String(row.section||'').split(/\s*\/\s*/).filter(Boolean);
 const original=Object.entries(config.formations?.[board.formation]||{}).filter(([,ids])=>C.list(ids).includes(id)).map(([section])=>section);
 // Breaking Section can transfer a table to a different section. A merged server
 // row still retains distinct physical sections, so it is not automatically safe to join.
 if(sections.length===1)return sections[0];
 const matched=original.filter(section=>sections.includes(section));return matched.length===1?matched[0]:'';
}
function workload(state,shift,row,now){
 const sameServer=(sh,id)=>{const other=C.list(state.shifts?.[sh]?.rows).find(r=>r.id===id);return (sh===shift&&id===row.id)||!!other&&serverKey(other.server)===serverKey(row.server);};
 const parties=Object.values(state.parties||{}).filter(p=>sameServer(p.shift,p.rowId));
 const recent=new Map();for(const[sh,board]of Object.entries(state.shifts||{}))for(const other of C.list(board.rows))if(sameServer(sh,other.id))for(const e of C.list(other.entries))if(e.kind==='party'&&now>=e.at&&now-e.at<300000)recent.set(e.id,e);
 return {activeGuests:parties.reduce((n,p)=>n+Number(p.people||0),0),activeTables:new Set(parties.flatMap(C.members)).size,activeParties:parties.length,recentGuests:[...recent.values()].reduce((n,p)=>n+Number(p.people||0),0),recentParties:recent.size};
}
function areaRank(tables){
 if(tables.some(id=>/^[LR]/.test(id)))return 0;
 if(tables.some(id=>/^C/.test(id)))return 1;
 if(tables.some(id=>/^[AB]/.test(id)))return 2;
 if(tables.some(id=>/^E/.test(id)))return 3;
 if(tables.some(id=>/^[HM]/.test(id)))return 4;
 return 5;
}
function recommend({state,config,shift='PM',people,records={},now=Date.now(),allowCrossSection=canCrossSections(people)}){
 const result={candidates:[],crossSectionCount:0,recovering:[],reason:''};
 if(!Number.isInteger(people)||people<1||people>120)return {...result,reason:'Enter a whole number from 1 to 120 guests.'};
 if(state?.day!==C.dayAt(now))return {...result,reason:'Wait for the current service day to load before searching.'};
 const board=state?.shifts?.[shift];
 if(!board?.formation||!config?.formations?.[board.formation])return {...result,reason:'Choose a formation before searching for tables.'};
 const allRows=C.rotationRows(board),rotationIndex=new Map(allRows.map((r,i)=>[r.id,i]));
 if(!allRows.some(r=>String(r.server||'').trim()))return {...result,reason:'Assign an active server to the current formation first.'};
 const deferred=new Map(allRows.map(r=>[r.id,C.deferredTurn(state,shift,r,now)]));
 const rows=allRows.filter(r=>{if(!String(r.server||'').trim())return false;const nextAutoSkip=shift==='PM'&&r.barAuto!==false&&String(r.section).toUpperCase().includes('BAR')&&C.list(r.entries).filter(e=>e.kind==='party').length%2===1?1:0;if(C.slots(r)+Math.ceil(people/4)+nextAutoSkip>60)return false;const turn=deferred.get(r.id);if(turn&&!turn.eligible){result.recovering.push({rowId:r.id,server:r.server,until:turn.until,minutes:Math.ceil((turn.until-now)/60000)});return false;}return true;}),rowMap=new Map(rows.map(r=>[r.id,r]));
 const knownTables=new Set(C.list(config.tables).map(t=>t.id));
 const held=new Set(Object.values(records||{}).filter(r=>r&&r.table&&r.date===state.day&&!/cancel|complete|seated|no.?show|deleted/i.test(r.status||'')&&C.reservationTime(r.date,r.time)+3600000>now).flatMap(r=>[r.table,...C.list(r.secondary)]));
 const formedTables=new Set(Object.values(config.formations[board.formation]).flatMap(C.list));
 const available=id=>knownTables.has(id)&&formedTables.has(id)&&state.tables?.[id]?.status==='ready'&&!state.tables[id].partyId&&!held.has(id);
 const joined=prefix=>Object.values(state.parties||{}).some(p=>C.members(p).filter(id=>id.startsWith(prefix)).length>1);
 const joinedC=joined('C'),joinedD=joined('D'),loads=new Map(rows.map(r=>[r.id,workload(state,shift,r,now)]));
 const options=[...C.list(config.tables).flatMap(t=>{const capacity=capacityFor(t.id);return capacity?[{tables:[t.id],...capacity}]:[];}),...(people<5?[]:groups)];
 for(const option of options){
  const ids=option.tables;if(option.max<people||!ids.every(available))continue;
  if(ids.filter(id=>/^C/.test(id)).length>1&&joinedD||ids.filter(id=>/^D/.test(id)).length>1&&joinedC)continue;
  const assigned=ids.map(id=>rowMap.get(board.assignments?.[id]));if(assigned.some(r=>!r))continue;
  const sections=ids.map((id,i)=>sectionFor(board,config,id,assigned[i]));if(sections.some(s=>!s))continue;
  const uniqueRows=[...new Map(assigned.map(r=>[r.id,r])).values()].sort((a,b)=>rotationIndex.get(a.id)-rotationIndex.get(b.id));
  const uniqueSections=[...new Set(sections)],crossSection=uniqueSections.length>1||uniqueRows.length>1;
  if(crossSection){if(!canCrossSections(people))continue;result.crossSectionCount++;if(!allowCrossSection)continue;}
  const row=uniqueRows[0],load=loads.get(row.id),returnTurn=deferred.get(row.id);
  result.candidates.push({tables:[...ids],booth:ids.length===1&&booths.includes(ids[0]),seatingType:ids.length>1?'COMBINED TABLES':booths.includes(ids[0])?'BOOTH':/^bar\s*\d+$/i.test(ids[0])?'BAR STOOL':'TABLE',min:option.min,max:option.max,section:uniqueSections.join(' / '),crossSection,rowId:row.id,server:row.server,beeper:row.beeper||'—',turns:C.slots(row),rotation:rotationIndex.get(row.id)+1,area:areaRank(ids),returnPriority:!!returnTurn?.eligible,returnAt:returnTurn?.at||0,returnReason:returnTurn?.reason||'',...load,afterGuests:load.activeGuests+people,servers:uniqueRows.map(r=>({name:r.server,section:r.section,beeper:r.beeper||'—',...loads.get(r.id)}))});
 }
 // 1–4 guests follow the exact Board queue. Parties of 5+ keep the nearest
 // turn count, then the owner's area order and actual workload before section order.
 const fit=(a,b)=>Number(a.tables.length>1)-Number(b.tables.length>1)||(a.max-people)-(b.max-people)||a.tables.length-b.tables.length||a.tables.join().localeCompare(b.tables.join(),undefined,{numeric:true});
 result.candidates.sort((a,b)=>Number(a.crossSection)-Number(b.crossSection)||Number(b.returnPriority)-Number(a.returnPriority)||(a.returnPriority&&b.returnPriority?a.returnAt-b.returnAt:0)||(people<5?a.rotation-b.rotation||Number(b.booth)-Number(a.booth):a.turns-b.turns||a.area-b.area||a.recentGuests-b.recentGuests||a.activeGuests-b.activeGuests||a.activeTables-b.activeTables||a.rotation-b.rotation)||fit(a,b));
 if(!result.candidates.length)result.reason=canCrossSections(people)&&allowCrossSection?'No suitable READY tables or approved combinations for this party.':'No suitable READY tables in one section for this party.';
 return result;
}
// Host-only overflow suggestions. Guest booking capacity still uses the active
// formation; a closed section is not promised online without a host decision.
function search(args){
 const report=recommend(args);
 const {state,config,shift='PM',people,records={},now=Date.now()}=args,board=state?.shifts?.[shift];
 if(!Number.isInteger(people)||people<1||people>120||state?.day!==C.dayAt(now)||!config?.formations?.[board?.formation])return report;
 const current=config.formations[board.formation],known=new Set(C.list(config.tables).map(t=>t.id)),activeRows=C.rotationRows(board).filter(r=>String(r.server||'').trim()),activeMap=new Map(activeRows.map(r=>[r.id,r]));
 const currentTables=new Set(Object.values(current).flatMap(C.list));
 const held=new Set(Object.values(records||{}).filter(r=>r&&r.table&&r.date===state.day&&!/cancel|complete|seated|no.?show|deleted/i.test(r.status||'')&&C.reservationTime(r.date,r.time)+3600000>now).flatMap(r=>[r.table,...C.list(r.secondary)]));
 const available=id=>known.has(id)&&state.tables?.[id]?.status==='ready'&&!state.tables[id].partyId&&!held.has(id);
 const inactive=id=>!currentTables.has(id)||!activeMap.has(board.assignments?.[id]);
 const joined=prefix=>Object.values(state.parties||{}).some(p=>C.members(p).filter(id=>id.startsWith(prefix)).length>1);
 const joinedC=joined('C'),joinedD=joined('D');
 const serverChoices=activeRows.flatMap((row,i)=>{
  const auto=shift==='PM'&&row.barAuto!==false&&String(row.section).toUpperCase().includes('BAR')&&C.list(row.entries).filter(e=>e.kind==='party').length%2===1?1:0,turn=C.deferredTurn(state,shift,row,now);
  if(C.slots(row)+Math.ceil(people/4)+auto>60||turn&&!turn.eligible)return [];
  const load=workload(state,shift,row,now);
  return [{rowId:row.id,server:row.server,beeper:row.beeper||'—',serverSection:row.section,turns:C.slots(row),rotation:i+1,returnPriority:!!turn?.eligible,returnAt:turn?.at||0,...load,afterGuests:load.activeGuests+people}];
 }).sort((a,b)=>Number(b.returnPriority)-Number(a.returnPriority)||(a.returnPriority&&b.returnPriority?a.returnAt-b.returnAt:0)||a.turns-b.turns||(people<5?a.rotation-b.rotation:a.recentGuests-b.recentGuests||a.activeGuests-b.activeGuests||a.rotation-b.rotation));
 const plans=[board.formation,...Object.keys(config.formations).filter(key=>key!==board.formation).sort()],options=C.list(config.tables).flatMap(t=>{const cap=capacityFor(t.id);return cap?[{tables:[t.id],...cap}]:[];}).concat(people<5?[]:groups),candidates=[];
 for(const option of options){
  const ids=option.tables;if(option.max<people||!ids.every(available)||!ids.some(inactive))continue;
  if(ids.filter(id=>/^C/.test(id)).length>1&&joinedD||ids.filter(id=>/^D/.test(id)).length>1&&joinedC)continue;
  // Keep the current physical section boundaries whenever these tables exist
  // there. An alternate template cannot disguise a <=12 cross-section party.
  const candidatePlans=ids.every(id=>currentTables.has(id))?[board.formation]:plans;
  for(const planFormation of candidatePlans){
   const form=config.formations[planFormation],sections=ids.map(id=>{
    const found=Object.entries(form).filter(([,tables])=>C.list(tables).includes(id));if(found.length!==1)return '';
    const row=C.list(board.rows).find(r=>r.id===board.assignments?.[id]);
    return planFormation===board.formation&&row?sectionFor(board,config,id,row)||found[0][0]:found[0][0];
   });
   if(sections.some(s=>!s))continue;
   const crossSection=new Set(sections).size>1;if(crossSection&&(!canCrossSections(people)||args.allowCrossSection===false))continue;
   const inactiveTables=ids.filter(inactive).map(id=>{const row=C.list(board.rows).find(r=>r.id===board.assignments?.[id]);return {table:id,reason:!currentTables.has(id)?'OTHER FORMATION':row?.cut?'CUT SECTION':'UNASSIGNED SECTION'};});
   candidates.push({tables:[...ids],min:option.min,max:option.max,booth:ids.length===1&&booths.includes(ids[0]),seatingType:ids.length>1?'COMBINED TABLES':booths.includes(ids[0])?'BOOTH':/^bar\s*\d+$/i.test(ids[0])?'BAR STOOL':'TABLE',inactive:true,inactiveTables,planFormation,formationLabel:config.formationNames?.[planFormation]||planFormation,section:[...new Set(sections)].join(' / '),crossSection,area:areaRank(ids),serverChoices,server:'Choose an active server',rowId:'',beeper:'—',servers:[]});
   break; // One physical group, not a duplicate card for each saved formation.
  }
 }
 candidates.sort((a,b)=>Number(a.planFormation!==board.formation)-Number(b.planFormation!==board.formation)||Number(a.crossSection)-Number(b.crossSection)||(people<5?Number(b.booth)-Number(a.booth):a.area-b.area)||(a.max-people)-(b.max-people)||a.tables.length-b.tables.length||a.tables.join().localeCompare(b.tables.join(),undefined,{numeric:true}));
 return {...report,candidates:[...report.candidates,...candidates],activeCount:report.candidates.length,backupCount:candidates.length,inactive:!report.candidates.length&&candidates.length>0,reason:candidates.length?'Review these additional READY tables outside the active sections.':report.reason};
}
return {capacities,capacityFor,booths,groups,canCrossSections,totalCapacity,recommend,search,sectionFor};
});
