// 가상 진행 시뮬레이터: 추천 -> 효과 적용 -> 다시 추천 ... 반복 (MV/MZ 공용)
//   GAME=<게임 폴더> PROFILE=profiles/xxx.js [START=map,x,y] [STEPS=40] [SW=1,2] [QUESTS=img/Quests.txt 경로] [MAINQ=1,2] node tools/sim.js
const path = require('path');
const H = require('./harness');
const sys = H.readJson(path.join(process.env.GAME, 'data', 'System.json'));
const START = (process.env.START || [sys.startMapId, sys.startX, sys.startY].join(',')).split(',').map(Number);
const STEPS = Number(process.env.STEPS || 40);
const { S, CAN } = H.load({ map: START[0], x: START[1], y: START[2], templateMap: process.env.TEMPLATE_MAP ? Number(process.env.TEMPLATE_MAP) : 0 });
for (const s of (process.env.SW || '').split(',').filter(Boolean)) S.sw.add(Number(s));
S.mainQuests = new Set((process.env.MAINQ || '').split(',').filter(Boolean).map(Number));
H.stubGalv(S, process.env.QUESTS || path.join(process.env.GAME, 'img', 'Quests.txt'));
// 실제 세이브에서 시작: SAVE=save/file1.rpgsave
if (process.env.SAVE) {
    require('./save').loadInto(S, process.env.SAVE, process.env.GAME);
    $gameSystem._navVisited = S.navVisited; $gameSystem._navTalked = S.navTalked;
    $gameParty.members = () => (S.actorsInParty || []).map(i => $gameActors.actor(i));
    console.log('세이브 로드: 맵', S.map, S.x + ',' + S.y, '스위치', S.sw.size, '진행 중 퀘스트', JSON.stringify(S.quests.active));
}
const { Index, Planner, Recommender, Runner } = CAN;
Index.build();
const iname = id => ($dataItems[id] && $dataItems[id].name) || id;
const log = console.log;

// 페이지 효과 적용 (조건이 지금 맞는 것만)
function apply(mapId, evId, pg) {
    const ok = c => Cond(c, mapId, evId);
    for (const v of pg.swOn) S.sw.add(v);
    for (const L of (pg.ssOn || [])) S.ss.add([mapId, evId, L].join(','));
    for (const e of (pg.ssExt || [])) if (ok(e.conds)) S.ss.add([e.map, e.ev, e.ch].join(','));
    for (const o of (pg.vops || [])) if (ok(o.conds)) S.vars[o.v] = o.op === 0 ? o.val : o.op === 1 ? (S.vars[o.v] || 0) + o.val : (S.vars[o.v] || 0) - o.val;
    for (const q of (pg.quest || [])) if (ok(q.conds)) { S.questOp(q.op, q.q, q.o); log('     * 퀘스트', q.op, q.q, q.o >= 0 ? '목표 ' + q.o : ''); }
    const got = (pg.gainIds || []).filter(g => !(pg.loseIds || []).includes(g));
    for (const g of got) S.items[g] = (S.items[g] || 0) + 1;
    for (const g of (pg.loseIds || [])) if (S.items[g] > 0) S.items[g]--;
    if (got.length) log('     + 획득:', got.map(iname).join(', '));
}
// 조건 목록 평가 (선택지는 통과로 간주)
function Cond(list, mapId, evId) {
    for (const c of list || []) {
        if (c.k === 'choice' || c.k === 'hide' || c.k === 'cemenu') continue;
        if (c.k === 'if') {
            const p = c.p; let r = null;
            if (p[0] === 0) r = S.sw.has(p[1]) === (p[2] === 0);
            else if (p[0] === 1 && p[2] === 0) { const v = S.vars[p[1]] || 0, w = p[3]; r = [v === w, v >= w, v <= w, v > w, v < w, v !== w][p[4]]; }
            else if (p[0] === 2) r = S.ss.has([mapId, evId, p[1]].join(',')) === (p[2] === 0);
            else if (p[0] === 8) r = (S.items[p[1]] || 0) > 0;
            if (r !== null && (c.neg ? !r : r) === false) return false;
        }
        if (c.k === 'never') return false;
    }
    return true;
}
// 맵 도착: 자동 실행/병렬 처리 이벤트 효과
function arrive() {
    const mp = Index.maps[S.map];
    if (!mp) return;
    for (let k = 0; k < 3; k++) for (const ev of mp.events) {
        const pg = Index.activePage(mp, ev);
        if (!pg || pg.trigger !== 3 || ev.template) continue;
        const key = S.map + ':' + ev.id + ':' + ev.pages.indexOf(pg);
        if (arrive.done.has(key)) continue;
        arrive.done.add(key);
        apply(S.map, ev.id, pg);
    }
}
arrive.done = new Set();

const seen = {};
for (let step = 1; step <= STEPS; step++) {
    arrive();
    $gameSystem._navVisited[S.map] = true;
    const by = Planner.destinations(null);
    const r = Recommender.build(by, null);
    const unit = (r.units || []).find(u => u.item);
    let t = (unit && unit.item) || r.next || (r.groups[0] && (r.groups[0].items[0] || (r.groups[0].explore ? { type: 'go', map: r.groups[0].exploreMap || r.groups[0].map, label: '[탐색] ' + Index.maps[r.groups[0].exploreMap || r.groups[0].map].name } : null)));
    if (!t) { log(step, 'STOP: 추천 없음', r.mainInfo || ''); break; }
    const key = t.label + '@' + t.map + ':' + (t.evId || 0);
    seen[key] = (seen[key] || 0) + 1;
    log(String(step).padStart(2), t.label, '@', Index.maps[t.map].name, t.evId ? 'ev' + t.evId : '', unit ? '  [' + unit.title + (unit.status ? ' / ' + unit.status : '') + ']' : '');
    if (seen[key] >= 3) { log('   STOP: 같은 추천 반복 (루프)'); break; }
    let node = by[t.map] && by[t.map][0];
    if (by[t.map] && t.evId) {
        const ev = Index.findEvent(t.map, t.evId), mp = Index.maps[t.map];
        if (ev) for (const n of by[t.map]) { try { if (Planner.spotDist(mp, Planner._getBfs(n.s), ev.x, ev.y, 1, ev.hb) >= 0) { node = n; break; } } catch (e) { /* 무시 */ } }
    }
    if (node) { S.map = t.map; S.x = node.s.x; S.y = node.s.y; arrive(); }
    if (t.type === 'go') continue;
    const ids = t.type === 'pickupAll' ? t.evIds : [t.evId];
    for (const id of ids) {
        const ev = Index.findEvent(t.map, id); if (!ev) continue;
        const pg = Index.activePage(Index.maps[t.map], ev); if (!pg) continue;
        const pi = ev.pages.indexOf(pg);
        $gameSystem._navTalked[t.map + ':' + id + ':' + pi] = true;
        if (t.type !== 'talk') Runner.badTargets.add(t.map + ':' + id);
        apply(t.map, id, pg);
        const tr = pg.transfers.find(x => !x.conds.some(c => c.k === 'choice' || c.k === 'cemenu') && Cond(x.conds, t.map, id));
        if (tr && Index.maps[tr.map]) { S.map = tr.map; S.x = tr.x; S.y = tr.y; log('     -> 이동:', Index.maps[tr.map].name); }
    }
}
log('진행 중 퀘스트:', JSON.stringify(S.quests.active), '완료:', JSON.stringify(S.quests.completed));
