/* Bihar Political Map — interactive district intelligence. */
'use strict';
const PM_PARTY_COLORS={bjp:'#ff6b2b',jdu:'#22c55e',rjd:'#e63946',inc:'#4a9eff'},PM_RISK_COLORS={critical:'#e63946',developing:'#ff9f43',watch:'#f5c518',clear:'#26de81'};
const PM_FALLBACK_DISTRICTS=['Araria','Arwal','Aurangabad','Banka','Begusarai','Bhagalpur','Bhojpur','Buxar','Darbhanga','East Champaran','Gaya','Gopalganj','Jamui','Jehanabad','Kaimur','Katihar','Khagaria','Kishanganj','Lakhisarai','Madhepura','Madhubani','Munger','Muzaffarpur','Nalanda','Nawada','Patna','Purnia','Rohtas','Saharsa','Samastipur','Saran','Sheikhpura','Sheohar','Sitamarhi','Siwan','Supaul','Vaishali','West Champaran'];
let pmMap=null,pmPartyChart=null,pmClient=null,pmChannel=null,pmGeoJson=null,pmGeoLayer=null,pmFeatureLayers={},pmControlAbort=null,pmMapRenderId=0;
let pmMode='news',pmParty='all',pmRisk='all',pmSearch='',pmSelected='Patna',pmNews=[],pmLive={},pmLiveAt=null,pmLiveTotal=0;
const PMP_NEWS_PAGE_SIZE=5,PMP_DISTRICTS=[...new Set([...(typeof DISTRICTS_DATA!=='undefined'?DISTRICTS_DATA.map(d=>d.name):[]),...PM_FALLBACK_DISTRICTS])].sort((a,b)=>a.localeCompare(b));
let isPmNewsState={district:'all',items:[],total:0,loading:false,requestId:0};
const pmSafe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const pmTime=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))return'Recently';const s=Math.round((d-Date.now())/1000),[u,z]=Math.abs(s)<3600?['minute',60]:Math.abs(s)<86400?['hour',3600]:['day',86400];return new Intl.RelativeTimeFormat('en',{numeric:'auto'}).format(Math.round(s/z),u)};
const pmRows=()=>{const rows=new Map();(typeof DISTRICTS_DATA==='undefined'?[]:DISTRICTS_DATA).forEach(r=>rows.set(r.name,{...r}));return rows.size?[...rows.values()]:PM_FALLBACK_DISTRICTS.map((name,index)=>({name,seats:0,bjp:0,jdu:0,rjd:0,inc:0,totalVotes:0,activity:'unknown',fallback:index}))};
const pmRow=n=>pmRows().find(r=>r.name===n);
function pmLevel(item){const value=String([item.severity,item.priority,item.status,item.risk_level].find(Boolean)||'').toLowerCase();if(['critical','high'].includes(value))return'critical';if(['developing','medium'].includes(value))return'developing';if(['watch','low'].includes(value))return'watch';const body=`${item.title||''} ${item.content||''}`.toLowerCase();if(/violence|attack|death|killed|arrest|critical|riot|flood|security alert/.test(body))return'critical';if(/election|rally|protest|dharna|campaign|nomination|scam|corruption/.test(body))return'developing';return'watch'}
function pmLiveLookup(name){const k=String(name||'').toLowerCase();return pmLive[k]||null}
async function pmLoadLiveStats(){try{const r=await fetch('/api/district-stats',{cache:'no-store'});const j=await r.json();const map={};(j.districts||[]).forEach(d=>{[d.en,d.hi,d.slug,d.feed].filter(Boolean).forEach(k=>{map[String(k).toLowerCase()]=d})});pmLive=map;pmLiveAt=j.generated_at||null;pmLiveTotal=(j.districts||[]).reduce((a,d)=>a+(d.feed?(d.articles||0):0),0);const st=document.getElementById('pm-live-status');if(st)st.textContent='LIVE · '+pmLiveTotal+' news · '+new Date(pmLiveAt||Date.now()).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});pmRefresh()}catch(e){console.warn('[PM] live stats failed:',e.message)}}
function pmMetric(name){
  /* Live data (district_news_* + district_summary_* — /api/district-stats) */
  const live=pmLiveLookup(name);
  if(live){
    const rc=live.risk_counts||{critical:0,high:0,medium:0,low:0};
    return {list:(live.top_titles||[]).map(t=>({title:t})),critical:rc.critical||0,developing:(rc.high||0)+(rc.medium||0),watch:rc.low||0,articles:live.articles||0,analysed:live.analysed||0,riskLevel:String(live.risk_level||'clear').toLowerCase(),live:true};
  }
  return pmMetricLegacy(name);
}
function pmMetricLegacy(name){const needle=name.toLowerCase(),list=pmNews.filter(i=>[i.district,i.location,i.author,i.title,i.content].filter(Boolean).join(' ').toLowerCase().includes(needle));return{list,critical:list.filter(i=>pmLevel(i)==='critical').length,developing:list.filter(i=>pmLevel(i)==='developing').length,watch:list.filter(i=>pmLevel(i)==='watch').length}}
const pmRiskLevel=m=>m.live?(m.riskLevel==='high'||m.riskLevel==='medium'?'developing':(m.riskLevel==='low'?'watch':(m.riskLevel||'clear'))):(m.critical?'critical':m.developing?'developing':m.watch?'watch':'clear');
const pmDominant=r=>Object.entries({bjp:r.bjp,jdu:r.jdu,rjd:r.rjd,inc:r.inc}).sort((a,b)=>b[1]-a[1])[0][0];
const pmColor=(r,m)=>pmMode==='party'?PM_PARTY_COLORS[pmDominant(r)]:PM_RISK_COLORS[pmRiskLevel(m)];
const pmMatches=r=>(!pmSearch||r.name.toLowerCase().includes(pmSearch))&&(pmRisk==='all'||pmRiskLevel(pmMetric(r.name))===pmRisk)&&(pmMode!=='party'||pmParty==='all'||pmDominant(r)===pmParty);
const pmNumber=v=>new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(v||0);

function initPoliticalMap(){if(pmControlAbort)pmControlAbort.abort();pmControlAbort=new AbortController();pmBuildControls(pmControlAbort.signal);pmBuildNewsFilters(pmControlAbort.signal);pmRenderPartyChart();pmRenderMap();pmLoadLiveStats();pmLoadNews();pmBuildDistrictButtons();pmOrderDistrictButtonsByVolume();loadPmDistrictNews('all')}
function pmBuildControls(signal){const select=document.getElementById('pm-district-select');if(!select)return;select.innerHTML=pmRows().sort((a,b)=>a.name.localeCompare(b.name)).map(r=>`<option value="${pmSafe(r.name)}">${pmSafe(r.name)}</option>`).join('');select.value=pmSelected;select.addEventListener('change',e=>pmSelect(e.target.value,true),{signal});const search=document.getElementById('pm-district-search');search?.addEventListener('input',e=>{pmSearch=e.target.value.trim().toLowerCase();pmRefresh()},{signal});document.querySelectorAll('[data-pm-mode]').forEach(b=>b.addEventListener('click',()=>{pmMode=b.dataset.pmMode;pmSetActive('[data-pm-mode]',b);pmRefresh()},{signal}));document.querySelectorAll('[data-pm-party]').forEach(b=>b.addEventListener('click',()=>{pmParty=b.dataset.pmParty;pmSetActive('[data-pm-party]',b);pmRefresh()},{signal}));document.querySelectorAll('[data-pm-risk]').forEach(b=>b.addEventListener('click',()=>{pmRisk=b.dataset.pmRisk;pmSetActive('[data-pm-risk]',b);pmRefresh()},{signal}));document.getElementById('pm-reset-map')?.addEventListener('click',pmReset,{signal})}
function pmSetActive(q,active){document.querySelectorAll(q).forEach(i=>i.classList.toggle('active',i===active))}
function pmReset(){pmSearch='';pmRisk='all';pmParty='all';const s=document.getElementById('pm-district-search');if(s)s.value='';pmSetActive('[data-pm-risk]',document.querySelector('[data-pm-risk="all"]'));pmSetActive('[data-pm-party]',document.querySelector('[data-pm-party="all"]'));if(pmMap&&pmGeoLayer)pmMap.fitBounds(pmGeoLayer.getBounds(),{padding:[18,18]});pmRefresh()}
async function pmGetGeoJson(){if(pmGeoJson)return pmGeoJson;const res=await fetch('assets/data/bihar-districts.geojson');if(!res.ok)throw new Error('District boundary asset could not be loaded');pmGeoJson=await res.json();return pmGeoJson}
async function pmRenderMap(){const el=document.getElementById('bihar-map');if(!el)return;const id=++pmMapRenderId;if(typeof L==='undefined'){pmRenderFallback(el);return}try{const geo=await pmGetGeoJson();if(id!==pmMapRenderId||!document.getElementById('bihar-map'))return;if(pmMap)pmMap.remove();pmFeatureLayers={};el.innerHTML='';pmMap=L.map(el,{zoomControl:true,attributionControl:false,scrollWheelZoom:true,zoomSnap:.25});pmGeoLayer=L.geoJSON(geo,{interactive:true,style:f=>pmPolygonStyle(f.properties.district),onEachFeature:pmBindDistrict}).addTo(pmMap);pmMap.fitBounds(pmGeoLayer.getBounds(),{padding:[18,18]});setTimeout(()=>pmMap?.invalidateSize(),120);pmRenderDetail(pmRow(pmSelected)||pmRows()[0])}catch(e){pmRenderFallback(el)}}
function pmPolygonStyle(name){const r=pmRow(name);if(!r)return{color:'#526078',weight:1,fillOpacity:.18};const visible=pmMatches(r);return{color:name===pmSelected?'#fff':'rgba(232,237,248,.72)',weight:name===pmSelected?2.7:1.05,fillColor:pmColor(r,pmMetric(name)),fillOpacity:visible?(name===pmSelected ? .92 : .76):.07,opacity:visible?1:.22}}
function pmBindDistrict(feature,layer){const name=feature.properties.district,r=pmRow(name);if(!r)return;pmFeatureLayers[name]=layer;layer.bindTooltip(pmTooltip(r),{sticky:true,className:'pm-map-tooltip',direction:'top',offset:[0,-5]});const preview=e=>{if(!pmMatches(r))return;e.target.bringToFront();e.target.setStyle({weight:3,color:'#fff',fillOpacity:.96});pmRenderDetail(r)};layer.on({mouseover:preview,mousemove:preview,mouseout:e=>e.target.setStyle(pmPolygonStyle(name)),click:()=>pmSelect(name,true)})}
function pmTooltip(r){const m=pmMetric(r.name),risk=pmRiskLevel(m);return`<strong>${pmSafe(r.name)}</strong><br><span>${m.list.length} updates · <b style="color:${PM_RISK_COLORS[risk]}">${risk.toUpperCase()}</b></span><br><span>🔴 ${m.critical} · 🟠 ${m.developing} · 🟡 ${m.watch}</span><br><span>${r.seats} seats · ${pmDominant(r).toUpperCase()} lead</span>`}
function pmRenderFallback(el){el.innerHTML=`<div class="pm-fallback">${pmRows().filter(pmMatches).map(r=>{const m=pmMetric(r.name);return`<button style="border-left-color:${pmColor(r,m)}" onclick="pmSelect('${pmSafe(r.name)}',false)">${pmSafe(r.name)}<small>${m.list.length} updates · ${pmRiskLevel(m)}</small></button>`}).join('')||'<p class="pm-empty">No district matches the current filter.</p>'}</div>`}
function pmSelect(name,pan){const r=pmRow(name)||pmRows()[0];if(!r)return;pmSelected=r.name;const s=document.getElementById('pm-district-select');if(s)s.value=r.name;if(pan&&pmMap&&pmFeatureLayers[r.name])pmMap.fitBounds(pmFeatureLayers[r.name].getBounds(),{padding:[42,42],maxZoom:9});pmRefreshMapStyles();pmRenderDetail(r)}
function pmRefreshMapStyles(){if(pmGeoLayer)pmGeoLayer.eachLayer(l=>{const d=l.feature?.properties?.district;if(d)l.setStyle(pmPolygonStyle(d))});else{const el=document.getElementById('bihar-map');if(el&&typeof L==='undefined')pmRenderFallback(el)}}
function pmRenderDetail(r){const el=document.getElementById('pm-district-detail');if(!el||!r)return;const m=pmMetric(r.name),risk=pmRiskLevel(m),d=pmDominant(r),stories=m.list.slice(0,4),total=m.list.length||1,hotspot=m.critical?`${m.critical} critical signal${m.critical>1?'s':''} need review`:'No critical hotspot recorded',issues=m.developing?`${m.developing} emerging issue${m.developing>1?'s':''} in live feed`:'Awaiting tagged issue reports',activity=m.list.length?`${m.list.length} field / media update${m.list.length>1?'s':''} captured`:'No organisational update submitted',event=m.watch?`${m.watch} watch signal${m.watch>1?'s':''} to monitor`:'No upcoming event submitted';el.innerHTML=`<div class="pm-detail-heading"><div><span class="pm-kicker">DISTRICT / CONSTITUENCY VIEW</span><strong>${pmSafe(r.name)}</strong></div><span class="pm-risk ${risk}">${risk}</span></div><div class="pm-summary"><div><span>Live updates</span><strong>${m.list.length}</strong></div><div><span>Critical</span><strong style="color:var(--red);">${m.critical}</strong></div><div><span>Seats</span><strong>${r.seats||'—'}</strong></div></div><div class="pm-operating-grid"><div><span>🔥 Hotspots</span><b>${hotspot}</b></div><div><span>↗ Emerging issues</span><b>${issues}</b></div><div><span>👥 Organisational activity</span><b>${activity}</b></div><div><span>📅 Upcoming events</span><b>${event}</b></div></div><div class="pm-signal"><div><span>Alert distribution</span><b>${m.list.length?'Live feed':'No current feed'}</b></div><div class="pm-signal-track"><i style="width:${m.critical/total*100}%;background:#e63946"></i><i style="width:${m.developing/total*100}%;background:#ff9f43"></i><i style="width:${m.watch/total*100}%;background:#f5c518"></i></div></div><div class="pm-context"><span>Estimated electorate</span><b>${r.totalVotes?pmNumber(r.totalVotes):'Not loaded'}</b><span>Seat context</span><b>${r.seats?`${d.toUpperCase()} lead · BJP ${r.bjp} · JDU ${r.jdu} · RJD ${r.rjd} · INC ${r.inc}`:'District data loading'}</b></div><div class="pm-detail-actions"><button onclick="pmSelect('${pmSafe(r.name)}',true)">Focus on map</button><button onclick="document.getElementById('pm-district-tbody')?.closest('section')?.scrollIntoView({behavior:'smooth',block:'start'})">View district data</button></div><div class="pm-headlines">${stories.length?stories.map(i=>`<div class="pm-headline">${pmSafe(i.title||'Untitled update')}<small>${pmTime(i.created_at)}</small></div>`).join(''):'<div class="pm-headline pm-no-headline">Hover or click any district to change this operational view. Connect tagged district reports to populate live signals.</div>'}</div>`}
function pmRenderPartyChart(){const canvas=document.getElementById('map-party-chart');if(!canvas||typeof Chart==='undefined')return;if(pmPartyChart)pmPartyChart.destroy();const t={BJP:0,JDU:0,RJD:0,INC:0};pmRows().forEach(r=>{t.BJP+=r.bjp;t.JDU+=r.jdu;t.RJD+=r.rjd;t.INC+=r.inc});pmPartyChart=new Chart(canvas,{type:'doughnut',data:{labels:Object.keys(t),datasets:[{data:Object.values(t),backgroundColor:Object.values(PM_PARTY_COLORS),borderWidth:0,hoverOffset:5}]},options:{responsive:true,cutout:'66%',plugins:{legend:{position:'bottom',labels:{color:'#a8b4cc',font:{size:10},padding:10,usePointStyle:true}}}}})}
function pmRenderTable(){const body=document.getElementById('pm-district-tbody');if(!body)return;const rows=pmRows().filter(pmMatches).sort((a,b)=>pmMetric(b.name).list.length-pmMetric(a.name).list.length||a.name.localeCompare(b.name));body.innerHTML=rows.map(r=>{const m=pmMetric(r.name);return`<tr class="${r.name===pmSelected?'pm-row-selected':''}" onclick="pmSelect('${pmSafe(r.name)}',true)"><td><b>${pmSafe(r.name)}</b><small class="pm-table-signal ${pmRiskLevel(m)}">${pmRiskLevel(m)}</small></td><td>${m.live?(m.articles||0):m.list.length}</td><td style="color:var(--red);font-weight:700;">${m.critical}</td><td style="color:#ff9f43;font-weight:700;">${m.developing}</td><td style="color:var(--gold);font-weight:700;">${m.watch}</td><td style="color:var(--bjp-color);">${r.bjp}</td><td style="color:var(--jdu-color);">${r.jdu}</td><td style="color:var(--rjd-color);">${r.rjd}</td><td>${r.seats}</td></tr>`}).join('')||'<tr><td colspan="9" class="pm-empty">No district matches the current filter.</td></tr>'}
function pmVisibleCount(){const e=document.getElementById('pm-visible-count');if(e)e.textContent=`${pmRows().filter(pmMatches).length} of ${pmRows().length} districts visible`}
function pmRenderStats(){const rows=pmRows(),ms=rows.map(r=>pmMetric(r.name)),set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};set('pm-district-count',rows.length);set('pm-news-total',pmLiveTotal||pmNews.length);set('pm-critical-districts',ms.filter(m=>m.critical>0).length);set('pm-watch-districts',ms.filter(m=>m.watch>0&&m.critical===0).length);pmVisibleCount()}
function pmRefresh(){pmRenderStats();pmRenderTable();pmRefreshMapStyles();pmRenderDetail(pmRow(pmSelected)||pmRows()[0])}
async function pmLoadNews(){const status=document.getElementById('pm-live-status');if(!window.supabase||!window.BIHAR_SUPABASE_URL||!window.BIHAR_SUPABASE_ANON_KEY){if(status)status.textContent='SEAT CONTEXT ONLY';pmRefresh();return}if(pmChannel&&pmClient)pmClient.removeChannel(pmChannel);pmClient=window.supabase.createClient(window.BIHAR_SUPABASE_URL,window.BIHAR_SUPABASE_ANON_KEY);const {data,error}=await pmClient.from('NewsDashboard').select('*').order('created_at',{ascending:false}).limit(500);if(error){if(status)status.textContent='LIVE FEED UNAVAILABLE';pmRefresh();return}pmNews=data||[];pmRefresh();pmChannel=pmClient.channel('bihar-map-live').on('postgres_changes',{event:'INSERT',schema:'public',table:'NewsDashboard'},e=>{if(pmNews.some(i=>i.id===e.new.id))return;pmNews=[e.new,...pmNews];pmRefresh()}).subscribe()}
window.pmSelect=pmSelect;

// ── District News Section (Live Hindustan feeds) ────────────────────────
function pmBuildNewsFilters(signal){const sel=document.getElementById('pm-news-district-select');if(!sel||sel.options.length>1)return;sel.innerHTML='<option value="all">All Districts</option>'+(PMP_DISTRICTS.map(d=>'<option value="'+pmSafe(d)+'">'+pmSafe(d)+'</option>').join('')||'');sel.addEventListener('change',e=>{loadPmDistrictNews(e.target.value)},signal);const kwEl=document.getElementById('pm-keyword-search');let kwTimeout=null;kwEl.addEventListener('input',()=>{if(kwTimeout)clearTimeout(kwTimeout);kwTimeout=setTimeout(()=>{loadPmDistrictNews(isPmNewsState.district)},300)})}

function loadPmDistrictNews(district,append){const target=(district||'all').toLowerCase(),id=++isPmNewsState.requestId;if(!append||isPmNewsState.district!==target){isPmNewsState.district=target;isPmNewsState.items=[];isPmNewsState.total=0}if(append&&isPmNewsState.loading)return;isPmNewsState.loading=true;const listEl=document.getElementById('pm-district-news-list'),titleEl=document.getElementById('pm-district-news-title');if(titleEl)titleEl.textContent=district==='all'||district==='all'?'📰 Bihar State News':'📰 '+district.charAt(0).toUpperCase()+district.slice(1)+' — District News';if(!append&&listEl)listEl.innerHTML='<div class="empty-state" style="padding:1rem;"><div class="spinner"></div><p class="empty-state-text">Loading district news…</p></div>';const offset=append?isPmNewsState.items.length:0,kwEl2=document.getElementById('pm-keyword-search'),keyword=(kwEl2?.value||'').trim();let urlParams=new URLSearchParams({district:target,limit:PMP_NEWS_PAGE_SIZE,offset:offset});if(keyword&&keyword.length>=2)urlParams.append('keyword',keyword);fetch('/api/district-news?'+urlParams.toString(),{cache:'no-store'}).then(r=>r.json()).then(payload=>{if(id!==isPmNewsState.requestId)return;if(payload.error)throw new Error(payload.error);isPmNewsState.items=append?[...isPmNewsState.items,...(payload.items||[])]:payload.items||[];isPmNewsState.total=payload.total??isPmNewsState.items.length;renderPmDistrictNews()}).catch(err=>{if(id===isPmNewsState.requestId){console.error('[PM] district news fetch failed:',err);if(listEl&&!isPmNewsState.items.length)listEl.innerHTML='<div class="empty-state" style="padding:1rem;"><p class="empty-state-text">District news unavailable right now.</p></div>'}}).finally(()=>{if(id===isPmNewsState.requestId)isPmNewsState.loading=false})}

function renderPmDistrictNews(){const listEl=document.getElementById('pm-district-news-list'),countEl=document.getElementById('pm-district-news-count');if(!listEl)return;const{items,total,district}=isPmNewsState;if(countEl){countEl.textContent=items.length?(items.length+'/'+total):'';countEl.style.display=items.length?'inline-flex':'none'}if(!items.length){listEl.innerHTML='<div class="empty-state" style="padding:1rem;"><div class="empty-state-icon">📭</div><p class="empty-state-text">No district news saved yet.</p><p style="font-size:.72rem;color:var(--text-muted);margin-top:.3rem;">District News Daily pipeline isi district ki apni table me RSS news bharti hai (00:00 &amp; 12:00 IST) — pehla cycle chalne par yahan headlines dikhengi.</p></div>';return};const cards=items.map((item,i)=>{const dt=item.published_at?new Date(item.published_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:true}):'';return'<div class="card card-shine" style="border-left:3px solid var(--blue);padding:.7rem .95rem;animation:slideInUp .3s ease both;animation-delay:'+Math.min(i*.03,.3)+'s;"><div style="font-size:.83rem;font-weight:600;color:var(--text-primary);line-height:1.42;margin-bottom:.3rem;"><a href="'+pmSafe(item.url)+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;" onmouseover="this.style.color=\'var(--blue)\'" onmouseout="this.style.color=\'inherit\'">'+pmSafe(item.title)+'</a></div><div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;"><span class="tag" style="font-size:.62rem;">📍 '+pmSafe(item.district)+'</span><span class="tag tag-blue" style="font-size:.62rem;">📡 '+pmSafe(item.source||'News')+'</span>'+(dt?'<span style="font-size:.66rem;color:var(--text-muted);">🕐 '+pmSafe(dt)+'</span>':'<a class="btn btn-ghost btn-sm" href="'+pmSafe(item.url)+'" target="_blank" rel="noopener noreferrer" style="font-size:.63rem;padding:.12rem .4rem;margin-left:auto;">Read ↗</a>')+'</div></div>';}).join('');const remaining=Math.max(total-items.length,0),moreBtn=remaining>0?'<button class="btn btn-ghost" onclick="loadPmDistrictNews(\'"+pmSafe(district)+"\',true)" style="width:100%;margin-top:.5rem;padding:.55rem .9rem;font-size:.72rem;font-weight:700;letter-spacing:.02em;">📰 Read '+Math.min(PMP_NEWS_PAGE_SIZE,remaining)+' More News ↓<span style="font-weight:500;color:var(--text-muted);">('+remaining+' remaining)</span></button>':'';listEl.innerHTML=cards+moreBtn}
window.loadPmDistrictNews=loadPmDistrictNews;

/* ── District buttons (same 36-district list as the War Room) ─────────────── */
const PM_DISTRICT_BUTTONS=[['पटना','Patna','patna'],['भागलपुर','Bhagalpur','bhagalpur'],['मुजफ्फरपुर','Muzaffarpur','muzaffarpur'],['आरा','Bhojpur','ara'],['बेगूसराय','Begusarai','begusarai'],['बिहार शरीफ','Biharsharif','biharsharif'],['बक्सर','Buxar','buxar'],['छपरा','Saran','chapra'],['गोपालगंज','Gopalganj','gopalganj'],['हाजीपुर','Vaishali','hajipur'],['जहानाबाद','Jehanabad','jahanabad'],['सिवान','Siwan','siwan'],['गया','Gaya','gaya'],['औरंगाबाद','Aurangabad','aurangabad'],['भभुआ','Kaimur','bhabua'],['नवादा','Nawada','nawada'],['सासाराम','Rohtas','sasaram'],['बांका','Banka','banka'],['अररिया','Araria','araria'],['कटिहार','Katihar','katihar'],['खगड़िया','Khagaria','khagaria'],['किशनगंज','Kishanganj','kishanganj'],['मधेपुरा','Madhepura','madhepura'],['मुंगेर','Munger','munger'],['पूर्णिया','Purnia','purnia'],['सहरसा','Saharsa','saharsa'],['लखीसराय','Lakhisarai','lakhisarai'],['जमुई','Jamui','jamui'],['सुपौल','Supaul','supaul'],['दरभंगा','Darbhanga','darbhanga'],['मधुबनी','Madhubani','madhubani'],['बगहा','West Champaran','bagaha'],['बेतिया','West Champaran','bettiah'],['मोतिहारी','East Champaran','motihari'],['समस्तीपुर','Samastipur','samastipur'],['सीतामढ़ी','Sitamarhi','sitamarhi']];
const PM_DISTRICT_LABELS=(()=>{const m={};PM_DISTRICT_BUTTONS.forEach(([hi,en,slug])=>{m[hi]=en;m[en]=en;m[slug]=en});return m})();
function pmBuildDistrictButtons(){const host=document.getElementById('pm-district-btn-grid');if(!host||host.dataset.built)return;host.dataset.built='1';host.innerHTML=PM_DISTRICT_BUTTONS.map(([hi,en,slug])=>'<button type="button" class="btn btn-ghost btn-sm pm-district-btn" data-pm-district="'+pmSafe(hi)+'" data-pm-en="'+pmSafe(en)+'" data-pm-slug="'+pmSafe(slug)+'">'+pmSafe(hi)+'</button>').join('')+'<button type="button" class="btn btn-ghost btn-sm pm-district-btn" data-pm-district="all" data-pm-en="all" data-pm-slug="all">बिहार (All)</button>';host.addEventListener('click',(e)=>{const btn=e.target.closest('[data-pm-district]');if(btn)pmLoadDistrictButton(btn)})}
function pmLoadDistrictButton(btn){const slug=btn.dataset.pmSlug,hi=btn.dataset.pmDistrict,en=btn.dataset.pmEn;
  document.querySelectorAll('.pm-district-btn').forEach(b=>b.classList.toggle('active',b===btn));
  const sel=document.getElementById('pm-news-district-select');
  if(sel){if(slug==='all'){sel.value='all'}else{const opt=[...sel.options].find(o=>o.value===en);if(opt)sel.value=en}}
  loadPmDistrictNews(hi==='all'?'all':hi);
  const t=document.getElementById('pm-district-news-title');
  if(t)t.textContent=hi==='all'?'📰 Bihar — All Districts (Live RSS)':'📰 '+en+' ('+hi+') — Live RSS News';
  const list=document.getElementById('pm-district-news-list');
  if(list)list.closest('section')?.scrollIntoView({behavior:'smooth',block:'start'})}
window.pmBuildDistrictButtons=pmBuildDistrictButtons;
window.pmLoadDistrictButton=pmLoadDistrictButton;

/* ── District button styling tiers (news volume ke hisab se) ─────────────── */
function pmTierFor(n) { return n >= 20 ? 'hot' : n >= 5 ? 'warm' : n > 0 ? 'cool' : 'empty'; }
/* Theme-safe: text colors CSS variables se (light/dark dono me readable) */
function pmTierStyle(n) {
  if (n >= 20) return { bg: 'linear-gradient(135deg, rgba(245,197,24,.36), rgba(255,107,43,.20))', border: '1.5px solid rgba(200,148,0,.85)', color: 'var(--text-primary)', shadow: '0 6px 18px rgba(245,197,24,.25)', weight: '800', size: '.8rem', opacity: '1' };
  if (n >= 5)  return { bg: 'linear-gradient(135deg, rgba(74,158,255,.26), rgba(74,158,255,.08))', border: '1px solid rgba(50,130,230,.7)', color: 'var(--text-primary)', shadow: '0 4px 14px rgba(74,158,255,.18)', weight: '700', size: '.78rem', opacity: '1' };
  if (n > 0)   return { bg: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', shadow: 'none', weight: '600', size: '.76rem', opacity: '1' };
  return { bg: 'transparent', border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', shadow: 'none', weight: '500', size: '.74rem', opacity: '.85' };
}
function pmPaintDistrictButton(btn, n) {
  const t = pmTierStyle(n);
  Object.assign(btn.style, {
    background: t.bg, border: t.border, color: t.color, boxShadow: t.shadow,
    fontWeight: t.weight, fontSize: t.size, opacity: t.opacity,
    padding: '.42rem .72rem', borderRadius: '999px',
    display: 'inline-flex', alignItems: 'center', gap: '.35rem',
    transition: 'transform .15s ease, box-shadow .15s ease',
  });
  btn.dataset.distTier = pmTierFor(n);
  let badge = btn.querySelector('.dist-count-badge');
  if (!badge) { badge = document.createElement('span'); badge.className = 'dist-count-badge'; btn.appendChild(badge); }
  badge.textContent = n > 0 ? String(n) : '—';
  Object.assign(badge.style, { fontSize: '.62rem', fontWeight: '800', opacity: '.9', letterSpacing: '.02em' });
}

/** Bihar Map ke district buttons bhi volume ke hisab se order + highlight. */
async function pmOrderDistrictButtonsByVolume() {
  const grid = document.getElementById('pm-district-btn-grid');
  if (!grid) return;
  const distBtns = [...grid.querySelectorAll('[data-pm-district]')].filter((b) => b.dataset.pmSlug !== 'all');
  if (!distBtns.length) return;

  let lookup = {};
  try {
    const res = await fetch('/api/district-stats', { cache: 'no-store' });
    const json = await res.json();
    (json.districts || []).forEach((d) => { lookup[d.hi] = d; lookup[d.en] = d; lookup[d.slug] = d; });
  } catch (e) { console.warn('[PM] district stats unavailable:', e.message); return; }

  const items = distBtns.map((b, i) => {
    const s = lookup[b.dataset.pmDistrict] || lookup[b.dataset.pmEn] || lookup[b.dataset.pmSlug] || {};
    return { btn: b, articles: typeof s.articles === 'number' ? s.articles : 0, idx: i };
  });
  items.sort((a, b) => (b.articles - a.articles) || (a.idx - b.idx));

  grid.querySelectorAll('.dist-group-divider').forEach((d) => d.remove());
  let dividerPlaced = false;
  items.forEach(({ btn, articles }) => {
    pmPaintDistrictButton(btn, articles);
    grid.appendChild(btn);
    if (!dividerPlaced && articles < 5) {
      const div = document.createElement('span');
      div.className = 'dist-group-divider';
      div.textContent = '▾ कम / कोई नई खबर नहीं (कम priority)';
      Object.assign(div.style, { fontSize: '.64rem', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '.04em', padding: '.3rem .2rem', flexBasis: '100%' });
      grid.appendChild(div);
      dividerPlaced = true;
    }
  });
  const allBtn = grid.querySelector('[data-pm-slug="all"]');
  if (allBtn) grid.insertBefore(allBtn, grid.firstChild);
}

window.pmOrderDistrictButtonsByVolume = pmOrderDistrictButtonsByVolume;
