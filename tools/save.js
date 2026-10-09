// 세이브 파일 읽기 (MV: .rpgsave = LZString base64, MZ: .rmmzsave = zlib) -> 하네스 상태
const fs = require('fs'), path = require('path'), zlib = require('zlib');

function decode(file, gameDir) {
    const raw = fs.readFileSync(file);
    if (/\.rmmzsave$/i.test(file)) return zlib.inflateSync(Buffer.from(raw.toString('latin1'), 'latin1')).toString('utf8');
    // MV: 게임에 들어 있는 lz-string 사용
    const lzPath = path.join(gameDir, 'js', 'libs', 'lz-string.js');
    const src = fs.readFileSync(lzPath, 'utf8');
    const LZ = new Function(src + '\nreturn LZString;')();
    return LZ.decompressFromBase64(raw.toString('utf8'));
}

// JsonEx 배열 표기 해제
const arr = v => (v && v['@a']) ? v['@a'] : (Array.isArray(v) ? v : []);
const obj = v => (v && typeof v === 'object') ? v : {};

function loadInto(S, file, gameDir) {
    const c = JSON.parse(decode(file, gameDir));
    const sw = arr(obj(c.switches)._data);
    S.sw = new Set(); sw.forEach((v, i) => { if (v) S.sw.add(i); });
    const vars = arr(obj(c.variables)._data);
    S.vars = {}; vars.forEach((v, i) => { if (v) S.vars[i] = v; });
    const ss = obj(obj(c.selfSwitches)._data);
    S.ss = new Set(Object.keys(ss).filter(k => ss[k] && k !== '@c'));
    S.items = {};
    for (const [k, v] of Object.entries(obj(obj(c.party)._items))) if (k !== '@c') S.items[k] = v;
    S.map = obj(c.map)._mapId || S.map;
    S.x = obj(c.player)._x; S.y = obj(c.player)._y;
    S.gold = obj(c.party)._gold || 0;
    S.actorsInParty = arr(obj(c.party)._actors);
    // 퀘스트 로그 (Galv_QuestLog)
    const q = obj(c.system)._quests;
    if (q && S.quests) {
        S.quests.active = arr(q.active).slice();
        S.quests.completed = arr(q.completed).slice();
        S.quests.failed = arr(q.failed).slice();
        for (const [id, qq] of Object.entries(obj(q.quest))) {
            if (!qq || id === '@c' || !qq._id) continue;
            S.questOp('activate', Number(id), -1);
            S.quests.quest[id]._objectives = arr(qq._objectives).slice();
            S.quests.quest[id]._status = qq._status;
        }
        S.quests.active = arr(q.active).slice();
    }
    S.navVisited = obj(c.system)._navVisited || {};
    S.navTalked = obj(c.system)._navTalked || {};
    return c;
}

module.exports = { decode, loadInto };
