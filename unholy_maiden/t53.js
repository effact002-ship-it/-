const orig=console.log; console.log=()=>{}; process.argv[2]='6,26,33'; process.argv.length=3; require('./test.js'); console.log=orig;
const {Index,Planner}=ClaudeAutoNav; const [M,X,Y,x0,y0,x1,y1]=process.env.A.split(',').map(Number); const m=Index.maps[M];
const ob=Index.obstacles(M); const d=Planner.staticBfs(m,X,Y,ob);
let s='     '; for(let x=x0;x<=x1;x++) s+=(x%10); s+='\n';
for(let y=y0;y<=y1;y++){let r='';for(let x=x0;x<=x1;x++){const i=y*m.w+x;const ev=m.events.find(e=>e.x===x&&e.y===y);let c=m.pass[i]===0?'#':(d[i]>=0?'.':'o');if(m.pass[i]!==0&&m.pass[i]!==15&&d[i]<0)c='+';if(ev)c=Index.isPushable(ev)?'P':ev.pages.some(p=>p.pmove)?'C':ev.pages.some(p=>p.transfers.length)?'T':ob.has(i)?'X':'e';if(x===X&&y===Y)c='@';r+=c;}s+=String(y).padStart(4)+' '+r+'\n';}orig(m.name, m.w, m.h);orig(s);
