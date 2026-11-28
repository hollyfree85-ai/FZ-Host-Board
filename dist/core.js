(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HostCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),list=x=>Array.isArray(x)?x:Object.values(x||{}),fail=(m,code='INVALID')=>{const e=new Error(m);e.code=code;throw e;};
const canonical=s=>String(s||'').trim().replace(/^AJ$/i,'A.J.');
const staffAliases = new Map([
  ['megan meadows', 'Megan'],
  ['megan sisk', 'Sisk'],
  ['cynthia risner', 'Cyndi'],
  ['sara swift', 'Sara'],
  ['sarah kibler', 'Kibbler'],
  ['sarah kibbler', 'Kibbler']
]);
function staffName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return staffAliases.get(name.toLowerCase()) || name.split(' ')[0];
}
function uid(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function dayAt(at=Date.now()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(x=>[x.type,x.value]));const d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');if(+p.hour<4)d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
function reservationTime(date,time){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}$/.test(time||''))return NaN;const target=Date.parse(date+'T'+time+':00Z');if(!Number.isFinite(target))return NaN;let instant=target;const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});for(let i=0;i<3;i++){const x=Object.fromEntries(fmt.formatToParts(instant).map(p=>[p.type,p.value]));const local=Date.parse(x.year+'-'+x.month+'-'+x.day+'T'+x.hour+':'+x.minute+':00Z');instant+=target-local;}return instant;}
function reservationDue(r,now){if(/cancel|complete|no.?show|deleted/i.test(r.status||''))return false;const at=reservationTime(r.date,r.time);return Number.isFinite(at)&&now>=at-7200000&&now<at;}
function reservationUndoExpiry(r){return r?.status==='deleted'&&Number.isFinite(r.deletedAt)&&r.deletedAt>0?r.deletedAt+72*60*60*1000:null;}
function reservationUndoAvailable(r,now){const expiry=reservationUndoExpiry(r);return expiry!==null&&now<expiry;}
function reservationUndoExpired(r,now){const expiry=reservationUndoExpiry(r);return expiry!==null&&now>=expiry;}
function emptyShift(){return {formation:'',rows:[],assignments:{}};}
function initial(config,at=Date.now()){return {schema:1,day:dayAt(at),revision:0,updatedAt:at,shifts:{AM:emptyShift(),PM:emptyShift()},tables:Object.fromEntries(config.tables.map(t=>[t.id,{status:'ready'}])),parties:{},undo:{},receipts:{},tableHistory:{}};}
function normalize(raw,config){const s=copy(raw||initial(config));s.shifts=s.shifts||{};for(const sh of ['AM','PM']){const b=s.shifts[sh]||(s.shifts[sh]=emptyShift());b.rows=list(b.rows);b.assignments=b.assignments||{};b.rows.forEach(r=>{r.entries=list(r.entries);if(r.arrivalOffset&&!r.arrivalOffsetShown){r.arrivalOffset=startingTurns(r);r.arrivalOffsetShown=true;}r.barAuto=r.barAuto!==false;});syncSectionAssignments(b,config);}s.tables=s.tables||{};for(const t of config.tables)s.tables[t.id]=s.tables[t.id]||{status:'ready'};s.parties=s.parties||{};s.undo=s.undo||{};s.receipts=s.receipts||{};return s;}
function rowOf(s,shift,id){const row=s.shifts[shift]?.rows.find(r=>r.id===id);if(!row)fail('Server row changed. Choose the server again.');return row;}
// Added sections are local to one live shift and its selected formation.
function shiftFormation(board,config,name=board?.formation){
 const base=config.formations?.[name];
 if(!base || name!==board?.formation || !board.addedSections)return base;
 const added=Object.entries(board.addedSections).filter(([,ids])=>ids);
 const assigned=new Set(added.flatMap(([,ids])=>list(ids)));
 const sections=Object.fromEntries(Object.entries(base).map(([section,ids])=>[section,list(ids).filter(id=>!assigned.has(id))]));
 return Object.assign(sections,Object.fromEntries(added));
}
function openSectionOptions(board,config){
 const form=shiftFormation(board,config);
 if(!form)return {sections:[],tables:[]};
 const taken=[...Object.keys(form),...list(board.rows).filter(r=>!r.cut).map(r=>r.section)];
 const sections=Array.from({length:9},(_,i)=>String(i+1)).filter(sec=>!taken.some(section=>rowHasSection({section},sec)));
 const used=new Set(Object.values(form).flatMap(list));
 const tables=list(config.tables).map(t=>t.id).filter(id=>!used.has(id)&&!board.assignments?.[id]&&!fixedSection(config,id)&&!sharedSections(board,config,id).length);
 return {sections,tables};
}
// Physical section rules are separate from a party's serving employee.
function rowHasSection(row,section){return String(row?.section||'').split(/\s*\/\s*|-/).includes(section);}
function sharedSections(board,config,id){return list(config.sectionRules?.shared?.[board?.formation]?.[id]);}
function fixedSection(config,id){return config.sectionRules?.fixed?.[id]||'';}
function tableRows(board,config,id,includeCut=false){
 const shared=sharedSections(board,config,id),fixed=fixedSection(config,id),rows=list(board?.rows);
 const owners=shared.length?rows.filter(r=>shared.some(s=>rowHasSection(r,s))):fixed?rows.filter(r=>rowHasSection(r,fixed)):rows.filter(r=>r.id===board?.assignments?.[id]);
 return owners.filter(r=>String(r.server||'').trim()&&(includeCut||!r.cut));
}
function tableSectionLabel(board,config,id,row){const shared=sharedSections(board,config,id);return shared.length?shared.map(s=>s==='BAR'?'Bar':s).join('/'):fixedSection(config,id)||sectionFor(board,config,id,row);}
function syncSectionAssignments(board,config){
 for(const id of new Set([...Object.keys(config.sectionRules?.fixed||{}),...Object.keys(config.sectionRules?.shared?.[board.formation]||{})])){
  const owners=tableRows(board,config,id,true),current=owners.find(r=>r.id===board.assignments[id]);
  const owner=current&&!current.cut?current:owners.find(r=>!r.cut)||current||owners[0];
  if(owner)board.assignments[id]=owner.id;else delete board.assignments[id];
 }
}
// BAR is a section limit, including its dining tables in the current formation.
function sectionFor(board,config,id,row){
 const fixed=fixedSection(config,id);if(fixed)return fixed;
 const shared=sharedSections(board,config,id);if(shared.length)return shared.find(s=>rowHasSection(row,s))||shared[0];
 const sections=String(row?.section||'').split(/\s*\/\s*/).filter(Boolean);
 const original=Object.entries(shiftFormation(board,config)||{}).filter(([,ids])=>list(ids).includes(id)).map(([section])=>section);
 if(sections.length===1)return sections[0];
 if(!sections.length)return original.length===1?original[0]:'';
 const matched=original.filter(section=>sections.includes(section));return matched.length===1?matched[0]:'';
}
const isBarSection=section=>String(section||'').split(/\s*\/\s*/).some(s=>/^BAR$/i.test(s.trim()));
function partyLimit(board,config,ids,row,backupFormation=''){
 if(/^BAR$/i.test(String(row?.section||'').trim()))return 5;
 for(const id of ids){
  const assigned=list(board?.rows).find(r=>r.id===board?.assignments?.[id]);
  const shared=sharedSections(board,config,id);
  const current=sectionFor(board,config,id,shared.length?(row||tableRows(board,config,id).find(r=>rowHasSection(r,'1'))||assigned):assigned);
  const section=current||sectionFor({formation:backupFormation},config,id);
  if(/^bar\s*\d+$/i.test(id)||isBarSection(section))return 5;
 }
 return 120;
}
function checkPartyLimit(board,config,ids,people,row,backupFormation){
 if(people>partyLimit(board,config,ids,row,backupFormation))fail('BAR section allows a maximum of 5 guests per party. Choose another section.');
}
function autoSkip(row,shift){row.entries=list(row.entries).filter(e=>e.kind!=='auto');if(shift!=='PM'||!row.barAuto||!String(row.section).toUpperCase().includes('BAR'))return;let count=0;row.entries=row.entries.flatMap(e=>{if(e.kind!=='party')return[e];count++;return count%2?[e]:[e,{id:'auto_'+e.id,kind:'auto',after:e.id,at:e.at}];});}
function slots(row){return list(row.entries).reduce((n,e)=>n+(e.kind==='party'?Math.ceil(e.people/4):1),0);}
function sectionOrder(a,b){const key=r=>String(r.section).split(/\s*\/\s*/).filter(s=>!/^BAR$/i.test(s)).sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}))[0]||'ZZZ';return key(a).localeCompare(key(b),undefined,{numeric:true});}
function startingTurns(row){
 const offset=row.arrivalOffset;
 if(!Number.isSafeInteger(offset)||offset<=0)return 0;
 // On old boards a host could batch-fill the starting turns before the first seating.
 // A single ordinary skip still advances the server beyond the automatic starting position.
 if(!row.arrivalOffsetShown){
  const [first,second]=list(row.entries);
  if(first?.kind==='manual'&&second?.kind==='manual'&&second.id===first.id+'_1')return 0;
 }
 return offset;
}
function rotationTurns(row){return slots(row)+startingTurns(row);}
function eligibleRotationRows(board){return list(board?.rows).filter(r=>!r.cut&&slots(r)<60);}
function boardTableCount(row){return list(row.entries).filter(entry=>entry.kind==='party').length;}
function boardRotationRows(board){
 return eligibleRotationRows(board).sort((a,b)=>rotationTurns(a)-rotationTurns(b)||sectionOrder(a,b));
}
function nextBoardRow(board){return boardRotationRows(board)[0]||null;}
function rotationRows(board){return eligibleRotationRows(board).sort((a,b)=>rotationTurns(a)-rotationTurns(b)||(a.arrivalOrder||0)-(b.arrivalOrder||0)||sectionOrder(a,b));}
const recoveryMs=10*60*1000;
function latestSeating(s,shift,row,at){
 const key=canonical(row.server).toLowerCase();let latest=null;
 for(const [sh,board]of Object.entries(s.shifts||{}))for(const other of list(board.rows))if(sh===shift&&other.id===row.id||key&&canonical(other.server).toLowerCase()===key)for(const e of list(other.entries))if(e.kind==='party'&&Number.isFinite(e.at)&&e.at<=at&&(!latest||e.at>=latest.at))latest=e;
 return latest;
}
function deferredTurn(s,shift,row,at){
 const saved=s.shifts[shift]?.deferredTurns?.[row.id];
 if(!saved||row.cut||canonical(saved.server)!==canonical(row.server))return null;
 const last=latestSeating(s,shift,row,at);
 // A seating from an older app or another shift also satisfies the held turn.
 if((last?.id||'')!==saved.lastSeatingId)return null;
 const until=saved.reason==='recovery'&&last?last.at+recoveryMs:0;
 return {...saved,until,eligible:at>=until};
}
function rememberPassedTurn(s,shift,row,config,at){
 if(row.cut||!canonical(row.server))return;
 const board=s.shifts[shift],formed=new Set(Object.values(config.formations?.[board.formation]||{}).flatMap(list));
 const own=[...formed].filter(id=>tableRows(board,config,id).some(r=>r.id===row.id));
 if(!own.length)return;
 const last=latestSeating(s,shift,row,at),hasReady=own.some(id=>s.tables[id]?.status==='ready'&&!s.tables[id].partyId);
 const reason=!hasReady?'no_ready':last&&at-last.at<recoveryMs?'recovery':'';
 if(!reason)return;
 board.deferredTurns=board.deferredTurns||{};
 if(!deferredTurn(s,shift,row,at))board.deferredTurns[row.id]={server:row.server,at,reason,lastSeatingId:last?.id||''};
}
function rememberPassedTurns(s,shift,seatedRow,config,at){
 const queue=rotationRows(s.shifts[shift]),index=queue.findIndex(r=>r.id===seatedRow.id);
 for(const row of queue.slice(0,Math.max(0,index)))rememberPassedTurn(s,shift,row,config,at);
 delete s.shifts[shift].deferredTurns?.[seatedRow.id];
}
function checkSpace(row){if(slots(row)>60)fail('This server has no remaining Board slots.');}
function partyFor(s,table){const t=s.tables[table];return t?.partyId?s.parties[t.partyId]||null:null;}
function members(p){return[p.primary,...list(p.secondary)];}
function active(s,cmd){const p=partyFor(s,cmd.table);if(!p)fail('Select a SEATED table.');if(cmd.partyVersion!=null&&(p.version||1)!==cmd.partyVersion)fail('This party was edited on another tablet. Reopen it.','CONFLICT');if(cmd.partyId&&p.id!==cmd.partyId)fail('This table now belongs to another party. Reopen the table.','CONFLICT');return p;}
function release(s,p,status='ready'){members(p).forEach(id=>s.tables[id]={status});delete s.parties[p.id];}
function occupy(s,p){s.parties[p.id]=p;members(p).forEach(id=>s.tables[id]={status:'seated',partyId:p.id});}
function available(s,ids,own=''){if(new Set(ids).size!==ids.length)fail('Choose each table only once.');for(const id of ids){if(!s.tables[id])fail('Unknown table '+id);if(s.tables[id].partyId!==own&&s.tables[id].status!=='ready')fail(id+' is no longer READY.','CONFLICT');}}
function risk(s,shift,rowId,at){const r=rowOf(s,shift,rowId),guard=['megan meadows','megan meadow','a.j.','jesus ovalle-munoz','mia burress','mia gibson','ashley garcia'].includes(canonical(r.server).toLowerCase());return r.entries.filter(e=>e.kind==='party'&&at-e.at<300000&&at>=e.at&&(guard||e.people>5)).map(e=>({id:e.id,table:e.primary,people:e.people,at:e.at}));}
function countPeople(v){const n=Number(v);if(!Number.isInteger(n)||n<1||n>120)fail('Enter 1–120 guests.');return n;}
function validate(s){const entries=new Map();for(const sh of ['AM','PM'])for(const r of s.shifts[sh].rows){checkSpace(r);for(const e of r.entries){if(entries.has(e.id))fail('Duplicate Board entry.');entries.set(e.id,{row:r.id,shift:sh,e});}}for(const p of Object.values(s.parties)){const ref=entries.get(p.id);if(!ref||ref.shift!==p.shift||ref.row!==p.rowId||ref.e.kind!=='party')fail('Party has no matching Board entry.');for(const id of members(p))if(s.tables[id]?.partyId!==p.id||s.tables[id]?.status!=='seated')fail('Party / Floor link is incomplete.');}for(const t of Object.values(s.tables))if(t.partyId&&!s.parties[t.partyId])fail('Floor has an unresolved party.');return s;}
const validCutTime = time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
function cutTimeLabel(time) {
 if (!validCutTime(time)) return '';
 const hour = Number(time.slice(0, 2));
 return (hour % 12 || 12) + time.slice(2) + (hour < 12 ? ' AM' : ' PM');
}
let cutClockDay = '', cutClockTimes = new Map();
function cutTimeAt(day, time) {
 if (!validCutTime(time)) return NaN;
 if (day !== cutClockDay) { cutClockDay = day; cutClockTimes.clear(); }
 if (!cutClockTimes.has(time)) {
  let date = day;
  // The restaurant workday ends at 4 AM the following morning.
  if (time < '04:00') {
   const next = new Date(day + 'T12:00:00Z');
   next.setUTCDate(next.getUTCDate() + 1);
   date = next.toISOString().slice(0, 10);
  }
  cutClockTimes.set(time, reservationTime(date, time));
 }
 return cutClockTimes.get(time);
}
function saveCutTime(row, time, expected) {
 if (time !== '' && !validCutTime(time)) fail('Enter a valid cut time.');
 const current = row.cutTime || '';
 if (time === current) return;
 if (expected !== undefined && expected !== current) fail('Cut time changed on another device. Reopen Formation & Servers.', 'CONFLICT');
 if (time) row.cutTime = time;
 else delete row.cutTime;
 delete row.reviewedCutTime;
}
function scheduledCuts(state, now) {
 if (!state || state.day !== dayAt(now)) return [];
 const scheduled = [];
 for (const shift of ['AM', 'PM']) {
  for (const row of list(state.shifts[shift]?.rows)) {
   if (row.cut || !row.server || !row.section || !validCutTime(row.cutTime) || row.reviewedCutTime === row.cutTime) continue;
   const at = cutTimeAt(state.day, row.cutTime);
   scheduled.push({row, shift, at, alertAt: at - 5 * 60000});
  }
 }
 return scheduled.sort((a, b) => a.at - b.at);
}
function placeSectionLabels(width,height,tables,groups,extras=[]){
 const gap=3;
 const obstacles=tables.map(t=>{const angle=(t.r||0)*Math.PI/180,w=width*t.w/100,h=height*Math.max(5,t.h)/100,rw=Math.abs(w*Math.cos(angle))+Math.abs(h*Math.sin(angle)),rh=Math.abs(w*Math.sin(angle))+Math.abs(h*Math.cos(angle));return {x:width*t.x/100-rw/2,y:height*Math.min(t.y,94)/100-rh/2,w:rw,h:rh};}).concat(extras);
 const overlap=(a,b)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
 // Plan all tablet callouts together so late sections cannot be squeezed into tiny cards.
 if(width>=800&&height>=400){
 const anchors=groups.map(g=>{const own=tables.filter(t=>g.tables.includes(t.id));return own.length?{x:own.reduce((n,t)=>n+t.x,0)/own.length*width/100,y:own.reduce((n,t)=>n+Math.min(t.y,94),0)/own.length*height/100}:null;});
 for(const [cw,ch]of [[200,76],[184,72],[168,68],[152,68],[136,68],[120,68]]){
 const options=anchors.map(anchor=>{if(!anchor)return [];const xs=new Set([gap,width-cw-gap,Math.max(gap,Math.min(width-cw-gap,anchor.x-cw/2))]),ys=new Set([gap,height-ch-gap,Math.max(gap,Math.min(height-ch-gap,anchor.y-ch/2))]);for(const o of obstacles){xs.add(o.x-cw-gap);xs.add(o.x+o.w+gap);ys.add(o.y-ch-gap);ys.add(o.y+o.h+gap);}for(let y=gap;y+ch<=height-gap;y+=ch/2)ys.add(y);for(let x=gap;x+cw<=width-gap;x+=cw/2)xs.add(x);const choices=[];for(const x of xs){if(x<gap||x+cw>width-gap)continue;for(const y of ys){if(y<gap||y+ch>height-gap)continue;const d=Math.hypot((x+cw/2-anchor.x)/width,(y+ch/2-anchor.y)/height);if(d>.3)continue;const rect={x,y,w:cw,h:ch,anchor};if(!obstacles.some(o=>overlap(rect,o)))choices.push({...rect,d});}}return choices.sort((a,b)=>a.d-b.d).slice(0,90);});
 const placed=groups.map(()=>null);let budget=12000;const search=(remaining)=>{if(!remaining.length)return true;if(--budget<0)return false;let chosen=null,valid=null;for(const i of remaining){const candidates=options[i].filter(p=>!placed.some(q=>q&&overlap(p,q)));if(!candidates.length)return false;if(!valid||candidates.length<valid.length){chosen=i;valid=candidates;}}for(const p of valid){placed[chosen]=p;if(search(remaining.filter(i=>i!==chosen)))return true;placed[chosen]=null;}return false;};
 if(search(groups.map((_,i)=>i)))return placed;
 }
 }
 const result=groups.map(()=>null);groups.map((group,index)=>({group,index})).reverse().forEach(({group,index})=>{const own=tables.filter(t=>group.tables.includes(t.id));if(!own.length)return null;const anchor={x:own.reduce((n,t)=>n+t.x,0)/own.length*width/100,y:own.reduce((n,t)=>n+Math.min(t.y,94),0)/own.length*height/100};let best=null;
 for(const scale of [1,.9,.8,.7,.6,.5,.4]){const cardWidth=(width>=1000?220:width>=600?190:132)*scale,cardHeight=(width>=600?82:68)*scale;const xs=new Set([gap,width-cardWidth-gap,Math.max(gap,Math.min(width-cardWidth-gap,anchor.x-cardWidth/2))]),ys=new Set([gap,height-cardHeight-gap,Math.max(gap,Math.min(height-cardHeight-gap,anchor.y-cardHeight/2))]);for(const o of obstacles){xs.add(o.x-cardWidth-gap);xs.add(o.x+o.w+gap);ys.add(o.y-cardHeight-gap);ys.add(o.y+o.h+gap);}let score=Infinity;for(const x of xs){if(x<gap||x+cardWidth>width-gap)continue;for(const y of ys){if(y<gap||y+cardHeight>height-gap)continue;const d=(x+cardWidth/2-anchor.x)**2+(y+cardHeight/2-anchor.y)**2;if(d>=score||Math.hypot((x+cardWidth/2-anchor.x)/width,(y+cardHeight/2-anchor.y)/height)>.3)continue;const rect={x,y,w:cardWidth,h:cardHeight};if(obstacles.some(o=>overlap(rect,o)))continue;best={...rect,anchor};score=d;}}if(best)break;}
 if(best)obstacles.push(best);result[index]=best;});return result;
}
function beeperRows(s){return Object.fromEntries(['AM','PM'].flatMap(shift=>list(s.shifts[shift]?.rows).filter(r=>r.beeper).map(r=>[shift+'_'+r.id,{day:s.day,shift,rowId:r.id,server:r.server,beeper:String(r.beeper),section:r.section}])));}
function retainBeeperHistory(history,at){const first=new Date(dayAt(at)+'T12:00:00Z');first.setUTCDate(first.getUTCDate()-6);const cutoff=first.toISOString().slice(0,10);return Object.fromEntries(Object.entries(history||{}).filter(([,e])=>e.day>=cutoff&&e.day<=dayAt(at)));}
const tableHistoryCommands=new Set(['SEAT','MOVE','PEOPLE','SECONDARY','STATUS','DELETE','CLEAR_ENTRY','UNDO','RESTORE_READY','ROW_EDIT','CORRECT','CLEAR_SHIFT','CLEAR']);
function tableHistoryParty(s,p){if(!p)return null;const row=list(s.shifts[p.shift]?.rows).find(r=>r.id===p.rowId);return {id:p.id,primary:p.primary,secondary:list(p.secondary),people:p.people,server:row?.server||'',shift:p.shift,seatedAt:p.at};}
function tableHistoryBefore(s,cmd){
 if(!tableHistoryCommands.has(cmd.type)||cmd.type==='STATUS'&&cmd.status!=='cleaning')return null;
 const parties=Object.fromEntries(Object.values(s.parties).map(p=>[p.id,tableHistoryParty(s,p)]));
 if(cmd.type==='CLEAR_ENTRY'){const row=list(s.shifts[cmd.shift||'PM']?.rows).find(r=>r.id===cmd.rowId),entry=list(row?.entries).find(e=>e.id===cmd.entryId&&e.kind==='party');if(entry&&!parties[entry.id])parties[entry.id]=tableHistoryParty(s,{...entry,rowId:row.id,shift:cmd.shift||'PM'});}
 return parties;
}
function tableHistoryChanges(before,s,cmd,restoring){
 if(!before)return [];
 const after=Object.fromEntries(Object.values(s.parties).map(p=>[p.id,tableHistoryParty(s,p)])),changes=[];
 // A Board-only Undo restores a historical entry without occupying its tables.
 if(cmd.type==='UNDO'&&restoring&&!after[restoring.id])after[restoring.id]=restoring;
 const joined=p=>[...list(p?.secondary)].sort().join('|');
 for(const id of new Set([...Object.keys(before),...Object.keys(after)])){
  const from=before[id]||null,to=after[id]||null;let action='';
  if(cmd.type==='SEAT'&&id===cmd.id)action='SEATED';
  else if(['UNDO','RESTORE_READY'].includes(cmd.type)&&!from&&to)action='RESTORED';
  else if(from&&!to){if(cmd.type==='STATUS')action='CLEANING';else if(cmd.type==='DELETE'||cmd.type==='CLEAR_ENTRY')action='DELETED';else if(cmd.type==='CLEAR_SHIFT'||cmd.type==='CLEAR')action='SHIFT_CLEARED';}
  else if(from&&to){if(from.primary!==to.primary)action='MOVED';else if(from.server!==to.server)action='SERVER_CHANGED';else if(from.people!==to.people)action='PEOPLE_CHANGED';else if(joined(from)!==joined(to))action='TABLES_CHANGED';else if(from.shift!==to.shift)action='SHIFT_CHANGED';}
  if(action)changes.push({partyId:id,action,from,to,tables:[...new Set([...(from?[from.primary,...from.secondary]:[]),...(to?[to.primary,...to.secondary]:[])])]});
 }
 return changes;
}
function tableHistoryRows(s,table='',now=Date.now()){
 const day=dayAt(now);if(s?.day!==day)return [];
 return Object.entries(s.tableHistory||{}).filter(([,event])=>event.day===day).flatMap(([id,event])=>list(event.changes).filter(change=>!table||list(change.tables).includes(table)).map((change,index)=>({id:id+'_'+index,at:event.at,sequence:event.sequence||0,...change}))).sort((a,b)=>b.at-a.at||b.sequence-a.sequence||a.id.localeCompare(b.id));
}
// The server screen reads only this limited projection. Keep it in the seating transaction.
function syncServerScreen(s,cmd){
 const previous=s.serverScreen?.parties||{}, parties={};
 for(const p of Object.values(s.parties)){
  const server=rowOf(s,p.shift,p.rowId).server, tables=members(p);
  const entry={server,tables,seatedAt:p.at},old=previous[p.id];
  if(old?.server===server){
   if(old.focus && tables.includes(old.focus.table))entry.focus=old.focus;
   for(const [table,at] of Object.entries(old.calls||{})){
    if(tables.includes(table) && cmd.at-at<180000)(entry.calls||={})[table]=at;
   }
  }
  if(cmd.partyId===p.id){
   if(cmd.type==='SCREEN_FOCUS' && (!entry.focus||cmd.at>=entry.focus.at))entry.focus={table:cmd.table,at:cmd.at};
   if(cmd.type==='SERVER_CALL'&&!cmd.messageKind)(entry.calls||={})[cmd.table]=Math.max(cmd.at,entry.calls?.[cmd.table]||0);
  }
  parties[p.id]=entry;
 }
 // Older tablets rebuild serverScreen on every board action. Keep typed messages
 // alongside it so those tablets can continue to work during an update.
 if(cmd.type==='SERVER_CALL' && cmd.messageKind){
  const messages=s.serverMessages||={};
  const {table,server,partyId,messageKind:kind,at}=cmd;
  const key=table+'_'+kind;
  if(messages[key]?.partyId!==partyId || messages[key].at<=at){
   messages[key]={kind,table,server,partyId,at};
  }
 }
 for(const [key,msg] of Object.entries(s.serverMessages||{})){
  const entry=parties[msg.partyId];
  if(cmd.at-msg.at>=180000 || entry?.server!==msg.server || !entry?.tables.includes(msg.table))delete s.serverMessages[key];
 }
 s.serverScreen={day:s.day,parties};
}
function reduce(raw,cmd,config,now=cmd.at){let s=normalize(raw,config);if(!cmd.id||!cmd.type||!Number.isFinite(cmd.at))fail('Invalid command.');if(s.receipts[cmd.id]||s.tableHistory?.[cmd.id])return s;if(now-cmd.at>120000&&cmd.type!=='DAILY_RESET')fail('This operation is too old. Reopen the table.','EXPIRED');
 const tableLog=s.tableHistory||{},tableBefore=tableHistoryBefore(s,cmd),tableRestore=cmd.type==='UNDO'?tableHistoryParty(s,s.undo[cmd.undoId]?.party):null;
 const oldBeepers=beeperRows(s),history=copy(s.beeperHistory||{}),historyStartedAt=s.beeperHistoryStartedAt||cmd.at;
 if(!s.beeperHistoryStartedAt)for(const [key,value]of Object.entries(oldBeepers))history['initial_'+key]={...value,at:cmd.at,event:'OBSERVED',reason:'Logging started'};
 if(cmd.type==='DAILY_RESET'){const day=dayAt(cmd.at);if(s.day>=day)return s;s=initial(config,cmd.at);s.lastResetAt=cmd.at;}
 else{
 if(cmd.day!==s.day||dayAt(cmd.at)!==s.day)fail('The operational day changed. Reload before retrying.','DAY_CHANGED');const sh=cmd.shift||'PM';if(!s.shifts[sh])fail('Choose AM or PM.');const b=s.shifts[sh];
 switch(cmd.type){
 case 'WAIT_SAVE':{const name=String(cmd.name||'').trim(),phone=String(cmd.phone||'').trim();if(!name||name.length>100)fail('Enter a guest name (maximum 100 characters).');if(!/^[+()0-9 .-]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15)fail('Enter a valid phone number (10–15 digits).');s.waiting=s.waiting||{};if(Object.keys(s.waiting).length>=200)fail('Waiting list is full. Remove completed parties first.');s.waiting[cmd.id]={id:cmd.id,name,phone,people:countPeople(cmd.people),at:cmd.at};break;}
 case 'WAIT_STATUS':{const r=s.waiting?.[cmd.waitId];if(!r)fail('This guest was already removed.','CONFLICT');if(typeof cmd.done!=='boolean')fail('Choose Done or Undone.');r.done=cmd.done;break;}
 case 'WAIT_REMOVE':{s.waiting=s.waiting||{};if(!s.waiting[cmd.waitId])fail('This guest was already removed.','CONFLICT');delete s.waiting[cmd.waitId];break;}
 case 'SCREEN_INIT':break;
 case 'SPECIAL_SHOUT_OUT':{
  const text=typeof cmd.text==='string'?cmd.text.trim():'';
  if(!text||text.length>200)fail('Enter a message of up to 200 characters.');
  if(now-cmd.at>=60000)fail('Shout-out expired. Send it again.','EXPIRED');
  if(s.specialShoutOut?.at>cmd.at)fail('A newer shout-out is already on the board.','CONFLICT');
  s.specialShoutOut={text,at:cmd.at};
  break;
 }
 case 'SCREEN_FOCUS':
 case 'SERVER_CALL':{
  if(cmd.type==='SERVER_CALL' && cmd.messageKind!=null && !['new','help'].includes(cmd.messageKind))fail('Choose New Table or Need Help.');
  const p=active(s,cmd);
  if(!cmd.partyId||p.shift!==sh||p.rowId!==cmd.rowId||rowOf(s,p.shift,p.rowId).server!==cmd.server)fail('The table or server changed. Select them again.','CONFLICT');
  break;
 }
 case 'BEEPER_HISTORY_INIT':break;
 case 'FORMATION_SELECT':{if(!config.formations[cmd.formation])fail('Choose a formation.');if(b.formation&&b.formation!==cmd.formation)fail('Use Edit Formation to change the current formation.','CONFLICT');b.formation=cmd.formation;break;}
 case 'SETUP':{
  if(Object.keys(s.parties).some(id=>s.parties[id].shift===sh)||b.rows.some(r=>r.entries.length))fail('This shift already has parties. Use Edit Formation or Breaking Section.');
  const form=config.formations[cmd.formation];if(!form)fail('Choose a formation.');delete b.deferredTurns;delete b.addedSections;b.rows=[];b.assignments={};b.formation=cmd.formation;
  const grouped=new Map();for(const sec of Object.keys(form).sort((a,z)=>a==='BAR'?1:z==='BAR'?-1:a.localeCompare(z,undefined,{numeric:true}))){const server=canonical(cmd.servers?.[sec]);if(!server)fail('Assign a server to Section '+sec);let r=grouped.get(server);if(!r){r={id:'row_'+cmd.id+'_'+grouped.size,server,section:sec,beeper:'',cut:false,barAuto:true,entries:[]};grouped.set(server,r);b.rows.push(r);}else r.section+=' / '+sec;for(const table of form[sec]){if(b.assignments[table])fail('Table '+table+' occurs in more than one section.');b.assignments[table]=r.id;}}
  break;}
 case 'SECTION_SERVER':{
  const form=shiftFormation(b,config,cmd.formation),sec=String(cmd.section||''),server=canonical(cmd.server);if(!form||!Object.prototype.hasOwnProperty.call(form,sec))fail('Choose a formation section.');if(!server)fail('Choose an employee who has arrived.');
  if(b.formation&&b.formation!==cmd.formation)fail('Use Edit Formation to change the current formation.');
  const current=b.rows.find(r=>!r.cut&&String(r.section).split(' / ').includes(sec));if(cmd.expectedOwner!==undefined&&(current?.id||'')!==cmd.expectedOwner)fail('This section changed on another device. Reopen Formation & Servers.','CONFLICT');
  let target=b.rows.find(r=>!r.cut&&canonical(r.server)===server)||b.rows.find(r=>canonical(r.server)===server);if(!target){target={id:'row_'+cmd.id,server,section:'',beeper:'',cut:false,barAuto:true,entries:[]};b.rows.push(target);}
  for(const row of b.rows){const sections=String(row.section).split(' / ').filter(x=>x&&x!==sec);if(row===target){if(!sections.includes(sec))sections.push(sec);row.section=sections.join(' / ');row.cut=false;}else{row.section=sections.join(' / ');if(!sections.length)row.cut=true;}}
  if(cmd.beeper!==undefined){const value=String(cmd.beeper||'');if(value&&(!/^\d+$/.test(value)||+value<1||+value>20))fail('Beeper must be 1–20.');if(value&&b.rows.some(r=>r.id!==target.id&&r.beeper===value))fail('Beeper '+value+' is assigned to another employee.');target.beeper=value;}
  if(cmd.workShift!==undefined){if(!['AM','PM','Double','Long Shift'].includes(cmd.workShift))fail('Choose AM, PM, Double Shift or Long Shift.');target.workShift=cmd.workShift;}
  if(cmd.longStart!==undefined){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(cmd.longStart))fail('Choose a valid Long Shift start time.');target.longStart=cmd.longStart;}
  if(cmd.cutTime!==undefined)saveCutTime(target,cmd.cutTime,cmd.expectedCutTime);
  if(cmd.lastCut!==undefined)target.lastCut=!!cmd.lastCut;
  if(cmd.closer!==undefined){if(sh!=='PM'||typeof cmd.closer!=='boolean')fail('Closer is a PM shift setting.');if(cmd.closer)for(const row of b.rows)row.closer=false;target.closer=cmd.closer;}
  if(cmd.workTomorrowAM!==undefined){if(sh!=='PM'||typeof cmd.workTomorrowAM!=='boolean')fail('Work tomorrow AM is a PM shift setting.');target.workTomorrowAM=cmd.workTomorrowAM;}
  b.formation=cmd.formation;for(const id of list(form[sec])){if(!s.tables[id])fail('Unknown table '+id);b.assignments[id]=target.id;}break;}
 case 'FORMATION':{
  const form=shiftFormation(b,config,cmd.formation);if(!form)fail('Choose a formation.');
  if(cmd.expectedRows&&JSON.stringify(b.rows.map(r=>[r.id,r.server,r.section,r.cut]))!==JSON.stringify(cmd.expectedRows))fail('Formation changed on another device. Reopen Edit Formation.','CONFLICT');
  const assigned=new Map(),usedTables=new Set();for(const [sec,ids]of Object.entries(form)){const server=canonical(cmd.servers?.[sec]);if(server){let sections=assigned.get(server);if(!sections)assigned.set(server,sections=[]);sections.push(sec);}for(const table of list(ids)){if(!s.tables[table]||usedTables.has(table))fail('Invalid or duplicate table '+table);usedTables.add(table);}}
  const matched=new Set(),next=[];for(const old of b.rows){const sections=assigned.get(canonical(old.server));if(sections&&!matched.has(canonical(old.server))&&old===(b.rows.find(r=>canonical(r.server)===canonical(old.server)&&!r.cut)||b.rows.find(r=>canonical(r.server)===canonical(old.server)))){old.section=sections.join(' / ');old.cut=false;matched.add(canonical(old.server));next.push(old);}else{old.section='';old.cut=true;next.push(old);}}
  for(const [server,sections]of assigned)if(!matched.has(server)){next.push({id:'row_'+cmd.id+'_'+next.length,server,section:sections.join(' / '),beeper:'',cut:false,barAuto:true,entries:[]});matched.add(server);}
  if(cmd.cutTimes!==undefined){
   if(!Array.isArray(cmd.cutTimes))fail('Invalid cut times.');
   const seen=new Set();
   for(const change of cmd.cutTimes){
    const name=canonical(change.server),row=next.find(r=>!r.cut&&canonical(r.server)===name);
    if(!row||seen.has(name))fail('Check the server cut times in this formation.');
    seen.add(name);
    saveCutTime(row,change.time,change.expected);
   }
  }
  if(cmd.pmFlags!==undefined){
   if(sh!=='PM'||!Array.isArray(cmd.pmFlags))fail('Closer settings belong to PM.');
   const flags=new Map();for(const value of cmd.pmFlags){const name=canonical(value.server);if(!assigned.has(name)||typeof value.closer!=='boolean'||typeof value.workTomorrowAM!=='boolean')fail('Invalid PM employee settings.');const previous=flags.get(name);if(previous&&(previous.closer!==value.closer||previous.workTomorrowAM!==value.workTomorrowAM))fail('Use the same PM settings for each section owned by '+name);flags.set(name,value);}
   if([...flags.values()].filter(f=>f.closer).length>1)fail('Choose one PM closer.');
   if([...flags.values()].some(f=>f.closer))for(const row of next)row.closer=false;
   for(const row of next)if(!row.cut&&flags.has(canonical(row.server))){const f=flags.get(canonical(row.server));row.closer=f.closer;row.workTomorrowAM=f.workTomorrowAM;}
  }
  if(!assigned.size)fail('Assign at least one server.');for(const row of next)if(row.cut)delete b.deferredTurns?.[row.id];if(b.formation!==cmd.formation)delete b.addedSections;b.rows=next;b.formation=cmd.formation;b.assignments={};for(const [sec,ids]of Object.entries(form)){const server=canonical(cmd.servers?.[sec]),row=b.rows.find(r=>!r.cut&&canonical(r.server)===server);if(row)for(const table of list(ids))b.assignments[table]=row.id;}
  break;}
 case 'ADD_SECTION':{
  if(!b.formation||cmd.formation!==b.formation)fail('The formation changed. Reopen Add Section.','CONFLICT');
  const sec=String(cmd.section||''),server=canonical(cmd.server),ids=list(cmd.tables);
  const available=openSectionOptions(b,config);
  if(!available.sections.includes(sec))fail('This section is already in use or unavailable. Reopen Add Section.','CONFLICT');
  if(!server||!list(config.servers).includes(server))fail('Choose an arriving server from the staff list.');
  if(b.rows.some(r=>!r.cut&&canonical(r.server).toLowerCase()===server.toLowerCase()))fail('This server already has an active section.','CONFLICT');
  if(!ids.length||new Set(ids).size!==ids.length||!ids.every(id=>available.tables.includes(id)))fail('Choose available tables. The table assignments may have changed.','CONFLICT');
  const queue=rotationRows(b);
  const row={id:'row_'+cmd.id,server,section:sec,beeper:'',cut:false,barAuto:true,entries:[],
   arrivalOffset:Math.max(0,...queue.map(rotationTurns)),arrivalOffsetShown:true,arrivalOrder:s.revision+1};
  if(cmd.cutTime!==undefined)saveCutTime(row,cmd.cutTime);
  b.rows.push(row);
  (b.addedSections||={})[sec]=ids;
  for(const id of ids)b.assignments[id]=row.id;
  break;
 }
 case 'JOIN':{const server=canonical(cmd.server),ids=list(cmd.tables);if(!server||!ids.length)fail('Choose a server and section tables.');if(b.rows.some(r=>canonical(r.server)===server&&!r.cut))fail('This server already has an active row.');const r={id:'row_'+cmd.id,server,section:String(cmd.section||'BREAK'),beeper:'',cut:false,barAuto:true,entries:[]};b.rows.push(r);for(const id of ids){if(!s.tables[id])fail('Unknown table '+id);b.assignments[id]=r.id;}break;}
 case 'SEAT':{if(cmd.recommendation){const expected=cmd.recommendation;if(s.revision!==expected.revision||b.formation!==expected.formation||JSON.stringify(config.formations?.[b.formation]||{})!==expected.formationKey)fail('Floor or rotation changed. Review the updated recommendation.','CONFLICT');if(expected.sectionRulesKey!==undefined&&expected.sectionRulesKey!==JSON.stringify(config.sectionRules||{}))fail('Section rules changed. Review the updated recommendation.','CONFLICT');if(expected.backupFormation&&JSON.stringify(config.formations?.[expected.backupFormation])!==expected.backupFormationKey)fail('Backup formation changed. Review the updated recommendation.','CONFLICT');for(const id of [cmd.table,...list(cmd.secondary)])if(b.assignments[id]!==expected.assignments?.[id]||s.tables[id]?.status!=='ready'||s.tables[id]?.partyId)fail('Table assignment or availability changed. Review the updated recommendation.','CONFLICT');}if(cmd.reservationId&&Object.values(s.parties).some(p=>p.reservationId===cmd.reservationId))fail('This reservation is already seated.','CONFLICT');const r=rowOf(s,sh,cmd.rowId);if(r.cut)fail('This employee is CUT.');const people=countPeople(cmd.people),secondary=list(cmd.secondary);available(s,[cmd.table,...secondary]);checkPartyLimit(b,config,[cmd.table,...secondary],people,r,cmd.recommendation?.backupFormation);const warnings=risk(s,sh,r.id,cmd.at).filter(x=>!list(cmd.confirmedRiskIds).includes(x.id));if(warnings.length)fail('Double-seat / large-party confirmation is required.','GUARD');const p={id:cmd.id,version:1,primary:cmd.table,secondary,people,rowId:r.id,shift:sh,at:cmd.at,...(cmd.reservationId?{reservationId:cmd.reservationId}:{})};rememberPassedTurns(s,sh,r,config,cmd.at);r.entries.push({id:p.id,kind:'party',primary:p.primary,secondary,people,at:cmd.at,...(cmd.reservationId?{reservationId:cmd.reservationId}:{})});autoSkip(r,sh);checkSpace(r);occupy(s,p);break;}
 case 'TABLE_HOLD':{const t=s.tables[cmd.table];if(!t)fail('Choose a table.');if(cmd.reserved){if(t.status!=='ready'||t.partyId)fail('This table is no longer READY.','CONFLICT');s.tables[cmd.table]={status:'reserved',holdShift:sh,heldAt:cmd.at};}else{if(t.status!=='reserved'||t.partyId)fail('This table is no longer RESERVED.','CONFLICT');s.tables[cmd.table]={status:'ready'};}break;}
 case 'STATUS':{if(!['ready','cleaning'].includes(cmd.status))fail('Invalid status.');const p=partyFor(s,cmd.table);if(cmd.expectedPartyId!==undefined&&(p?.id||'')!==cmd.expectedPartyId)fail('Party changed. Repeat the voice command.','CONFLICT');if(p){if(cmd.partyVersion!=null&&(p.version||1)!==cmd.partyVersion)fail('This party was edited on another tablet. Reopen it.','CONFLICT');if(cmd.partyId&&p.id!==cmd.partyId)fail('Party changed.','CONFLICT');release(s,p,cmd.status);}else{if(!s.tables[cmd.table])fail('Choose a table.');s.tables[cmd.table]={status:cmd.status};}break;}
 case 'DELETE':{const p=active(s,cmd),r=rowOf(s,p.shift,p.rowId),index=r.entries.findIndex(e=>e.id===p.id);if(index<0)fail('Party is not on this Board.');s.undo[cmd.id]={id:cmd.id,party:copy(p),entry:copy(r.entries[index]),index:r.entries.filter(e=>e.kind!=='auto').findIndex(e=>e.id===p.id),at:cmd.at,shift:p.shift};r.entries.splice(index,1);autoSkip(r,p.shift);release(s,p);for(const id of Object.keys(s.undo).sort((a,z)=>s.undo[z].at-s.undo[a].at).slice(25))delete s.undo[id];break;}
 case 'CLEAR_ENTRY':{const r=rowOf(s,sh,cmd.rowId),e=r.entries.find(e=>e.id===cmd.entryId&&e.kind==='party');if(!e)fail('This Board entry was already removed.','CONFLICT');const p=s.parties[e.id];if((p?.version||null)!==(cmd.partyVersion||null))fail('Party changed. Reopen Clear.','CONFLICT');const party=p||{id:e.id,primary:e.primary,secondary:list(e.secondary),people:e.people,rowId:r.id,shift:sh,at:e.at};s.undo[cmd.id]={id:cmd.id,party:copy(party),entry:copy(e),index:r.entries.filter(e=>e.kind!=='auto').findIndex(x=>x.id===e.id),boardOnly:!p,at:cmd.at,shift:sh};r.entries=r.entries.filter(x=>x.id!==e.id);autoSkip(r,sh);if(p)release(s,p);for(const id of Object.keys(s.undo).sort((a,z)=>s.undo[z].at-s.undo[a].at).slice(25))delete s.undo[id];break;}
 case 'RESTORE_READY':{const r=rowOf(s,sh,cmd.rowId),e=r.entries.find(e=>e.id===cmd.entryId&&e.kind==='party');if(!e)fail('This Board record is no longer available.','CONFLICT');if(s.parties[e.id])fail('This party is already seated.','CONFLICT');const p={id:e.id,version:cmd.at,primary:e.primary,secondary:list(e.secondary),people:e.people,rowId:r.id,shift:sh,at:e.at,...(e.reservationId?{reservationId:e.reservationId}:{})};available(s,members(p));checkPartyLimit(b,config,members(p),p.people,r);occupy(s,p);break;}
 case 'UNDO':{const u=s.undo[cmd.undoId];if(!u)fail('This Delete was already restored or cleared.','CONFLICT');const p=copy(u.party);p.version=(p.version||1)+1;const r=rowOf(s,p.shift,p.rowId);if(!u.boardOnly){available(s,members(p));checkPartyLimit(s.shifts[p.shift],config,members(p),p.people,r);}if(r.entries.some(e=>e.id===p.id))fail('Party is already on the Board.');const physical=r.entries.filter(e=>e.kind!=='auto');physical.splice(Math.min(u.index,physical.length),0,copy(u.entry));r.entries=physical;autoSkip(r,p.shift);checkSpace(r);if(!u.boardOnly)occupy(s,p);delete s.undo[cmd.undoId];break;}
 case 'PEOPLE':{const p=active(s,cmd),r=rowOf(s,p.shift,p.rowId);const people=countPeople(cmd.people);checkPartyLimit(s.shifts[p.shift],config,members(p),people,r);p.version=(p.version||1)+1;p.people=people;r.entries.find(e=>e.id===p.id).people=p.people;checkSpace(r);break;}
 case 'SECONDARY':{const p=active(s,cmd),ids=list(cmd.secondary);available(s,[p.primary,...ids],p.id);checkPartyLimit(s.shifts[p.shift],config,[p.primary,...ids],p.people,rowOf(s,p.shift,p.rowId));const old=members(p);p.version=(p.version||1)+1;p.secondary=ids;old.filter(id=>!members(p).includes(id)).forEach(id=>s.tables[id]={status:'ready'});occupy(s,p);rowOf(s,p.shift,p.rowId).entries.find(e=>e.id===p.id).secondary=ids;break;}
 case 'MOVE':{const p=active(s,cmd),old=copy(p),r=rowOf(s,p.shift,p.rowId),target=rowOf(s,sh,cmd.rowId||p.rowId);if(target.cut)fail('Target employee is CUT.');const primary=cmd.target||p.primary,secondary=list(cmd.secondary);available(s,[primary,...secondary],p.id);checkPartyLimit(b,config,[primary,...secondary],p.people,target);const oldIndex=r.entries.findIndex(e=>e.id===p.id),entry=r.entries[oldIndex];if(!entry)fail('Party is missing from Board.');r.entries=r.entries.filter(e=>e.id!==p.id);autoSkip(r,p.shift);p.version=(p.version||1)+1;p.primary=primary;p.secondary=secondary;p.rowId=target.id;p.shift=sh;if(target===r)target.entries.splice(Math.min(oldIndex,target.entries.length),0,{...entry,primary,secondary});else target.entries.push({...entry,primary,secondary});autoSkip(target,sh);checkSpace(target);release(s,old);occupy(s,p);break;}
 case 'ASSIGNMENTS':{if(cmd.expectedFormation&&b.formation!==cmd.expectedFormation)fail('Formation changed. Reopen the table map.','CONFLICT');const mapping=copy(cmd.mapping||{});
  for(const [table,id]of Object.entries(mapping)){if(!s.tables[table])fail('Unknown table '+table);rowOf(s,sh,id);}
  for(const ids of Object.values(b.addedSections||{}))for(const table of list(ids)){
   if(b.assignments[table])mapping[table]=b.assignments[table];else delete mapping[table];
  }
  b.assignments=mapping;break;}
 case 'PM_CUT_DECISION':fail('Cut reviews now use saved employee cut times. Refresh the app.', 'CONFLICT');break;
 case 'SCHEDULED_CUT_DECISION':{
  const row=rowOf(s,sh,cmd.rowId);
  if(typeof cmd.cut!=='boolean'||!validCutTime(cmd.cutTime)||row.cut||!row.section||row.server!==cmd.server||row.cutTime!==cmd.cutTime||row.reviewedCutTime===row.cutTime||cmd.at<cutTimeAt(s.day,row.cutTime)-5*60000)
   fail('This cut reminder changed or was already handled.', 'CONFLICT');
  row.reviewedCutTime=row.cutTime;
  if(cmd.cut){row.cut=true;delete b.deferredTurns?.[row.id];}
  break;}
 case 'CUT':{const r=rowOf(s,sh,cmd.rowId);r.cut=!!cmd.cut;if(r.cut){delete b.deferredTurns?.[r.id];if(r.cutTime)r.reviewedCutTime=r.cutTime;}break;}
 case 'BEEPER':{const r=rowOf(s,sh,cmd.rowId),value=String(cmd.beeper||'');if(value&&(!/^\d+$/.test(value)||+value<1||+value>20))fail('Beeper must be 1–20.');if(value&&b.rows.some(x=>x.id!==r.id&&x.beeper===value))fail('Beeper '+value+' is assigned to another employee.');r.beeper=value;break;}
 case 'ROW_EDIT':{const r=rowOf(s,sh,cmd.rowId);if(cmd.server){if(canonical(cmd.server)!==canonical(r.server)){delete b.deferredTurns?.[r.id];delete r.cutTime;delete r.reviewedCutTime;}r.server=canonical(cmd.server);}if(cmd.section!=null)r.section=String(cmd.section);if(cmd.barAuto!=null)r.barAuto=!!cmd.barAuto;autoSkip(r,sh);checkSpace(r);break;}
 case 'SKIP':{const r=rowOf(s,sh,cmd.rowId);if(cmd.entryId){const e=r.entries.find(x=>x.id===cmd.entryId);if(!e||e.kind!=='manual')fail('Only a manual SKIP can be removed.');r.entries=r.entries.filter(x=>x.id!==cmd.entryId);}else{const count=cmd.count===undefined?1:Number(cmd.count);if(!Number.isInteger(count)||count<1||count>60)fail('Enter 1–60 skips.');rememberPassedTurn(s,sh,r,config,cmd.at);for(let i=0;i<count;i++)r.entries.push({id:i?cmd.id+'_'+i:cmd.id,kind:'manual',at:cmd.at});}checkSpace(r);break;}
 case 'BAR_REPAIR':{const r=rowOf(s,sh,cmd.rowId);if(sh!=='PM'||!String(r.section).toUpperCase().includes('BAR'))fail('Choose a PM BAR row.');let count=0,wasDue=false;r.entries=r.entries.filter(e=>{if(e.kind==='auto')return false;if(e.kind==='party'){count++;wasDue=count%2===0;return true;}if(e.kind==='manual'&&wasDue){wasDue=false;return false;}wasDue=false;return true;});r.barAuto=true;autoSkip(r,sh);checkSpace(r);break;}
 case 'CORRECT':{const target=sh==='AM'?'PM':'AM';if(s.shifts[target].rows.some(r=>r.entries.length)||s.shifts[target].rows.length)fail('The target shift is not empty. Clear or review it before correction.');s.shifts[target]=copy(b);s.shifts[sh]=emptyShift();for(const r of s.shifts[target].rows)autoSkip(r,target);Object.values(s.parties).forEach(p=>{if(p.shift===sh)p.shift=target;});Object.values(s.undo).forEach(u=>{if(u.shift===sh){u.shift=target;u.party.shift=target;}});break;}
 case 'CLEAR_SHIFT':{if(!['AM','PM'].includes(cmd.shift))fail('Choose AM or PM.');const ids=new Set(b.rows.flatMap(r=>r.entries.filter(e=>e.kind==='party').flatMap(e=>[e.primary,...list(e.secondary)])));for(const [id,t]of Object.entries(s.tables))if(t.status==='reserved'&&t.holdShift===sh)ids.add(id);for(const p of Object.values(s.parties))if(p.shift===sh){members(p).forEach(id=>ids.add(id));release(s,p);}for(const id of ids)if(s.tables[id]&&!s.tables[id].partyId&&!(s.tables[id].status==='reserved'&&s.tables[id].holdShift!==sh))s.tables[id]={status:'ready'};for(const [id,u]of Object.entries(s.undo))if((u.shift||u.party?.shift)===sh)delete s.undo[id];s.shifts[sh]=emptyShift();break;}
 case 'CLEAR':{const day=s.day;s=initial(config,cmd.at);s.day=day;s.lastResetAt=cmd.at;break;}
 default:fail('Unknown operation '+cmd.type);
 }
 }
 const newBeepers=beeperRows(s);for(const key of new Set([...Object.keys(oldBeepers),...Object.keys(newBeepers)])){const old=oldBeepers[key],current=newBeepers[key];if(old&&current&&old.beeper===current.beeper&&old.server===current.server&&old.day===current.day)continue;if(old)history[cmd.id+'_removed_'+key]={...old,at:cmd.at,event:'REMOVED',reason:cmd.type};if(current)history[cmd.id+'_assigned_'+key]={...current,at:cmd.at,event:'ASSIGNED',reason:cmd.type};}
 s.beeperHistory=retainBeeperHistory(history,now);s.beeperHistoryStartedAt=historyStartedAt;
 s.tableHistory=Object.fromEntries(Object.entries(tableLog).filter(([,e])=>e.day===s.day));
 const tableChanges=tableHistoryChanges(tableBefore,s,cmd,tableRestore);if(tableChanges.length)s.tableHistory[cmd.id]={day:s.day,at:cmd.at,sequence:Object.keys(s.tableHistory).length+1,changes:tableChanges};
 s.revision=(s.revision||0)+1;s.updatedAt=cmd.at;s.receipts[cmd.id]={type:cmd.type,at:cmd.at};for(const id of Object.keys(s.receipts).sort((a,z)=>s.receipts[z].at-s.receipts[a].at).slice(80))delete s.receipts[id];for(const board of Object.values(s.shifts))syncSectionAssignments(board,config);syncServerScreen(s,cmd);return validate(s);
}
return {shiftFormation,openSectionOptions,startingTurns,rotationTurns,rowHasSection,sharedSections,fixedSection,tableRows,tableSectionLabel,syncSectionAssignments,sectionFor,isBarSection,partyLimit,checkPartyLimit,tableHistoryRows,reservationUndoExpiry,reservationUndoAvailable,reservationUndoExpired,retainBeeperHistory,cutTimeLabel,cutTimeAt,scheduledCuts,placeSectionLabels,copy,list,canonical,staffName,uid,dayAt,reservationTime,reservationDue,initial,normalize,rowOf,autoSkip,slots,sectionOrder,rotationRows,boardTableCount,boardRotationRows,nextBoardRow,recoveryMs,latestSeating,deferredTurn,partyFor,members,risk,reduce,validate};
});


