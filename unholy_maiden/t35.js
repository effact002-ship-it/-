const orig=console.log; console.log=()=>{}; const [M,X,Y,TX,TY]=process.env.A.split(',').map(Number); process.argv[2]=M+','+X+','+Y; process.argv.length=3; require('./test.js'); console.log=orig;
const {Index,Planner}=ClaudeAutoNav; const m=Index.maps[M]; const ob=Index.obstacles(M);
const d=Planner.staticBfs(m,X,Y,ob); const e=new Set(); e.stop=new Set(); const d2=Planner.staticBfs(m,X,Y,e);
orig('dist',d[TY*m.w+TX],'noEv',d2[TY*m.w+TX]);
let s='';const x0=Math.max(0,TX-25),y0=Math.max(0,TY-15);for(let y=y0;y<Math.min(m.h,TY+15);y++){let r='';for(let x=x0;x<Math.min(m.w,TX+30);x++){const i=y*m.w+x;const ev=m.events.find(q=>q.x===x&&q.y===y);r+=(x===TX&&y===TY)?'@':(x===X&&y===Y)?'*':ev?(/石像/.test(ev.name)?'S':/爆弾/.test(ev.name)?'B':/移動/.test(ev.name)?'T':'e'):(d2[i]>=0?'.':'#');}s+=String(y).padStart(3)+' '+r+'\n';}orig(s);
