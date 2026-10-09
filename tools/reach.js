// 도달 가능 지역 출력: GAME=... PROFILE=... node tools/reach.js map,x,y [켤 스위치...]
const H = require('./harness');
const [m, x, y] = (process.argv[2] || '').split(',').map(Number);
const sys = H.readJson(require('path').join(process.env.GAME, 'data', 'System.json'));
const { S, CAN } = H.load({ map: m || sys.startMapId, x: isNaN(x) ? sys.startX : x, y: isNaN(y) ? sys.startY : y });
for (const s of process.argv.slice(3)) S.sw.add(Number(s));
const { Index, Planner } = CAN;
let t = Date.now(); Index.build();
console.log('build ms', Date.now() - t, 'maps', Object.keys(Index.maps).length, 'excluded', Object.keys(Index.excluded).length);
t = Date.now(); const by = Planner.destinations(null); console.log('plan ms', Date.now() - t, 'reachable', Object.keys(by).length);
const rows = Object.keys(by).map(k => [Index.placeLabel(Number(k)), by[k][0].hops, Planner.legsTo(by[k][0]).map(e => e.to.map + (e.choices && e.choices.length ? '(' + e.choices.join('/') + ')' : '')).join('>')]).sort((a, b) => a[1] - b[1]);
for (const r of rows) console.log(r.join(' | '));
if (process.env.ACT) for (const id of process.env.ACT.split(',').map(Number)) console.log('ACT', id, Index.activitiesOf(id).map(a => a.label).join(' / '));
