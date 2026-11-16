(function(root){'use strict';
class PartyDialog{
 constructor(options){this.options=options;this.people=null;this.key='';this.saving=false;this.error='';}
 open(){
  this.people=null;this.key='';this.error='';
  this.options.openDialog('Party Recommendations',`<form id="partySearchForm"><label for="partyPeople">How many people?</label><div class="party-search-input"><input id="partyPeople" type="number" inputmode="numeric" min="1" max="120" step="1" value="10" required><button type="submit" class="primary">FIND TABLES</button></div></form><div id="partyResults" aria-live="polite"><p class="helper">Enter the party size to find READY tables for the current shift and formation.</p></div>`);
  document.getElementById('partySearchForm').onsubmit=e=>{e.preventDefault();if(this.saving)return;this.error='';this.people=Number(document.getElementById('partyPeople').value);this.crossSection=false;this.key='';this.refresh();};
  document.getElementById('partyPeople').oninput=()=>{this.people=null;document.getElementById('partyResults').innerHTML='<p class="helper">Press FIND TABLES to update recommendations.</p>';};
  document.getElementById('partyPeople').focus();document.getElementById('partyPeople').select();
 }
 refresh(){
  const target=document.getElementById('partyResults');if(!target||!document.getElementById('modal').open||this.people===null||this.saving)return;
  const o=this.options,context=o.context(),esc=o.escape;
  const report=context.live?root.PartyRecommendations.recommend({...context,people:this.people,allowCrossSection:this.crossSection}):{candidates:[],reason:'Wait until LIVE to check current table availability.',crossSectionCount:0};
  const key=JSON.stringify([report,this.people,context.shift,context.formationLabel,context.state?.revision,JSON.stringify(context.config?.formations),this.crossSection,this.error]);if(this.key===key)return;this.key=key;
  const cards=report.candidates.map((c,i)=>`<article class="party-option ${i===0?'party-best':''}" data-party-tables="${esc(c.tables.join('|'))}"><div class="party-option-heading"><span>${i===0?'TOP MATCH':'OPTION '+(i+1)}</span><strong>${esc(c.tables.join(' + '))}</strong><b>${c.min===c.max?c.max:c.min+'–'+c.max} seats</b><span class="party-seating-type">${esc(c.seatingType)}</span></div><p class="party-server">${esc(c.server)} · <b>BEEPER ${esc(c.beeper)}</b></p><p>Section ${esc(c.section)} · Rotation #${c.rotation} · ${c.turns} turns</p><div class="party-load"><span><b>${c.activeGuests}</b> guests now</span><span><b>${c.activeTables}</b> tables now</span><span><b>${c.afterGuests}</b> guests after</span></div>${c.recentParties?`<p class="party-caution">Seated ${c.recentGuests} guests in the last 5 minutes.</p>`:''}${c.crossSection?`<p class="party-caution"><strong>CROSS-SECTION · Coordinate before seating.</strong><br>${esc(c.servers.map(s=>s.name+' (Section '+s.section+', Beeper '+s.beeper+')').join(' + '))}<br>Suggested lead: ${esc(c.server)}. ACCEPT assigns the entire party to this lead server.</p>`:''}<button type="button" class="primary party-accept" data-party-accept="${i}" aria-label="Accept ${esc(c.tables.join(' plus '))}, ${this.people} guests, ${esc(c.server)}">ACCEPT</button></article>`).join('');
  target.innerHTML=`<div class="party-results-header"><h3>${this.people} guests · ${esc(context.shift)} · ${esc(context.formationLabel||'No formation')}</h3><button id="partyRefresh" type="button">REFRESH</button></div><p class="helper">${report.candidates.length} option${report.candidates.length===1?'':'s'} · ${this.people<5?'1–4 guests: follow Board rotation, then a fitting READY booth before a regular table.':'5+ guests: nearest turn count, then L/R → C → A/B → E → H/M and server workload.'}</p>${this.error?`<p class="party-error" role="alert">${esc(this.error)}</p>`:''}${cards||`<p class="party-empty">${esc(report.reason)}</p>`}${report.crossSectionCount?`<button id="partyCrossSection" type="button" class="full">${this.crossSection?'HIDE CROSS-SECTION OPTIONS':'SHOW '+report.crossSectionCount+' CROSS-SECTION OPTION'+(report.crossSectionCount===1?'':'S')}</button>`:''}<p class="helper">ACCEPT seats this party on the listed table(s), records it on Board and updates Floor. Review the server and current workload before accepting.</p>`;
  document.getElementById('partyRefresh').onclick=()=>{this.key='';this.refresh();};
  target.querySelectorAll('[data-party-accept]').forEach(button=>button.onclick=()=>this.accept(report.candidates[Number(button.dataset.partyAccept)],context));
  const cross=document.getElementById('partyCrossSection');if(cross)cross.onclick=()=>{this.crossSection=!this.crossSection;this.key='';this.refresh();};
 }
 async accept(candidate,context){
  if(this.saving||!document.getElementById('modal').open||!document.getElementById('partyResults'))return;
  this.saving=true;this.error='';
  document.getElementById('modalBody').querySelectorAll('button,input').forEach(el=>el.disabled=true);
  try{await this.options.accept(candidate,this.people,context);}catch(error){this.error=error.message||'Seating was not confirmed. Please check the Floor.';}
  finally{this.saving=false;this.key='';document.getElementById('partySearchForm')?.querySelectorAll('button,input').forEach(el=>el.disabled=false);this.refresh();}
 }
}
root.PartyDialog=PartyDialog;
})(globalThis);
