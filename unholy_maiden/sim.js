// 가상 진행 시뮬레이터: 추천 -> 효과 적용 -> 다시 추천 ... 반복
const fs=require('fs');
const START=(process.env.START||'6,26,33').split(',').map(Number);
const STEPS=Number(process.env.STEPS||30);
const orig=console.log; console.log=()=>{}; process.argv[2]=START.join(','); process.argv.length=3; require('./test.js'); console.log=orig;
const G='/mnt/user-data/uploads/Unholy_maiden_Ver.1.0.10_PART6_Final_한국어_합본/js/plugins.js';
const ps=fs.readFileSync(G,'utf8'); const pl=JSON.parse(ps.slice(ps.indexOf('['),ps.lastIndexOf(']')+1));
PluginManager.parameters=n=>n==='QuestSystem'?pl.find(p=>p.name==='QuestSystem').parameters:{};
const S={sw:new Set((process.env.SW||'').split(',').filter(Boolean).map(Number)), ss:new Set(), items:{}, vars:{}, map:START[0], x:START[1], y:START[2]};
$gameSwitches.value=i=>S.sw.has(i);
$gameSelfSwitches={value:k=>S.ss.has(k.join(',')),_data:{}};
$gameVariables.value=i=>S.vars[i]||0;
$gameParty.numItems=it=>it?(S.items[it.id]||0):0; $gameParty.hasItem=it=>$gameParty.numItems(it)>0;
$gameParty.battleMembers=()=>[{hpRate:()=>1}];
$gameSystem._navTalked={}; $gameSystem._navVisited={};
$gameMap.mapId=()=>S.map; Object.defineProperty($gamePlayer,'x',{get:()=>S.x}); Object.defineProperty($gamePlayer,'y',{get:()=>S.y});
const {Index,Planner,Recommender}=ClaudeAutoNav;
const iname=id=>($dataItems[id]&&$dataItems[id].name)||id;
const seen={};
for (let step=1; step<=STEPS; step++){
  if(!$gameSystem._navVisited[S.map]){ const mp=Index.maps[S.map]; if(mp) for(const ev of mp.events){ const pg=Index.activePage(mp,ev); if(pg&&pg.trigger===3&&!ev.template){ for(const v of pg.swOn) S.sw.add(v); } } }
  $gameSystem._navVisited[S.map]=true;
  const by=Planner.destinations(null); const r=Recommender.build(by,null);
  let t=r.next || (r.groups[0] && (r.groups[0].items[0] || (r.groups[0].explore ? {type:'go',map:r.groups[0].map,label:'[탐색] '+Index.maps[r.groups[0].map].name} : null)));
  if (!t){ orig(step,'STOP: 추천 없음', r.mainInfo||''); break; }
  const key=t.label+'@'+t.map; seen[key]=(seen[key]||0)+1;
  orig(String(step).padStart(2), t.label, '@', Index.maps[t.map].name, r.mainInfo?('  | '+r.mainInfo):'');
  if (seen[key]>=3){ orig('   STOP: 같은 추천 반복 (루프)'); break; }
  let node=by[t.map]&&by[t.map][0];
  if (by[t.map] && t.evId) { const ev=Index.findEvent(t.map,t.evId); const mp=Index.maps[t.map]; if(ev) for(const n of by[t.map]){ try{ if(Planner.spotDist(mp,Planner._getBfs(n.s),ev.x,ev.y,1)>=0){node=n;break;} }catch(e){} } }
  if(node){ S.map=t.map; S.x=node.s.x; S.y=node.s.y; }
  if (t.type==='go') continue;
  const ids = t.type==='pickupAll' ? t.evIds : [t.evId];
  for (const id of ids){ const ev=Index.findEvent(t.map,id); if(!ev) continue; const pg=Index.activePage(Index.maps[t.map],ev); if(!pg) continue;
    const pi=ev.pages.indexOf(pg); $gameSystem._navTalked[t.map+':'+id+':'+pi]=true; if(t.type!=='talk') ClaudeAutoNav.Runner.badTargets.add(t.map+':'+id);
    for(const v of pg.swOn) S.sw.add(v); for(const L of pg.ssOn) S.ss.add([t.map,id,L].join(','));
    const got=pg.gainIds.filter(g=>!(pg.loseIds||[]).includes(g)); for(const g of got) S.items[g]=(S.items[g]||0)+1;
    for(const g of (pg.loseIds||[])) if(S.items[g]>0) S.items[g]--;
    if(got.length) orig('     + 획득:', got.map(iname).join(', '));
    const tr=pg.transfers.find(x=>!x.conds.some(c=>c.k==='choice')); if(tr && Index.maps[tr.map]){ S.map=tr.map; S.x=tr.x; S.y=tr.y; orig('     -> 이동:', Index.maps[tr.map].name); }
  }
}
orig('최종 스위치(층):', [215,216,1238,1237,1248].map(s=>s+':'+(S.sw.has(s)?'ON':'off')).join(' '));
if (process.env.DBG) { const by=Planner.destinations(null); const T=Number(process.env.DBG);
 orig('reach target?', !!by[T]);
 Index._ignoreConds=true; const by2=Planner.destinations(null); Index._ignoreConds=false;
 const n=by2[T]&&by2[T][0]; orig('ignore-route?', !!n);
 if(n) for(const e of Planner.legsTo(n)) orig('  leg', Index.maps[e.from].name,'ev',e.evId,'(',e.ex,e.ey,')->',Index.maps[e.to.map].name,'failed',JSON.stringify(e.failed),'fromReachable',!!by[e.from]);
}
if (process.env.DBG) { const by=Planner.destinations(null);
 const bi=Recommender.blockedInfo(Number(process.env.DBG), by); orig('blockedInfo', bi && bi.text);
 orig('setters 185', JSON.stringify(Index.switchSetters[185]));
 for (const st of (Index.switchSetters[185]||[])) { const ev=Index.findEvent(st.map,st.evId); const raw=ev.pages[st.page]; const act=Index.activePage(Index.maps[st.map],ev);
   orig('  setter', Index.maps[st.map].name,'ev',st.evId,ev.name.slice(0,14),'page',st.page,'active?',act===raw,'t'+raw.trigger,'danger',raw.danger,'pageFails',JSON.stringify(Index.pageCondFails(raw.cond,st.map,st.evId)),'te',JSON.stringify(raw.te),'reachMap',!!by[st.map]); }
}
if (process.env.DBG) { const by=Planner.destinations(null); orig('mainGoal now:', JSON.stringify(Recommender.mainGoal(by,null))); }
if (process.env.DBG2) { const by=Planner.destinations(null); orig('by81', !!by[81], 'reach19', JSON.stringify(Planner.reach(81,19,by,null)));
 const ev=Index.findEvent(81,19); orig('active19', Index.activePage(Index.maps[81],ev)===ev.pages[0]); }
if (process.env.DBG3) { const T=Number(process.env.DBG3); const by=Planner.destinations(null); Index._ignoreConds=true; const by2=Planner.destinations(null); Index._ignoreConds=false; Planner.destinations(null);
 for (const m in Index.maps){ const mp=Index.maps[m]; for(const ev of mp.events) for(const [pi,pg] of ev.pages.entries()) for(const t of pg.transfers) if(t.map===T) orig('into',T,'from',m,mp.name,'ev',ev.id,ev.name.slice(0,12),ev.x,ev.y,'p'+pi,'trig',pg.trigger,'battle',pg.battle,'danger',pg.danger,'tmpl',!!ev.template,'ce',t.ce||'', 'conds',JSON.stringify(t.conds).slice(0,120),'fromReach',!!by[m],'ign',!!by2[m]); }
}
if (process.env.DBG4) { const by=Planner.destinations(null); orig('sw472',S.sw.has(472),'469',S.sw.has(469),'470',S.sw.has(470),'by72',!!by[72],'by73',!!by[73],'by80',!!by[80], Index.maps[72].name, Index.maps[73].name, Index.maps[80].name, 'visited72', !!$gameSystem._navVisited[72]);
 for (const [m,e] of [[73,22],[80,9],[80,10]]) { const ev=Index.findEvent(m,e); const ap=Index.activePage(Index.maps[m],ev); orig(m,e,'activeIdx',ev.pages.indexOf(ap), by[m]?JSON.stringify(Planner.reach(m,e,by,null)):'-'); } }
if (process.env.DBG5) { const T=Number(process.env.DBG5); const best=Planner.explore(null);
 for (const n of best.values()) { const m=Index.maps[n.s.map]; if(!m) continue; for (const e of Index.edgesOf(n.s.map,null)) { if (e.to.map!==T) continue;
   const ob=Index.obstacles(n.s.map); const d=Planner.staticBfs(m,n.s.x,n.s.y,ob); const sd=Planner.spotDist(m,d,e.ex,e.ey,e.prio);
   const blk=[]; if(sd<0){ for(const j of ob){const o2=new Set(ob);o2.delete(j);o2.stop=ob.stop;if(Planner.spotDist(m,Planner.staticBfs(m,n.s.x,n.s.y,o2),e.ex,e.ey,e.prio)>=0){const ev=m.events.find(q=>q.y*m.w+q.x===j);blk.push((j%m.w)+','+((j/m.w)|0)+':'+(ev&&ev.name));}}
     const e0=new Set(); e0.stop=new Set(); if(Planner.spotDist(m,Planner.staticBfs(m,n.s.x,n.s.y,e0),e.ex,e.ey,e.prio)<0) blk.push('TERRAIN'); }
   orig('from',n.s.map,m.name,'@',n.s.x,n.s.y,'edge ev',e.evId,e.ex,e.ey,'dist',sd,'blk',blk.join(' ')); } } }
if (process.env.DBG6) { const by=Planner.destinations(null); orig('pos',S.map,S.x,S.y,'reachable',Object.keys(by).length, Object.keys(by).slice(0,30).map(m=>m+':'+Index.maps[m].name).join(' | '));
 orig('edges', JSON.stringify(Index.edgesOf(S.map,null).map(e=>[e.evId,e.ex,e.ey,e.to.map,e.failed&&e.failed.length]))); }
if (process.env.DBG7) { const by=Planner.destinations(null); const mg=Recommender._mainGoal(by,null); orig(JSON.stringify(mg)); if(mg&&mg.item){ const ev=Index.findEvent(mg.item.map,mg.item.evId); orig(ev.name,ev.x,ev.y); ev.pages.forEach((p,i)=>orig(' p'+i, 'trig',p.trigger,'active',Index.activePage(Index.maps[mg.item.map],ev)===p, JSON.stringify(p.transfers.map(t=>[t.map,t.x,t.y,t.conds,t.ce,t.msgs])).slice(0,600))); } }
