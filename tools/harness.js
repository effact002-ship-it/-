// Node 테스트 하네스: RPG Maker 전역을 흉내 내고 플러그인을 로드한다 (MV/MZ 공용)
//   GAME=<data/ 와 js/plugins.js 가 있는 폴더>  PROFILE=<profiles/*.js>
// 사용: const H = require('./harness'); H.load({ map, x, y }); H.CAN.Index ...
const fs = require('fs'), path = require('path');

function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

function load(opt) {
    opt = opt || {};
    const G = opt.game || process.env.GAME;
    if (!G) throw new Error('GAME 환경 변수(게임 data 폴더의 상위 폴더)를 지정하세요');
    const ld = f => readJson(path.join(G, 'data', f));
    const isMZ = !!ld('System.json').advanced;

    // 플러그인 목록
    let plugins = [];
    try {
        const ps = fs.readFileSync(path.join(G, 'js', 'plugins.js'), 'utf8');
        plugins = JSON.parse(ps.slice(ps.indexOf('['), ps.lastIndexOf(']') + 1));
    } catch (e) { /* 없음 */ }

    // 상태 (시뮬레이션이 바꿈)
    const S = opt.state || { sw: new Set(), ss: new Set(), vars: {}, items: {}, map: 0, x: 0, y: 0, quests: null };
    S.map = opt.map !== undefined ? opt.map : S.map; S.x = opt.x !== undefined ? opt.x : S.x; S.y = opt.y !== undefined ? opt.y : S.y;

    global.window = global;
    global.$plugins = plugins;
    global.Utils = { RPGMAKER_NAME: isMZ ? 'MZ' : 'MV' };
    global.PluginManager = { parameters: n => { const p = plugins.find(q => q.name === n); return p ? p.parameters : {}; } };
    global.Input = { keyMapper: {} };
    for (const n of ['Game_Player', 'Window_ChoiceList', 'Scene_Map', 'Window_Message', 'Game_Event', 'Game_Map', 'Window_NumberInput', 'Window_EventItem', 'Scene_Gameover']) global[n] = function() {};
    global.ConfigManager = { makeData() { return {}; }, applyData() {} };
    global.Graphics = { frameCount: 0 };
    global.Window_Command = class {}; global.Window_Base = class {}; global.Scene_MenuBase = class {};
    global.process.mainModule = { filename: path.join(G, 'index.html') };
    global.$dataMapInfos = ld('MapInfos.json'); global.$dataTilesets = ld('Tilesets.json'); global.$dataCommonEvents = ld('CommonEvents.json');
    global.$dataItems = ld('Items.json'); global.$dataWeapons = ld('Weapons.json'); global.$dataArmors = ld('Armors.json'); global.$dataActors = ld('Actors.json');
    if (opt.templateMap) global.$dataTemplateEvents = ld('Map' + String(opt.templateMap).padStart(3, '0') + '.json').events;

    global.$gameSwitches = { value: i => S.sw.has(i) };
    global.$gameVariables = { value: i => S.vars[i] || 0 };
    global.$gameSelfSwitches = { value: k => S.ss.has(k.join(',')), _data: {} };
    global.$gameParty = {
        numItems: it => it ? (S.items[it.id] || 0) : 0, hasItem(it) { return this.numItems(it) > 0; },
        members: () => [], battleMembers: () => [{ hpRate: () => 1 }], gold: () => 0
    };
    global.$gameActors = { actor: i => ({ name: () => { const a = $dataActors[i]; return a ? a.name : 'A' + i; } }) };
    global.$gameSystem = { _navTalked: {}, _navVisited: {}, _quests: S.quests };
    global.$gameMap = { mapId: () => S.map, event: () => null, events: () => [] };
    global.$gamePlayer = {};
    Object.defineProperty($gamePlayer, 'x', { get: () => S.x }); Object.defineProperty($gamePlayer, 'y', { get: () => S.y });

    // 프로필 주입
    const prof = opt.profile || process.env.PROFILE;
    global.ClaudeAutoNavProfile = prof ? eval(fs.readFileSync(prof, 'utf8')) : undefined;

    const src = opt.plugin || path.join(__dirname, '..', 'core', 'ClaudeAutoNav.js');
    delete require.cache[require.resolve(src)];
    require(src);
    return { S, CAN: global.ClaudeAutoNav, isMZ, plugins };
}

// Galv_QuestLog 흉내: 퀘스트 이름 파일(img/Quests.txt)이 있으면 이름/분류를 읽음
function stubGalv(S, questsTxt) {
    const txt = {};
    if (questsTxt && fs.existsSync(questsTxt)) {
        let id = 0, rec = false;
        for (const line of fs.readFileSync(questsTxt, 'utf8').split('\n')) {
            const m = /<quest (.*):(.*)>/i.exec(line);
            if (m) { id = Number(m[1]); const s = m[2].split('|'); txt[id] = { name: s[0], category: s[2] || 0, desc: [] }; rec = true; continue; }
            if (/<\/quest>/i.test(line)) { rec = false; continue; }
            if (rec && txt[id]) txt[id].desc.push(line.replace(/\r$/, ''));
        }
    }
    global.Galv = { QUEST: { txt } };
    const mk = id => ({
        _id: id, _objectives: [], _status: 0,
        name: () => (txt[id] && txt[id].name) || ('퀘스트 ' + id),
        category: () => (txt[id] && txt[id].category) || (S.mainQuests && S.mainQuests.has(id) ? 0 : 2),
        objectives: () => { const d = txt[id] && txt[id].desc[0]; return d && d.length > 1 ? d.split(',') : []; }
    });
    S.quests = { active: [], completed: [], failed: [], quest: {} };
    S.questOp = (op, q, o) => {
        const Q = S.quests;
        if (!Q.quest[q]) Q.quest[q] = mk(q);
        if (op === 'activate' && !Q.active.includes(q) && !Q.completed.includes(q)) Q.active.push(q);
        if (op === 'objective') Q.quest[q]._objectives[o] = 1;
        if (op === 'complete') { Q.active = Q.active.filter(x => x !== q); if (!Q.completed.includes(q)) Q.completed.push(q); }
    };
    $gameSystem._quests = S.quests;
}

module.exports = { load, stubGalv, readJson };
