// 추천/경로 분석 점검 도구 (Node, 게임 엔진 없이 빠르게). 봇이 왜 그 행동을 하는지/못 하는지 확인할 때 먼저 쓴다.
//   GAME=<게임 폴더> PROFILE=profiles/<게임>.js SAVE=<세이브> node tools/probe.js <명령> [인자...]
// 명령:
//   units                      퀘스트 단위 추천 (봇이 가장 먼저 보는 목록)과 막힌 이유
//   reach                      지금 갈 수 있는 맵 목록
//   blocked <map> [ev]         그 맵(이벤트)까지 가는 길을 막은 조건 (blockedInfo)
//   plan <map> [ev]            목표까지의 경로 다리(leg)와 선택지
//   page <map> <ev>            이벤트 페이지별 조건/트리거/현재 활성 페이지
//   var <id>                   변수를 바꾸는 이벤트(varSetters)와 지금 활성 여부
//   item <id>                  아이템을 얻는 곳(itemSources)과 findItem 결과
//   party <actorId>            동료를 파티에 넣는 이벤트(partySetters)
//   quests                     Galv 퀘스트 상태와 진행 이벤트(questAdv)
// 옵션 환경 변수:
//   POS=map,x,y                위치 바꾸기 (세이브 위치 대신)
//   SW=+4,-5,+1                스위치 켜기(+)/끄기(-)  (예: 시간대를 아침으로)
const path = require('path');
const H = require('./harness');
const G = process.env.GAME;
const { S, CAN } = H.load({});
const fs = require('fs');
const qtxt = path.join(G, 'img', 'Quests.txt');
if (fs.existsSync(qtxt)) H.stubGalv(S, qtxt);
if (process.env.SAVE) require('./save').loadInto(S, process.env.SAVE, G);
if (process.env.POS) { const [m, x, y] = process.env.POS.split(',').map(Number); S.map = m; S.x = x; S.y = y; }
for (const t of (process.env.SW || '').split(',').filter(Boolean)) { const id = Number(t.slice(1)); if (t[0] === '+') S.sw.add(id); else S.sw.delete(id); }
if (typeof $gameSystem !== 'undefined' && $gameSystem) $gameSystem._navTalked = {};

const { Index, Planner, Recommender, Cond } = CAN;
Index.build();
const by = Planner.destinations(null);
const name = m => (Index.maps[m] ? Index.maps[m].name : '?');
const J = o => JSON.stringify(o);
const [cmd, a1, a2] = process.argv.slice(2);
const n1 = Number(a1), n2 = Number(a2);
console.log('위치', S.map, S.x + ',' + S.y, '갈 수 있는 맵', Object.keys(by).length);

switch (cmd) {
    case 'units': {
        const r = Recommender.build(by, null);
        for (const u of r.units || []) console.log('-', u.title, '|', u.item ? u.item.label + ' @' + name(u.item.map) + ' ev' + u.item.evId + ' ' + J(u.item.choices || []) : '(할 일 없음)', '|', u.info || '');
        if (r.next) console.log('next:', r.next.label);
        for (const g of r.groups || []) for (const it of g.items.slice(0, 3)) console.log('  ', g.name || g.map, it.prio, it.label);
        break;
    }
    case 'reach':
        for (const m of Object.keys(by)) console.log(m, name(m), 'hops', by[m][0].hops);
        break;
    case 'blocked': {
        const bi = Recommender.blockedInfo(n1, by, true, n2 || undefined);
        console.log(bi ? J({ text: bi.text, failed: bi.failed, stuck: !!bi.stuck, leg: bi.leg && [bi.leg.from, name(bi.leg.from), 'ev' + bi.leg.evId, bi.leg.kind] }) : '막힌 곳 없음 (또는 조건을 무시해도 갈 수 없음)');
        break;
    }
    case 'plan': {
        const p = Planner.plan({ map: n1, evId: n2 || 0 }, null, by);
        if (!p) { console.log('경로 없음'); break; }
        for (const e of p.legs) console.log(e.from, name(e.from), 'ev' + (e.evId || e.itemId), '->', e.to.map, name(e.to.map), e.to.x + ',' + e.to.y, J(e.choices || []), e.warp ? 'warp' : '', e.failed ? 'failed ' + J(e.failed) : '');
        break;
    }
    case 'page': {
        const map = Index.maps[n1], ev = Index.findEvent(n1, n2), act = Index.activePage(map, ev);
        console.log(ev.name, ev.x + ',' + ev.y);
        ev.pages.forEach((p, i) => console.log(' p' + i, act === p ? '(활성)' : '', 'trig', p.trigger, 'prio', p.prio, 'fails', J(Index.pageCondFails(p.cond, n1, n2)), 'transfers', p.transfers.length, p.pmoves ? 'pmoves ' + J(p.pmoves.map(b => [b.dx, b.dy])) : ''));
        break;
    }
    case 'var':
        console.log('v' + n1, '=', $gameVariables.value(n1));
        for (const st of Index.varSetters[n1] || []) { const map = Index.maps[st.map], ev = Index.findEvent(st.map, st.evId), raw = ev.pages[st.page];
            console.log(st.map, name(st.map), 'ev' + st.evId, ev.name, 'p' + st.page, '활성', Index.activePage(map, ev) === raw, '도달', !!by[st.map], 'fails', J(Index.pageCondFails(raw.cond, st.map, st.evId))); }
        break;
    case 'item':
        console.log($dataItems[n1].name, '보유', $gameParty.numItems($dataItems[n1]));
        for (const sc of Index.itemSources(n1)) { const map = Index.maps[sc.map], ev = Index.findEvent(sc.map, sc.evId), raw = ev.pages[sc.page];
            console.log(sc.kind, sc.map, name(sc.map), 'ev' + sc.evId, ev.name, 'p' + sc.page, '활성', Index.activePage(map, ev) === raw, '도달', !!by[sc.map]); }
        console.log('findItem:', J(Recommender.findItem(n1, by, null, 0, new Set())));
        break;
    case 'party':
        for (const st of Index.partySetters[n1] || []) { const map = Index.maps[st.map], ev = Index.findEvent(st.map, st.evId), raw = ev.pages[st.page];
            console.log(st.map, name(st.map), 'ev' + st.evId, ev.name, 'p' + st.page, '활성', Index.activePage(map, ev) === raw, 'conds', J(st.conds), '통과', Cond.all(st.conds.filter(c => c.k !== 'choice'), st.map, st.evId)); }
        break;
    case 'quests':
        for (const q of Recommender.galvQuests()) {
            console.log('Q' + q.id, q.name, 'cur', q.cur, J(q.st), q.objText || '');
            for (const r of Index.questAdv[q.id] || []) console.log('   ', r.op, r.o, '@', r.map, name(r.map), 'ev' + r.evId, 'p' + r.page);
        }
        break;
    default:
        console.log('명령: units | reach | blocked <map> [ev] | plan <map> [ev] | page <map> <ev> | var <id> | item <id> | party <actorId> | quests');
}
