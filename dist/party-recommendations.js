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
// Only explicitly approved combinations. C2+C3 uses the lower supplied limit (12).
// Full C-row and D combinations await confirmed capacities; do not generate them.
const groups=[
 ['B1 B2',10],['B2 B3',10],['B1 B2 B3',15],
 ['L1 L2',8,10],['L2 L3',8],['L3 L4',8],['R1 R2',8],['R2 R3',8],['R3 R4',8],
 ['A4 L5',10,11],['L5 L6',12,13],['A4 L5 L6',20],['R4 R5',10],
 ['R5 R6',12,14],['R6 R7',12,13],['R4 R5 R6',20],['R3 R4 R5',15],
 ['M1 M2',10],['M1 H3',10],['M2 H4',10],['C1 C2',8,10],['C2 C3',12],['C3 C4',10],
 ['E1 F1',8],['E2 E3',8],['E3 E4',8,10],['E4 E5',8,10],['E2 E3 E4',12]
].map(([ids,min,max=min])=>Object.freeze({tables:Object.freeze(ids.split(' ')),min,max}));
Object.freeze(groups);
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
function recommend({state,config,shift='PM',people,records={},now=Date.now(),allowCrossSection=false}){
 const result={candidates:[],crossSectionCount:0,reason:''};
 if(!Number.isInteger(people)||people<1||people>120)return {...result,reason:'Enter a whole number from 1 to 120 guests.'};
 if(state?.day!==C.dayAt(now))return {...result,reason:'Wait for the current service day to load before searching.'};
 const board=state?.shifts?.[shift];
 if(!board?.formation||!config?.formations?.[board.formation])return {...result,reason:'Choose a formation before searching for tables.'};
 const allRows=C.rotationRows(board),rotationIndex=new Map(allRows.map((r,i)=>[r.id,i]));
 if(!allRows.some(r=>String(r.server||'').trim()))return {...result,reason:'Assign an active server to the current formation first.'};
 const rows=allRows.filter(r=>{if(!String(r.server||'').trim())return false;const nextAutoSkip=shift==='PM'&&r.barAuto!==false&&String(r.section).toUpperCase().includes('BAR')&&C.list(r.entries).filter(e=>e.kind==='party').length%2===1?1:0;return C.slots(r)+Math.ceil(people/4)+nextAutoSkip<=60;}),rowMap=new Map(rows.map(r=>[r.id,r]));
 const knownTables=new Set(C.list(config.tables).map(t=>t.id));
 const held=new Set(Object.values(records||{}).filter(r=>r&&r.table&&r.date===state.day&&!/cancel|complete|seated|no.?show|deleted/i.test(r.status||'')&&C.reservationTime(r.date,r.time)+3600000>now).flatMap(r=>[r.table,...C.list(r.secondary)]));
 const formedTables=new Set(Object.values(config.formations[board.formation]).flatMap(C.list));
 const available=id=>knownTables.has(id)&&formedTables.has(id)&&state.tables?.[id]?.status==='ready'&&!state.tables[id].partyId&&!held.has(id);
 const joined=prefix=>Object.values(state.parties||{}).some(p=>C.members(p).filter(id=>id.startsWith(prefix)).length>1);
 const joinedC=joined('C'),joinedD=joined('D'),loads=new Map(rows.map(r=>[r.id,workload(state,shift,r,now)]));
 const options=[...C.list(config.tables).flatMap(t=>{const capacity=capacityFor(t.id);return capacity?[{tables:[t.id],...capacity}]:[];}),...groups];
 for(const option of options){
  const ids=option.tables;if(option.max<people||!ids.every(available))continue;
  if(ids.filter(id=>/^C/.test(id)).length>1&&joinedD||ids.filter(id=>/^D/.test(id)).length>1&&joinedC)continue;
  const assigned=ids.map(id=>rowMap.get(board.assignments?.[id]));if(assigned.some(r=>!r))continue;
  const sections=ids.map((id,i)=>sectionFor(board,config,id,assigned[i]));if(sections.some(s=>!s))continue;
  const uniqueRows=[...new Map(assigned.map(r=>[r.id,r])).values()].sort((a,b)=>rotationIndex.get(a.id)-rotationIndex.get(b.id));
  const uniqueSections=[...new Set(sections)],crossSection=uniqueSections.length>1||uniqueRows.length>1;
  if(crossSection){result.crossSectionCount++;if(!allowCrossSection)continue;}
  const row=uniqueRows[0],load=loads.get(row.id);
  result.candidates.push({tables:[...ids],min:option.min,max:option.max,section:uniqueSections.join(' / '),crossSection,rowId:row.id,server:row.server,beeper:row.beeper||'—',turns:C.slots(row),rotation:rotationIndex.get(row.id)+1,area:areaRank(ids),...load,afterGuests:load.activeGuests+people,servers:uniqueRows.map(r=>({name:r.server,section:r.section,beeper:r.beeper||'—',...loads.get(r.id)}))});
 }
 // Preserve the exact Board queue, including section order at equal turn counts.
 // Area and workload must never jump ahead of an earlier eligible server.
 // Always prefer a fitting single table before considering combinations.
 result.candidates.sort((a,b)=>Number(a.crossSection)-Number(b.crossSection)||a.rotation-b.rotation||Number(a.tables.length>1)-Number(b.tables.length>1)||(people>=6?a.area-b.area:a.tables.length-b.tables.length)||(a.max-people)-(b.max-people)||a.tables.length-b.tables.length||a.tables.join().localeCompare(b.tables.join(),undefined,{numeric:true}));
 if(!result.candidates.length)result.reason='No suitable READY tables in one section for this party.';
 return result;
}
return {capacities,capacityFor,groups,recommend,sectionFor};
});
