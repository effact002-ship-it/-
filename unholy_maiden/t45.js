const orig=console.log; console.log=()=>{}; process.argv[2]='61,8,18'; process.argv.length=3; require('./test.js'); console.log=orig;
const {Index,Planner,Runner}=ClaudeAutoNav; const M=+(process.env.M||61); const m=Index.maps[M];
global.$dataMap={width:m.w,height:m.h};
const DX={2:0,4:-1,6:1,8:0},DY={2:1,4:0,6:0,8:-1},DB={2:1,4:2,6:4,8:8},RV={2:8,4:6,6:4,8:2};
const AP=e=>e.pages[0];
const evs=m.events.map(e=>({_erased:false,x:e.x,y:e.y,eventId:()=>e.id,page:()=>AP(e),isThrough:()=>{const p=AP(e);return !p||p.through},isNormalPriority:()=>{const p=AP(e);return p&&p.prio===1},isTriggerIn:a=>{const p=AP(e);return p&&a.includes(p.trigger)},list:()=>[1,2],_moveType:0,
  canPass:(x,y,d)=>{const nx=x+DX[d],ny=y+DY[d];return gm.isPassable(x,y,d)&&gm.isPassable(nx,ny,RV[d])&&!gm.eventsXy(nx,ny).some(q=>q.isNormalPriority()&&!q.isThrough())}}));
const gm={isCounter:()=>false,mapId:()=>M,roundXWithDirection:(x,d)=>x+DX[d],roundYWithDirection:(y,d)=>y+DY[d],isValid:(x,y)=>x>=0&&y>=0&&x<m.w&&y<m.h,isPassable:(x,y,d)=>!!(m.pass[y*m.w+x]&DB[d]),events:()=>evs,eventsXy:(x,y)=>evs.filter(e=>e.x===x&&e.y===y),event:id=>evs.find(e=>e.eventId()===id)};
Object.assign($gameMap,gm);
const [sx,sy]=(process.env.P||'8,18').split(',').map(Number);
global.$gamePlayer={x:sx,y:sy,_higher:!!process.env.HI,canPass(x,y,d){const nx=x+DX[d],ny=y+DY[d];if(!gm.isValid(nx,ny))return false;const o=m.ovr,i=y*m.w+x,j=ny*m.w+nx;let ok;if(o&&o[i]===2&&o[j]===1)ok=true;else if(o&&o[i]===1&&this._higher)ok=o[j]===1||o[j]===2;else if(o&&o[i]===1&&!this._higher&&o[j]===2)ok=false;else ok=gm.isPassable(x,y,d)&&gm.isPassable(nx,ny,RV[d]);return ok&&!gm.eventsXy(nx,ny).some(q=>q.isNormalPriority()&&!q.isThrough())}};
Runner.avoidSet=()=>new Set();
const f=Runner.liveField(0,false,true,{});
const [tx,ty]=(process.env.T||'8,15').split(',').map(Number);
orig('dist',f.dist[ty*m.w+tx]); const p=Runner.pathFrom(f,[{x:tx,y:ty,face:0}]); orig(p&&p.dirs.join(''), p&&[...p.doors]);
orig('haz tiles', m.haz.reduce((a,b)=>a+b,0), 'tags', m.hazTags);
orig('canPass 8,16 up', $gamePlayer.canPass(8,16,8), 'evs at 8,15', gm.eventsXy(8,15).map(e=>[e.eventId(),e.isNormalPriority(),e.isThrough()]), 'pushes', f.pushes && [...f.pushes]);
if (process.env.TE) { const ge=gm.event(+process.env.TE); gm.isCounter=()=>false; const sp=Runner.spotsFor(ge,1); orig('spots',JSON.stringify(sp)); const p2=Runner.pathFrom(f,sp); orig('path to ev', p2&&p2.dirs.join(''), p2&&[...p2.doors]); }
