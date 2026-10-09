const orig=console.log; console.log=()=>{}; process.argv[2]='6,26,33'; process.argv.length=3; require('./test.js'); console.log=orig;
const {Index,Planner,Runner}=ClaudeAutoNav; const M=+(process.env.M||50); const m=Index.maps[M];
const AP={}; for(const e of m.events){ AP[e.id]=Index.activePage(m,e); }
global.$dataMap={width:m.w,height:m.h};
const DX={2:0,4:-1,6:1,8:0},DY={2:1,4:0,6:0,8:-1},DB={2:1,4:2,6:4,8:8},RV={2:8,4:6,6:4,8:2};
const evs=m.events.map(e=>({_erased:false,x:e.x,y:e.y,_pageIndex:e.pages.indexOf(AP[e.id]),eventId:()=>e.id,page:()=>AP[e.id]&&{priorityType:AP[e.id].prio},isThrough:()=>!AP[e.id]||AP[e.id].through,isNormalPriority:()=>AP[e.id]&&AP[e.id].prio===1,isTriggerIn:a=>AP[e.id]&&a.includes(AP[e.id].trigger),list:()=>[1,2],_moveType:0}));
const gm={isCounter:()=>false,mapId:()=>M,roundXWithDirection:(x,d)=>x+DX[d],roundYWithDirection:(y,d)=>y+DY[d],isValid:(x,y)=>x>=0&&y>=0&&x<m.w&&y<m.h,isPassable:(x,y,d)=>!!(m.pass[y*m.w+x]&DB[d]),events:()=>evs,eventsXy:(x,y)=>evs.filter(e=>e.x===x&&e.y===y),event:id=>evs.find(e=>e.eventId()===id)};
Object.assign($gameMap,gm);
global.$gamePlayer={x:0,y:0,canPass:(x,y,d)=>{const nx=x+DX[d],ny=y+DY[d];return gm.isValid(nx,ny)&&gm.isPassable(x,y,d)&&gm.isPassable(nx,ny,RV[d])&&!gm.eventsXy(nx,ny).some(q=>q.isNormalPriority()&&!q.isThrough())}};
Runner.avoidSet=()=>new Set(); Runner.badTargets=new Set();
global.ConfigManager.navSidePick=true;
let hits=0, tried=0;
const picks=evs.filter(g=>Index.isPickupLive(g)); orig('pickups on map', picks.length);
for (const g of picks.slice(0,10)) { // place player 3 tiles away on a passable tile
  for (const [dx,dy] of [[3,0],[-3,0],[0,3],[0,-3],[2,1]]) { const x=g.x+dx,y=g.y+dy; if(!gm.isValid(x,y)||!m.pass[y*m.w+x]) continue;
    $gamePlayer.x=x;$gamePlayer.y=y; Runner.phase='walk'; Runner._sidePos=null; Runner.sideDone=new Set(); Runner.curTarget=0; tried++;
    if (Runner.checkSide()) { hits++; orig('from',x,y,'-> ev',Runner.side.id,'steps',Runner.side.path.dirs.length); } break; } }
orig('tried',tried,'hits',hits);
