/*:
 * @target MZ
 * @plugindesc [v2.0] 자동 내비게이션 - 자동 이동 + 상점/NPC 상호작용 + 아이템 줍기 + 지도 미리보기 (MV/MZ 공용)
 * @author Claude
 *
 * @param openKey
 * @text 메뉴 열기 키코드
 * @type number
 * @default 78
 * @desc 내비게이션 메뉴를 여는 키 (기본 78 = N)
 *
 * @param excludeMapPattern
 * @text 제외할 맵 이름 패턴
 * @default
 * @desc 비워 두면 게임 프로필의 값을 사용
 *
 * @param excludeMapIds
 * @text 제외할 맵 ID (하위 맵 포함)
 * @default
 * @desc 비워 두면 게임 프로필의 값을 사용
 *
 * @param maxStoryMessages
 * @text 이동 이벤트 허용 대화 수
 * @type number
 * @default 2
 * @desc 이동 명령 전에 대화가 이보다 많으면 스토리 이벤트로 보고 경로에서 제외
 *
 * @param travelItemPattern
 * @text 이동용 아이템 이름 패턴
 * @default
 * @desc 비워 두면 게임 프로필의 값을 사용. 이 패턴에 맞는 아이템만 경로 계산(출발 시점)에 사용
 *
 * @help
 * N 키: 내비게이션 메뉴 열기 (맵에서 이벤트가 진행 중이 아닐 때)
 *   1) 왼쪽 목록: 현재 진행 상태로 갈 수 있는 지역 (가까운 순)
 *   2) 오른쪽 목록: 그 지역에서 할 수 있는 활동 (이동 / 상점 / 대화 / 텔레포터)
 *   3) 선택하면 자동으로 길을 찾아 이동하고, 활동이면 대상과 상호작용합니다.
 * 자동 이동 중 방향키나 취소(ESC/우클릭)를 누르면 즉시 중단됩니다.
 *
 * 경로 계산은 스위치/변수/셀프스위치/아이템 조건을 실시간으로 평가하므로
 * 아직 열리지 않은 문이나 텔레포터 층은 목록에 나오지 않습니다.
 */

(() => {
    'use strict';
    const PN = 'ClaudeAutoNav';
    const P = PluginManager.parameters(PN);

    //=========================================================================
    // 게임 프로필: 게임마다 다른 이름 규칙/맵 분류/특수 장치. 배포 시 window.ClaudeAutoNavProfile로 주입됨
    //=========================================================================
    const DEFAULT_PROFILE = {
        name: '',
        excludeMapPattern: '이벤트용|백업|테스트|더미|미사용|구버전|컷신|cutscene|test|unused|backup|debug',
        excludeMapIds: [],
        endingRootIds: [],          // 이 맵(하위 포함)으로 가는 이동은 엔딩/게임오버로 보고 피함
        travelItemPattern: '귀환|텔레포|전송',
        nameMap: {},                // 이벤트 이름 번역 (일본어 원본 이름 등)
        hEventCeRe: null,           // 이 이름의 공통 이벤트를 부르면 H 이벤트
        hPictureRe: null,           // 이 이름의 그림을 띄우면 H 이벤트
        hExcludeNameRe: /移動|出口|スイッチ|switch|harass/i,
        dangerCeRe: /ending|エンディング|엔딩|game\s*over|ゲームオーバー|게임\s*오버|bad\s*end|배드\s*엔드/i,
        floorRe: /^제\s*(\d+)\s*층/,   // 던전 층 맵 이름
        placeRules: [
            [/광장$/, '거리'],
            [/교회|성당|예배|참회/, '교회'], [/펍|주점|酒場|술집|bar\b/i, '주점'], [/여관|숙소|宿|inn\b/i, '여관'], [/길드/, '길드'],
            [/목욕|bath/i, '목욕탕'], [/변소|화장실|toilet|restroom/i, '화장실'], [/약방|진료소|병원|의원|hospital|clinic/i, '의료'],
            [/샵|상점|가게|잡화|만물상|보석점|상회|아울렛|무기점|방어구|ショップ|shop|store/i, '상점'],
            [/공작실|대장간|공방|작업장/, '공방'],
            [/광장|골목|빈민가|유흥가|주거지|거리|도시|마을|부락|하수도|구역|street|town|city/i, '거리'],
            [/집|민가|저택|빌딩|아파트|방$|^\d+F$|house|room/i, '건물']
        ],
        buildingRootRe: null,       // 이름 분류가 안 될 때 이 최상위 지역 아래는 '건물'
        placeRootStripRe: null,     // 지역 이름 표시에서 지울 접두어
        regionPass: [],             // 정적 통행: 항상 통과 가능한 리전
        regionBlock: [],            // 정적 통행: 항상 통과 불가 리전
        talkWithoutName: true,      // 이름 표시 없이 대사만 있는 NPC도 대화 상대로 봄 (MV 게임 대부분)
        lockChoice: null,           // { detect, pick, force } 잠긴 문/상자 선택지 문구
        template: {                 // TemplateEvent 플러그인의 템플릿 이름 규칙
            names: [], collectRe: null, excludeRe: null, breakableRe: null, questBoardRe: null
        },
        sideExcludeRe: /爆弾|爆發|罠|bomb|trap/i, // 지나가며 줍기에서 제외할 이벤트 이름
        enemyContact: false          // 길을 막은 추격형 적에게 부딪혀서라도 지나갈지
    };
    const PROF = Object.assign({}, DEFAULT_PROFILE, (typeof window !== 'undefined' && window.ClaudeAutoNavProfile) || {});
    PROF.template = Object.assign({}, DEFAULT_PROFILE.template, PROF.template || {});

    const IS_MZ = typeof Utils !== 'undefined' && Utils.RPGMAKER_NAME === 'MZ';
    // 켜져 있는 플러그인 확인 (어댑터 자동 감지용)
    const HAS = name => typeof $plugins !== 'undefined' && $plugins.some(p => p && p.name === name && p.status);
    const numList = s => String(s || '').split(/[\s,]+/).map(Number).filter(n => n > 0);

    const OPEN_KEY = Number(P.openKey || 78);
    const EXCL_RE = new RegExp(P.excludeMapPattern || PROF.excludeMapPattern, 'i');
    const EXCL_IDS = P.excludeMapIds ? numList(P.excludeMapIds) : (PROF.excludeMapIds || []);
    const MAX_MSG = Number(P.maxStoryMessages || 2);
    const ITEM_RE = new RegExp(P.travelItemPattern || PROF.travelItemPattern);

    Input.keyMapper[OPEN_KEY] = 'autonav';
    // 키 설정 플러그인(YEP_KeyboardConfig 등)이 keyMapper를 통째로 바꿔도 동작하도록 키 입력을 직접 감지
    const _Input_onKeyDown = Input._onKeyDown;
    if (_Input_onKeyDown) {
        Input._onKeyDown = function(event) {
            if (event && event.keyCode === OPEN_KEY) this._navKeyFrame = Graphics.frameCount;
            _Input_onKeyDown.call(this, event);
        };
    }
    const navKeyTriggered = () => {
        if (Input.isTriggered('autonav')) return true;
        if (Input._navKeyFrame !== undefined && Graphics.frameCount - Input._navKeyFrame <= 1) { Input._navKeyFrame = undefined; return true; }
        return false;
    };

    const DIRS = [2, 4, 6, 8];
    const DBIT = { 2: 1, 4: 2, 6: 4, 8: 8 };
    const REV = { 2: 8, 4: 6, 6: 4, 8: 2 };
    const DX = { 2: 0, 4: -1, 6: 1, 8: 0 };
    const DY = { 2: 1, 4: 0, 6: 0, 8: -1 };
    const NAME_JP = PROF.nameMap || {};

    //=========================================================================
    // 플러그인 어댑터 (켜져 있으면 자동 적용)
    //=========================================================================
    const Adapt = {
        // 리전 통행: 프로필 + YEP_RegionRestrictions
        regions: (() => {
            const pass = new Set(PROF.regionPass || []), block = new Set(PROF.regionBlock || []);
            if (HAS('YEP_RegionRestrictions')) {
                const p = PluginManager.parameters('YEP_RegionRestrictions') || {};
                for (const r of numList(p['All Restrict']).concat(numList(p['Player Restrict']))) block.add(r);
                for (const r of numList(p['All Allow']).concat(numList(p['Player Allow']))) pass.add(r);
            }
            return { pass, block };
        })(),
        // 맵 메모의 <Player Restrict Region: x> 등 (YEP_RegionRestrictions)
        mapRegions(note) {
            const out = { pass: new Set(), block: new Set() };
            if (!note || !HAS('YEP_RegionRestrictions')) return out;
            const parse = s => {
                const m = /(\d+)\s*to\s*(\d+)/i.exec(s);
                if (m) { const a = []; for (let i = Number(m[1]); i <= Number(m[2]); i++) a.push(i); return a; }
                return numList(s);
            };
            note.replace(/<(All|Player) (Restrict|Allow) Region:\s*([^>]+)>/gi, (_, who, kind, v) => {
                for (const r of parse(v)) (/restrict/i.test(kind) ? out.block : out.pass).add(r);
                return '';
            });
            return out;
        },
        // 미끄러운 바닥 (YEP_SlipperyTiles): 경로가 어긋나므로 피해 칸처럼 비싸게
        slipRegions: (() => {
            if (!HAS('YEP_SlipperyTiles')) return [];
            return numList((PluginManager.parameters('YEP_SlipperyTiles') || {})['Slippery Region']);
        })(),
        // 큰 이벤트 판정 (YEP_EventHitboxResize): <Hitbox Up/Down/Left/Right: n>
        hitbox(text) {
            if (!text || !/<Hitbox/i.test(text)) return null;
            const hb = { u: 0, d: 0, l: 0, r: 0 };
            text.replace(/<Hitbox (Up|Down|Left|Right):\s*(\d+)>/gi, (_, k, n) => { hb[k[0].toLowerCase()] = Number(n); return ''; });
            return hb.u || hb.d || hb.l || hb.r ? hb : null;
        },
        // 추격형 적 (YEP_EventChasePlayer): 이동 루트 스크립트로 추격 범위를 설정한 페이지
        isChaser(pg) {
            if (!pg || pg.moveType !== 3 || !pg.moveRoute) return false;
            return (pg.moveRoute.list || []).some(c => c.code === 45 && /_chaseRange\s*=\s*[1-9]|_seePlayer\s*=\s*true/.test(String(c.parameters && c.parameters[0])));
        }
    };
    // 실행 중인 이벤트의 판정 범위 (YEP_EventHitboxResize)
    function liveHitbox(ge) {
        if (!ge || ge._addedHitboxUp === undefined) return null;
        const hb = { u: ge._addedHitboxUp || 0, d: ge._addedHitboxDown || 0, l: ge._addedHitboxLeft || 0, r: ge._addedHitboxRight || 0 };
        return hb.u || hb.d || hb.l || hb.r ? hb : null;
    }
    // 이벤트가 차지하는 칸 목록
    function hbTiles(x, y, hb) {
        if (!hb) return [[x, y]];
        const out = [];
        for (let yy = y - hb.u; yy <= y + hb.d; yy++) for (let xx = x - hb.l; xx <= x + hb.r; xx++) out.push([xx, yy]);
        return out;
    }
    const isChoiceCond = c => c.k === 'choice' || c.k === 'cemenu';
    const choiceToken = c => c.k === 'cemenu' ? '#ce:' + c.ce : c.text;

    //=========================================================================
    // 조건 평가
    //=========================================================================
    const Cond = {
        // 결과: true / false / null(알 수 없음 -> 통과로 간주)
        branch(p, mapId, evId) {
            switch (p[0]) {
                case 0: return $gameSwitches.value(p[1]) === (p[2] === 0);
                case 1: {
                    const v1 = $gameVariables.value(p[1]);
                    const v2 = p[2] === 0 ? p[3] : $gameVariables.value(p[3]);
                    switch (p[4]) {
                        case 0: return v1 === v2; case 1: return v1 >= v2; case 2: return v1 <= v2;
                        case 3: return v1 > v2; case 4: return v1 < v2; case 5: return v1 !== v2;
                    }
                    return null;
                }
                case 2: return !!$gameSelfSwitches.value([mapId, evId, p[1]]) === (p[2] === 0);
                case 4: return p[2] === 0 ? $gameParty.members().includes($gameActors.actor(p[1])) : null;
                case 7: {
                    const g = $gameParty.gold();
                    return p[2] === 0 ? g >= p[1] : p[2] === 1 ? g <= p[1] : g < p[1];
                }
                case 8: return $gameParty.hasItem($dataItems[p[1]]);
                case 12: return Cond.script(String(p[1] || ''));
                case 9: return $gameParty.hasItem($dataWeapons[p[1]], p[2]);
                case 10: return $gameParty.hasItem($dataArmors[p[1]], p[2]);
            }
            return null;
        },
        // 아이템 개수/변수/스위치만 쓰는 스크립트 조건만 평가 (그 외는 알 수 없음 = null)
        script(src) {
            const allowed = src
                .replace(/\$gameParty\.(numItems|hasItem)\(\$data(Items|Weapons|Armors)\[\d+\]\)/g, '')
                .replace(/\$game(Variables|Switches)\.value\(\d+\)/g, '')
                .replace(/\$gameParty\.(gold|size)\(\)/g, '')
                .replace(/\b(true|false)\b/g, '');
            if (!/^[\s\d.()<>=!&|+\-*/%]*$/.test(allowed)) return null;
            try { return !!(new Function('return (' + src + ');'))(); } catch (e) { return null; }
        },
        choiceText(text) {
            const m = /^\s*if\((.+?)\)/.exec(text || '');
            if (!m) return true;
            const expr = m[1];
            if (!/^[\dsv\[\]\s!&|<>=()+\-]+$/.test(expr)) return null;
            try {
                const js = expr.replace(/s\[(\d+)\]/g, '$gameSwitches.value($1)').replace(/v\[(\d+)\]/g, '$gameVariables.value($1)');
                return !!(new Function('return (' + js + ');'))();
            } catch (e) { return null; }
        },
        one(c, mapId, evId) {
            if (c.k === 'if') {
                const r = Cond.branch(c.p, mapId, evId);
                return r === null ? null : (c.neg ? !r : r);
            }
            if (c.k === 'choice') return Cond.choiceText(c.text);
            // 숨김 선택지 (HIME_HiddenChoiceConditions): 식이 참이면 숨겨짐
            if (c.k === 'hide') { const r = Cond.script(c.expr); return r === null ? null : !r; }
            // 공통 이벤트 메뉴 항목 (YEP_CommonEventMenu): 표시 조건
            if (c.k === 'cemenu') return c.vis ? Cond.script(c.vis) : true;
            if (c.k === 'hasAny') return c.items.length ? c.items.some(id => $gameParty.numItems($dataItems[id]) > 0) : false;
            if (c.k === 'icount') {
                const db = c.item[0] === 0 ? $dataItems : c.item[0] === 1 ? $dataWeapons : $dataArmors;
                const n = $gameParty.numItems(db[c.item[1]]);
                let r;
                switch (c.op) { case 0: r = n === c.v; break; case 1: r = n >= c.v; break; case 2: r = n <= c.v; break;
                    case 3: r = n > c.v; break; case 4: r = n < c.v; break; case 5: r = n !== c.v; break; default: return null; }
                return c.neg ? !r : r;
            }
            if (c.k === 'never') return false;
            return null;
        },
        all(list, mapId, evId) {
            for (const c of list) if (Cond.one(c, mapId, evId) === false) return false;
            return true;
        },
        page(c, mapId, evId) {
            if (c.switch1Valid && !$gameSwitches.value(c.switch1Id)) return false;
            if (c.switch2Valid && !$gameSwitches.value(c.switch2Id)) return false;
            if (c.variableValid && $gameVariables.value(c.variableId) < c.variableValue) return false;
            if (c.selfSwitchValid && !$gameSelfSwitches.value([mapId, evId, c.selfSwitchCh])) return false;
            if (c.itemValid && !$gameParty.hasItem($dataItems[c.itemId])) return false;
            if (c.actorValid && !$gameParty.members().includes($gameActors.actor(c.actorId))) return false;
            return true;
        },
        // TemplateEvent의 \TE{식} 주석 조건. 평가 불가능하면 통과로 간주
        te(list, mapId, evId) {
            for (const expr of list || []) {
                const js = expr
                    .replace(/\\v\[(\d+)\]/gi, (_, n) => String(Number($gameVariables.value(Number(n))) || 0))
                    .replace(/\\s\[(\d+)\]/gi, (_, n) => String(!!$gameSwitches.value(Number(n))))
                    .replace(/\\sv\[(\d+)\]/gi, (_, n) => {
                        const ss = $gameSelfSwitches;
                        return String(ss && ss.getVariableValue ? Number(ss.getVariableValue([mapId, evId, Number(n)])) || 0 : 0);
                    });
                if (!/^[\s\d.()<>=!&|+\-*/%a-zA-Z_$]*$/.test(js)) continue;
                if (/[a-zA-Z_$]/.test(js.replace(/\$gameParty\.size\(\)|true|false/g, ''))) continue; // 알 수 없는 식은 무시
                try { if (!(new Function('return (' + js + ');'))()) return false; } catch (e) { /* 무시 */ }
            }
            return true;
        }
    };

    //=========================================================================
    // 이벤트 명령 스캔 (이동 / 상점 / 대화 추출)
    //=========================================================================
    const ceCache = {};
    function scanList(list, depth) {
        const out = { transfers: [], shop: null, speaker: '', msgs: 0, gain: false, battle: false, vars: [], changes: false, recover: false, dmsgs: 0, dchanges: false, gains: [], danger: false, choices: false, effects: [], dsw: false, selVars: [], wanted: [], swOn: [], gainIds: [], stock: [], ssOn: [], loseIds: [], quest: [], vops: [], ssExt: [] };
        if (!list) return out;
        // 선택지 -> 변수 대입 -> 나중에 변수 값으로 분기하는 메뉴 (지하철 노선 등): 변수 값 -> 그 선택지 조건
        const chVar = {};
        let hidePending = {};            // 다음 선택지 표시에서 숨길 항목 (HIME hide_choice)
        const hideAt = {};               // 선택지 명령 들여쓰기 -> 숨김 조건
        let ceMenu = [];                 // YEP_CommonEventMenu 항목
        const choiceConds = () => frames.map(f => f.cond).filter(c => c.k === 'choice' || c.k === 'hide' || c.k === 'cemenu');
        let frames = []; // {indent, cond}
        const lastIf = {};
        let msgs = 0;
        const conds = () => frames.map(f => f.cond);
        const effect = () => { if (depth === 0 && out.effects.length < 16) out.effects.push(afterSel ? conds().concat([giftCond]) : conds()); };
        const varItem = {}; // 이 이벤트 안에서 '아이템 개수'를 대입한 변수 -> [종류, ID]
        // 선물/증답: '아이템 선택'으로 고른 아이템 ID가 들어가는 변수와, 이벤트가 원하는 아이템 목록
        const selVars = new Set();
        const wanted = out.wanted;
        let afterSel = false;
        const giftCond = { k: 'hasAny', items: wanted };
        const exitThen = {}, exitElse = {}, inElse = {};
        let stop = false;
        const ifCond = (lp, neg) => {
            if (lp[0] === 1 && lp[2] === 0 && selVars.has(lp[1])) return neg ? { k: 'never' } : { k: 'if', p: lp };
            if (lp[0] === 1 && lp[2] === 0 && varItem[lp[1]]) return { k: 'icount', item: varItem[lp[1]], op: lp[4], v: lp[3], neg: neg };
            return { k: 'if', p: lp, neg: neg };
        };
        for (const cmd of list) {
            if (stop) break;
            const ind = cmd.indent || 0;
            const p = cmd.parameters || [];
            if (cmd.code !== 411 && cmd.code !== 402 && cmd.code !== 403) frames = frames.filter(f => f.indent < ind);
            switch (cmd.code) {
                case 101:
                    msgs++;
                    if (depth === 0) out.dmsgs++;
                    if (!out.speaker && p[4]) out.speaker = String(p[4]);
                    break;
                case 401:
                    // MV 이름 상자 (YEP_MessageCore 등): \n<이름>
                    if (!out.speaker) { const m = /\\n[lrc]?<([^<>]+)>/i.exec(String(p[0] || '')); if (m) out.speaker = m[1]; }
                    break;
                case 102:
                    hideAt[ind] = hidePending; hidePending = {};
                    break;
                case 231:
                    if (PROF.hPictureRe && PROF.hPictureRe.test(String(p[1] || ''))) out.hev = true;
                    break;
                case 355: case 655: {
                    const src = String(p[0] || '');
                    let m;
                    const hc = /hide_choice\s*\(\s*(\d+)\s*,\s*["'](.+)["']\s*\)/.exec(src);
                    if (hc) hidePending[Number(hc[1]) - 1] = hc[2];
                    const swRe = /\$gameSwitches\.setValue\(\s*(\d+)\s*,\s*true\s*\)/g;
                    while ((m = swRe.exec(src))) { const v = Number(m[1]); if (out.swOn.length < 24 && !out.swOn.includes(v)) out.swOn.push(v); out.changes = true; if (depth === 0) { out.dchanges = true; out.dsw = true; } effect(); }
                    const ssRe = /\$gameSelfSwitches\.setValue\(\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*['"](\w)['"]\s*\]\s*,\s*true\s*\)/g;
                    while ((m = ssRe.exec(src))) { if (out.ssExt.length < 12) out.ssExt.push({ map: Number(m[1]), ev: Number(m[2]), ch: m[3], conds: conds() }); out.changes = true; if (depth === 0) out.dchanges = true; effect(); }
                    // 퀘스트 진행 (Galv_QuestLog): objective(퀘스트, 목표, 상태) / complete(퀘스트)
                    const qRe = /Galv\.QUEST\.(objective|complete|activate)\(\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*['"]?(\w+)['"]?)?)?/g;
                    while ((m = qRe.exec(src))) {
                        const op = m[1], st = m[4];
                        if (op === 'objective' && !(st === '1' || /^c/i.test(st || ''))) continue; // 목표 완료만
                        if (out.quest.length < 12) out.quest.push({ op, q: Number(m[2]), o: m[3] !== undefined ? Number(m[3]) : -1, conds: conds() });
                        out.changes = true; if (depth === 0) out.dchanges = true; effect();
                    }
                    if (PROF.hPictureRe && /Galv\.CACHE\.load\(\s*['"]pictures['"]/.test(src) && PROF.hPictureRe.test(src)) out.hev = true;
                    break;
                }
                case 356: {
                    // MV 플러그인 명령: 공통 이벤트 메뉴 (YEP_CommonEventMenu) = 공통 이벤트를 고르는 선택지
                    const s = String(p[0] || '');
                    let m;
                    if ((m = /^AddCommonEventMenu\s+(.+)$/i.exec(s))) ceMenu = ceMenu.concat(numList(m[1].replace(/to/gi, ' ')));
                    else if (/^ClearCommonEventMenu/i.test(s)) ceMenu = [];
                    else if (/^OpenCommonEventMenu/i.test(s) && depth < 3) {
                        for (const id of ceMenu) {
                            const ce = scanCommon(id, depth + 1);
                            const mc = { k: 'cemenu', ce: id, vis: ceMenuVisible(id) };
                            const c0 = conds().concat([mc]);
                            for (const t of ce.transfers) out.transfers.push({ map: t.map, x: t.x, y: t.y, conds: c0.concat(t.conds), msgs: msgs + t.msgs, ce: id });
                        }
                        if (depth === 0) out.choices = true;
                    }
                    break;
                }
                case 111:
                    if (p[0] === 1 && out.vars.length < 8 && !out.vars.includes(p[1])) out.vars.push(p[1]);
                    lastIf[ind] = p;
                    exitThen[ind] = exitElse[ind] = inElse[ind] = false;
                    if (p[0] === 1 && p[2] === 0 && p[4] === 0 && chVar[p[1]] && chVar[p[1]][p[3]] && ind <= chVar[p[1]][p[3]].ind) {
                        // 메뉴 변수 == N (선택지 블록이 끝난 뒤의 분기): N을 대입한 선택지를 고른 경우
                        for (const c of chVar[p[1]][p[3]].conds) frames.push({ indent: ind, cond: c });
                    } else if (p[0] === 1 && p[2] === 0 && selVars.has(p[1])) {
                        // 고른 선물 == X : X를 가지고 있어야 의미 있음 / == 0 (아무것도 안 고름) : 효과 없음
                        if (p[4] === 0 && p[3] > 0) { if (!wanted.includes(p[3])) wanted.push(p[3]); frames.push({ indent: ind, cond: { k: 'icount', item: [0, p[3]], op: 1, v: 1 } }); }
                        else frames.push({ indent: ind, cond: { k: 'never' } });
                    } else if (p[0] === 1 && p[2] === 0 && varItem[p[1]]) {
                        frames.push({ indent: ind, cond: { k: 'icount', item: varItem[p[1]], op: p[4], v: p[3] } });
                    } else {
                        frames.push({ indent: ind, cond: { k: 'if', p: p } });
                    }
                    break;
                case 411:
                    frames = frames.filter(f => f.indent < ind);
                    inElse[ind] = true;
                    if (lastIf[ind]) frames.push({ indent: ind, cond: ifCond(lastIf[ind], true) });
                    break;
                case 412: {
                    // 분기 안에서 '이벤트 처리 중단'이 있었다면, 분기 뒤의 명령은 반대 조건에서만 실행됨
                    const lp = lastIf[ind];
                    if (lp && exitThen[ind] && !exitElse[ind]) frames.push({ indent: ind - 1, cond: ifCond(lp, true) });
                    else if (lp && exitElse[ind] && !exitThen[ind]) frames.push({ indent: ind - 1, cond: ifCond(lp, false) });
                    exitThen[ind] = exitElse[ind] = inElse[ind] = false;
                    break;
                }
                case 115:
                    if (ind === 0) { stop = true; break; }
                    if (inElse[ind - 1]) exitElse[ind - 1] = true; else exitThen[ind - 1] = true;
                    break;
                case 402: {
                    if (depth === 0) out.choices = true;
                    frames = frames.filter(f => f.indent < ind);
                    frames.push({ indent: ind, cond: { k: 'choice', text: String(p[1] || '') } });
                    const hx = hideAt[ind] && hideAt[ind][p[0]];
                    if (hx) frames.push({ indent: ind, cond: { k: 'hide', expr: hx } });
                    break;
                }
                case 403:
                    frames = frames.filter(f => f.indent < ind);
                    frames.push({ indent: ind, cond: { k: 'never' } });
                    break;
                case 125:
                    if (p[0] === 0) { out.gain = true; if (out.gains.length < 8) out.gains.push(conds()); }
                    effect();
                    break;
                case 126: case 127: case 128:
                    if (p[1] === 0) { out.gain = true; if (out.gains.length < 8) out.gains.push(conds()); }
                    if (cmd.code === 126 && p[1] === 0 && p[2] === 0 && out.gainIds.length < 12 && !out.gainIds.includes(p[0])) out.gainIds.push(p[0]);
                    if (cmd.code === 126 && p[1] === 1 && p[2] === 0 && out.loseIds.length < 12) out.loseIds.push(p[0]);
                    effect(); // 획득이든 납품(소모)이든 진행 효과
                    break;
                case 301:
                    out.battle = true;
                    break;
                case 121:
                    if (p[2] === 0) for (let v = p[0]; v <= p[1] && out.swOn.length < 24; v++) if (!out.swOn.includes(v)) out.swOn.push(v);
                    if (p[2] === 0) { out.changes = true; if (depth === 0) { out.dchanges = true; out.dsw = true; } effect(); }
                    break;
                case 122:
                    // 선택지 안에서 변수에 상수 대입: 메뉴 변수 후보
                    if (p[0] === p[1] && p[2] === 0 && p[3] === 0) {
                        const cc = choiceConds();
                        const ci = frames.filter(f => f.cond.k === 'choice').reduce((a, f) => Math.min(a, f.indent), 99);
                        if (cc.length) (chVar[p[0]] = chVar[p[0]] || {})[p[4]] = { conds: cc, ind: ci };
                    }
                    // 상수 대입/가감 기록 (시뮬레이션/분석용)
                    if (p[3] === 0 && p[2] <= 2 && out.vops.length < 16) for (let v = p[0]; v <= p[1] && v < p[0] + 4; v++) out.vops.push({ v, op: p[2], val: p[4], conds: conds() });
                    // 변수 = 아이템 개수 (게임 데이터 피연산자)
                    if (p[3] === 3 && p[4] >= 0 && p[4] <= 2 && p[2] === 0) { for (let v = p[0]; v <= p[1]; v++) varItem[v] = [p[4], p[5]]; break; }
                    // 화자 이름 표시용 문자열 대입(스크립트 피연산자)은 상태 변화로 보지 않음
                    if (p[3] === 4) break;
                    out.changes = true;
                    if (depth === 0) out.dchanges = true;
                    effect();
                    if (out.vars.length < 8 && !out.vars.includes(p[0])) out.vars.push(p[0]);
                    break;
                case 123:
                    if (p[1] === 0 && depth === 0 && !out.ssOn.includes(p[0])) out.ssOn.push(p[0]);
                    if (p[1] === 0) { out.changes = true; if (depth === 0) { out.dchanges = true; out.dsw = true; } effect(); }
                    break;
                case 104: // 아이템 선택 (선물 고르기)
                    selVars.add(p[0]); afterSel = true;
                    break;
                case 314:
                    effect();
                    out.recover = true;
                    break;
                case 353: case 354:
                    out.danger = true; // 게임오버 / 타이틀로
                    break;
                case 205:
                    // 이 이벤트가 플레이어에게서 멀어지는 이동 = 밀어서 움직이는 물체 (석상/책장)
                    if (depth === 0 && p[0] === 0 && p[1] && p[1].list && p[1].list.some(mc => mc.code === 11)) out.pushSelf = true;
                    // 플레이어 이동 루트로 순간이동시키는 장치 (전송 함정/텔레포터): 순 이동량을 기록
                    if (depth === 0 && p[0] === -1 && p[1] && p[1].list) {
                        let dx = 0, dy = 0;
                        for (const mc of p[1].list) {
                            const c = mc.code;
                            if (c === 1 || c === 5 || c === 6) dy++;
                            if (c === 4 || c === 7 || c === 8) dy--;
                            if (c === 2 || c === 5 || c === 7) dx--;
                            if (c === 3 || c === 6 || c === 8) dx++;
                            if (c === 14 && mc.parameters) { dx += mc.parameters[0]; dy += mc.parameters[1]; }
                        }
                        if (dx || dy) out.pmove = { dx: (out.pmove ? out.pmove.dx : 0) + dx, dy: (out.pmove ? out.pmove.dy : 0) + dy, conds: conds() };
                    }
                    break;
                case 201:
                    effect();
                    if (p[0] === 0) out.transfers.push({ map: p[1], x: p[2], y: p[3], conds: conds(), msgs: msgs });
                    break;
                case 302:
                    if (!out.shop) out.shop = { goods: [[p[0], p[1]]], conds: conds() };
                    break;
                case 605:
                    if (out.shop && out.shop.goods.length < 60) out.shop.goods.push([p[0], p[1]]);
                    break;
                case 357:
                    if (p[0] === 'MNKR_SupponShopStockMZ' && p[1] === 'addItem' && p[3] && out.stock.length < 80) {
                        const iid = Number(p[3].itemId || 0);
                        if (iid > 0) out.stock.push([String(p[3].shopName || ''), iid]);
                    }
                    if (p[1] === 'openShop' && !out.shop) out.shop = { goods: [], name: p[3] && p[3].shopName ? String(p[3].shopName) : '', conds: conds() };
                    break;
                case 117:
                    if (H_CE_RE && typeof $dataCommonEvents !== 'undefined' && $dataCommonEvents[p[0]] && H_CE_RE.test($dataCommonEvents[p[0]].name || '')) out.hev = true;
                    if (depth < 3) {
                        const ce = scanCommon(p[0], depth + 1);
                        if (ce.hev) out.hev = true;
                        const c0 = conds();
                        for (const t of ce.transfers) {
                            out.transfers.push({ map: t.map, x: t.x, y: t.y, conds: c0.concat(t.conds), msgs: msgs + t.msgs, ce: p[0] });
                        }
                        if (ce.shop && !out.shop) out.shop = { goods: ce.shop.goods, name: ce.shop.name, conds: c0.concat(ce.shop.conds) };
                        msgs += ce.msgs;
                        if (ce.gain) { out.gain = true; for (const g of (ce.gains || [])) if (out.gains.length < 8) out.gains.push(c0.concat(g)); }
                        if (ce.battle) out.battle = true;
                        if (ce.changes) out.changes = true;
                        if (ce.danger) out.danger = true;
                        for (const v of (ce.swOn || [])) if (out.swOn.length < 24 && !out.swOn.includes(v)) out.swOn.push(v);
                        for (const q of (ce.quest || [])) if (out.quest.length < 12) out.quest.push({ op: q.op, q: q.q, o: q.o, conds: c0.concat(q.conds) });
                        for (const vo of (ce.vops || [])) if (out.vops.length < 16) out.vops.push({ v: vo.v, op: vo.op, val: vo.val, conds: c0.concat(vo.conds) });
                        for (const st of (ce.stock || [])) if (out.stock.length < 80) out.stock.push(st);
                        if (ce.selVars && ce.selVars.length) { for (const v of ce.selVars) selVars.add(v); afterSel = true; }
                        for (const w of (ce.wanted || [])) if (!wanted.includes(w)) wanted.push(w);
                        if (ce.recover) out.recover = true;
                    }
                    break;
            }
        }
        out.msgs = msgs;
        out.selVars = Array.from(selVars);
        return out;
    }
    // 'A1', '0', 'EV012' 같은 의미 없는 이름은 버림
    function okName(n) { n = String(n || '').trim(); return !n || /^(A\d+|EV\d+|\d+|\?+|#\d+)$/i.test(n) ? '' : n; }
    // H 이벤트 판정: 프로필이 지정한 공통 이벤트를 부르는 이벤트
    const H_CE_RE = PROF.hEventCeRe || null;
    const DANGER_CE_RE = PROF.dangerCeRe;
    // 공통 이벤트 메뉴 항목의 <Menu Visible Eval> 표시 조건 -> 평가 가능한 식 (모르면 null = 표시로 간주)
    function ceMenuVisible(id) {
        const ce = typeof $dataCommonEvents !== 'undefined' && $dataCommonEvents[id];
        if (!ce) return null;
        let rec = false, src = '';
        for (const c of ce.list || []) {
            if (c.code !== 108 && c.code !== 408) continue;
            const t = String(c.parameters[0] || '');
            if (/<Menu Visible Eval>/i.test(t)) { rec = true; continue; }
            if (/<\/Menu Visible Eval>/i.test(t)) break;
            if (rec) src += ' ' + t;
        }
        const m = /if\s*\((.+)\)\s*\{\s*visible\s*=\s*true;?\s*\}\s*else\s*\{\s*visible\s*=\s*false;?\s*\}/.exec(src);
        return m ? m[1].trim() : null;
    }
    function scanCommon(id, depth) {
        if (ceCache[id]) return ceCache[id];
        ceCache[id] = { transfers: [], shop: null, msgs: 0, gain: false, battle: false, vars: [], changes: false, recover: false, gains: [], danger: false, selVars: [], wanted: [], swOn: [], stock: [], quest: [], vops: [] }; // 재귀 방지
        const ce = $dataCommonEvents[id];
        const r = ce ? scanList(ce.list, depth) : ceCache[id];
        if (ce && DANGER_CE_RE.test(ce.name || '')) r.danger = true;
        ceCache[id] = r;
        return r;
    }

    //=========================================================================
    // 맵 인덱스 (전체 맵 1회 로드 -> 통행 비트맵 + 이벤트 요약)
    //=========================================================================
    const Index = {
        built: false,
        maps: {},       // id -> {id, name, w, h, pass, events: [...]}
        itemEdges: [],  // 귀환 아이템 등
        excluded: {},

        // 게임 폴더 (MZ: 게임 폴더, MV: www 폴더). data/MapInfos.json이 있는 곳을 찾음
        baseDir() {
            if (this._base !== undefined) return this._base;
            const fs = require('fs'), path = require('path');
            const cands = [];
            try { cands.push(path.dirname(process.mainModule.filename)); } catch (e) { /* 없음 */ }
            try {
                let p = decodeURIComponent(window.location.pathname || '');
                if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
                cands.push(path.dirname(p));
            } catch (e) { /* 없음 */ }
            try { cands.push(process.cwd(), path.join(process.cwd(), 'www')); } catch (e) { /* 없음 */ }
            this._base = cands[0] || '.';
            for (const c of cands) {
                try { if (fs.existsSync(path.join(c, 'data', 'MapInfos.json'))) { this._base = c; break; } } catch (e) { /* 무시 */ }
            }
            return this._base;
        },
        dataPath(file) {
            return require('path').join(this.baseDir(), 'data', file);
        },

        build() {
            if (this.built) return;
            // 맵 파일 읽기: NW.js는 fs, 그 외(브라우저 실행 등)는 동기 XHR
            let readMap;
            try {
                const fs = require('fs');
                readMap = file => JSON.parse(fs.readFileSync(this.dataPath(file), 'utf8'));
            } catch (e) {
                readMap = file => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', 'data/' + file, false);
                    xhr.send(null);
                    if (xhr.status >= 400 || !xhr.responseText) throw new Error('missing ' + file);
                    return JSON.parse(xhr.responseText);
                };
            }
            // 제외 맵 계산
            for (const info of $dataMapInfos) {
                if (!info) continue;
                let cur = info, ex = false, guard = 0;
                while (cur && guard++ < 30) {
                    if (EXCL_IDS.includes(cur.id) || EXCL_RE.test(cur.name || '')) { ex = true; break; }
                    cur = $dataMapInfos[cur.parentId];
                }
                if (ex) this.excluded[info.id] = true;
            }
            // 타이틀/엔딩 계열 맵 (프로필의 엔딩 맵과 그 하위 맵들)
            this.endingMaps = new Set();
            const endRoots = PROF.endingRootIds || [];
            for (const info of $dataMapInfos) {
                if (!info || !endRoots.length) continue;
                let cur = info, g = 0;
                while (cur && g++ < 30) { if (endRoots.includes(cur.id)) { this.endingMaps.add(info.id); break; } cur = $dataMapInfos[cur.parentId]; }
            }
            for (const info of $dataMapInfos) {
                if (!info || this.excluded[info.id]) continue;
                const file = 'Map' + String(info.id).padStart(3, '0') + '.json';
                let data;
                try { data = readMap(file); } catch (e) { continue; }
                this.maps[info.id] = this.compileMap(info, data);
            }
            // 아이템 -> 공통 이벤트 -> 이동 (귀환석 등)
            for (const item of $dataItems) {
                if (!item || !(item.occasion === 0 || item.occasion === 2)) continue;
                if (!ITEM_RE.test(item.name || '')) continue;
                for (const ef of item.effects) {
                    if (ef.code !== 44) continue;
                    const ce = scanCommon(ef.dataId, 1);
                    for (const t of ce.transfers) {
                        if (!t.conds.some(isChoiceCond)) continue;
                        this.itemEdges.push({ itemId: item.id, ceId: ef.dataId, to: { map: t.map, x: t.x, y: t.y }, conds: t.conds, msgs: t.msgs });
                    }
                }
            }
            // 플러그인 상점 재고: 상점 이름 -> 아이템 ID 목록
            this.shopStock = {};
            const addStock = list => { for (const [nm, iid] of list) { (this.shopStock[nm] = this.shopStock[nm] || new Set()).add(iid); } };
            for (const id in this.maps) for (const ev of this.maps[id].events) for (const pg of ev.pages) addStock(pg.stock || []);
            for (const ce of $dataCommonEvents) if (ce) addStock(scanCommon(ce.id, 1).stock || []);
            // 스위치를 켜는 이벤트 색인 (본편 목표 역추적용)
            this.switchSetters = {};
            for (const id in this.maps) {
                for (const ev of this.maps[id].events) {
                    ev.pages.forEach((pg, pi) => {
                        for (const v of pg.swOn) (this.switchSetters[v] = this.switchSetters[v] || []).push({ map: Number(id), evId: ev.id, page: pi });
                    });
                }
            }
            // 본편 단계: 층간 이동 장치 선택지의 if(s[N]) 조건 = 층 해금 스위치
            // 스위치 조건 선택지가 가장 많은 공통 이벤트(=층간 텔레포터)만 사용
            this.milestones = [];
            for (const ce of $dataCommonEvents) {
                if (!ce) continue;
                const list = [];
                for (const t of scanCommon(ce.id, 1).transfers) {
                    for (const c of t.conds) {
                        if (c.k !== 'choice') continue;
                        const m = /if\(s\[(\d+)\]\)/.exec(c.text);
                        if (!m || list.some(x => x.sw === Number(m[1]))) continue;
                        list.push({ sw: Number(m[1]), label: c.text.replace(/^\s*if\(.+?\)/, '').replace(/\\[A-Za-z]+\[\d*\]/g, '').trim(), to: t.map });
                    }
                }
                if (list.length >= 3 && list.length > this.milestones.length) this.milestones = list;
            }
            // 퀘스트를 진행시키는 이벤트 색인 (Galv_QuestLog: 목표 완료 / 퀘스트 완료)
            this.questAdv = {};
            for (const id in this.maps) {
                for (const ev of this.maps[id].events) {
                    if (ev.template) continue;
                    ev.pages.forEach((pg, pi) => {
                        for (const q of (pg.quest || [])) {
                            if (q.op === 'activate') continue;
                            const arr = this.questAdv[q.q] = this.questAdv[q.q] || [];
                            if (!arr.some(r => r.map === Number(id) && r.evId === ev.id && r.page === pi && r.o === q.o)) arr.push({ map: Number(id), evId: ev.id, page: pi, o: q.o, op: q.op, conds: q.conds });
                        }
                    });
                }
            }
            // 퀘스트 변수를 참조하는 이벤트 색인
            this.questRefs = {};
            for (const id in this.maps) {
                for (const ev of this.maps[id].events) {
                    for (const pg of ev.pages) {
                        const vs = pg.vars.slice();
                        if (pg.cond.variableValid) vs.push(pg.cond.variableId);
                        for (const v of vs) {
                            const arr = this.questRefs[v] = this.questRefs[v] || [];
                            if (!arr.some(r => r.map === Number(id) && r.evId === ev.id)) arr.push({ map: Number(id), evId: ev.id });
                        }
                    }
                }
            }
            this.built = true;
        },

        // 현재 진행 상태 기준, 지나갈 수 없는 고정 물체 칸
        obstacles(mapId) {
            const map = this.maps[mapId];
            const set = new Set();
            set.stop = new Set(); // 밟으면 이벤트가 시작되는 칸: 도착은 가능하지만 통과는 불가
            if (!map) return set;
            const addTiles = (s, x, y, hb) => { for (const [tx, ty] of hbTiles(x, y, hb)) if (tx >= 0 && ty >= 0 && tx < map.w && ty < map.h) s.add(ty * map.w + tx); };
            for (const ev of map.events) {
                const pg = this.activePage(map, ev);
                if (!pg || pg.prio === 1 || (pg.trigger !== 1 && pg.trigger !== 2) || pg.n <= 1) continue;
                if (this.isCollectPage(ev, pg, mapId)) continue;
                const ge = mapId === $gameMap.mapId() && $gameMap.event ? $gameMap.event(ev.id) : null;
                const x = ge ? ge.x : ev.x, y = ge ? ge.y : ev.y;
                addTiles(set.stop, x, y, ge ? liveHitbox(ge) : (pg.hb || ev.hb));
            }
            if (mapId === $gameMap.mapId()) {
                for (const ge of $gameMap.events()) {
                    if (ge._erased || !ge.page() || ge.isThrough() || !ge.isNormalPriority() || ge._moveType !== 0) continue;
                    const fe = this.findEvent(mapId, ge.eventId());
                    if (this.isPushable(fe)) { (set.push = set.push || new Map()).set(ge.y * map.w + ge.x, this.pushNo(fe)); continue; }
                    const ow = this.oneWayDir(fe);
                    if (ow) { (set.oneway = set.oneway || new Map()).set(ge.y * map.w + ge.x, ow); continue; }
                    if (this.isOpenable(fe)) continue;
                    addTiles(set, ge.x, ge.y, liveHitbox(ge));
                }
                return set;
            }
            for (const ev of map.events) {
                const pg = this.activePage(map, ev);
                if (pg && pg.prio === 1 && pg.push && pg.trigger === 1) { (set.push = set.push || new Map()).set(ev.y * map.w + ev.x, pg.noPush || []); continue; }
                if (!pg || pg.prio !== 1 || !pg.fixed || pg.transfers.length) continue;
                const ow = this.oneWayDir(ev);
                if (ow) { if (pg.faceDir) (set.oneway = set.oneway || new Map()).set(ev.y * map.w + ev.x, ow); continue; }
                if (this.isOpenable(ev)) continue;
                addTiles(set, ev.x, ev.y, pg.hb || ev.hb);
            }
            return set;
        },

        compileMap(info, data) {
            const w = data.width, h = data.height;
            const ts = $dataTilesets[data.tilesetId];
            const flags = ts ? ts.flags : [];
            const d = data.data;
            const pass = new Uint8Array(w * h);
            const mr = Adapt.mapRegions(data.note);
            const rPass = r => Adapt.regions.pass.has(r) || mr.pass.has(r);
            const rBlock = r => Adapt.regions.block.has(r) || mr.block.has(r);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const region = d[(5 * h + y) * w + x] || 0;
                    let bits = 0;
                    if (region && rBlock(region)) bits = 0;
                    else if (region && rPass(region)) bits = 15;
                    else {
                        for (const dir of DIRS) {
                            const bit = (1 << (dir / 2 - 1)) & 0x0f;
                            let ok = false;
                            for (let z = 3; z >= 0; z--) {
                                const flag = flags[d[(z * h + y) * w + x] || 0] || 0;
                                if ((flag & 0x10) !== 0) continue;
                                if ((flag & bit) === 0) { ok = true; break; }
                                if ((flag & bit) === bit) { ok = false; break; }
                            }
                            if (ok) bits |= DBIT[dir];
                        }
                    }
                    pass[y * w + x] = bits;
                }
            }
            const events = [];
            const hazTags = [];
            for (const ev of data.events) {
                if (!ev) continue;
                const isTemplate = /<TE:/.test(ev.note || '');
                for (const t of (isTemplate ? ((this.template(ev.note) || {}).haz || []) : hazardTagsOf(ev.pages))) if (!hazTags.includes(t)) hazTags.push(t);
                if (isTemplate) {
                    const tpl = this.template(ev.note);
                    events.push({ id: ev.id, name: tpl ? tpl.name : '', x: ev.x, y: ev.y, template: true, pages: tpl ? tpl.pages : [] });
                    continue;
                }
                events.push({ id: ev.id, name: ev.name || '', x: ev.x, y: ev.y, template: false, hb: Adapt.hitbox(ev.note), pages: ev.pages.map(compilePage) });
            }
            // 고정된 물체 이벤트(통과 불가, 이동 안 함)는 정적 지도에서도 막힌 칸으로 처리
            for (const ev of events) {
                if (ev.x < 0 || ev.y < 0 || ev.x >= w || ev.y >= h) continue;
                const pg0 = ev.pages[ev.pages.length - 1] || ev.pages[0];
                if (!pg0 || pg0.prio !== 1 || !pg0.fixed || pg0.transfers.length || ev.template) continue;
                if (ev.pages.some(p => p.prio !== 1 || !p.fixed || p.push)) continue;
                for (const [tx, ty] of hbTiles(ev.x, ev.y, pg0.hb || ev.hb)) if (tx >= 0 && ty >= 0 && tx < w && ty < h) pass[ty * w + tx] = 0;
            }
            // 피해 칸: 대미지 바닥 타일, 또는 이 맵의 평행 처리가 대미지를 주는 지형 태그
            const haz = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                let tag = 0, dmg = false;
                for (let z = 3; z >= 0; z--) {
                    const f = flags[d[(z * h + y) * w + x] || 0] || 0;
                    if (!tag && (f >> 12)) tag = f >> 12;
                    if (f & 0x100) dmg = true;
                }
                if (dmg || (tag && hazTags.includes(tag))) haz[y * w + x] = 1;
                if (Adapt.slipRegions.length && Adapt.slipRegions.includes(d[(5 * h + y) * w + x] || 0)) haz[y * w + x] = 1;
            }
            const top = this.rootName(info);
            const name = String(info.name || '').replace(/★/g, '').trim();
            // 다리(위층) 리전
            let ovr = null;
            if (OVER.over) {
                for (let i = 0; i < w * h; i++) {
                    const r = d[5 * w * h + i] || 0;
                    if (r === OVER.over || r === OVER.gate) { ovr = ovr || new Uint8Array(w * h); ovr[i] = r === OVER.over ? 1 : 2; }
                }
            }
            return { id: info.id, name, full: top && top !== name ? top + ' > ' + name : name, w, h, pass, events, haz, hazTags, ovr };
        },

        _tplCache: {},
        template(note) {
            const m = /<TE:([^>]+)>/.exec(note || '');
            if (!m || typeof $dataTemplateEvents === 'undefined') return null;
            const v = m[1].trim();
            if (this._tplCache[v] !== undefined) return this._tplCache[v];
            let te = null;
            if (/^\d+$/.test(v)) te = $dataTemplateEvents[Number(v)];
            else if (!/\\/.test(v)) te = $dataTemplateEvents.find(e => e && e.name === v);
            const r = te ? { name: String(te.name || ''), pages: te.pages.map(compilePage), haz: hazardTagsOf(te.pages) } : null;
            this._tplCache[v] = r;
            return r;
        },

        // 상호작용으로 열리는 문/창살: 지금은 막혀 있지만 다른 페이지에서 통과 가능해지는 이벤트
        // 한쪽에서만 열리는 빗장 문: 열 수 있는 방향(플레이어가 바라봐야 하는 방향) 반환
        oneWayDir(ev) {
            if (!ev) return 0;
            if (ev._oneWay !== undefined) return ev._oneWay;
            let d = 0;
            const pg = ev.pages.find(p => p.prio === 1 && !p.through && p.faceDir && p.ssOn && p.ssOn.length && !p.transfers.length);
            if (pg && ev.pages.some(p => p !== pg && (p.through || p.prio !== 1))) d = pg.faceDir;
            ev._oneWay = d;
            return d;
        },

        // 밀어서 움직이는 물체: 부딪히면 반대쪽으로 한 칸 밀림
        isPushable(ev) {
            return !!ev && ev.pages.some(p => p.push && p.trigger === 1 && p.prio === 1);
        },
        pushNo(ev) {
            const pg = ev && ev.pages.find(p => p.push && p.trigger === 1 && p.prio === 1);
            return pg ? pg.noPush || [] : [];
        },

        isOpenable(ev) {
            if (!ev) return false;
            if (this.oneWayDir(ev)) return true;
            // 깨뜨리면 지나갈 수 있는 항아리류 (템플릿): 조사하면 통과 가능한 페이지로 바뀜
            if (ev.template) return !!TPL_BREAK && TPL_BREAK.test(ev.name) && ev.pages.some(p => p.through) && ev.pages.some(p => p.prio === 1 && !p.through && p.trigger <= 2);
            if (ev.pages.some(p => p.transfers.length)) return false;
            return ev.pages.some(p => p.through || p.prio !== 1) && ev.pages.some(p => p.prio === 1 && !p.through);
        },

        isCollectPage(ev, pg, mapId) {
            if (!pg) return false;
            if (this.isPickupPage(pg, mapId, ev ? ev.id : 0)) return true;
            return !!ev && ev.template && !!COLLECT_RE && COLLECT_RE.test(ev.name) && !(TPL_EXCLUDE && TPL_EXCLUDE.test(ev.name)) &&
                pg.trigger <= 2 && pg.n > 1 && !pg.battle && !pg.shop && pg.transfers.every(t => t.ce); // 공통 이벤트 안의 선택지 이동(귀환 메뉴 등)은 무시
        },

        // mapId를 주면 획득 명령이 걸린 조건(셀프 스위치 등)까지 현재 상태로 평가: 이미 받은 반복 오브젝트는 제외
        // 말을 걸면 무언가 달라지는 대화인지 (잡담 NPC 제외용)
        // mapId를 주면, 효과가 걸린 조건(아이템 소지, 스위치 등)을 지금 상태로 평가:
        // 납품 NPC인데 필요한 물품이 없으면 의미 없는 대화로 판정
        isUsefulTalk(pg, mapId, evId) {
            if (!pg) return false;
            if (pg.shop || pg.battle) return true;
            if (mapId === undefined) return !!(pg.dchanges || pg.gain || pg.recover || pg.transfers.length);
            return (pg.effects || []).some(c => Cond.all(c, mapId, evId));
        },

        isPickupPage(pg, mapId, evId) {
            if (!pg || pg.trigger > 2 || !pg.gain || pg.battle || pg.shop || pg.msgs > 1 || pg.transfers.length) return false;
            if (mapId === undefined) return true;
            return (pg.gains || []).some(c => Cond.all(c, mapId, evId));
        },

        // 아이템을 구할 수 있는 곳: 그 아이템을 파는 상점, 그 아이템을 주는 이벤트
        itemSources(itemId) {
            const out = [];
            for (const id in this.maps) {
                for (const ev of this.maps[id].events) {
                    if (ev.template) continue;
                    ev.pages.forEach((pg, pi) => {
                        const sells = pg.shop && (pg.shop.goods.some(g => g[0] === 0 && g[1] === itemId) ||
                            (pg.shop.name && this.shopStock[pg.shop.name] && this.shopStock[pg.shop.name].has(itemId)));
                        if (sells) out.push({ map: Number(id), evId: ev.id, page: pi, kind: 'shop' });
                        else if (pg.gainIds && pg.gainIds.includes(itemId) && pg.trigger <= 2) out.push({ map: Number(id), evId: ev.id, page: pi, kind: 'event' });
                    });
                }
            }
            return out;
        },

        // 이벤트가 요구하는 아이템 (아이템 조건/아이템 개수 비교에서 추출)
        requiredItems(ev, onlyPage) {
            const ids = new Set();
            const pages = onlyPage ? [onlyPage] : ev.pages;
            // 개수 0일 때 거짓이고 많을 때 참인 조건 = 그 아이템이 있어야 함
            const needs = (c, n) => {
                let r;
                switch (c.op) { case 0: r = n === c.v; break; case 1: r = n >= c.v; break; case 2: r = n <= c.v; break;
                    case 3: r = n > c.v; break; case 4: r = n < c.v; break; case 5: r = n !== c.v; break; default: return null; }
                return c.neg ? !r : r;
            };
            for (const pg of pages) for (const cl of (pg.effects || [])) for (const c of cl) {
                if (c.k === 'icount' && c.item[0] === 0 && needs(c, 0) === false && needs(c, 99) === true) ids.add(c.item[1]);
                if (c.k === 'if' && c.p[0] === 8 && !c.neg) ids.add(c.p[1]);
            }
            for (const pg of pages) if (pg.cond.itemValid) ids.add(pg.cond.itemId);
            return Array.from(ids);
        },

        // 페이지 출현 조건 중 지금 만족하지 않는 것들을 조건 객체로 변환
        pageCondFails(c, mapId, evId) {
            const out = [];
            if (c.switch1Valid && !$gameSwitches.value(c.switch1Id)) out.push({ k: 'if', p: [0, c.switch1Id, 0] });
            if (c.switch2Valid && !$gameSwitches.value(c.switch2Id)) out.push({ k: 'if', p: [0, c.switch2Id, 0] });
            if (c.variableValid && $gameVariables.value(c.variableId) < c.variableValue) out.push({ k: 'if', p: [1, c.variableId, 0, c.variableValue, 1] });
            if (c.selfSwitchValid && !$gameSelfSwitches.value([mapId, evId, c.selfSwitchCh])) out.push({ k: 'if', p: [2, c.selfSwitchCh, 0] });
            if (c.itemValid && !$gameParty.hasItem($dataItems[c.itemId])) out.push({ k: 'if', p: [8, c.itemId] });
            if (c.actorValid && !$gameParty.members().includes($gameActors.actor(c.actorId))) out.push({ k: 'if', p: [4, c.actorId, 0] });
            return out;
        },

        describeCond(c) {
            if (c.k === 'icount' || (c.k === 'if' && c.p[0] === 8)) {
                const id = c.k === 'icount' ? c.item[1] : c.p[1];
                return (($dataItems[id] && $dataItems[id].name) || ('아이템 ' + id)) + ' 필요';
            }
            if (c.k === 'if' && c.p[0] === 4) {
                const a = $gameActors.actor(c.p[1]);
                const nm = a ? a.name() : ('동료 ' + c.p[1]);
                return c.neg ? nm + '이(가) 동행 중이라 지금은 갈 수 없음 (먼저 동행 목적지를 해결)' : nm + '와(과) 함께여야 함';
            }
            if (c.k === 'if' && c.p[0] === 0) return '진행 조건(스위치 ' + c.p[1] + ') 미충족';
            if (c.k === 'if' && c.p[0] === 1) return '진행 조건(변수 ' + c.p[1] + ') 미충족';
            if (c.k === 'if' && c.p[0] === 2) return '이 장소의 선행 이벤트 필요';
            if (c.k === 'if' && c.p[0] === 7) return '골드 부족';
            return '조건 미충족';
        },

        rootId(mapId) {
            let cur = $dataMapInfos[mapId], g = 0;
            while (cur && cur.parentId && $dataMapInfos[cur.parentId] && g++ < 30) cur = $dataMapInfos[cur.parentId];
            return cur ? cur.id : 0;
        },

        rootName(info) {
            let cur = info, guard = 0;
            while (cur && cur.parentId && $dataMapInfos[cur.parentId] && guard++ < 30) cur = $dataMapInfos[cur.parentId];
            return String((cur && cur.name) || '').replace(/★/g, '').trim();
        },

        // 장소 종류(큰 분류): 교회/주점/여관/상점/길드... 던전은 'N층'
        placeType(mapId) {
            const map = this.maps[mapId];
            if (!map) return '';
            if (map._ptype !== undefined) return map._ptype;
            const n = map.name, root = this.rootName($dataMapInfos[mapId]) || '';
            const rules = PROF.placeRules || [];
            let t = '';
            const fl = PROF.floorRe && (PROF.floorRe.exec(root) || PROF.floorRe.exec(n));
            if (fl) t = fl[1] + '층';
            else for (const [re, name] of rules) if (re.test(n)) { t = name; break; }
            if (!t && map.events.some(e => e.pages.some(p => p.shop))) t = '상점';
            if (!t && PROF.buildingRootRe && PROF.buildingRootRe.test(root)) t = '건물';
            map._ptype = t;
            return t;
        },
        // 건물 단위: 거리/던전 층에 바로 붙은 장소(여관/교회 등)를 건물로 보고, 그 아래 방들을 묶음
        isOpenArea(mapId) { const t = this.placeType(mapId); return t === '거리' || /층$/.test(t) || !t; },
        buildingOf(mapId) {
            let cur = mapId, g = 0;
            while (g++ < 20) {
                const info = $dataMapInfos[cur];
                if (!info || !info.parentId || !this.maps[info.parentId]) return cur;
                if (this.isOpenArea(info.parentId) && this.isOpenArea(cur) === false) return cur;
                if (this.isOpenArea(info.parentId)) return cur;
                cur = info.parentId;
            }
            return cur;
        },
        buildingRooms(bid) {
            if (this.isOpenArea(bid)) return [bid];
            const out = [bid];
            for (let i = 0; i < out.length; i++) {
                for (const m of $dataMapInfos) if (m && m.parentId === out[i] && this.maps[m.id] && !out.includes(m.id)) out.push(m.id);
            }
            return out;
        },
        placeLabel(mapId) {
            const map = this.maps[mapId];
            if (!map) return String(mapId);
            const t = this.placeType(mapId);
            const raw = this.rootName($dataMapInfos[mapId]) || '';
            const root = PROF.placeRootStripRe ? raw.replace(PROF.placeRootStripRe, '') : raw;
            const area = raw && raw !== map.name && !/층$/.test(t) ? ' · ' + root : '';
            const nm = /층$/.test(t) && PROF.floorRe ? map.name.replace(new RegExp(PROF.floorRe.source + '\\s*'), '') : map.name;
            return (t ? '[' + t + '] ' : '') + nm + area;
        },

        // 현재 진행 상태 기준 활성 페이지
        activePage(map, ev) {
            if (map.id === $gameMap.mapId()) {
                const ge = $gameMap.event(ev.id);
                if (ge) {
                    if (ge._erased || ge._pageIndex < 0) return null;
                    return ev.pages[ge._pageIndex] || null;
                }
            }
            for (let i = ev.pages.length - 1; i >= 0; i--) {
                if (Cond.page(ev.pages[i].cond, map.id, ev.id) && Cond.te(ev.pages[i].te, map.id, ev.id)) return ev.pages[i];
            }
            return null;
        },

        edgesOf(mapId, blacklist) {
            const map = this.maps[mapId];
            if (!map) return [];
            const out = [];
            for (const ev of map.events) {
                const active = this.activePage(map, ev);
                // 조건 무시 모드(막힌 이유 분석)에서는 비활성 페이지의 이동도 후보로 보고, 페이지 조건을 '막힌 조건'으로 기록
                const pages = this._ignoreConds ? ev.pages.filter(p => p !== active).concat(active ? [active] : []) : (active ? [active] : []);
                for (const pg of pages) {
                if (pg.trigger > 2 || pg.battle || ev.template || pg.danger) continue;
                const pageFailed = pg === active ? [] : this.pageCondFails(pg.cond, mapId, ev.id);
                for (const t of pg.transfers) {
                    if (t.msgs > MAX_MSG) continue;
                    // 공통 이벤트 경유 이동은 선택지형(텔레포터/귀환)만 허용 (패배·함정 처리 제외)
                    if (t.ce && !t.conds.some(isChoiceCond)) continue;
                    if (!this.maps[t.map]) continue;
                    let failed = pageFailed.length ? pageFailed.slice() : null;
                    if (!Cond.all(t.conds, mapId, ev.id)) {
                        if (!this._ignoreConds) continue;
                        const tf = t.conds.filter(c => Cond.one(c, mapId, ev.id) === false);
                        if (tf.some(c => isChoiceCond(c) || c.k === 'hide' || c.k === 'never')) continue; // 층간 텔레포터 선택지 등은 분석에서 제외
                        failed = (failed || []).concat(tf);
                    }
                    const key = mapId + ':' + ev.id + ':' + t.map + ':' + t.x + ':' + t.y;
                    if (blacklist && blacklist.has(key)) continue;
                    out.push({
                        key, kind: 'event', from: mapId, evId: ev.id, ex: ev.x, ey: ev.y, hb: pg.hb || ev.hb, prio: pg.prio, trigger: pg.trigger, failed,
                        choices: t.conds.filter(isChoiceCond).map(choiceToken),
                        to: { map: t.map, x: t.x, y: t.y }
                    });
                }
                // 이동 루트형 텔레포터 (같은 맵 안 순간이동)
                const pm = pg.pmove;
                if (pm && !pg.transfers.length && (pg.trigger === 1 || pg.trigger === 2) && Math.abs(pm.dx) + Math.abs(pm.dy) >= 2 && Cond.all(pm.conds, mapId, ev.id)) {
                    const tx = ev.x + pm.dx, ty = ev.y + pm.dy;
                    const key = mapId + ':' + ev.id + ':' + mapId + ':' + tx + ':' + ty;
                    if (!(blacklist && blacklist.has(key)) && tx >= 0 && ty >= 0 && tx < map.w && ty < map.h) {
                        out.push({ key, kind: 'event', from: mapId, evId: ev.id, ex: ev.x, ey: ev.y, hb: pg.hb || ev.hb, prio: pg.prio, trigger: pg.trigger,
                            failed: pageFailed.length ? pageFailed.slice() : null, choices: [], to: { map: mapId, x: tx, y: ty }, warp: true });
                    }
                }
            }
            }
            return out;
        },

        activitiesOf(mapId) {
            const map = this.maps[mapId];
            if (!map) return [];
            const out = [], pickups = [];
            for (const ev of map.events) {
                const pg = this.activePage(map, ev);
                if (!pg) continue;
                if (this.pickupState(map, ev, pg)) {
                    pickups.push({ type: 'pickup', evId: ev.id, x: ev.x, y: ev.y, label: '[아이템] ' + pickupLabel(ev) + ' (' + ev.x + ',' + ev.y + ')', sort: 4 });
                    continue;
                }
                if (pg.hev && !ev.template && pg.trigger <= 2 && !pg.battle && pg.n > 1 && !pg.transfers.some(t => !t.ce && !t.conds.some(isChoiceCond)) && !(PROF.hExcludeNameRe && PROF.hExcludeNameRe.test(ev.name)) && !/harass/i.test(pg.speaker || '')) {
                    const done = (($gameSystem && $gameSystem._navTalked) || {})[mapId + ':' + ev.id + ':' + ev.pages.indexOf(pg)];
                    let hn = speakerName(pg.speaker) || cleanName(ev.name);
                    if (/harass/i.test(hn)) hn = '성희롱 NPC';
                    if (!hn || /^(A\d+|EV\d+|\d+|\?+)$/i.test(hn)) hn = '';
                    out.push({ type: 'talk', evId: ev.id, label: '[H 이벤트] ' + (hn ? hn + ' ' : '') + '(' + ev.x + ',' + ev.y + ')' + (done ? ' (봤음)' : '') + (pg.danger ? ' (주의: 엔딩 분기)' : ''), sort: done ? 4.5 : 1.5, hev: true });
                    continue;
                }
                if (pg.trigger !== 0 || ev.template) continue;
                const nm = cleanName(ev.name);
                if (pg.shop && Cond.all(pg.shop.conds, mapId, ev.id)) {
                    const who = okName(speakerName(pg.speaker)) || okName(pg.shop.name) || okName(nm) || ('(' + ev.x + ',' + ev.y + ')');
                    const goods = pg.shop.goods.map(g => goodName(g)).filter(Boolean).slice(0, 3).join(', ');
                    out.push({ type: 'shop', evId: ev.id, label: '[상점] ' + who + (goods ? ' (' + goods + '...)' : ''), sort: 0 });
                    continue;
                }
                const tele = pg.transfers.filter(t => t.conds.some(isChoiceCond));
                if (tele.length >= 2) {
                    out.push({ type: 'talk', evId: ev.id, label: '[이동 장치] ' + (okName(speakerName(pg.speaker)) || okName(nm) || '전송 장치') + ' (' + ev.x + ',' + ev.y + ')', sort: 1 });
                    continue;
                }
                if ((pg.speaker || (PROF.talkWithoutName && pg.msgs > 0)) && pg.img && pg.img[0] !== '!' && pg.transfers.length === 0) {
                    const useful = this.isUsefulTalk(pg, mapId, ev.id);
                    if (!useful) continue; // 의미 없는 잡담 주민은 목록에서 제외
                    out.push({ type: 'talk', evId: ev.id, label: (useful ? '[대화] ' : '[잡담] ') + (okName(speakerName(pg.speaker)) || okName(nm) || 'NPC') + ' (' + ev.x + ',' + ev.y + ')' + (pg.danger ? ' (주의: 엔딩 분기)' : ''), sort: useful ? 2 : 5 });
                }
            }
            out.sort((a, b) => a.sort - b.sort);
            if (pickups.length) {
                out.push({ type: 'pickupAll', evIds: pickups.map(p => p.evId), label: '[아이템] 이 지역 아이템 모두 줍기 (' + pickups.length + '개' + (mapId === $gameMap.mapId() ? '' : ', 추정') + ')', sort: 3 });
                for (const p of pickups) out.push(p);
            }
            return out;
        },

        // 줍기 가능 여부: 현재 맵은 실제 페이지, 다른 맵은 초기화 전(자동실행) 상태면 '있을 것'으로 추정
        pickupState(map, ev, pg) {
            if (ev.template && TPL_EXCLUDE && TPL_EXCLUDE.test(ev.name)) return false;
            if (this.isCollectPage(ev, pg, map.id)) return true;
            if (!ev.template || map.id === $gameMap.mapId()) return false;
            return pg.trigger === 3 && ev.pages.some(p => this.isCollectPage(ev, p));
        },

        isPickupLive(ge) {
            if (!ge || ge._erased || ge._pageIndex < 0) return false;
            const ev = this.findEvent($gameMap.mapId(), ge.eventId());
            if (!ev) return false;
            if (ev.template && TPL_EXCLUDE && TPL_EXCLUDE.test(ev.name)) return false;
            return this.isCollectPage(ev, ev.pages[ge._pageIndex], $gameMap.mapId());
        },

        findEvent(mapId, evId) {
            const map = this.maps[mapId];
            return map ? map.events.find(e => e.id === evId) : null;
        }
    };

    // 평행 처리 이벤트가 '지형 태그 == N 이면 대미지'를 거는 경우 그 태그 목록 (독늪/전류 바닥/마그마 등)
    // 입체 교차(다리) 리전: OverpassTile 플러그인 설정
    const OVER = (() => {
        let over = 0, gate = 0;
        try {
            const p = PluginManager.parameters('OverpassTile') || {};
            over = Number(p.overPathRegion || 0); gate = Number(p.gatewayRegion || 0);
        } catch (e) { /* 없음 */ }
        return { over, gate };
    })();

    function hazardTagsOf(pages) {
        const tags = [];
        for (const pg of pages || []) {
            if (!pg || (pg.trigger !== 3 && pg.trigger !== 4)) continue;
            const txt = JSON.stringify(pg.list || []);
            if (!/"code":311[,}]/.test(txt) && !/대미지|ダメージ|damage/i.test(txt)) continue;
            txt.replace(/terrainTag\((?:[^()]|\([^()]*\))*\)\s*={2,3}\s*(\d+)/g, (_, n) => { if (!tags.includes(Number(n))) tags.push(Number(n)); return ''; });
        }
        return tags;
    }

    function compilePage(pg) {
        const s = scanList(pg.list, 0);
        const te = [];
        let cmt = '';
        for (const c of pg.list || []) {
            if (c.code !== 108 && c.code !== 408) continue;
            cmt += String(c.parameters[0] || '') + '\n';
            String(c.parameters[0] || '').replace(/\\TE\{(.+?)\}/gi, (_, x) => { te.push(x); return ''; });
        }
        // 밀기 물체가 거부하는 방향: 최상위 '플레이어가 d 방향을 보고 있으면 -> 이벤트 중단'
        const noPush = [];
        const L = pg.list || [];
        for (let i = 0; i < L.length; i++) {
            const c = L[i];
            if (c.indent !== 0 || c.code !== 111 || c.parameters[0] !== 6 || c.parameters[1] !== -1) continue;
            for (let j = i + 1; j < L.length; j++) {
                if (L[j].indent === 0) break;
                if (L[j].code === 115 && L[j].indent === 1) { noPush.push(c.parameters[2]); break; }
            }
        }
        let faceDir = 0;
        for (const c of pg.list || []) {
            if (c.indent !== 0 || c.code === 108 || c.code === 408) continue;
            if (c.code === 111 && c.parameters[0] === 6 && c.parameters[1] === -1) faceDir = c.parameters[2];
            break;
        }
        return {
            faceDir: faceDir, noPush: noPush,
            cond: pg.conditions, trigger: pg.trigger, prio: pg.priorityType,
            fixed: pg.moveType === 0 && !pg.through, through: !!pg.through, n: pg.list.length,
            img: pg.image ? (pg.image.characterName || (pg.image.tileId ? '#tile' : '')) : '',
            transfers: s.transfers, shop: s.shop, speaker: s.speaker, msgs: s.msgs, gain: s.gain, battle: s.battle,
            vars: s.vars, changes: s.changes, recover: s.recover, dmsgs: s.dmsgs, dchanges: s.dchanges, gains: s.gains,
            danger: s.danger || s.transfers.some(t => Index.endingMaps && Index.endingMaps.has(t.map)),
            te: te, choices: s.choices, effects: s.effects, dsw: s.dsw, swOn: s.swOn, pmove: s.pmove || null, push: !!s.pushSelf, hev: !!s.hev, gainIds: s.gainIds, stock: s.stock,
            ssOn: s.ssOn, loseIds: s.loseIds, quest: s.quest, vops: s.vops, ssExt: s.ssExt,
            hb: Adapt.hitbox(cmt), enemy: Adapt.isChaser(pg)
        };
    }
    // 템플릿 이벤트 이름 규칙 (프로필)
    const TPL_NAME = PROF.template.names || [];
    // 아이템 대신 변수/자원을 주는 수집물(에테르 등)도 줍기 대상으로 취급
    const COLLECT_RE = PROF.template.collectRe || null;
    const TPL_EXCLUDE = PROF.template.excludeRe || null;
    const TPL_BREAK = PROF.template.breakableRe || null;
    function pickupLabel(ev) {
        if (!ev.template) return '조사 지점';
        const n = String(ev.name || '').replace(/^I[DE]\d+:\s*/, '');
        for (const [re, ko] of TPL_NAME) if (re.test(n)) return ko;
        return cleanName(n) || '아이템';
    }

    function speakerName(t) {
        return String(t || '')
            .replace(/\\v\[(\d+)\]/gi, (_, n) => String($gameVariables.value(Number(n))))
            .replace(/\\n\[(\d+)\]/gi, (_, n) => { const a = $gameActors.actor(Number(n)); return a ? a.name() : ''; })
            .replace(/\\[A-Za-z]+(\[[^\]]*\])?/g, '').replace(/[<>]/g, '').trim();
    }

    function cleanName(n) {
        n = String(n || '');
        if (/^EV\d+$/i.test(n) || /^NPC\d+$/i.test(n)) return '';
        return NAME_JP[n] || n;
    }
    function goodName(g) {
        const db = g[0] === 0 ? $dataItems : g[0] === 1 ? $dataWeapons : $dataArmors;
        const it = db && db[g[1]];
        return it ? it.name : '';
    }

    //=========================================================================
    // 경로 계산
    //=========================================================================
    const Planner = {
        // 정적 통행 데이터 기반 BFS -> 거리 배열
        staticBfs(map, sx, sy, obst) {
            const w = map.w, h = map.h, pass = map.pass, ovr = map.ovr;
            const L = ovr ? 2 : 1;
            const dist = new Int32Array(w * h).fill(-1);
            if (sx < 0 || sy < 0 || sx >= w || sy >= h) return dist;
            const sd = new Int32Array(w * h * L).fill(-1);
            const q = new Int32Array(w * h * L);
            let qh = 0, qt = 0;
            const si = sy * w + sx;
            const s0 = si * L + (ovr && ovr[si] ? 1 : 0); // 장소 이동 직후: 다리 위/입구면 위층
            sd[s0] = 0; dist[si] = 0; q[qt++] = s0;
            while (qh < qt) {
                const st = q[qh++], i = (st / L) | 0, lv = st % L, x = i % w, y = (i / w) | 0;
                for (const d of DIRS) {
                    const nx = x + DX[d], ny = y + DY[d];
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const j = ny * w + nx;
                    let ok;
                    if (ovr && ovr[i] === 2 && ovr[j] === 1) ok = true;
                    else if (ovr && ovr[i] === 1 && lv) ok = ovr[j] === 1 || ovr[j] === 2;
                    else if (ovr && ovr[i] === 1 && !lv && ovr[j] === 2) ok = false;
                    else ok = !!(pass[i] & DBIT[d]) && !!(pass[j] & DBIT[REV[d]]);
                    if (!ok) continue;
                    const nl = !ovr ? 0 : ovr[j] === 2 ? 1 : ovr[j] === 1 ? lv : 0;
                    const sj = j * L + nl;
                    if (sd[sj] >= 0) continue;
                    if (obst && obst.has(j)) continue;
                    if (obst && obst.oneway && obst.oneway.has(j) && obst.oneway.get(j) !== d) continue;
                    if (obst && obst.push && obst.push.has(j)) {
                        // 밀 수 있는 물체: 같은 방향 한 칸 뒤가 비어 있어야 밀고 들어갈 수 있음
                        const kx = nx + DX[d], ky = ny + DY[d];
                        if (kx < 0 || ky < 0 || kx >= w || ky >= h) continue;
                        const k = ky * w + kx;
                        if (obst.push.get(j).includes(d)) continue;
                        if (!(pass[j] & DBIT[d]) || !(pass[k] & DBIT[REV[d]]) || obst.has(k) || obst.push.has(k)) continue;
                    }
                    sd[sj] = sd[st] + 1;
                    if (dist[j] < 0 || sd[sj] < dist[j]) dist[j] = sd[sj];
                    if (obst && obst.stop && obst.stop.has(j)) continue;
                    q[qt++] = sj;
                }
            }
            return dist;
        },
        // 이벤트에 상호작용 가능한 지점까지의 최소 거리
        spotDist(map, dist, ex, ey, prio, hb) {
            const w = map.w, h = map.h;
            const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? -1 : dist[y * w + x];
            let best = -1;
            const take = v => { if (v >= 0 && (best < 0 || v < best)) best = v; };
            // 큰 이벤트(판정 확장)는 차지한 모든 칸 기준
            for (const [tx, ty] of hbTiles(ex, ey, hb)) {
                if (prio !== 1) take(at(tx, ty));
                for (const d of DIRS) {
                    take(at(tx - DX[d], ty - DY[d]));
                    take(at(tx - 2 * DX[d], ty - 2 * DY[d]) >= 0 && prio === 1 ? at(tx - 2 * DX[d], ty - 2 * DY[d]) + 1 : -1);
                }
            }
            return best;
        },

        // 현재 위치에서 모든 도달 가능한 상태 탐색 (다익스트라)
        explore(blacklist) {
            const start = { map: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y };
            // 출발 맵은 실제 게임 통행 판정(문 열기 포함)으로 계산
            let startField = null;
            try { if ($dataMap && $gameMap.events) startField = Runner.liveField(0, false, true, { traps: NavCfg.allowTraps }); } catch (e) { startField = null; }
            this._startField = startField;
            const liveCache = new Map();
            this._liveFrom = s => {
                if (s.map !== $gameMap.mapId() || !startField) return null;
                const k = s.x + ',' + s.y;
                if (!liveCache.has(k)) liveCache.set(k, Runner.liveField(0, false, true, { sx: s.x, sy: s.y, traps: NavCfg.allowTraps }));
                return liveCache.get(k);
            };
            const key = s => s.map + ',' + s.x + ',' + s.y;
            const best = new Map();
            const edgeCache = {};
            const bfsCache = new Map();
            const obstCache = {};
            const getBfs = s => {
                const k = key(s);
                if (!obstCache[s.map]) obstCache[s.map] = Index.obstacles(s.map);
                if (!bfsCache.has(k)) bfsCache.set(k, this.staticBfs(Index.maps[s.map], s.x, s.y, obstCache[s.map]));
                return bfsCache.get(k);
            };
            const open = [{ s: start, cost: 0, hops: 0, prev: null, edge: null }];
            best.set(key(start), open[0]);
            let expansions = 0;
            while (open.length && expansions < 5000) {
                let bi = 0;
                for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
                const node = open.splice(bi, 1)[0];
                if (best.get(key(node.s)) !== node) continue;
                expansions++;
                const map = Index.maps[node.s.map];
                if (!map) continue;
                const dist = getBfs(node.s);
                if (!edgeCache[map.id]) edgeCache[map.id] = Index.edgesOf(map.id, blacklist);
                const edges = edgeCache[map.id].slice();
                if (node === best.get(key(start))) {
                    for (const ie of Index.itemEdges) {
                        if (!$gameParty.hasItem($dataItems[ie.itemId])) continue;
                        if (!Index.maps[ie.to.map] || !Cond.all(ie.conds, 0, 0)) continue;
                        edges.push({ key: 'item:' + ie.itemId + ':' + ie.to.map, kind: 'item', itemId: ie.itemId, ceId: ie.ceId, choices: ie.conds.filter(isChoiceCond).map(choiceToken), to: ie.to, from: map.id });
                    }
                }
                for (const e of edges) {
                    if (blacklist && blacklist.has(e.key)) continue;
                    let d;
                    if (e.kind === 'item') d = 20;
                    else if (startField && map.id === $gameMap.mapId()) {
                        // 현재 맵은 어느 지점에서 출발하든 실제 통행 판정 사용
                        const ge = $gameMap.event(e.evId);
                        if (!ge) continue;
                        const pg = ge.page();
                        const fld = node === best.get(key(start)) ? startField : this._liveFrom(node.s);
                        const p = Runner.pathFrom(fld, Runner.spotsFor(ge, pg ? pg.priorityType : e.prio));
                        if (!p) continue;
                        d = p.dirs.length;
                    } else {
                        d = this.spotDist(map, dist, e.ex, e.ey, e.prio, e.hb);
                        if (d < 0) continue;
                    }
                    const ns = { map: e.to.map, x: e.to.x, y: e.to.y };
                    const cost = node.cost + 10 + d * 0.05;
                    const k = key(ns);
                    const old = best.get(k);
                    if (!old || cost < old.cost) {
                        const nn = { s: ns, cost, hops: node.hops + 1, prev: node, edge: e };
                        best.set(k, nn); open.push(nn);
                    }
                }
            }
            this._bfsCache = bfsCache;
            this._getBfs = getBfs;
            return best;
        },

        // 지도별 최선 도착 노드 목록
        destinations(blacklist) {
            const best = this.explore(blacklist);
            const byMap = {};
            for (const n of best.values()) {
                const m = n.s.map;
                (byMap[m] = byMap[m] || []).push(n);
            }
            for (const m in byMap) byMap[m].sort((a, b) => a.cost - b.cost);
            return byMap;
        },

        // 도달 가능 여부: { ok, hops }
        reach(mapId, evId, byMap, field) {
            const map = Index.maps[mapId];
            const ev = Index.findEvent(mapId, evId);
            const nodes = byMap[mapId];
            if (!map || !ev || !nodes) return { ok: false };
            const cur = $gameMap.mapId();
            if (mapId === cur && field) {
                const ge = $gameMap.event(evId);
                if (ge) {
                    const pg = ge.page();
                    if (Runner.pathFrom(field, Runner.spotsFor(ge, pg ? pg.priorityType : 1))) return { ok: true, hops: 0 };
                }
            }
            const pg = Index.activePage(map, ev) || ev.pages[0];
            let best = null;
            for (const n of nodes) {
                if (mapId === cur && field && (!n.edge || field.dist[n.s.y * field.w + n.s.x] >= 0)) continue;
                let d;
                const lf = mapId === cur && this._liveFrom ? this._liveFrom(n.s) : null;
                if (lf) {
                    const ge = $gameMap.event(evId), gp = ge && ge.page();
                    const p = ge ? Runner.pathFrom(lf, Runner.spotsFor(ge, gp ? gp.priorityType : pg.prio)) : null;
                    d = p ? p.dirs.length : -1;
                } else d = this.spotDist(map, this._getBfs(n.s), ev.x, ev.y, pg.prio, pg.hb || ev.hb);
                if (d >= 0 && (!best || n.hops < best.hops)) best = { ok: true, hops: n.hops };
            }
            return best || { ok: false };
        },

        legsTo(node) {
            const legs = [];
            for (let n = node; n && n.edge; n = n.prev) legs.unshift(n.edge);
            return legs;
        },

        // 목표(맵 + 선택적 이벤트)까지의 경로
        plan(target, blacklist, cachedByMap, requireDetour) {
            const byMap = cachedByMap || this.destinations(blacklist);
            const nodes = byMap[target.map];
            if (!nodes) return null;
            if (!target.evId) return { legs: this.legsTo(nodes[0]), final: target, hops: nodes[0].hops };
            const map = Index.maps[target.map];
            const ev = Index.findEvent(target.map, target.evId);
            if (!ev) return null;
            const pg = Index.activePage(map, ev) || ev.pages[0];
            let bestNode = null, bestCost = Infinity;
            for (const n of nodes) {
                if (requireDetour && (!n.edge || (typeof requireDetour === 'function' && !requireDetour(n)))) continue; // 현재 위치 영역 제외
                let d;
                const lf = this._liveFrom && this._liveFrom(n.s);
                if (lf) {
                    const ge = $gameMap.event(target.evId);
                    const gp = ge && ge.page();
                    const p = ge ? Runner.pathFrom(lf, Runner.spotsFor(ge, gp ? gp.priorityType : pg.prio)) : null;
                    d = p ? p.dirs.length : -1;
                } else {
                    d = this.spotDist(map, this._getBfs(n.s), ev.x, ev.y, pg.prio, pg.hb || ev.hb);
                }
                if (d < 0) continue;
                const c = n.cost + d * 0.05;
                if (c < bestCost) { bestCost = c; bestNode = n; }
            }
            if (!bestNode) {
                if (requireDetour || target.map === $gameMap.mapId()) return null;
                bestNode = nodes[0]; // 이동 중인 NPC 등은 현장에서 재탐색
            }
            return { legs: this.legsTo(bestNode), final: target, hops: bestNode.hops };
        }
    };

    //=========================================================================
    // 실행기 (자동 이동)
    //=========================================================================
    const NavLog = {
        lines: [],
        reset() { this.lines = []; },
        add(msg) {
            const t = (Graphics.frameCount || 0);
            const pos = (typeof $gameMap !== 'undefined' && $gameMap) ? ' [map ' + $gameMap.mapId() + ' ' + $gamePlayer.x + ',' + $gamePlayer.y + ']' : '';
            this.lines.push(t + pos + ' ' + msg);
            if (this.lines.length > 300) this.lines.shift();
            this.dirty = true; // 파일 쓰기는 모아서 (이동 중 끊김 방지)
        },
        tick() { if (this.dirty && (Graphics.frameCount % 60 === 0 || !Runner.active)) { this.dirty = false; this.flush(); } },
        flush() {
            try {
                const fs = require('fs'), path = require('path');
                fs.writeFileSync(path.join(Index.baseDir(), 'autonav_log.txt'), this.lines.join('\n'));
            } catch (e) { /* 무시 */ }
        }
    };

    const Runner = {
        badTargets: new Set(), // 도착해 보니 상호작용 불가였던 대상 (이번 실행 동안 추천 제외)
        active: false, legs: [], final: null, phase: '', path: null,
        pendingChoices: [], blacklist: new Set(), status: '', frames: 0, fails: 0,
        triggerFrame: 0, startMap: 0, blockCount: 0, targetPos: null,

        // opts: { mode: 'talk'|'pickup', queue: [eventId...] }
        start(plan, label, opts) {
            opts = opts || {};
            if (this._tempTraps) NavLog.add('TEMP traps allowed for this run');
            this.mode = opts.mode || 'talk';
            this.queue = (opts.queue || []).slice();
            this.kinds = opts.kinds || {};
            this.skipped = new Set();
            this.detourTried = {};
            this._lockedDoors = new Set();
            this.picked = 0;
            this.curTarget = 0;
            this.side = null; this.sideDone = new Set(); this._sidePos = null;
            this._blocked = null;
            this.exitTo = opts.exitTo || 0;
            this.tour = opts.tour || null;
            this._tourLabel = opts.tourLabel || null;
            if (!opts.tour) this._tourDone = 0;
            this.active = true;
            NavLog.add('START ' + label + ' mode=' + this.mode + ' queue=' + JSON.stringify(this.queue) + ' legs=' + plan.legs.map(l => l.kind + ':' + l.from + '/ev' + (l.evId || l.itemId) + '->' + l.to.map + '@' + l.to.x + ',' + l.to.y).join(' | '));
            this.legs = plan.legs.slice();
            this.final = plan.final;
            this.label = label;
            this.fails = 0;
            this.blacklist = new Set();
            this.beginLeg();
        },
        stop(msg) {
            if (this.active) NavLog.add('STOP ' + (msg || '(정상 종료)'));
            this._tempTraps = false;
            this.active = false;
            this._blocked = null;
            this.legs = []; this.path = null; this.pendingChoices = [];
            this.setStatus(msg || '');
            this._statusTimer = msg ? 420 : 0;
        },
        setStatus(s) { this.status = s; },
        isMulti() { return this.mode === 'pickup' || this.mode === 'batch'; },
        targetAlive(id) {
            const ge = $gameMap.event(id);
            if ((this.kinds[id] || 'pickup') === 'pickup') return Index.isPickupLive(ge);
            return !!ge && !ge._erased && !!ge.page() && ge.list().length > 1;
        },
        curLeg() { return this.legs[0] || null; },

        beginLeg() {
            this.path = null; this.frames = 0; this.blockCount = 0; this.targetPos = null;
            const leg = this.curLeg();
            NavLog.add('LEG ' + (leg ? leg.kind + ' from ' + leg.from + ' ev' + (leg.evId || leg.itemId) + ' -> ' + leg.to.map : 'final, queue=' + JSON.stringify(this.queue)));
            const total = this._totalLegs || 0;
            if (leg) {
                this.phase = leg.kind === 'item' ? 'item' : 'walk';
                const m = Index.maps[leg.to.map];
                this.setStatus('자동 이동 중 -> ' + this.label + '  (다음: ' + (m ? m.name : leg.to.map) + ')   [방향키/ESC: 중단]');
            } else if (this.queue && this.queue.length) {
                this.phase = 'walkFinal';
                this.curTarget = 0;
                this.setStatus((this.isMulti() ? (this.mode === 'batch' ? '진행 중' : '아이템 줍는 중') + ' (' + this.picked + '개 완료, 남은 ' + this.queue.length + ')' : '목표로 이동 중 -> ' + this.label) + '   [방향키/ESC: 중단]');
            } else {
                this.finish('도착: ' + this.label);
            }
        },

        replan(reason) {
            this.fails++;
            NavLog.add('REPLAN #' + this.fails + ' ' + reason);
            if (this.fails > 6) { this.stop('자동 이동 실패: ' + reason); return; }
            const plan = Planner.plan(this.final, this.blacklist);
            if (!plan) { this.stop('경로를 찾지 못했습니다 (' + reason + ')'); return; }
            this.legs = plan.legs.slice();
            this.beginLeg();
        },

        isIdle() {
            return !$gamePlayer.isTransferring() && !$gameMap.isEventRunning() && !$gameMessage.isBusy() && !$gamePlayer.isMoving();
        },

        // 전투/메뉴에서 맵으로 돌아온 직후 잠깐은 키 입력(결과창 확인 등)으로 중단하지 않음
        onSceneMapStart() { this.path = null; this._dirHold = 0; this._resumeGuard = Graphics.frameCount + 45; },
        inResumeGuard() { return this._resumeGuard && Graphics.frameCount < this._resumeGuard; },

        update() {
            if (this._statusTimer > 0 && --this._statusTimer === 0 && !this.active) this.status = '';
            if (!this.active) return;
            this.frames++;
            if (this.phase === 'triggered') return this.updateTriggered();
            if (this.phase === 'triggeredFinal') return this.updateTriggeredFinal();
            if (this.phase === 'door') return this.updateDoor();
            if (this.phase === 'sideTrig') return this.updateSideTrig();
            if (!this.isIdle()) {
                // 걷는 중(한 칸 이동 중)에는 경로 유지, 이벤트/장소 이동 중일 때만 경로 재계산
                if (!$gamePlayer.isMoving() || $gameMap.isEventRunning() || $gamePlayer.isTransferring()) this.path = null;
                return;
            }
            if (this.phase === 'side') return this.updateSide();
            if ((this.phase === 'walk' || this.phase === 'walkFinal') && this.checkSide()) return;
            if (this.phase === 'item') return this.useItem();
            const leg = this.curLeg();
            if (leg) {
                if (leg.to.map !== leg.from && $gameMap.mapId() === leg.to.map) { this.legs.shift(); this.beginLeg(); return; }
                if ($gameMap.mapId() !== leg.from) { this.replan('예상과 다른 맵'); return; }
                this.walkTo(leg.evId, leg.prio, () => this.triggerEvent(leg.evId, leg.prio, leg.trigger, leg.choices));
            } else if (this.phase === 'walkFinal') {
                if (this.exitTo && $gameMap.mapId() === this.exitTo) { this.finish('도착: ' + Index.maps[this.exitTo].name); return; }
                if ($gameMap.mapId() !== this.final.map) { this.replan('목표 맵이 아님'); return; }
                if (!this.curTarget) {
                    if (this.isMulti()) {
                        if (this.choosePickup()) return;
                        if (!this.curTarget) return;
                    } else {
                        this.curTarget = this.queue[0];
                    }
                    this.frames = 0; this.blockCount = 0; this.path = null;
                }
                const id = this.curTarget;
                const ge = $gameMap.event(id);
                if (!ge) { this.skipTarget('대상을 찾을 수 없습니다'); return; }
                if (ge._erased || !ge.page() || ge.list().length <= 1) {
                    NavLog.add('SKIP ev' + id + ' (지금은 상호작용할 수 없는 상태)');
                    this.badTargets.add($gameMap.mapId() + ':' + id);
                    this.skipTarget('지금은 상호작용할 수 없는 상태입니다');
                    return;
                }
                const pg = ge.page();
                const prio = pg ? pg.priorityType : 1;
                this.walkTo(id, prio, () => {
                    this.triggerEvent(id, prio, 0, []);
                    this.phase = 'triggeredFinal';
                });
            }
        },

        // 이동 경로 근처(걸어서 5칸 이내)의 아이템은 잠깐 들러서 줍고 원래 경로로 복귀
        checkSide() {
            if (!NavCfg.sidePick) return false;
            const px = $gamePlayer.x, py = $gamePlayer.y, mapId = $gameMap.mapId();
            if (this._sidePos && this._sidePos.m === mapId && Math.abs(this._sidePos.x - px) + Math.abs(this._sidePos.y - py) < 2) return false;
            this._sidePos = { m: mapId, x: px, y: py };
            this.sideDone = this.sideDone || new Set();
            const R = NavCfg.sideRange;
            const cands = [];
            for (const ge of $gameMap.events()) {
                if (Math.abs(ge.x - px) + Math.abs(ge.y - py) > R + 1) continue;
                const id = ge.eventId(), key = mapId + ':' + id;
                if (id === this.curTarget || this.sideDone.has(key) || this.badTargets.has(key)) continue;
                if (this.skipped && this.skipped.has(id)) continue;
                const ev = Index.findEvent(mapId, id);
                if (Index.oneWayDir(ev) && !ge.isThrough() && ge.isNormalPriority() && ge.page()) { cands.push(ge); continue; } // 빗장 문(지름길)
                if (!Index.isPickupLive(ge)) continue;
                if (ev && PROF.sideExcludeRe && PROF.sideExcludeRe.test(ev.name)) continue; // 폭탄 항아리/함정 상자는 제외
                cands.push(ge);
            }
            if (!cands.length) return false;
            const field = this.liveField(0, true, false);
            let best = null;
            for (const ge of cands) {
                const pg = ge.page();
                const p = this.pathFrom(field, this.spotsFor(ge, pg ? pg.priorityType : 1));
                if (!p || p.dirs.length > R) continue;
                // 비용이 걸음 수보다 크면 독늪 등 피해 칸을 지나야 함 -> 제외
                if (field.dist[p.spot.y * field.w + p.spot.x] > p.dirs.length) continue;
                if (!best || p.dirs.length < best.p.dirs.length) best = { ge, p };
            }
            if (!best) return false;
            this.side = { id: best.ge.eventId(), ret: this.phase, path: best.p, frames: 0 };
            NavLog.add('SIDE ev' + this.side.id + ' (' + best.p.dirs.length + ' steps)');
            this.phase = 'side';
            this.path = null;
            return true;
        },

        updateSide() {
            const sd = this.side;
            const ge = sd && $gameMap.event(sd.id);
            const alive = ge && (Index.oneWayDir(Index.findEvent($gameMap.mapId(), sd.id)) ? (!ge.isThrough() && ge.isNormalPriority()) : Index.isPickupLive(ge));
            if (!alive || ++sd.frames > 60 * 20) return this.endSide();
            const p = sd.path;
            if (!p.dirs.length) {
                if (p.spot.face) $gamePlayer.setDirection(p.spot.face);
                const pg = ge.page();
                if (pg && pg.priorityType !== 1 && ge.x === $gamePlayer.x && ge.y === $gamePlayer.y) $gamePlayer.checkEventTriggerHere([0, 1, 2]);
                else $gamePlayer.checkEventTriggerThere([0, 1, 2]);
                if (!$gameMap.isEventRunning() && !ge.isStarting() && ge.page() && ge.list().length > 1) ge.start();
                this.phase = 'sideTrig';
                this.triggerFrame = this.frames;
                return;
            }
            $gamePlayer.moveStraight(p.dirs[0]);
            if ($gamePlayer.isMovementSucceeded()) p.dirs.shift();
            else this.endSide();
        },

        updateSideTrig() {
            if (this.frames - this.triggerFrame < 8 || !this.isIdle()) return;
            this.picked = (this.picked || 0) + 1;
            this.endSide();
        },

        endSide() {
            if (this.side) { this.sideDone = this.sideDone || new Set(); this.sideDone.add($gameMap.mapId() + ':' + this.side.id); }
            this.phase = this.side ? this.side.ret : this.phase;
            this.side = null;
            this.path = null;
            this._sidePos = null;
        },

        useItem() {
            const leg = this.curLeg();
            const item = $dataItems[leg.itemId];
            if (!$gameParty.hasItem(item)) { this.blacklist.add(leg.key); this.replan('아이템 없음'); return; }
            this.pendingChoices = leg.choices.slice();
            $gameTemp.reserveCommonEvent(leg.ceId);
            this.startMap = $gameMap.mapId();
            this.phase = 'triggered'; this.triggerFrame = this.frames;
        },

        // 상호작용 지점 목록: [{x,y,face}]
        spotsFor(ge, prio) {
            const spots = [];
            const ex = ge.x, ey = ge.y;
            const ow = Index.oneWayDir(Index.findEvent($gameMap.mapId(), ge.eventId()));
            if (ow && !ge.isThrough() && ge.isNormalPriority()) {
                const s1 = { x: ex - DX[ow], y: ey - DY[ow], face: ow };
                return $gameMap.isValid(s1.x, s1.y) ? [s1] : [];
            }
            // 큰 이벤트(판정 확장): 차지한 칸 전체가 대상, 그 바깥 이웃 칸에서 바라보면 됨
            const hb = liveHitbox(ge);
            const tiles = hbTiles(ex, ey, hb);
            const inside = (x, y) => tiles.some(t => t[0] === x && t[1] === y);
            for (const [tx, ty] of tiles) {
                if (prio !== 1) spots.push({ x: tx, y: ty, face: 0 });
                for (const d of DIRS) {
                    const mx = tx - DX[d], my = ty - DY[d];
                    if (hb && inside(mx, my)) continue;
                    spots.push({ x: mx, y: my, face: d });
                    if (prio === 1 && $gameMap.isValid(mx, my) && $gameMap.isCounter(mx, my)) {
                        spots.push({ x: tx - 2 * DX[d], y: ty - 2 * DY[d], face: d });
                    }
                }
            }
            return spots.filter(s => $gameMap.isValid(s.x, s.y));
        },

        // 회피 칸: 다른 접촉형 이벤트(문/함정/이동 지점) + 적 심볼 주변
        avoidSet(targetId, withEnemies, allowTraps) {
            const w = $dataMap.width;
            const avoid = new Set();
            const mapId = $gameMap.mapId();
            for (const ev of $gameMap.events()) {
                if (ev.eventId() === targetId || ev._erased || !ev.page()) continue;
                const info = Index.findEvent(mapId, ev.eventId());
                const pg = info ? info.pages[ev._pageIndex] : null;
                if (pg && (pg.battle || pg.enemy)) {
                    // 추격형 적(접촉 시 피해)은 항상 피하고, 전투 심볼은 설정에 따라
                    if (!withEnemies && !pg.enemy) continue;
                    for (const [tx, ty] of hbTiles(ev.x, ev.y, liveHitbox(ev))) {
                        avoid.add(ty * w + tx);
                        for (const d of DIRS) {
                            const nx = tx + DX[d], ny = ty + DY[d];
                            if ($gameMap.isValid(nx, ny)) avoid.add(ny * w + nx);
                        }
                    }
                    continue;
                }
                if (ev.isNormalPriority() || !ev.isTriggerIn([1, 2])) continue;
                if (ev.list().length <= 1) continue;
                // 발밑 아이템(꽃/씨앗/에테르)은 밟아도 됨
                if (Index.isPickupLive(ev)) continue;
                // 함정/기믹(맵 이동이 없는 접촉 이벤트)은 설정에서 허용한 경우 마지막 수단으로 통과
                // 단, 맵 이동/엔딩 분기/대사 많은 스토리 이벤트 칸은 항상 피함
                if (allowTraps && pg && !pg.transfers.length && !pg.danger && pg.dmsgs < 3) continue;
                for (const [tx, ty] of hbTiles(ev.x, ev.y, liveHitbox(ev))) if ($gameMap.isValid(tx, ty)) avoid.add(ty * w + tx);
            }
            return avoid;
        },

        // 플레이어 위치에서 전체 BFS (실제 통행 판정 사용)
        // 열 수 있는 문 칸 목록 (잠겨서 실패한 문 제외)
        doorSet() {
            const w = $dataMap.width, set = new Set(), mapId = $gameMap.mapId();
            for (const ge of $gameMap.events()) {
                if (ge._erased || !ge.page() || ge.isThrough() || !ge.isNormalPriority()) continue;
                if (!ge.isTriggerIn([0, 1, 2]) || ge.list().length <= 1) continue;
                const k = ge.y * w + ge.x;
                if (this._lockedDoors && this._lockedDoors.has(mapId + ':' + k)) continue;
                const fe = Index.findEvent(mapId, ge.eventId());
                if (Index.isOpenable(fe)) {
                    const ow = Index.oneWayDir(fe);
                    for (const [tx, ty] of hbTiles(ge.x, ge.y, liveHitbox(ge))) {
                        if (!$gameMap.isValid(tx, ty)) continue;
                        const kk = ty * w + tx;
                        set.add(kk); if (ow) (set.dir = set.dir || new Map()).set(kk, ow);
                    }
                }
            }
            return set;
        },

        // opt: { sx, sy, traps }  sx/sy를 주면 플레이어가 아닌 임의 지점에서 탐색 (같은 맵 한정)
        liveField(targetId, withEnemies, withDoors, opt) {
            opt = opt || {};
            const w = $dataMap.width, h = $dataMap.height;
            const avoid = this.avoidSet(targetId, withEnemies, !!opt.traps);
            const doors = withDoors ? this.doorSet() : null;
            const pushes = withDoors ? this.pushSet() : null;
            // 최후 수단: 길목을 막은 적 심볼은 부딪혀서(전투) 지나감
            let foes = null;
            if (opt.throughEnemies) {
                foes = new Set();
                const mid = $gameMap.mapId();
                for (const ge of $gameMap.events()) {
                    if (ge._erased || !ge.page()) continue;
                    const info = Index.findEvent(mid, ge.eventId());
                    const pg = info ? info.pages[ge._pageIndex] : null;
                    if (pg && !pg.danger && (pg.battle || (pg.enemy && PROF.enemyContact))) foes.add(ge.y * w + ge.x);
                }
            }
            const map = Index.maps[$gameMap.mapId()];
            const haz = map && map.haz && map.w === w ? map.haz : null;
            const sx = opt.sx !== undefined ? opt.sx : $gamePlayer.x, sy = opt.sy !== undefined ? opt.sy : $gamePlayer.y;
            const si = sy * w + sx;
            // 다리(입체 교차) 맵: 위층/아래층을 따로 탐색 (상태 = 칸 x 층)
            const ovr = map && map.ovr && map.w === w ? map.ovr : null;
            const L = ovr ? 2 : 1;
            const sprev = new Int32Array(w * h * L).fill(-1);
            const spdir = new Uint8Array(w * h * L);
            const sdist = new Int32Array(w * h * L).fill(-1);
            const done = new Uint8Array(w * h * L);
            const dist = new Int32Array(w * h).fill(-1);
            // 가중치 탐색: 독늪/대미지 바닥은 비싸게, 문/밀기 물체는 약간 비싸게 -> 피해가 가장 적은 길
            const HAZ = 25, PUSH = 8, DOOR = 3;
            const startLv = !ovr ? 0 : (sx === $gamePlayer.x && sy === $gamePlayer.y ? ($gamePlayer._higher ? 1 : 0) : (ovr[si] ? 1 : 0));
            const ss = si * L + startLv;
            const buckets = [[ss]];
            sprev[ss] = ss; sdist[ss] = 0; dist[si] = 0;
            const savedHigher = $gamePlayer._higher;
            try {
            for (let c = 0; c < buckets.length; c++) {
                const b = buckets[c];
                if (!b) continue;
                for (let bi = 0; bi < b.length; bi++) {
                    const st = b[bi];
                    if (done[st] || sdist[st] !== c) continue;
                    done[st] = 1;
                    const i = (st / L) | 0, lv = st % L;
                    if (i !== si && avoid.has(i)) continue; // 들어갈 수는 있지만 통과는 안 함 (목표일 때만 사용)
                    const x = i % w, y = (i / w) | 0;
                    if (ovr) $gamePlayer._higher = !!lv;
                    for (const d of DIRS) {
                        const nx = $gameMap.roundXWithDirection(x, d), ny = $gameMap.roundYWithDirection(y, d);
                        if (!$gameMap.isValid(nx, ny)) continue;
                        const j = ny * w + nx;
                        const nl = !ovr ? 0 : ovr[j] === 2 ? 1 : ovr[j] === 1 ? lv : 0;
                        const sj = j * L + nl;
                        if (done[sj]) continue;
                        if (this.active && this._blocked && this._blockedMap === $gameMap.mapId() && this._blocked.has(j)) continue;
                        let cost = 1;
                        if (!$gamePlayer.canPass(x, y, d)) {
                            if (foes && foes.has(j)) {
                                cost += 40;
                            } else if (pushes && pushes.has(j)) {
                                // 밀 수 있는 물체: 그 뒤 칸이 비어 있어야 함
                                const ge = $gameMap.eventsXy(nx, ny).find(e => !e._erased && e.isNormalPriority());
                                if (pushes.get(j).includes(d)) continue; // 이 방향으로는 밀리지 않음
                                if (!ge || !$gameMap.isPassable(x, y, d) || !ge.canPass(nx, ny, d)) continue;
                                cost += PUSH;
                            } else {
                                // 닫힌 문: 지형상 통과 가능하면 '열고 지나가는' 칸으로 허용
                                if (!doors || !doors.has(j)) continue;
                                if (doors.dir && doors.dir.has(j) && doors.dir.get(j) !== d) continue; // 반대쪽에서 빗장이 걸린 문
                                if (!$gameMap.isPassable(x, y, d) || !$gameMap.isPassable(nx, ny, REV[d])) continue;
                                cost += DOOR;
                            }
                        }
                        if (haz && haz[j]) cost += HAZ;
                        const nd = c + cost;
                        if (sdist[sj] >= 0 && sdist[sj] <= nd) continue;
                        sdist[sj] = nd; sprev[sj] = st; spdir[sj] = d;
                        if (dist[j] < 0 || nd < dist[j]) dist[j] = nd;
                        (buckets[nd] = buckets[nd] || []).push(sj);
                    }
                }
                buckets[c] = null;
            }
            } finally { if (ovr) $gamePlayer._higher = savedHigher; }
            const allDoors = doors && pushes ? new Set([...doors, ...pushes.keys()]) : (doors || (pushes ? new Set(pushes.keys()) : null));
            return { w, si, ss, L, sprev, spdir, sdist, dist, avoid, doors: allDoors, pushes, traps: !!opt.traps };
        },

        pushSet() {
            const w = $dataMap.width, set = new Map(), mapId = $gameMap.mapId();
            for (const ge of $gameMap.events()) {
                if (ge._erased || !ge.page() || ge.isThrough() || !ge.isNormalPriority()) continue;
                const fe = Index.findEvent(mapId, ge.eventId());
                if (Index.isPushable(fe)) set.set(ge.y * w + ge.x, Index.pushNo(fe));
            }
            return set;
        },

        pathFrom(field, spots) {
            let best = null;
            for (const s of spots) {
                const k = s.y * field.w + s.x;
                const d = field.dist[k];
                if (d < 0) continue;
                if (field.avoid.has(k) && k !== field.si) continue;
                if (!best || d < best.d || (d === best.d && s.face === 0)) best = { k, d, spot: s };
            }
            if (!best) return null;
            const dirs = [], tiles = [];
            const L = field.L || 1;
            let st = best.k * L;
            for (let l = 0; l < L; l++) if (field.sdist[best.k * L + l] === best.d) { st = best.k * L + l; break; }
            for (let j = st; j !== field.ss; j = field.sprev[j]) {
                if (j < 0) return null;
                dirs.unshift(field.spdir[j]); tiles.unshift((j / L) | 0);
            }
            const doorAt = new Set();
            if (field.doors) for (const j of tiles) if (field.doors.has(j)) doorAt.add(j);
            return { dirs, spot: best.spot, steps: 0, doors: doorAt, cost: best.d };
        },

        // 우선순위: 적 회피+문 없이 > 문 없이 > 적 회피+문 열기 > 문 열기
        liveBfs(spots, targetId) {
            const p = this.pathFrom(this.liveField(targetId, true, false), spots) ||
                   this.pathFrom(this.liveField(targetId, false, false), spots) ||
                   this.pathFrom(this.liveField(targetId, true, true), spots) ||
                   this.pathFrom(this.liveField(targetId, false, true), spots);
            if (p) return p;
            // 적 심볼이 길목을 막고 있으면 잠시 기다렸다가, 그래도 막히면 전투를 감수하고 통과
            if ((this.blockCount || 0) >= 45) {
                const e = this.pathFrom(this.liveField(targetId, false, true, { throughEnemies: true, traps: NavCfg.allowTraps }), spots);
                if (e) { NavLog.add('PATH through enemy (battle)'); return e; }
            }
            if (!NavCfg.allowTraps) return p;
            const t = this.pathFrom(this.liveField(targetId, false, true, { traps: true }), spots);
            if (t) NavLog.add('PATH uses traps/gimmicks (setting on)');
            return t;
        },

        openDoor(d, nx, ny) {
            const w = $dataMap.width;
            this.doorKey = $gameMap.mapId() + ':' + (ny * w + nx);
            this.doorDir = d;
            this.doorFrom = { x: $gamePlayer.x, y: $gamePlayer.y };
            this.doorReturn = this.phase;
            $gamePlayer.setDirection(d);
            NavLog.add('DOOR open try at ' + nx + ',' + ny);
            $gamePlayer.checkEventTriggerThere([0, 1, 2]);
            if (!$gameMap.isAnyEventStarting()) {
                const ge = $gameMap.eventsXy(nx, ny).find(e => !e._erased && e.isNormalPriority());
                if (ge && ge.page() && ge.list().length > 1) ge.start();
            }
            this.phase = 'door';
            this.triggerFrame = this.frames;
            this.path = null;
        },

        updateDoor() {
            if (this.frames - this.triggerFrame < 8 || !this.isIdle()) return;
            const moved = this.doorFrom && ($gamePlayer.x !== this.doorFrom.x || $gamePlayer.y !== this.doorFrom.y);
            const ok = moved || $gamePlayer.canPass($gamePlayer.x, $gamePlayer.y, this.doorDir);
            NavLog.add('DOOR ' + (moved ? 'pushed/moved' : ok ? 'opened' : 'still closed -> locked'));
            if (!ok) {
                this._lockedDoors = this._lockedDoors || new Set();
                this._lockedDoors.add(this.doorKey);
                this.setStatus('문을 열지 못해 다른 길을 찾습니다   [방향키/ESC: 중단]');
            }
            this.phase = this.doorReturn;
            this.path = null;
        },

        walkTo(evId, prio, onArrive) {
            const ge = $gameMap.event(evId);
            if (!ge || ge._erased) { this.failLeg('대상 이벤트 없음'); return; }
            if (this.frames > 60 * 120) { this.failLeg('시간 초과'); return; }
            if (this.targetPos && (this.targetPos.x !== ge.x || this.targetPos.y !== ge.y)) this.path = null;
            // 미끄러짐/강제 이동 등으로 예상 위치에서 벗어나면 경로 재계산
            if (this.path && this.path.expect && (this.path.expect.x !== $gamePlayer.x || this.path.expect.y !== $gamePlayer.y)) this.path = null;
            if (!this.path) {
                const r = this.liveBfs(this.spotsFor(ge, prio), evId);
                if (!r) {
                    if (this.blockCount % 30 === 0) NavLog.add('NO-PATH to ev' + evId + ' at ' + ge.x + ',' + ge.y + ' (try ' + this.blockCount + ')');
                    this.blockCount++;
                    if (this.blockCount > 300) { this.failLeg('길이 막힘'); }
                    return;
                }
                this.path = r; this.targetPos = { x: ge.x, y: ge.y };
            }
            if (this.path.dirs.length === 0) {
                const face = this.path.spot.face;
                if (face) $gamePlayer.setDirection(face);
                this.path = null; this._blocked = null;
                onArrive();
                return;
            }
            const d = this.path.dirs[0];
            const bx = $gamePlayer.x, by = $gamePlayer.y;
            if (this.path.doors && this.path.doors.size) {
                const nx = $gameMap.roundXWithDirection(bx, d), ny = $gameMap.roundYWithDirection(by, d);
                if (this.path.doors.has(ny * $dataMap.width + nx) && !$gamePlayer.canPass(bx, by, d)) { this.openDoor(d, nx, ny); return; }
            }
            $gamePlayer.moveStraight(d);
            if ($gamePlayer.isMovementSucceeded()) {
                this.path.dirs.shift();
                this.path.expect = { x: $gameMap.roundXWithDirection(bx, d), y: $gameMap.roundYWithDirection(by, d) };
                this.blockCount = 0;
                // 적 심볼이 근처에 있으면 몇 걸음마다 경로 재계산
                if (++this.path.steps >= 3 && this.enemyNear(6)) this.path = null;
            } else {
                // 움직이는 캐릭터 등에 막힘 -> 해당 칸 회피 후 재탐색
                this.blockCount++;
                const w = $dataMap.width;
                const nx = $gameMap.roundXWithDirection(bx, d), ny = $gameMap.roundYWithDirection(by, d);
                if (this.blockCount > 20) {
                    if (this._blockedMap !== $gameMap.mapId()) { this._blocked = null; this._blockedMap = $gameMap.mapId(); }
                    this._blocked = this._blocked || new Set();
                    this._blocked.add(ny * w + nx);
                }
                this.path = null;
                if (this.blockCount > 240) this.failLeg('길이 막힘');
            }
        },

        enemyNear(r) {
            const mapId = $gameMap.mapId(), px = $gamePlayer.x, py = $gamePlayer.y;
            for (const ev of $gameMap.events()) {
                if (ev._erased || Math.abs(ev.x - px) + Math.abs(ev.y - py) > r) continue;
                const info = Index.findEvent(mapId, ev.eventId());
                const pg = info ? info.pages[ev._pageIndex] : null;
                if (pg && (pg.battle || pg.enemy)) return true;
            }
            return false;
        },

        triggerEvent(evId, prio, trigger, choices) {
            const ge = $gameMap.event(evId);
            if (!ge) { this.failLeg('대상 이벤트 없음'); return; }
            NavLog.add('TRIGGER ev' + evId + ' at ' + ge.x + ',' + ge.y + ' prio' + prio + ' choices=' + JSON.stringify(choices || []));
            this.pendingChoices = (choices || []).slice();
            this.startMap = $gameMap.mapId();
            if (prio !== 1 && ge.x === $gamePlayer.x && ge.y === $gamePlayer.y) {
                $gamePlayer.checkEventTriggerHere([0, 1, 2]);
            } else {
                $gamePlayer.checkEventTriggerThere([0, 1, 2]);
            }
            if (!$gameMap.isEventRunning() && !$gameMap._interpreter.isRunning()) {
                if (!ge.isStarting() && ge.page() && ge.list().length > 1) ge.start();
            }
            this.phase = 'triggered';
            this.triggerFrame = this.frames;
        },

        updateTriggered() {
            if (this.finishOnTrigger) {
                this.finishOnTrigger = false;
                this.stop('');
                return;
            }
            if (this.frames - this.triggerFrame < 8) return;
            if (!this.isIdle()) return;
            const leg = this.curLeg();
            const mapNow = $gameMap.mapId();
            NavLog.add('AFTER-TRIGGER mapNow=' + mapNow + ' expected=' + (leg ? leg.to.map : '-'));
            this.pendingChoices = [];
            if (leg && mapNow === leg.to.map) {
                if (leg.kind === 'item' && $dataItems[leg.itemId].consumable) $gameParty.consumeItem($dataItems[leg.itemId]);
                this.legs.shift();
                this.beginLeg();
            } else if (mapNow !== this.startMap) {
                this.replan('예상 밖의 이동');
            } else {
                if (leg) this.blacklist.add(leg.key);
                this.replan('이동 이벤트가 동작하지 않음');
            }
        },

        // 다음 아이템 선택. 같은 맵에서 못 가면 다른 맵을 경유하는 우회 경로를 설정. 처리 완료 시 true
        choosePickup() {
            this.skipped = this.skipped || new Set();
            this.queue = this.queue.filter(id => !this.skipped.has(id) && this.targetAlive(id));
            if (!this.queue.length) { this.finishPickup(); return true; }
            const spotsOf = id => { const ge = $gameMap.event(id); const pg = ge.page(); return this.spotsFor(ge, pg ? pg.priorityType : 1); };
            let field = null, best = null;
            const tiers = [[true, false], [false, false], [true, true], [false, true]];
            if (NavCfg.allowTraps) tiers.push([false, true, true]);
            for (const [en, dr, tr] of tiers) {
                field = this.liveField(0, en, dr, { traps: !!tr });
                const rank = id => (this.kinds[id] === 'talk' ? 0 : 1);
                for (const id of this.queue) {
                    const p = this.pathFrom(field, spotsOf(id));
                    if (!p) continue;
                    if (!best || rank(id) < rank(best.id) || (rank(id) === rank(best.id) && p.dirs.length < best.p.dirs.length)) best = { id, p };
                }
                if (best) break;
            }
            if (best) { this.curTarget = best.id; return false; }
            // 이 위치에서 못 가는 아이템만 남음 -> 다른 맵 경유 우회
            const byMap = Planner.destinations(this.blacklist);
            let detour = null;
            for (const id of this.queue) {
                if (this.detourTried[id]) { this.skipped.add(id); continue; }
                const cur = $gameMap.mapId();
                const sameArea = n => n.s.map === cur && field.dist[n.s.y * field.w + n.s.x] >= 0;
                const plan = Planner.plan({ map: cur, evId: id }, this.blacklist, byMap, n => !sameArea(n));
                if (plan && plan.legs.length && (!detour || plan.legs.length < detour.plan.legs.length)) detour = { id, plan };
            }
            if (!detour) {
                for (const id of this.queue) this.skipped.add(id);
                this.finishPickup();
                return true;
            }
            this.detourTried[detour.id] = true;
            this.legs = detour.plan.legs.slice();
            this.setStatus('우회 경로로 이동 중 (아이템 ' + this.queue.length + '개 남음)   [방향키/ESC: 중단]');
            this.beginLeg();
            return true;
        },

        finish(msg) {
            // 건물 전체 진행: 다음 방으로 이어서
            while (this.tour && this.tour.length) {
                const nx = this.tour.shift();
                const plan = nx.map === $gameMap.mapId() ? { legs: [], final: { map: nx.map, evId: 0 }, hops: 0 } : Planner.plan({ map: nx.map, evId: 0 }, null);
                if (!plan) { NavLog.add('TOUR skip map ' + nx.map + ' (경로 없음)'); continue; }
                const rest = this.tour, done = (this._tourDone || 0) + (this.picked || 0);
                this.start(plan, this._tourLabel + ' - ' + Index.maps[nx.map].name, { mode: nx.mode, queue: nx.queue, kinds: nx.kinds, tour: rest, tourLabel: this._tourLabel });
                this._tourDone = done;
                return;
            }
            if (this._tourLabel) msg = this._tourLabel + ' 완료 (' + ((this._tourDone || 0) + (this.picked || 0)) + '개)';
            this.tour = null; this._tourLabel = null; this._tourDone = 0;
            this.stop(msg);
            if (NavCfg.autoChain) { this.reopen = 40; }
        },

        finishPickup() {
            const sk = this.skipped ? this.skipped.size : 0;
            this.finish((this.mode === 'batch' ? '진행 완료' : '아이템 줍기 완료') + ' (' + this.picked + '개' + (sk ? ', 갈 수 없는 곳 ' + sk + '개' : '') + ')');
        },

        updateTriggeredFinal() {
            if (!this.isMulti()) {
                if (this.frames - this.triggerFrame < 8 || !this.isIdle() || SceneManager.isSceneChanging()) return;
                this.finish('완료: ' + this.label);
                return;
            }
            if (this.frames - this.triggerFrame < 8 || !this.isIdle() || SceneManager.isSceneChanging()) return;
            this.picked++;
            this.queue = this.queue.filter(id => id !== this.curTarget);
            this.curTarget = 0;
            this.beginLeg();
        },

        skipTarget(reason) {
            this._blocked = null;
            if (this.isMulti() && this.curTarget) {
                this.skipped = this.skipped || new Set();
                this.skipped.add(this.curTarget);
                this.queue = this.queue.filter(id => id !== this.curTarget);
                this.curTarget = 0;
                this.beginLeg();
            } else {
                this.stop('자동 이동 실패: ' + reason);
            }
        },

        failLeg(reason) {
            const leg = this.curLeg();
            NavLog.add('FAIL ' + reason + (leg ? ' leg ev' + leg.evId : ' target ' + this.curTarget));
            if (!leg) { this.skipTarget(reason); return; }
            this._blocked = null;
            if (leg) { this.blacklist.add(leg.key); this.replan(reason); }
            else this.stop('자동 이동 실패: ' + reason);
        }
    };

    //=========================================================================
    // 설정 (ConfigManager에 저장)
    //=========================================================================
    const NavCfg = {
        get autoText() { return ConfigManager.navAutoText !== false; },
        set autoText(v) { ConfigManager.navAutoText = !!v; ConfigManager.save(); },
        get autoChain() { return ConfigManager.navAutoChain === true; },
        set autoChain(v) { ConfigManager.navAutoChain = !!v; ConfigManager.save(); },
        get allowTraps() { return ConfigManager.navAllowTraps === true || Runner._tempTraps === true; },
        set allowTraps(v) { ConfigManager.navAllowTraps = !!v; ConfigManager.save(); },
        get doorMode() { return ConfigManager.navDoorMode || 'ask'; },
        set doorMode(v) { ConfigManager.navDoorMode = v; ConfigManager.save(); },
        // 심볼 인카운트 기습 설정: off(게임 그대로) / safe(기습당하지 않음) / pre(항상 선제공격)
        get ambush() { return ConfigManager.navAmbush || 'safe'; },
        set ambush(v) { ConfigManager.navAmbush = v; ConfigManager.save(); },
        get dash() { return ConfigManager.navDash !== false; },
        set dash(v) { ConfigManager.navDash = !!v; ConfigManager.save(); },
        get sidePick() { return ConfigManager.navSidePick !== false; },
        set sidePick(v) { ConfigManager.navSidePick = !!v; ConfigManager.save(); },
        sideRange: 5,
        textWait: 80
    };
    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const c = _ConfigManager_makeData.call(this);
        c.navAutoText = this.navAutoText !== false;
        c.navAutoChain = this.navAutoChain === true;
        c.navDoorMode = this.navDoorMode || 'ask';
        c.navAllowTraps = this.navAllowTraps === true;
        c.navSidePick = this.navSidePick !== false;
        c.navDash = this.navDash !== false;
        c.navAmbush = this.navAmbush || 'safe';
        return c;
    };
    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(c) {
        _ConfigManager_applyData.call(this, c);
        this.navAutoText = c.navAutoText !== false;
        this.navAutoChain = c.navAutoChain === true;
        this.navDoorMode = c.navDoorMode || 'ask';
        this.navAllowTraps = c.navAllowTraps === true;
        this.navSidePick = c.navSidePick !== false;
        this.navDash = c.navDash !== false;
        this.navAmbush = c.navAmbush || 'safe';
    };

    //=========================================================================
    // 추천 엔진
    //=========================================================================
    const Recommender = {
        quests() {
            if (this._quests !== undefined) return this._quests;
            this._quests = [];
            try {
                const raw = PluginManager.parameters('QuestSystem').QuestDatas;
                for (const q of JSON.parse(raw || '[]')) {
                    const d = JSON.parse(q);
                    this._quests.push({ v: Number(d.VariableId), title: String(d.Title || ''), place: String(d.Place || ''), requester: String(d.Requester || '') });
                }
            } catch (e) { /* 퀘스트 플러그인 없음 */ }
            return this._quests;
        },

        visitedSet() {
            const set = new Set(Object.keys(($gameSystem && $gameSystem._navVisited) || {}).map(Number));
            const data = $gameSelfSwitches && $gameSelfSwitches._data;
            if (data) for (const k in data) { if (data[k]) set.add(Number(String(k).split(',')[0])); }
            return set;
        },

        partyHpRate() {
            const ms = $gameParty.battleMembers();
            if (!ms.length) return 1;
            return ms.reduce((a, m) => a + m.hpRate(), 0) / ms.length;
        },

        // 결과: { next, groups: [{ map, hops, current, items: [...] , explore, needTraps }], total }
        // 항목 우선순위(작을수록 먼저): 0 회복 / 1 퀘스트 보고 / 2 스토리 이벤트 / 3 퀘스트 진행 / 4 의뢰 게시판 / 5 새 대화 / 6 아이템
        build(byMap, field) {
            const cur = $gameMap.mapId();
            const items = [];
            const seen = new Set();
            const add = (c, by, fld) => {
                const k = c.map + ':' + c.evId;
                if (Runner.badTargets.has(k)) return;
                if (seen.has(k)) { const o = items.find(x => x.map === c.map && x.evId === c.evId); if (o && c.prio < o.prio) Object.assign(o, c); return; }
                const r = Planner.reach(c.map, c.evId, by || byMap, fld || field);
                if (!r.ok) return;
                c.hops = r.hops; seen.add(k); items.push(c);
            };
            const near = Object.keys(byMap).map(Number).filter(m => Index.maps[m] && byMap[m][0].hops <= 4);
            const lowHp = this.partyHpRate() < 0.5;
            const talked = ($gameSystem && $gameSystem._navTalked) || {};

            // 퀘스트: 보고 가능 > 진행 가능 > 필요한 물품 구하기
            let notOrdered = 0;
            const iname = id => ($dataItems[id] && $dataItems[id].name) || ('아이템 ' + id);
            // 여러 퀘스트를 한꺼번에 다루는 이벤트(게시판/길드 창구)는 '허브': 보고에만 사용
            const qvars = new Set(this.quests().map(q => q.v));
            const hubCount = {};
            for (const v of qvars) for (const r of (Index.questRefs[v] || [])) { const k = r.map + ':' + r.evId; hubCount[k] = (hubCount[k] || 0) + 1; }
            const isHub = r => (hubCount[r.map + ':' + r.evId] || 0) >= 3;
            const qinfo = {};
            for (const q of this.quests()) {
                const st = $gameVariables.value(q.v);
                if (st === 1) notOrdered++;
                if (st !== 2 && st !== 3) continue;
                const qkey = 'q' + q.v;
                qinfo[qkey] = { q, st, missing: [] };
                const missing = new Set();
                let progressed = false;
                for (const r of (Index.questRefs[q.v] || [])) {
                    if (!byMap[r.map]) continue;
                    const map = Index.maps[r.map], ev = Index.findEvent(r.map, r.evId);
                    const pg = ev && Index.activePage(map, ev);
                    if (!pg || pg.trigger !== 0 || pg.danger) continue;
                    if (st === 2 && isHub(r)) continue;
                    if (st === 3 || Index.isUsefulTalk(pg, r.map, r.evId)) {
                        add({ quest: qkey, type: 'talk', cat: st === 3 ? '보고' : '퀘스트', prio: st === 3 ? 0.5 : 0.8, map: r.map, evId: r.evId,
                            label: (st === 3 ? '[퀘스트 보고] ' : '[퀘스트 진행] ') + q.title,
                            help: '의뢰자: ' + q.requester + ' / 장소: ' + q.place });
                        progressed = true;
                    } else {
                        for (const id of Index.requiredItems(ev, pg)) if ($gameParty.numItems($dataItems[id]) <= 0) missing.add(id);
                    }
                }
                qinfo[qkey].missing = Array.from(missing);
                // 진행에 필요한 물품이 없으면 구할 곳으로 안내
                if (!progressed && st === 2) {
                    for (const id of missing) {
                        const srcs = Index.itemSources(id).sort((a, b) => (a.kind === 'shop' ? 0 : 1) - (b.kind === 'shop' ? 0 : 1));
                        for (const sc of srcs) {
                            if (!byMap[sc.map]) continue;
                            const sev = Index.findEvent(sc.map, sc.evId), sp = Index.activePage(Index.maps[sc.map], sev);
                            if (!sp || sev.pages.indexOf(sp) !== sc.page) continue;
                            add({ quest: qkey, type: 'talk', cat: '퀘스트', prio: 1.2, map: sc.map, evId: sc.evId,
                                label: '[퀘스트] ' + iname(id) + ' 구하기 (' + q.title + ')',
                                help: '"' + q.title + '" 진행에 ' + iname(id) + '이(가) 필요합니다. ' + (sc.kind === 'shop' ? '상점에서 구입하세요.' : '') });
                            break;
                        }
                    }
                }
            }

            // 퀘스트 로그 (Galv_QuestLog): 진행 중 퀘스트의 다음 목표를 완료시키는 이벤트
            const gq = this.galvQuests();
            const gqinfo = {};
            for (const q of gq) {
                const qkey = 'g' + q.id;
                gqinfo[qkey] = q;
                const label = (q.main ? '[메인] ' : '[퀘스트] ') + q.name;
                const help = q.objText ? '목표: ' + q.objText : '';
                for (const r of (Index.questAdv[q.id] || [])) {
                    if (r.op === 'objective' && (q.st[r.o] === 1 || q.st[r.o] === 2)) continue; // 이미 끝난 목표
                    const map = Index.maps[r.map], ev = Index.findEvent(r.map, r.evId);
                    const raw = ev && ev.pages[r.page];
                    if (!map || !raw || raw.danger) continue;
                    const prio = (q.main ? 0.6 : 0.8) + (r.op === 'objective' && r.o !== q.cur ? 0.05 : 0);
                    if (Index.activePage(map, ev) === raw) {
                        if (Cond.all(r.conds, r.map, r.evId) === false) continue;
                        if (raw.trigger <= 2) {
                            add({ quest: qkey, type: 'talk', cat: '퀘스트', prio, map: r.map, evId: r.evId, label, help });
                        } else if (byMap[r.map] && r.map !== cur && !items.some(i => i.quest === qkey && i.map === r.map)) {
                            // 자동 실행 이벤트: 그 맵에 들어가면 진행됨
                            items.push({ quest: qkey, type: 'go', cat: '퀘스트', prio, map: r.map, evId: 0, hops: byMap[r.map][0].hops, label: label + ' (' + map.name + '으로 이동)', help });
                        }
                        continue;
                    }
                    // 지금은 비활성 페이지: 출현 조건 스위치를 켜는 선행 이벤트
                    for (const c of Index.pageCondFails(raw.cond, r.map, r.evId)) {
                        if (!(c.k === 'if' && c.p[0] === 0)) continue;
                        const g = this.findSetter(c.p[1], byMap, field, 1);
                        if (g) add({ quest: qkey, type: 'talk', cat: '퀘스트', prio: prio + 0.1, map: g.map, evId: g.evId, label: label + ' (선행 단계)', help });
                    }
                }
            }

            for (const mid of near) {
                const map = Index.maps[mid];
                for (const ev of map.events) {
                    const pg = Index.activePage(map, ev);
                    if (!pg || pg.trigger > 2) continue;
                    const nm = speakerName(pg.speaker) || cleanName(ev.name);
                    if (lowHp && pg.recover && pg.trigger === 0) {
                        add({ type: 'talk', cat: '회복', prio: 0, map: mid, evId: ev.id, label: '[회복] ' + (nm || map.name), help: '파티 HP가 50% 미만입니다.' });
                        continue;
                    }
                    if (notOrdered > 0 && ev.template && PROF.template.questBoardRe && PROF.template.questBoardRe.test(ev.name)) {
                        add({ type: 'talk', cat: '의뢰', prio: 4, map: mid, evId: ev.id, label: '[의뢰 게시판] 새 의뢰 ' + notOrdered + '개', help: '아직 받지 않은 의뢰가 있습니다.' });
                        continue;
                    }
                    // 아직 안 본 H 이벤트
                    if (pg.hev && !ev.template && pg.trigger <= 2 && !pg.battle && !pg.danger && pg.n > 1 && !pg.transfers.some(t => !t.ce && !t.conds.some(isChoiceCond)) && !(PROF.hExcludeNameRe && PROF.hExcludeNameRe.test(ev.name)) && !/harass/i.test(pg.speaker || '')) {
                        const pidx = ev.pages.indexOf(pg);
                        if (!talked[mid + ':' + ev.id + ':' + pidx]) {
                            let hn = speakerName(pg.speaker) || cleanName(ev.name);
                            if (/harass/i.test(hn)) hn = '성희롱 NPC';
                            hn = okName(hn);
                            add({ type: 'talk', cat: 'H 이벤트', prio: 3.5, map: mid, evId: ev.id, hev: true,
                                label: '[H 이벤트] ' + (hn ? hn + ' ' : '') + '(' + Index.maps[mid].name + ' ' + ev.x + ',' + ev.y + ')',
                                help: '아직 보지 않은 H 이벤트입니다. 도착하면 자동으로 말을 겁니다. 선택지는 직접 고르세요.' });
                        }
                        continue;
                    }
                    // 한 번 열면 계속 열려 있는 빗장 문(지름길): 열 수 있는 쪽에서 열어 둠
                    if (Index.oneWayDir(ev) && pg.prio === 1 && !pg.through && pg.faceDir) {
                        add({ type: 'talk', cat: '지름길', prio: 2.5, map: mid, evId: ev.id, label: '[지름길] 빗장 열기 (' + ev.x + ',' + ev.y + ')',
                            help: '한 번 열면 계속 열려 있는 빗장 문입니다. 열 수 있는 쪽으로 가서 엽니다.' });
                        continue;
                    }
                    if (ev.template || pg.shop || pg.danger) continue; // 엔딩/게임오버로 이어질 수 있는 이벤트는 추천하지 않음
                    if (pg.transfers.filter(t => t.conds.some(isChoiceCond)).length >= 2) continue; // 텔레포터류
                    const pidx = ev.pages.indexOf(pg);
                    const done = talked[mid + ':' + ev.id + ':' + pidx];
                    // 스토리 이벤트: 대사 3개 이상 + 스위치 변화
                    if (pg.dmsgs >= 3 && pg.dsw && !done && Index.isUsefulTalk(pg, mid, ev.id) && map.events.filter(e => e.name === ev.name && e.name).length < 3) {
                        add({ type: 'talk', cat: '이벤트', prio: 2, map: mid, evId: ev.id,
                            label: '[이벤트] ' + (nm || map.name), help: '아직 진행하지 않은 이벤트입니다. (대사 ' + pg.dmsgs + '개' + (pg.battle ? ', 전투 포함' : '') + ')' });
                        continue;
                    }
                    // 새 대화: 아직 말 걸지 않은 NPC (페이지가 바뀌면 다시 새 대화)
                    if (pg.trigger === 0 && (pg.speaker || (PROF.talkWithoutName && pg.msgs > 0)) && pg.img && pg.img[0] !== '!' && !pg.transfers.length && !done && Index.isUsefulTalk(pg, mid, ev.id)) {
                        add({ type: 'talk', cat: '대화', prio: 5, map: mid, evId: ev.id, label: '[대화] ' + (nm || 'NPC'), help: '아직 나누지 않은 대화입니다.' });
                    }
                }
                // 아이템 (가까운 지역만)
                if (byMap[mid][0].hops <= 2) {
                    for (const a of Index.activitiesOf(mid)) {
                        if (a.type !== 'pickup') continue;
                        add({ type: 'pickup', cat: '아이템', prio: 6, map: mid, evId: a.evId, label: a.label, help: '아이템을 줍습니다.' });
                    }
                }
            }

            // 본편 목표
            let mainInfo = null, mainItem = null;
            try {
                const mg = this.mainGoal(byMap, field);
                if (mg && mg.item) { mainItem = mg.item; if (mg.item.type !== 'go') items.push(mg.item); }
                if (mg && mg.info) mainInfo = mg.info;
            } catch (e) { /* 무시 */ }

            // 지역별 묶기
            const groups = new Map();
            const curB = Index.buildingOf(cur);
            const groupOf = (mid, hops, extra) => {
                const bid = Index.buildingOf(mid);
                const key = bid + (extra && extra.needTraps ? ':t' : '');
                if (!groups.has(key)) groups.set(key, Object.assign({ map: bid, hops, current: bid === curB, items: [], explore: false }, extra || {}));
                const g = groups.get(key);
                if (hops < g.hops) g.hops = hops;
                return g;
            };
            for (const it of items) groupOf(it.map, it.map === cur ? 0 : byMap[it.map][0].hops).items.push(it);
            // 탐색: 아직 가보지 않은 지역
            const visited = this.visitedSet();
            let exploreCount = 0;
            for (const mid of near.slice().sort((a, b) => byMap[a][0].hops - byMap[b][0].hops)) {
                if (visited.has(mid) || mid === cur || exploreCount >= 3) continue;
                const g = groupOf(mid, byMap[mid][0].hops);
                g.explore = true;
                if (!g.exploreMap) g.exploreMap = mid; // 건물 안의 아직 안 가본 방
                exploreCount++;
            }

            // 함정 경유 (추천이 거의 없을 때)
            if (items.length < 3 && !NavCfg.allowTraps) {
                Runner._tempTraps = true;
                try {
                    const by2 = Planner.destinations(null);
                    const f2 = Runner.liveField(0, false, true, { traps: true });
                    let n = 0;
                    for (const m in by2) {
                        const mid = Number(m);
                        if (byMap[mid] || !Index.maps[mid] || by2[m][0].hops > 6 || n >= 3) continue;
                        const g = groupOf(mid, by2[m][0].hops, { needTraps: true });
                        g.explore = true; if (!g.exploreMap) g.exploreMap = mid; n++;
                    }
                    const gated = Index.activitiesOf(cur).filter(a => a.type === 'pickup' &&
                        !Planner.reach(cur, a.evId, byMap, field).ok && Planner.reach(cur, a.evId, by2, f2).ok);
                    if (gated.length) {
                        const g = groupOf(cur, 0, { needTraps: true });
                        for (const a of gated) g.items.push({ type: 'pickup', cat: '아이템', prio: 6, map: cur, evId: a.evId, hops: 0, label: a.label, help: '함정/기믹 칸을 지나야 닿습니다.', needTraps: true });
                    }
                } catch (e) { /* 함정 경로 분석 실패는 무시 */ } finally {
                    Runner._tempTraps = false;
                    Planner.destinations(null);
                }
            }

            const list = Array.from(groups.values());
            for (const g of list) {
                g.items.sort((a, b) => a.prio - b.prio);
                g.top = g.items.length ? g.items[0].prio : 9;
            }
            // 현재 위치 > (함정 아님) > 중요도 > 거리
            list.sort((a, b) => (b.current - a.current) || ((a.needTraps ? 1 : 0) - (b.needTraps ? 1 : 0)) || (a.hops - b.hops) || (a.top - b.top));
            const best = items.slice().sort((a, b) => (a.prio - b.prio) || (a.hops - b.hops))[0] || null;
            // 다음 할 일: 진행 중인 퀘스트(보고/진행/물품) > 본편 목표 > 기타 중요한 일
            const questNext = items.filter(i => i.cat === '보고' || i.cat === '퀘스트').sort((a, b) => (a.prio - b.prio) || (a.hops - b.hops))[0];
            const next = questNext || mainItem || (best && best.prio <= 3 ? best : null);
            // 퀘스트 단위 목록: 메인 1개 + 진행 중인 서브 퀘스트들
            const units = [];
            const ms = (Index.milestones || []).find(m => !$gameSwitches.value(m.sw));
            const gUnits = [];
            for (const k in gqinfo) {
                const q = gqinfo[k];
                const step = items.filter(i => i.quest === k).sort((a, b) => (a.prio - b.prio) || (a.hops - b.hops))[0] || null;
                gUnits.push({ key: k, kind: q.main ? 'main' : 'sub', title: q.name, status: q.objText || '진행 중', item: step,
                    info: step ? '' : '다음 목표를 진행할 장소를 찾지 못했습니다' + (q.objText ? ' (목표: ' + q.objText + ')' : ''), help: q.objText ? '목표: ' + q.objText : '' });
            }
            // 층 해금 같은 본편 단계가 있거나, 퀘스트 로그에 메인 퀘스트가 없으면 기존 메인 단위 사용
            if (ms || mainItem || !gUnits.some(u => u.kind === 'main')) units.push({ key: 'main', kind: 'main', title: ms ? (ms.label || '다음 단계') + ' 해금' : '메인 스토리', item: mainItem, info: mainInfo });
            for (const k in qinfo) {
                const qi = qinfo[k];
                const step = items.filter(i => i.quest === k).sort((a, b) => (a.prio - b.prio) || (a.hops - b.hops))[0] || null;
                let info = '';
                if (!step) {
                    const place = qi.q.place ? ' (장소: ' + qi.q.place + ')' : '';
                    const refOk = (Index.questRefs[qi.q.v] || []).some(r => byMap[r.map]);
                    if (qi.missing.length) info = '필요: ' + qi.missing.map(iname).join(', ') + ' (구할 곳 미확인)';
                    else if (qi.st === 2 && /토벌|討伐|격파|처치/.test(qi.q.title)) info = '몬스터 토벌이 필요합니다' + place;
                    else if (!refOk) info = '관련 장소에 지금은 갈 수 없음' + place;
                    else info = '조건을 채우면 ' + (qi.st === 3 ? '보고' : '진행') + '할 수 있음' + place;
                }
                units.push({ key: k, kind: 'sub', title: qi.q.title, status: qi.st === 3 ? '보고 가능' : '진행 중', item: step, info, help: '의뢰자: ' + qi.q.requester + ' / 장소: ' + qi.q.place });
            }
            for (const u of gUnits) if (u.kind === 'main') units.push(u);
            const mainCount = units.length;
            for (const u of gUnits) if (u.kind !== 'main') units.push(u);
            // 보고 가능 > 진행 가능(할 일 있음) > 막힘
            const subs = units.slice(mainCount).sort((a, b) => ((b.status === '보고 가능') - (a.status === '보고 가능')) || ((b.item ? 1 : 0) - (a.item ? 1 : 0)) || ((a.item ? a.item.hops : 99) - (b.item ? b.item.hops : 99)));
            units.length = mainCount; units.push(...subs);
            const board = items.find(i => i.cat === '의뢰') || null;
            const hItems = items.filter(i => i.hev).sort((a, b) => a.hops - b.hops);
            return { next, groups: list.slice(0, 8), total: items.length, mainInfo, units, board, notOrdered, hItems };
        },

        // 본편 목표: 아직 꺼진 첫 층 해금 스위치를 켜는 이벤트를 찾고, 막혀 있으면 그 조건 스위치를 켜는 이벤트로 역추적
        mainGoal(byMap, field) {
            const res = this._mainGoal(byMap, field);
            if (!res || !res.info) return res;
            // 다음 층으로 가는 길을 못 찾음: 지금 층(최근 해금한 층)에서 아직 안 가본 곳을 탐색
            try {
                const ms = Index.milestones || [];
                const idx = ms.findIndex(m => !$gameSwitches.value(m.sw));
                const roots = new Set([Index.rootId($gameMap.mapId())]);
                if (idx > 0 && ms[idx - 1].to) roots.add(Index.rootId(ms[idx - 1].to));
                const visited = this.visitedSet();
                let best = null;
                for (const m in byMap) {
                    const mid = Number(m);
                    if (mid === $gameMap.mapId() || visited.has(mid) || !roots.has(Index.rootId(mid))) continue;
                    if (Index.excluded && Index.excluded[mid]) continue;
                    if (!best || byMap[m][0].hops < byMap[best][0].hops) best = mid;
                }
                if (best) return { item: { type: 'go', cat: '메인', prio: -1, map: best, evId: 0, hops: byMap[best][0].hops,
                    label: '[메인] 길 찾기 탐색: ' + Index.maps[best].name,
                    help: '다음 층으로 가는 길을 아직 못 찾아서 이 층의 안 가본 곳을 탐색합니다. (' + res.info.replace(/^\[메인\]\s*/, '') + ')' }, info: res.info };
            } catch (e) { /* 무시 */ }
            return res;
        },
        // 스위치 sw를 켜는 이벤트 중 지금 진행 가능한 것. 막혀 있으면 그 페이지 조건 스위치를 켜는 이벤트로 거슬러 올라감
        findSetter(sw, byMap, field, depth, seen) {
            seen = seen || new Set();
            if (depth > 4 || seen.has(sw)) return null;
            seen.add(sw);
            for (const st of (Index.switchSetters[sw] || [])) {
                const map = Index.maps[st.map], ev = Index.findEvent(st.map, st.evId);
                if (!map || !ev || ev.template) continue;
                const raw = ev.pages[st.page];
                if (!raw || raw.danger || raw.trigger > 2) continue;
                const pg = Index.activePage(map, ev);
                if (pg === raw && byMap[st.map]) {
                    const r = Planner.reach(st.map, st.evId, byMap, field);
                    if (r.ok) return { map: st.map, evId: st.evId, hops: r.hops, depth };
                }
                const c = raw.cond;
                for (const id of [c.switch1Valid && c.switch1Id, c.switch2Valid && c.switch2Id]) {
                    if (id && !$gameSwitches.value(id)) { const r = this.findSetter(id, byMap, field, depth + 1, seen); if (r) return r; }
                }
            }
            return null;
        },

        // 퀘스트 로그 (Galv_QuestLog) 진행 중 퀘스트: { id, name, main, st(목표 상태), cur(다음 목표 번호), objText }
        galvQuests() {
            if (typeof Galv === 'undefined' || !Galv.QUEST || !$gameSystem || !$gameSystem._quests) return [];
            const qs = $gameSystem._quests, out = [];
            for (const id of (qs.active || [])) {
                const q = qs.quest && qs.quest[id];
                if (!q) continue;
                let name = '', cat = 0, objs = [];
                try { name = q.name(); cat = Number(q.category()) || 0; objs = q.objectives() || []; } catch (e) { /* 퀘스트 파일 없음 */ }
                const st = q._objectives || [];
                let cur = -1;
                for (let i = 0; i < objs.length; i++) if (st[i] !== 1 && st[i] !== 2 && st[i] !== -1) { cur = i; break; }
                const clean = t => String(t || '').replace(/\\[A-Za-z]+\[\d*\]/g, '').trim();
                out.push({ id: Number(id), name: clean(name) || ('퀘스트 ' + id), main: cat === 0, st, cur, objText: cur >= 0 ? clean(objs[cur]) : '' });
            }
            return out;
        },

        _mainGoal(byMap, field) {
            const next = (Index.milestones || []).find(m => !$gameSwitches.value(m.sw));
            if (!next) return null;
            const seen = new Set();
            const find = (sw, depth) => this.findSetter(sw, byMap, field, depth, seen);
            const g = find(next.sw, 0);
            const name = next.label || ('단계 ' + next.sw);
            if (g) {
                const nm = Index.maps[g.map].name;
                return { item: { type: 'talk', cat: '메인', prio: -1, map: g.map, evId: g.evId, hops: g.hops,
                    label: '[메인] ' + name + (g.depth ? ' (선행 단계)' : ''),
                    help: '본편 진행: "' + name + '" 해금' + (g.depth ? '에 필요한 선행 이벤트' : ' 지점') + ' (' + nm + ')' } };
            }
            const cur = $gameMap.mapId();
            const goItem = (mid, label, help) => ({ item: { type: 'go', cat: '메인', prio: -1, map: mid, evId: 0, hops: byMap[mid][0].hops, label, help } });
            // 해금 지점이 있는 맵까지는 갈 수 있으면 그 맵으로 (도착 후 내부 탐색)
            for (const st of (Index.switchSetters[next.sw] || [])) {
                if (byMap[st.map] && st.map !== cur) return goItem(st.map, '[메인] ' + name + ' 해금 지점으로 이동', '본편 진행: ' + Index.maps[st.map].name + '에 있는 해금 지점으로 향합니다.');
            }
            if (byMap[next.to] && next.to !== cur) return goItem(next.to, '[메인] ' + name + ' 방면으로 이동', '본편 진행: 다음 층 "' + name + '"으로 향합니다.');
            // 다음 층 영역: 아직 안 가본 곳 우선 탐색
            const root = Index.rootId(next.to);
            const visited = this.visitedSet();
            let unv = null, any = null;
            for (const m in byMap) {
                const mid = Number(m);
                if (Index.rootId(mid) !== root || mid === cur) continue;
                if (!any || byMap[m][0].hops < byMap[any][0].hops) any = mid;
                if (!visited.has(mid) && (!unv || byMap[m][0].hops < byMap[unv][0].hops)) unv = mid;
            }
            if (unv) return goItem(unv, '[메인] ' + name + ' 탐색: ' + Index.maps[unv].name, '본편 진행: 해금 지점을 찾기 위해 아직 안 가본 곳을 탐색합니다.');
            if (any && Index.rootId(cur) !== root && !visited.has(any)) return goItem(any, '[메인] ' + name + ' 진입', '본편 진행: 다음 층 영역으로 들어갑니다.');
            // 관문: 지금 갈 수 있는 곳에서 다음 층으로 이어지는(아직 닫힌) 출입구
            // 관문은 게임 전체에서 찾음 (지금 못 가는 곳이어도 '무엇이 필요한지'는 알 수 있음)
            let gate = null;
            // 목표 층 안에서 아직 못 가는 맵(특히 해금 지점이 있는 맵)으로 이어지는 출입구
            const setterMaps = new Set((Index.switchSetters[next.sw] || []).map(st => st.map));
            const wantMap = m2 => Index.rootId(m2) === root && !byMap[m2];
            for (const m in Index.maps) {
                const mid = Number(m);
                const map = Index.maps[m];
                for (const ev of map.events) {
                    if (!ev.pages.some(p => p.transfers.some(t => wantMap(t.map) && !t.conds.some(isChoiceCond)))) continue;
                    const toSetter = ev.pages.some(p => p.transfers.some(t => setterMaps.has(t.map)));
                    const r = byMap[mid] ? Planner.reach(mid, ev.id, byMap, field) : { ok: false };
                    const cand = { map: mid, evId: ev.id, hops: (r.ok ? r.hops : 99) - (toSetter ? 0.5 : 0), ok: r.ok, x: ev.x, y: ev.y };
                    if (!gate || (cand.ok && !gate.ok) || (cand.ok === gate.ok && cand.hops < gate.hops)) gate = cand;
                }
            }
            if (gate) {
                const gev = Index.findEvent(gate.map, gate.evId);
                const req = Index.requiredItems(gev);
                const where = Index.maps[gate.map].name + ' ' + gate.x + ',' + gate.y;
                const iname = id => ($dataItems[id] && $dataItems[id].name) || ('아이템 ' + id);
                const missing = req.filter(id => $gameParty.numItems($dataItems[id]) <= 0);
                if (req.length && !missing.length && gate.ok) {
                    return { item: { type: 'talk', cat: '메인', prio: -1, map: gate.map, evId: gate.evId, hops: gate.hops,
                        label: '[메인] ' + name + ' 관문 열기 (' + req.map(iname).join(', ') + ' 사용)',
                        help: '필요한 아이템을 가지고 있습니다. 관문(' + where + ')으로 가서 사용합니다. 선택지는 직접 고르세요.' } };
                }
                const srcItem = (ids, why) => {
                    // 필요한 아이템을 구할 수 있는 곳 (상점 우선)
                    for (const id of ids) {
                        const srcs = Index.itemSources(id).sort((a, b) => (a.kind === 'shop' ? 0 : 1) - (b.kind === 'shop' ? 0 : 1));
                        for (const sc of srcs) {
                            if (!byMap[sc.map]) continue;
                            const sev = Index.findEvent(sc.map, sc.evId), sp = Index.activePage(Index.maps[sc.map], sev);
                            if (!sp || sev.pages.indexOf(sp) !== sc.page) continue;
                            const r = Planner.reach(sc.map, sc.evId, byMap, field);
                            if (!r.ok) continue;
                            return { item: { type: 'talk', cat: '메인', prio: -1, map: sc.map, evId: sc.evId, hops: r.hops,
                                label: '[메인] ' + iname(id) + ' 구하기 (' + Index.maps[sc.map].name + (sc.kind === 'shop' ? ' 상점' : '') + ')',
                                help: why + ' ' + iname(id) + '이(가) 필요합니다.' } };
                        }
                    }
                    // 2차: 지금은 비활성인 획득 페이지 - 그 페이지를 켜는 스위치가 어떤 맵에 들어가면 자동으로 켜지는 경우 그 맵으로
                    for (const id of ids) {
                        for (const sc of Index.itemSources(id)) {
                            if (sc.kind === 'shop') continue;
                            const sev = Index.findEvent(sc.map, sc.evId);
                            const raw = sev && sev.pages[sc.page];
                            if (!raw || raw.danger) continue;
                            for (const c of Index.pageCondFails(raw.cond, sc.map, sc.evId)) {
                                if (!(c.k === 'if' && c.p[0] === 0)) continue;
                                seen.clear();
                                const g3 = find(c.p[1], 1);
                                if (g3) return { item: { type: 'talk', cat: '메인', prio: -1, map: g3.map, evId: g3.evId, hops: g3.hops,
                                    label: '[메인] ' + iname(id) + ' 얻기 위한 선행 단계 (' + Index.maps[g3.map].name + ')',
                                    help: why + ' ' + iname(id) + '이(가) 필요합니다. ' + Index.maps[sc.map].name + '에서 얻으려면 먼저 이 이벤트를 진행해야 합니다.' } };
                                for (const st of (Index.switchSetters[c.p[1]] || [])) {
                                    const tev = Index.findEvent(st.map, st.evId), tp = tev && tev.pages[st.page];
                                    if (!tp || tp.trigger < 3 || !byMap[st.map] || st.map === $gameMap.mapId()) continue;
                                    return goItem(st.map, '[메인] ' + iname(id) + ' 구하러 이동 (' + Index.maps[st.map].name + ')',
                                        why + ' ' + iname(id) + '이(가) 필요합니다. ' + Index.maps[st.map].name + '에 들어가면 ' + Index.maps[sc.map].name + '에서 얻을 수 있게 됩니다.');
                                }
                            }
                        }
                    }
                    return null;
                };
                if (missing.length) { const r = srcItem(missing, name + '으로 가는 관문(' + where + ')을 열려면'); if (r) return r; }
                const gap = gev && Index.activePage(Index.maps[gate.map], gev);
                const closed = !gap || !gap.transfers.some(t => wantMap(t.map));
                if (!gate.ok || closed) {
                    // 관문까지 가는 길을 막는 조건을 역추적: 스위치면 그 스위치를 켜는 이벤트, 아이템이면 구할 곳
                    let bi = gate.ok ? null : this.blockedInfo(gate.map, byMap, true, gate.evId);
                    if (!bi && gev) {
                        // 관문까지는 갈 수 있지만 관문 자체가 닫혀 있음: 이동 페이지의 조건을 막힌 조건으로 사용
                        let fails = [];
                        for (const pg of gev.pages) {
                            if (!pg.transfers.length || pg.danger) continue;
                            const f = Index.pageCondFails(pg.cond, gate.map, gate.evId);
                            if (f.length) { fails = f; break; }
                        }
                        if (fails.length) bi = { leg: null, failed: fails, text: '관문 조건: ' + fails.map(c => Index.describeCond(c)).join(', ') };
                    }
                    if (bi && bi.stuck && bi.leg.from !== $gameMap.mapId()) {
                        return goItem(bi.leg.from, '[메인] ' + name + ' 막힌 지점 확인: ' + Index.maps[bi.leg.from].name,
                            '다음 층으로 이어지는 출입구(' + bi.leg.ex + ',' + bi.leg.ey + ')가 이 맵에 있습니다. 도착 후 길을 막는 장치/문을 확인하세요.');
                    }
                    if (bi) {
                        for (const c of bi.failed) {
                            if (c.k === 'if' && c.p[0] === 0 && c.p[2] === 0 && !c.neg) {
                                seen.clear();
                                const g2 = find(c.p[1], 1);
                                if (g2) {
                                    const need = Index.requiredItems(Index.findEvent(g2.map, g2.evId)).filter(id => $gameParty.numItems($dataItems[id]) <= 0);
                                    if (need.length) {
                                        const r = srcItem(need, name + '으로 가는 길을 여는 장치(' + Index.maps[g2.map].name + ')에');
                                        if (r) return r;
                                        return { info: '[메인] ' + name + ': ' + Index.maps[g2.map].name + '의 장치에 ' + need.map(iname).join(', ') + ' 필요 (구할 곳 미확인)' };
                                    }
                                }
                                if (g2) return { item: { type: 'talk', cat: '메인', prio: -1, map: g2.map, evId: g2.evId, hops: g2.hops,
                                    label: '[메인] ' + name + ' 선행 단계 (' + Index.maps[g2.map].name + ')',
                                    help: '다음 층으로 가는 길(' + bi.text + ')을 열기 위한 선행 이벤트입니다.' } };
                                for (const st of (Index.switchSetters[c.p[1]] || [])) {
                                    if (byMap[st.map] && st.map !== $gameMap.mapId()) return goItem(st.map, '[메인] ' + name + ' 선행 단계 장소로 이동: ' + Index.maps[st.map].name, '길을 여는 이벤트가 이곳에 있습니다. (' + bi.text + ')');
                                }
                            }
                        }
                    }
                    // 선행 이벤트를 못 찾으면: 근처(관문 맵/막힌 지점 맵)의 보스 전투를 제안
                    for (const bm of [gate.map, bi && bi.leg ? bi.leg.from : 0]) {
                        if (!bm || !byMap[bm]) continue;
                        for (const ev of Index.maps[bm].events) {
                            const pg = Index.activePage(Index.maps[bm], ev);
                            if (!pg || !pg.battle || pg.trigger > 2 || ev.template || pg.danger) continue;
                            if (!(/ボス|boss|보스/i.test(ev.name) || Index.isOpenable(ev))) continue;
                            const r = Planner.reach(bm, ev.id, byMap, field);
                            if (!r.ok) continue;
                            return { item: { type: 'talk', cat: '메인', prio: -1, map: bm, evId: ev.id, hops: r.hops,
                                label: '[메인] 보스 처치 (' + Index.maps[bm].name + ')',
                                help: name + '으로 가는 길이 보스 뒤에 있습니다. 전투가 시작되니 회복과 장비를 확인하세요. 선택지는 직접 고르세요.' } };
                        }
                    }
                    const why = bi ? bi.text : '';
                    return { info: '[메인] ' + name + ' 관문: ' + where + ' (' + (why || '가는 길이 막혀 있음') + (missing.length ? ', 필요: ' + missing.map(iname).join(', ') : '') + ')' };
                }
                return { item: { type: 'go', cat: '메인', prio: -1, map: gate.map, evId: gate.evId, hops: gate.hops,
                    label: '[메인] ' + name + '으로 가는 관문 확인' + (missing.length ? ' (필요: ' + missing.map(iname).join(', ') + ')' : ''),
                    help: '다음 층 입구(' + where + ')가 아직 닫혀 있습니다.' + (missing.length ? ' 필요: ' + missing.map(iname).join(', ') + ' (구할 곳을 찾지 못함)' : ' 근처의 보스/장치/조건을 확인하세요.') } };
            }
            return { info: '[메인] 다음 목표: ' + name + ' - ' + (this.blockedReason(next.to) || '아직 길이 열리지 않음') };
        },

        // 조건을 무시하고 경로를 찾은 뒤, 지금 막혀 있는 첫 단계의 이유를 설명
        blockedReason(targetMap) { const r = this.blockedInfo(targetMap); return r ? r.text : ''; },
        blockedInfo(targetMap, byNormal, exact, targetEv) {
            Index._ignoreConds = true;
            try {
                const by2 = Planner.destinations(null);
                const root = Index.rootId(targetMap);
                let node = exact ? (by2[targetMap] ? by2[targetMap][0] : null) : null;
                if (exact && targetEv && by2[targetMap]) {
                    // 목표 이벤트 칸까지 실제로 닿는 도착 지점을 선택 (맵 안 텔레포터 등 포함)
                    const map = Index.maps[targetMap], ev = Index.findEvent(targetMap, targetEv);
                    const pg = ev && (Index.activePage(map, ev) || ev.pages[0]);
                    let best = null;
                    for (const n of by2[targetMap]) {
                        let d = -1;
                        try { d = Planner.spotDist(map, Planner._getBfs(n.s), ev.x, ev.y, pg ? pg.prio : 0, (pg && pg.hb) || ev.hb); } catch (e) { d = -1; }
                        if (d >= 0 && (!best || n.cost < best.cost)) best = n;
                    }
                    if (best) node = best;
                }
                if (!exact) for (const m in by2) if (Index.rootId(Number(m)) === root && (!node || by2[m][0].cost < node.cost)) node = by2[m][0];
                if (!node) return null;
                for (const e of Planner.legsTo(node)) {
                    if (e.failed && e.failed.length) {
                        return { leg: e, failed: e.failed, text: Index.maps[e.from].name + ' (' + e.ex + ',' + e.ey + '): ' + e.failed.map(c => Index.describeCond(c)).join(', ') };
                    }
                    // 조건은 맞지만 지금 위치 기준으로는 그 출입구까지 걸어서 못 가는 경우 (맵 안의 장애물)
                    if (byNormal && byNormal[e.from] && !byNormal[e.to.map] && e.kind === 'event') {
                        return { leg: e, failed: [], stuck: true, text: Index.maps[e.from].name + ' (' + e.ex + ',' + e.ey + ') 까지 가는 길이 막혀 있음' };
                    }
                }
                return null;
            } finally {
                Index._ignoreConds = false;
                Planner.destinations(null);
            }
        },

        summary(g) {
            const c = {};
            for (const it of g.items) c[it.cat] = (c[it.cat] || 0) + 1;
            const order = ['보고', '퀘스트', '메인', '회복', '이벤트', 'H 이벤트', '지름길', '의뢰', '대화', '아이템'];
            const parts = order.filter(k => c[k]).map(k => k + ' ' + c[k]);
            if (g.explore && !g.items.length) parts.push('새 지역');
            return parts.join(' · ');
        }
    };

    window.ClaudeAutoNav = { Index, Planner, Runner, Recommender };

    //=========================================================================
    // 게임 훅
    //=========================================================================
    const _Game_Player_moveByInput = Game_Player.prototype.moveByInput;
    // 자동 이동 중에는 항상 달리기 (맵에서 달리기 금지면 제외)
    // 심볼 인카운트(SoR_EnemySymbolEncounter): 부딪힐 때 방향으로 선제/기습이 결정됨 -> 설정에 따라 보정
    if (Game_Event.prototype.EncountDir) {
        const _EncountDir = Game_Event.prototype.EncountDir;
        Game_Event.prototype.EncountDir = function() {
            _EncountDir.apply(this, arguments);
            const mode = NavCfg.ambush;
            if (mode === 'pre') $gameTemp.encflag = 2;
            else if (mode === 'safe' && $gameTemp.encflag === 1) $gameTemp.encflag = 0;
        };
    }

    const _Game_Player_updateDashing = Game_Player.prototype.updateDashing;
    Game_Player.prototype.updateDashing = function() {
        if (Runner.active && NavCfg.dash) {
            if (this.isMoving()) return;
            this._dashing = this.canMove() && !this.isInVehicle() && !$gameMap.isDashDisabled();
            return;
        }
        _Game_Player_updateDashing.call(this);
    };

    Game_Player.prototype.moveByInput = function() {
        if (Runner.active) {
            // 플레이어 갱신 안에서 다음 걸음을 바로 이어서 내야 걸음 사이에 멈춤(뚝뚝 끊김)이 없음
            if (Runner._dirHold === 0 || Runner._dirHold === undefined) {
                if (Input.dir4 === 0 && !this.isMoving() && Runner._frameStamp !== Graphics.frameCount) {
                    Runner._frameStamp = Graphics.frameCount;
                    try { Runner.update(); } catch (e) { NavLog.add('ERROR ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); Runner.stop('자동 진행 중 오류가 발생해 중단했습니다'); }
                }
            }
            // 선택지/메시지/이벤트 중에 방향키를 쓰는 건 수동 조작이 아님 (전투 후 선택지 등)
            const canManual = this.canMove() && !$gameMessage.isBusy() && !$gameMap.isEventRunning();
            Runner._dirHold = Input.dir4 !== 0 && canManual && !Runner.inResumeGuard() ? (Runner._dirHold || 0) + 1 : 0;
            if ($gameTemp.isDestinationValid()) $gameTemp.clearDestination();
            if (Runner._dirHold >= 6) { Runner._dirHold = 0; Runner.reopen = 0; Runner.stop('수동 조작으로 자동 이동을 중단했습니다'); $gameTemp.clearDestination(); }
            return;
        }
        _Game_Player_moveByInput.call(this);
    };

    const _Window_Message_isTriggered = Window_Message.prototype.isTriggered;
    Window_Message.prototype.isTriggered = function() {
        if (_Window_Message_isTriggered.call(this)) { this._navWait = 0; return true; }
        if (Runner.active && NavCfg.autoText && !$gameMessage.isChoice() && !$gameMessage.isNumberInput() && !$gameMessage.isItemChoice()) {
            this._navWait = (this._navWait || 0) + 1;
            if (this._navWait >= NavCfg.textWait) { this._navWait = 0; return true; }
        }
        return false;
    };

    const _Window_ChoiceList_start = Window_ChoiceList.prototype.start;
    Window_ChoiceList.prototype.start = function() {
        this._navDoorDone = false;
        _Window_ChoiceList_start.call(this);
    };

    const _Window_ChoiceList_update = Window_ChoiceList.prototype.update;
    Window_ChoiceList.prototype.update = function() {
        _Window_ChoiceList_update.call(this);
        // 잠긴 문/보물상자의 자물쇠 선택지: 설정에 따라 자동 선택
        const LC = PROF.lockChoice;
        const lockMenu = () => { for (let i = 0; i < this.maxItems(); i++) if (LC.detect.test(this.commandName(i))) return true; return false; };
        if (LC && Runner.active && NavCfg.doorMode !== 'ask' && this.isOpen() && this.active && !this._navDoorDone && (Runner.phase === 'door' || lockMenu())) {
            const re = NavCfg.doorMode === 'force' ? LC.force : LC.pick;
            for (let i = 0; i < this.maxItems(); i++) {
                if (re.test(this.commandName(i)) && this.isCommandEnabled(i)) {
                    this._navDoorDone = true;
                    this.select(i); this.processOk();
                    return;
                }
            }
        }
        if (!Runner.active || !Runner.pendingChoices.length || !this.isOpen() || !this.active) return;
        if (/^#ce:/.test(Runner.pendingChoices[0])) return; // 공통 이벤트 메뉴용 (아래 훅에서 처리)
        const strip = s => String(s || '').replace(/^\s*if\(.+?\)/, '').replace(/\\[A-Za-z]+\[\d*\]/g, '').trim();
        const want = strip(Runner.pendingChoices[0]);
        for (let i = 0; i < this.maxItems(); i++) {
            if (strip(this.commandName(i)) === want) {
                Runner.pendingChoices.shift();
                this.select(i);
                this.processOk();
                return;
            }
        }
    };

    // 공통 이벤트 메뉴 (YEP_CommonEventMenu: 버스 정류장 등): 목적지 공통 이벤트를 자동 선택
    if (typeof Window_CommonEventMenu !== 'undefined') {
        const _Window_CommonEventMenu_update = Window_CommonEventMenu.prototype.update;
        Window_CommonEventMenu.prototype.update = function() {
            _Window_CommonEventMenu_update.call(this);
            const want = Runner.active && Runner.pendingChoices[0];
            if (!want || !/^#ce:/.test(want) || !this.isOpen() || !this.active) return;
            const id = Number(want.slice(4));
            for (let i = 0; i < this.maxItems(); i++) {
                if (Number(this._list[i].ext) === id && this.isCommandEnabled(i)) {
                    Runner.pendingChoices.shift();
                    this.select(i);
                    this.processOk();
                    return;
                }
            }
        };
    }

    // 말 건 기록: 같은 페이지의 대화는 다시 '새 대화'로 추천하지 않음
    const _Game_Event_start = Game_Event.prototype.start;
    Game_Event.prototype.start = function() {
        _Game_Event_start.apply(this, arguments);
        // 말 걸기뿐 아니라 접촉/밟기로 시작된 이벤트도 기록 (반복 이벤트 무한 추천 방지)
        if (this._trigger <= 2 && $gameSystem) {
            $gameSystem._navTalked = $gameSystem._navTalked || {};
            $gameSystem._navTalked[this._mapId + ':' + this._eventId + ':' + this._pageIndex] = true;
        }
    };

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.apply(this, arguments);
        if ($gameSystem) { $gameSystem._navVisited = $gameSystem._navVisited || {}; $gameSystem._navVisited[mapId] = true; }
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        Runner.onSceneMapStart();
    };

    const _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        this._navStatusSprite = new Sprite(new Bitmap(Graphics.width, 34));
        this._navStatusSprite.y = Graphics.height - 40;
        this._navStatusText = null;
        this.addChild(this._navStatusSprite);
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (SceneManager._scene !== this) return;
        try {
            if (Runner._frameStamp !== Graphics.frameCount) { Runner._frameStamp = Graphics.frameCount; Runner.update(); }
        } catch (e) {
            // 자동 진행 중 예외가 나도 게임이 멈추지 않도록 중단만 하고 기록
            NavLog.add('ERROR ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
            Runner.stop('자동 진행 중 오류가 발생해 중단했습니다');
        }
        this.updateNavStatus();
        NavLog.tick();
        if (!Runner.active && navKeyTriggered() && this.canOpenAutoNav()) {
            Runner.reopen = 0;
            Runner._chainSeen = {};
            SoundManager.playOk();
            SceneManager.push(Scene_AutoNav);
        } else if (!Runner.active && Runner.reopen > 0 && this.canOpenAutoNav() && --Runner.reopen === 0) {
            SceneManager.push(Scene_AutoNav);
            SceneManager.prepareNextScene('chain');
        }
    };

    Scene_Map.prototype.canOpenAutoNav = function() {
        return this.isActive() && !$gameMap.isEventRunning() && !$gameMessage.isBusy() && !$gamePlayer.isTransferring();
    };

    Scene_Map.prototype.updateNavStatus = function() {
        const spr = this._navStatusSprite;
        if (!spr || this._navStatusText === Runner.status) return;
        this._navStatusText = Runner.status;
        const b = spr.bitmap;
        b.clear();
        if (!Runner.status) return;
        b.fontSize = 18;
        const tw = Math.min(Graphics.width - 16, b.measureTextWidth(Runner.status) + 24);
        b.fillRect(8, 2, tw, 30, 'rgba(0,0,0,0.65)');
        b.drawText(Runner.status, 20, 2, tw - 24, 30, 'left');
    };

    const _Scene_Map_updateCallMenu = Scene_Map.prototype.updateCallMenu;
    Scene_Map.prototype.updateCallMenu = function() {
        if ((Runner.active || Runner.reopen > 0) && !$gameMap.isEventRunning() && !$gameMessage.isBusy() && this.isMenuCalled()) {
            if (Runner.inResumeGuard()) { this.menuCalling = false; return; }
            Runner.reopen = 0;
            Runner.stop('자동 이동을 중단했습니다');
            this.menuCalling = false;
            return;
        }
        _Scene_Map_updateCallMenu.call(this);
    };

    //=========================================================================
    // 내비게이션 화면
    //=========================================================================
    // MV/MZ 창 생성 차이 흡수: MZ는 Rectangle 하나, MV는 (x, y, 너비, 높이)
    class Window_NavList extends Window_Command {
        initialize(rect) {
            this._navRect = rect;
            if (IS_MZ) super.initialize(rect);
            else super.initialize(rect.x, rect.y);
        }
        windowWidth() { return this._navRect ? this._navRect.width : super.windowWidth(); }
        windowHeight() { return this._navRect ? this._navRect.height : super.windowHeight(); }
        setItems(items) { this._items = items; this.refresh(); }
        makeCommandList() {
            for (const it of (this._items || [])) this.addCommand(it.label, 'item', it.enabled !== false, it);
        }
        drawItem(index) {
            const rect = IS_MZ ? this.itemLineRect(index) : this.itemRectForText(index);
            this.resetTextColor();
            this.changePaintOpacity(this.isCommandEnabled(index));
            const it = this._list[index].ext;
            if (it.note) {
                const nw = this.textWidth('00회 이동') + 8;
                this.drawText(this.fitText(this.commandName(index), rect.width - nw - 6), rect.x, rect.y, rect.width - nw, 'left');
                this.changeTextColor(IS_MZ ? ColorManager.systemColor() : this.systemColor());
                this.drawText(it.note, rect.x + rect.width - nw, rect.y, nw, 'right');
            } else {
                this.drawText(this.fitText(this.commandName(index), rect.width), rect.x, rect.y, rect.width, 'left');
            }
        }
        fitText(t, w) {
            if (this.textWidth(t) <= w) return t;
            while (t.length > 1 && this.textWidth(t + '…') > w) t = t.slice(0, -1);
            return t + '…';
        }
        select(index) {
            super.select(index);
            if (this._onSelect) this._onSelect(this.currentExt());
        }
        updateHelp() {
            const it = this.currentExt();
            if (this._helpWindow) this._helpWindow.setText(it && it.help ? it.help : '');
        }
    }

    const MARK = { player: '#ffd84a', arrive: '#ffffff', door: '#3fc46a', shop: '#f0a020', talk: '#4aa8ff', pickup: '#ff6a6a', device: '#c070ff' };
    class Window_NavMap extends Window_Base {
        initialize(rect) {
            if (IS_MZ) super.initialize(rect);
            else super.initialize(rect.x, rect.y, rect.width, rect.height);
        }
        get navW() { return IS_MZ ? this.innerWidth : this.contentsWidth(); }
        get navH() { return IS_MZ ? this.innerHeight : this.contentsHeight(); }
        setMap(mapId, marks, focus) {
            this._mapId = mapId; this._marks = marks || []; this._focus = focus || null;
            this.refresh();
        }
        setFocus(focus) { this._focus = focus || null; this.refresh(); }
        refresh() {
            const c = this.contents;
            c.clear();
            const map = Index.maps[this._mapId];
            if (!map) return;
            const lh = 26;
            const cw = this.navW, ch = this.navH - lh * 2;
            const sc = Math.min(cw / map.w, ch / map.h);
            const ox = Math.floor((cw - map.w * sc) / 2), oy = Math.floor((ch - map.h * sc) / 2);
            const cell = Math.max(1, Math.ceil(sc));
            c.fillRect(ox, oy, Math.ceil(map.w * sc), Math.ceil(map.h * sc), '#101216');
            for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
                if (map.pass[y * map.w + x]) c.fillRect(Math.floor(ox + x * sc), Math.floor(oy + y * sc), cell, cell, '#5d6470');
            }
            const px = x => ox + (x + 0.5) * sc, py = y => oy + (y + 0.5) * sc;
            const r = Math.max(3, Math.min(8, sc * 0.55));
            for (const m of this._marks) {
                if (m.type === 'door') c.fillRect(Math.floor(px(m.x) - r * 0.7), Math.floor(py(m.y) - r * 0.7), Math.ceil(r * 1.4), Math.ceil(r * 1.4), MARK.door);
            }
            for (const m of this._marks) {
                if (m.type === 'door' || m.type === 'player' || m.type === 'arrive') continue;
                c.drawCircle(px(m.x), py(m.y), r, MARK[m.type] || '#ffffff');
            }
            for (const m of this._marks) {
                if (m.type === 'arrive') { c.drawCircle(px(m.x), py(m.y), r + 2, '#000000'); c.drawCircle(px(m.x), py(m.y), r, MARK.arrive); }
                if (m.type === 'player') { c.drawCircle(px(m.x), py(m.y), r + 3, '#000000'); c.drawCircle(px(m.x), py(m.y), r + 1, MARK.player); }
            }
            const f = this._focus;
            if (f) {
                c.drawCircle(px(f.x), py(f.y), r * 2.4, 'rgba(255,255,255,0.35)');
                c.drawCircle(px(f.x), py(f.y), r * 1.3, MARK[f.type] || '#ffffff');
            }
            // 범례
            c.fontSize = 16;
            const items = [['player', '현재 위치'], ['arrive', '도착 지점'], ['door', '출입구'], ['shop', '상점'], ['talk', 'NPC'], ['pickup', '아이템'], ['device', '이동 장치']];
            let lx = 4, ly = this.navH - lh * 2 + 6;
            for (const [k, t] of items) {
                const tw = c.measureTextWidth(t);
                if (lx + 16 + tw > cw) { lx = 4; ly += lh; }
                c.drawCircle(lx + 6, ly + lh / 2, 6, MARK[k]);
                c.textColor = '#dddddd';
                c.drawText(t, lx + 16, ly, tw + 4, lh, 'left');
                lx += 16 + tw + 14;
            }
            this.resetFontSettings();
        }
    }

    class Scene_AutoNav extends Scene_MenuBase {
        prepare(mode) { this._startMode = mode; }
        // 진단용: 메뉴를 열 때 현재 맵의 밀기 물체/출구별 경로 상태를 로그에 기록
        logMapState() {
            try {
                const f = this._field, cur = $gameMap.mapId(), w = f.w;
                NavLog.add('MENU map ' + cur + ' ' + (Index.maps[cur] ? Index.maps[cur].name : '') + ' reachableMaps=' + Object.keys(this._byMap).length);
                NavLog.add('  pushes=' + JSON.stringify(f.pushes ? [...f.pushes.entries()].map(([k, v]) => (k % w) + ',' + ((k / w) | 0) + ' no' + v.join('')) : []) + ' doors=' + JSON.stringify(f.doors ? [...f.doors].map(k => (k % w) + ',' + ((k / w) | 0)) : []));
                for (const e of Index.edgesOf(cur, null)) {
                    const ge = $gameMap.event(e.evId);
                    const p = ge && Runner.pathFrom(f, Runner.spotsFor(ge, ge.page() ? ge.page().priorityType : e.prio));
                    NavLog.add('  exit ev' + e.evId + ' (' + e.ex + ',' + e.ey + ') -> ' + e.to.map + (Index.maps[e.to.map] ? ' ' + Index.maps[e.to.map].name : '') + (e.warp ? ' [warp]' : '') + ' path=' + (p ? p.dirs.length + (p.doors.size ? ' doors/push ' + p.doors.size : '') : 'NONE') + (e.failed ? ' failed=' + JSON.stringify(e.failed) : ''));
                }
                for (const ge of $gameMap.events()) {
                    const info = Index.findEvent(cur, ge.eventId());
                    if (info && Index.isPushable(info)) NavLog.add('  push ev' + ge.eventId() + ' now at ' + ge.x + ',' + ge.y + ' normal=' + ge.isNormalPriority() + ' through=' + ge.isThrough() + ' page=' + ge._pageIndex);
                }
                NavLog.flush();
            } catch (e) { NavLog.add('logMapState error ' + e); NavLog.flush(); }
        }
        create() {
            super.create();
            Index.build();
            this._byMap = Planner.destinations(null);
            this._field = Runner.liveField(0, false, true, { traps: NavCfg.allowTraps });
            this._rec = Recommender.build(this._byMap, this._field);
            if (!Runner.active) this.logMapState();
            const helpH = this.helpAreaHeight();
            const top = IS_MZ && ConfigManager.touchUI ? this.buttonAreaHeight() : 0;
            if (IS_MZ) this._helpWindow = new Window_Help(new Rectangle(0, Graphics.boxHeight - helpH, Graphics.boxWidth, helpH));
            else { this._helpWindow = new Window_Help(2); this._helpWindow.y = Graphics.boxHeight - helpH; }
            this.addWindow(this._helpWindow);
            const h = Graphics.boxHeight - helpH - top;
            const lw = Math.floor(Graphics.boxWidth * 0.48);
            this._destWindow = new Window_NavList(new Rectangle(0, top, lw, h));
            const rw = Graphics.boxWidth - lw;
            const mh = Math.floor(h * 0.58);
            this._mapWindow = new Window_NavMap(new Rectangle(lw, top, rw, mh));
            this.addWindow(this._mapWindow);
            this._actWindow = new Window_NavList(new Rectangle(lw, top + mh, rw, h - mh));
            this._destWindow._onSelect = d => this.previewDest(d);
            this._actWindow._onSelect = a => this.previewAct(a);
            this._destWindow.setHelpWindow(this._helpWindow);
            this._actWindow.setHelpWindow(this._helpWindow);
            this._destWindow.setHandler('item', this.onDest.bind(this));
            this._destWindow.setHandler('cancel', this.popScene.bind(this));
            this._actWindow.setHandler('item', this.onAct.bind(this));
            this._actWindow.setHandler('cancel', this.onActCancel.bind(this));
            this.addWindow(this._destWindow);
            this.addWindow(this._actWindow);
            this._destWindow.setItems(this.makeDestItems());
            this._actWindow.setItems([]);
            this._actWindow.deactivate();
            this._actWindow.select(-1);
            this._destWindow.activate();
            this._destWindow.select(0);
            if (this._startMode === 'rec' || this._startMode === 'chain') this.onDest();
            if (this._startMode === 'chain') this.autoContinue();
        }
        helpAreaHeight() { return IS_MZ ? this.calcWindowHeight(2, false) : Window_Base.prototype.fittingHeight(2); }
        cfgLabel(key) {
            if (key === 'ambush') return '[설정] 적 기습: ' + ({ off: '게임 그대로', safe: '기습 방지', pre: '항상 선제공격' })[NavCfg.ambush];
            if (key === 'dash') return '[설정] 자동 이동 시 달리기: ' + (NavCfg.dash ? '켜짐' : '꺼짐');
            if (key === 'sidePick') return '[설정] 지나가며 근처 아이템 줍기: ' + (NavCfg.sidePick ? '켜짐' : '꺼짐');
            if (key === 'allowTraps') return '[설정] 함정/기믹 칸 통과: ' + (NavCfg.allowTraps ? '다른 길 없으면 허용' : '금지');
            if (key === 'doorMode') return '[설정] 잠긴 문/상자 선택지: ' + ({ ask: '직접 선택', pick: '자물쇠 열기 자동', force: '억지로 열기 자동' })[NavCfg.doorMode];
            return key === 'autoText'
                ? '[설정] 이벤트 대사 자동 넘김: ' + (NavCfg.autoText ? '켜짐' : '꺼짐')
                : '[설정] 완료 후 추천 자동 열기: ' + (NavCfg.autoChain ? '켜짐' : '꺼짐');
        }
        makeDestItems() {
            const cur = $gameMap.mapId();
            const list = [];
            for (const m in this._byMap) {
                const id = Number(m);
                const map = Index.maps[id];
                if (!map) continue;
                const node = this._byMap[m][0];
                list.push({
                    kind: 'map', mapId: id, hops: node.hops, cost: node.cost, label: (id === cur ? '(현재) ' : '') + Index.placeLabel(id),
                    note: id === cur ? '' : node.hops + '회 이동',
                    help: map.full + '\n' + (id === cur ? '현재 위치한 지역입니다.' : '경유 ' + node.hops + '회 (' + this.routeText(node) + ')')
                });
            }
            list.sort((a, b) => (a.mapId === cur ? -1 : b.mapId === cur ? 1 : a.cost - b.cost));
            const head = [{
                kind: 'rec', label: '★ 추천 진행 (' + this._rec.total + ')',
                help: '메인 퀘스트와 진행 중인 서브 퀘스트를 퀘스트 단위로 보여줍니다.\n고른 퀘스트는 끝날 때까지 자동으로 이어서 진행합니다.'
            }];
            const tail = [
                { kind: 'cfg', key: 'autoText', label: this.cfgLabel('autoText'), help: '자동 진행 중 실행된 이벤트의 대사를 자동으로 넘깁니다.\n선택지는 직접 고릅니다.' },
                { kind: 'cfg', key: 'ambush', label: this.cfgLabel('ambush'), help: '적 심볼과 부딪혔을 때의 판정입니다.\n기습 방지: 뒤를 잡혀도 일반 전투 / 항상 선제: 언제나 선제공격 / 끔: 게임 그대로' },
                { kind: 'cfg', key: 'dash', label: this.cfgLabel('dash'), help: '자동 이동할 때 달려서 이동합니다. (달리기 금지 맵은 제외)' },
                { kind: 'cfg', key: 'sidePick', label: this.cfgLabel('sidePick'), help: '자동 이동 중 경로에서 걸어서 ' + NavCfg.sideRange + '칸 이내의 아이템은 잠깐 들러서 줍습니다.\n독늪 등 피해 칸을 지나야 하는 아이템은 줍지 않습니다.' },
                { kind: 'cfg', key: 'autoChain', label: this.cfgLabel('autoChain'), help: '자동 진행이 끝나면 추천 목록을 자동으로 다시 엽니다.\n추천만 고르면서 게임을 진행할 수 있습니다.' },
                { kind: 'cfg', key: 'allowTraps', label: this.cfgLabel('allowTraps'), help: '가시 바닥 등 함정/기믹 칸을 밟아야만 갈 수 있을 때 통과할지 정합니다.\n허용하면 피해를 입거나 함정 이벤트가 발생할 수 있습니다. (맵 이동 칸은 항상 피함)' },
                { kind: 'cfg', key: 'doorMode', label: this.cfgLabel('doorMode'), help: '잠긴 문이나 보물상자의 자물쇠 선택지 처리입니다.\n직접 선택 / 자물쇠 열기(성공률) / 억지로 열기(피로 증가)' }
            ];
            // 해당 장치가 없는 게임에서는 설정 숨김
            const shown = tail.filter(t => (t.key !== 'ambush' || !!Game_Event.prototype.EncountDir) && (t.key !== 'doorMode' || !!PROF.lockChoice));
            return head.concat(list, shown);
        }
        routeText(node) {
            const names = Planner.legsTo(node).map(e => {
                const m = Index.maps[e.to.map];
                return (e.kind === 'item' ? '[' + $dataItems[e.itemId].name + '] ' : '') + (m ? m.name : e.to.map);
            });
            if (names.length > 5) return names.slice(0, 2).join(' > ') + ' > ... > ' + names.slice(-2).join(' > ');
            return names.join(' > ');
        }
        marksFor(mapId) {
            const marks = [];
            const map = Index.maps[mapId];
            if (!map) return marks;
            for (const e of Index.edgesOf(mapId, null)) marks.push({ type: 'door', x: e.ex, y: e.ey });
            const live = mapId === $gameMap.mapId();
            for (const a of Index.activitiesOf(mapId)) {
                if (a.type === 'pickupAll') continue;
                const p = this.posOf(mapId, a.evId);
                if (p) marks.push({ type: a.type === 'pickup' ? 'pickup' : a.type === 'shop' ? 'shop' : /^\[이동 장치\]/.test(a.label) ? 'device' : 'talk', x: p.x, y: p.y, evId: a.evId });
            }
            for (const r of this._rec.groups.flatMap(g => g.items)) {
                if (r.map !== mapId || !r.evId || marks.some(k => k.evId === r.evId)) continue;
                const p = this.posOf(mapId, r.evId);
                if (p) marks.push({ type: 'talk', x: p.x, y: p.y, evId: r.evId });
            }
            if (live) marks.push({ type: 'player', x: $gamePlayer.x, y: $gamePlayer.y });
            else if (this._byMap[mapId]) { const s = this._byMap[mapId][0].s; marks.push({ type: 'arrive', x: s.x, y: s.y }); }
            return marks;
        }
        posOf(mapId, evId) {
            if (mapId === $gameMap.mapId()) { const ge = $gameMap.event(evId); if (ge) return { x: ge.x, y: ge.y }; }
            const ev = Index.findEvent(mapId, evId);
            return ev ? { x: ev.x, y: ev.y } : null;
        }
        showMap(mapId, focusEvId) {
            if (this._previewMap !== mapId) {
                this._previewMap = mapId;
                this._marks = this.marksFor(mapId);
                this._mapWindow.setMap(mapId, this._marks, null);
            }
            const m = focusEvId && (this._marks || []).find(k => k.evId === focusEvId);
            this._mapWindow.setFocus(m || null);
        }
        previewDest(d) {
            if (!d || !this._mapWindow || this._actWindow.active) return;
            if (d.kind === 'map') this.showMap(d.mapId, 0);
            else if (d.kind === 'rec' && this._rec.groups[0]) this.showMap(this._rec.groups[0].map, 0);
        }
        previewAct(a) {
            if (!a || !this._mapWindow || !this._actWindow.active) return;
            const mapId = a.map || (this._curDest && this._curDest.mapId);
            if (mapId) this.showMap(mapId, a.type === 'pickupAll' || a.kind !== 'act' ? 0 : a.evId);
        }
        reachOf(mapId, evId) { return Planner.reach(mapId, evId, this._byMap, this._field); }
        onDest() {
            const d = this._destWindow.currentExt();
            if (d.kind === 'cfg') {
                if (d.key === 'doorMode') NavCfg.doorMode = ({ ask: 'pick', pick: 'force', force: 'ask' })[NavCfg.doorMode];
                else if (d.key === 'ambush') NavCfg.ambush = ({ safe: 'pre', pre: 'off', off: 'safe' })[NavCfg.ambush] || 'safe';
                else NavCfg[d.key] = !NavCfg[d.key];
                d.label = this.cfgLabel(d.key);
                this._destWindow.refresh();
                this._destWindow.activate();
                return;
            }
            this._curDest = d;
            const items = [];
            if (d.kind === 'rec') {
                this.showRecAreas();
                return;
            } else {
                if (d.mapId !== $gameMap.mapId()) items.push({ kind: 'go', map: d.mapId, label: '[이동] 이 지역으로 가기', help: '가장 가까운 입구로 자동 이동합니다.' });
                for (const a of Index.activitiesOf(d.mapId)) {
                    const help = a.type === 'pickupAll' ? '이동 후 가까운 순서로 아이템을 전부 줍습니다.' : a.type === 'pickup' ? '이동 후 이 아이템을 줍습니다.' : '도착 후 자동으로 말을 겁니다.';
                    const it = { kind: 'act', map: d.mapId, evId: a.evId, evIds: a.evIds, type: a.type, label: a.label, help: a.label + '\n' + help };
                    if (a.type === 'pickupAll') {
                        it.evIds = a.evIds.filter(id => this.reachOf(d.mapId, id).ok);
                        it.label = '[아이템] 이 지역 아이템 모두 줍기 (' + it.evIds.length + '개)';
                        if (!it.evIds.length) { it.enabled = false; it.label += ' - 갈 수 없음'; }
                    } else if (!this.reachOf(d.mapId, a.evId).ok) {
                        it.enabled = false;
                        it.label += ' (갈 수 없음)';
                        it.help = a.label + '\n현재 진행 상황에서는 길이 막혀 있어 갈 수 없습니다.';
                    }
                    items.push(it);
                }
            }
            // 출입구 안내: 이 지역의 출구별로 (목적지당 하나, 가까운 것)
            if (d.kind === 'map') {
                const byTo = new Map();
                for (const e of Index.edgesOf(d.mapId, null)) {
                    if (e.warp || (e.choices && e.choices.length) || e.to.map === d.mapId || !Index.maps[e.to.map]) continue;
                    const r = this.reachOf(d.mapId, e.evId);
                    const old = byTo.get(e.to.map);
                    const score = r.ok ? (r.hops || 0) : 999;
                    if (!old || score < old.score) byTo.set(e.to.map, { e, ok: r.ok, score });
                }
                const exits = Array.from(byTo.values()).sort((a, b) => (b.ok - a.ok) || (a.score - b.score));
                for (const x of exits) {
                    const lb = '[출입구] ' + Index.placeLabel(x.e.to.map) + ' 방향 (' + x.e.ex + ',' + x.e.ey + ')';
                    items.push({ kind: 'act', type: 'exit', map: d.mapId, evId: x.e.evId, to: x.e.to.map, label: lb + (x.ok ? '' : ' (갈 수 없음)'), enabled: x.ok,
                        help: lb + '\n' + (x.ok ? '이 출입구까지 안내하고 통과합니다.' : '현재 진행 상황에서는 이 출입구까지 갈 수 없습니다.') });
                }
            }
            // 건물 전체(하위 방 포함) 아이템 모두 줍기
            if (d.kind === 'map') {
                const rooms = Index.buildingRooms(Index.buildingOf(d.mapId)).filter(r => this._byMap[r] || r === $gameMap.mapId());
                if (rooms.length > 1) {
                    const segs = [];
                    let total = 0;
                    for (const r of rooms) {
                        const pa = Index.activitiesOf(r).find(a => a.type === 'pickupAll');
                        if (!pa) continue;
                        const ids = r === $gameMap.mapId() ? pa.evIds.filter(id => this.reachOf(r, id).ok) : pa.evIds;
                        if (!ids.length) continue;
                        segs.push({ map: r, mode: 'pickup', queue: ids, kinds: {}, hops: r === $gameMap.mapId() ? -1 : (this._byMap[r] ? this._byMap[r][0].hops : 99) });
                        total += ids.length;
                    }
                    if (segs.length > 1) {
                        segs.sort((a, b) => a.hops - b.hops);
                        items.unshift({ kind: 'act', type: 'tour', map: segs[0].map, evId: 0, segs, label: '[아이템] 건물 전체 아이템 모두 줍기 (' + total + '개, 방 ' + segs.length + '곳)',
                            help: Index.maps[Index.buildingOf(d.mapId)].name + '과(와) 안쪽 방들의 아이템을 가까운 방부터 차례로 줍습니다.\n' + segs.map(sg => Index.maps[sg.map].name + ' ' + sg.queue.length).join(', ') });
                    }
                }
            }
            if (!items.length) items.push({ kind: 'none', label: '할 수 있는 활동이 없습니다', enabled: false });
            this._actWindow.setItems(items);
            this._actWindow.activate();
            this._actWindow.select(0);
        }
        areaName(g) {
            const m = Index.maps[g.map];
            return (g.needTraps ? '(함정 경유) ' : '') + (m ? Index.placeLabel(g.map) : g.map) + (g.current ? ' (현재 위치)' : '');
        }
        // 자동 이어하기: 마지막으로 고른 퀘스트에 다음 단계가 있으면 바로 진행 (같은 단계 반복 시 멈춤)
        autoContinue() {
            const focus = $gameSystem._navFocus;
            const u = focus && (this._rec.units || []).find(x => x.key === focus && x.item);
            if (!u) return;
            const key = u.item.map + ':' + u.item.evId + ':' + u.item.label;
            Runner._chainSeen = Runner._chainSeen || {};
            Runner._chainSeen[key] = (Runner._chainSeen[key] || 0) + 1;
            if (Runner._chainSeen[key] > 2) { this._helpWindow.setText('같은 단계가 반복되어 자동 이어하기를 멈췄습니다. 직접 골라 주세요.'); return; }
            this._actWindow.select(0);
            this._pendingAuto = 20; // 장면이 완전히 시작된 뒤 실행
            this._helpWindow.setText('퀘스트 이어서 진행: ' + u.title + '  (취소 키로 중단)');
        }
        update() {
            super.update();
            if (this._pendingAuto > 0) {
                if (Input.isTriggered('cancel') || TouchInput.isCancelled()) { this._pendingAuto = 0; return; }
                if (--this._pendingAuto === 0 && this._actWindow.active) this.onAct();
            }
        }
        // 추천 진행 첫 화면: 퀘스트 단위 (메인 / 서브 / 기타)
        unitRow(u, prefix) {
            const head = (prefix || '') + (u.kind === 'main' ? '[메인] ' : '[서브] ') + u.title + (u.status ? ' (' + u.status + ')' : '');
            if (!u.item) return { kind: 'none', enabled: false, label: head + ' - 막힘', help: head + '\n' + (u.info || '지금 할 수 있는 단계를 찾지 못했습니다.').replace(/^\[메인\]\s*/, '') };
            const step = u.item.label.replace(/^(\[[^\]]+\]\s*)+/, '');
            return { kind: 'act', unit: u.key, map: u.item.map, evId: u.item.evId, type: u.item.type, needTraps: u.item.needTraps,
                label: head + ' - ' + step, note: u.item.hops ? u.item.hops + '회 이동' : '',
                help: head + '\n다음 단계: ' + step + (u.item.help ? ' / ' + u.item.help : '') + (u.help ? ' / ' + u.help : '') };
        }
        showRecAreas() {
            this._recDetail = null;
            this._recLevel = 'units';
            const r = this._rec, items = [];
            const focus = $gameSystem._navFocus;
            const fu = (r.units || []).find(u => u.key === focus && u.item);
            if (fu) items.push(this.unitRow(fu, '▶ 이어서: '));
            for (const u of (r.units || [])) items.push(this.unitRow(u));
            if (r.board) items.push({ kind: 'act', map: r.board.map, evId: r.board.evId, type: 'talk', label: r.board.label, note: r.board.hops ? r.board.hops + '회 이동' : '', help: '아직 받지 않은 의뢰가 있습니다. 게시판으로 가서 엽니다.' });
            if (r.hItems && r.hItems.length) items.push({ kind: 'hlist', label: '[H 이벤트] 아직 안 본 것 (' + r.hItems.length + '개)', help: '근처에서 아직 보지 않은 H 이벤트 목록입니다. 가까운 순서로 보여줍니다.' });
            const others = r.groups.reduce((a, g) => a + g.items.filter(i => !i.quest && i.cat !== '메인' && !i.hev).length, 0);
            items.push({ kind: 'others', label: '기타 할 일 (지역별, ' + others + '개)', help: '퀘스트와 상관없는 대화/이벤트/아이템 줍기를 지역별로 봅니다.' });
            this._actWindow.setItems(items);
            this._actWindow.activate();
            this._actWindow.select(0);
        }
        showRecGroups() {
            this._recDetail = null;
            this._recLevel = 'groups';
            const r = this._rec, items = [];
            if (r.mainInfo) items.push({ kind: 'none', enabled: false, label: r.mainInfo, help: '다음 층으로 가는 길이 아직 열리지 않았습니다. 보스나 기믹을 직접 해결해야 할 수 있습니다.' });
            if (r.next) {
                items.push({ kind: 'act', map: r.next.map, evId: r.next.evId, type: r.next.type, label: '▶ 다음 할 일: ' + r.next.label,
                    note: r.next.hops ? r.next.hops + '회 이동' : '', help: '가장 우선순위가 높은 일입니다.\n' + r.next.help });
            }
            for (const g of r.groups) {
                const sum = Recommender.summary(g);
                items.push({ kind: 'area', map: g.map, group: g, label: this.areaName(g), note: g.current ? '' : g.hops + '회 이동',
                    help: (sum || '할 일 없음') + '\n선택하면 "전부 진행" 또는 하나씩 고를 수 있습니다.' });
            }
            if (!items.length) items.push({ kind: 'none', enabled: false, label: '지금 갈 수 있는 곳은 모두 확인했습니다',
                help: '남은 길은 밀기 퍼즐이나 스위치 장치 같은 기믹 뒤에 있습니다. 직접 풀어서 진행해 주세요.' });
            this._actWindow.setItems(items);
            this._actWindow.activate();
            this._actWindow.select(0);
        }
        showRecDetail(g) {
            this._recDetail = g;
            const items = [];
            if (g.items.length && g.hlist) {
                items.push({ kind: 'batch', map: g.map, group: g, label: '▶ H 이벤트 전체 진행 (' + g.items.length + '개)',
                    help: '안 본 H 이벤트를 가까운 곳부터 차례로 진행합니다. 선택지는 직접 고르세요.' });
            }
            if (g.items.length && !g.hlist) {
                items.push({ kind: 'batch', map: g.map, group: g, label: '▶ 전부 진행 (' + g.items.length + '개)',
                    help: Recommender.summary(g) + '\n중요한 일부터, 가까운 순서로 차례대로 진행합니다.' });
            }
            const em = g.exploreMap || g.map;
            if (g.explore && em !== $gameMap.mapId()) items.push({ kind: 'act', type: 'go', map: em, evId: 0, needTraps: g.needTraps, label: '[이동] ' + (em === g.map ? '이 지역으로 가기' : Index.maps[em].name + '(으)로 가기'), help: '아직 가보지 않은 지역입니다.' });
            for (const it of g.items) {
                items.push({ kind: 'act', map: it.map, evId: it.evId, type: it.type, needTraps: it.needTraps || g.needTraps, label: it.label, help: it.label + '\n' + it.help });
            }
            this._actWindow.setItems(items);
            this._actWindow.activate();
            this._actWindow.select(0);
        }
        runBatch(g) {
            const g0 = g.items.find(it => it.map === $gameMap.mapId()) || g.items[0];
            const target = { map: g0 ? g0.map : g.map, evId: 0 };
            if (g.needTraps) Runner._tempTraps = true;
            let plan = target.map === $gameMap.mapId() ? { legs: [], final: target, hops: 0 } : Planner.plan(target, null, g.needTraps ? null : this._byMap);
            if (!plan) {
                Runner._tempTraps = false;
                SoundManager.playBuzzer();
                this._helpWindow.setText('경로를 찾지 못했습니다.');
                this._actWindow.activate();
                return;
            }
            // 방(맵)별로 나눠서 차례로: 지금 있는 방 > 가까운 방
            const segs = new Map();
            for (const it of g.items) {
                if (!segs.has(it.map)) segs.set(it.map, { map: it.map, mode: 'batch', queue: [], kinds: {}, hops: it.map === $gameMap.mapId() ? -1 : (this._byMap[it.map] ? this._byMap[it.map][0].hops : 99) });
                const sg = segs.get(it.map); sg.queue.push(it.evId); sg.kinds[it.evId] = it.type === 'pickup' ? 'pickup' : 'talk';
            }
            const list = Array.from(segs.values()).sort((a, b) => a.hops - b.hops);
            if (!list.length) { this.popScene(); return; }
            const first = list.shift();
            if (first.map !== target.map) {
                plan = first.map === $gameMap.mapId() ? { legs: [], final: { map: first.map, evId: 0 }, hops: 0 } : Planner.plan({ map: first.map, evId: 0 }, null, this._byMap);
                if (!plan) { SoundManager.playBuzzer(); this._helpWindow.setText('경로를 찾지 못했습니다.'); this._actWindow.activate(); return; }
            }
            const label = g.label || (Index.maps[g.map].name + ' 전부 진행');
            Runner.start(plan, label, { mode: 'batch', queue: first.queue, kinds: first.kinds, tour: list, tourLabel: list.length ? label : null });
            this.popScene();
        }
        onActCancel() {
            if (this._curDest && this._curDest.kind === 'rec' && this._recDetail && this._recDetail.hlist) { this.showRecAreas(); return; }
            if (this._curDest && this._curDest.kind === 'rec' && this._recDetail) { this.showRecGroups(); return; }
            if (this._curDest && this._curDest.kind === 'rec' && this._recLevel === 'groups') { this.showRecAreas(); return; }
            this._actWindow.deactivate();
            this._actWindow.setItems([]);
            this._mapWindow.setFocus(null);
            this._destWindow.activate();
        }
        onAct() {
            const a = this._actWindow.currentExt();
            if (a.kind === 'others') { this.showRecGroups(); return; }
            if (a.kind === 'hlist') { this.showRecDetail({ map: $gameMap.mapId(), items: this._rec.hItems, hlist: true, label: 'H 이벤트 전체 진행' }); return; }
            if (a.kind === 'area') { this.showRecDetail(a.group); return; }
            if ($gameSystem) $gameSystem._navFocus = a.unit || null;
            if (a.kind === 'batch') { this.runBatch(a.group); return; }
            const mapId = a.map;
            if (a.needTraps) Runner._tempTraps = true;
            const target = { map: mapId, evId: a.kind === 'act' && a.type !== 'pickupAll' && a.type !== 'go' ? a.evId : 0 };
            let plan = null;
            if (mapId === $gameMap.mapId()) {
                if (target.evId) {
                    const ge = $gameMap.event(target.evId);
                    const pg = ge && ge.page();
                    if (ge && Runner.pathFrom(this._field, Runner.spotsFor(ge, pg ? pg.priorityType : 1))) plan = { legs: [], final: target, hops: 0 };
                } else if (a.type === 'pickupAll' || a.type === 'tour') {
                    plan = { legs: [], final: target, hops: 0 };
                }
            }
            if (!plan && target.evId && mapId === $gameMap.mapId()) {
                // 같은 맵인데 직접 못 가는 경우: 다른 맵 경유만 허용
                const f = this._field;
                plan = Planner.plan(target, null, this._byMap, n => !(n.s.map === mapId && f.dist[n.s.y * f.w + n.s.x] >= 0));
            }
            if (!plan) plan = Planner.plan(target, null, this._byMap);
            if (a.needTraps && !plan) plan = Planner.plan(target, null);
            if (!plan) {
                try {
                    NavLog.reset();
                    NavLog.add('PLAN-FAIL target map ' + mapId + ' ev' + target.evId + ' (' + (a.label || '') + ')');
                    const f = this._field, cur = $gameMap.mapId();
                    NavLog.add('  pushes=' + JSON.stringify(f.pushes ? [...f.pushes.entries()].map(([k, v]) => (k % f.w) + ',' + ((k / f.w) | 0) + ' no' + v.join('')) : []) + ' doors=' + (f.doors ? f.doors.size : 0));
                    for (const e of Index.edgesOf(cur, null)) {
                        const ge = $gameMap.event(e.evId);
                        const p = ge && Runner.pathFrom(f, Runner.spotsFor(ge, ge.page() ? ge.page().priorityType : e.prio));
                        NavLog.add('  edge ev' + e.evId + ' (' + e.ex + ',' + e.ey + ') -> ' + e.to.map + '@' + e.to.x + ',' + e.to.y + (e.warp ? ' warp' : '') + ' path=' + (p ? p.dirs.length : 'none'));
                    }
                    NavLog.flush();
                } catch (e) { /* 무시 */ }
                Runner._tempTraps = false;
                SoundManager.playBuzzer();
                this._helpWindow.setText('경로를 찾지 못했습니다.');
                this._actWindow.activate();
                return;
            }
            const label = a.kind === 'act' ? a.label.replace(/^\[.+?\]\s*/, '') + ' @ ' + Index.maps[mapId].name : Index.maps[mapId].name;
            let opts = {};
            if (a.type === 'tour') {
                const rest = a.segs.slice(1).map(sg => Object.assign({}, sg));
                const lb = Index.maps[Index.buildingOf(a.segs[0].map)].name + ' 건물 아이템 줍기';
                opts = { mode: 'pickup', queue: a.segs[0].queue.slice(), tour: rest, tourLabel: lb };
            } else if (a.type === 'pickupAll') opts = { mode: 'pickup', queue: a.evIds };
            else if (a.type === 'pickup') opts = { mode: 'pickup', queue: [a.evId] };
            else if (a.type === 'exit') opts = { mode: 'talk', queue: [a.evId], exitTo: a.to };
            else if (a.kind === 'act' && a.type !== 'go') opts = { mode: 'talk', queue: [a.evId] };
            Runner.start(plan, label, opts);
            this.popScene();
        }
    }
    window.Scene_AutoNav = Scene_AutoNav;
})();
