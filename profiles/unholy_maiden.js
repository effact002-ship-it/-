// Unholy Maiden (RPG Maker MZ) - v49까지 엔진에 박혀 있던 값들
({
    name: 'Unholy Maiden',
    excludeMapPattern: '이벤트용|백업|EV용|테스트|더미|리프레시|엔드롤|H 이벤트용|실패용|시몬용|꿈속|기억 속|트라우마',
    excludeMapIds: [12, 68],
    endingRootIds: [12],
    travelItemPattern: '귀환|텔레포|전송',
    nameMap: { '行商人': '행상인', '食材屋': '식재료 상점', '店主': '점주', '町人': '마을 사람', 'アル': '아르', 'ヒルダ': '힐다', 'テレポーター': '텔레포터', '封印石': '봉인석', '物々交換NPC': '물물교환 NPC' },
    hEventCeRe: /\[Experience\] (?!Lewdness$|Chastity)|Lewdness \(at climax\)|Sexual desire addition for events \((?!minimal)|Sex Scenes|H event|\bREC\b/i,
    floorRe: /^제\s*(\d+)\s*층/,
    placeRules: [
        [/광장$/, '거리'],
        [/교회|성당|예배|참회/, '교회'], [/펍|주점|酒場|술집/, '주점'], [/여관|숙소|宿/, '여관'], [/길드/, '길드'],
        [/테르마에|목욕/, '목욕탕'], [/변소|화장실/, '화장실'], [/약방|진료소|병원|의원/, '의료'],
        [/샵|상점|가게|잡화|만물상|보석점|귀금속|상회|아울렛|무기점|방어구|Northeast|ショップ/, '상점'],
        [/공작실|대장간|공방|작업장/, '공방'],
        [/원로원|집무실|자료실|심문소|관측대|출판사|학사|사채업자/, '시설'],
        [/광장|골목|빈민가|유흥가|주거지|거리|도시|마을|부락|하수도|허브원|갈란디스/, '거리'],
        [/집|민가|저택|공작저|빌딩|^\d+F$/, '건물']
    ],
    buildingRootRe: /로즈|추방자|헤그이|무녀의 부락/,
    placeRootStripRe: /^로즈(퍼|포)드\s*/,
    // TMRegionPassable(43 통과, 44 불가), MPP_HiddenPassage(45 통과, 46 불가)
    regionPass: [43, 45],
    regionBlock: [44, 46],
    talkWithoutName: false,
    lockChoice: { detect: /자물쇠|억지로/, pick: /자물쇠 열기|열기를 시도|연다|열다/, force: /억지로|부순|부수/ },
    template: {
        names: [
            [/宝箱/, '보물상자'], [/爆弾/, null], [/壺|ツボ/, '항아리'], [/種子/, '씨앗'], [/花/, '꽃'],
            [/鉱石/, '광석'], [/空瓶/, '빈 병'], [/エーテルの器/, '에테르 그릇'], [/エーテル/, '에테르'],
            [/薬学書/, '약학서'], [/ごみ/, '바닥 잡동사니'], [/装備ドロップ/, '장비'], [/トークン/, '토큰']
        ],
        collectRe: /エーテル|花|種子|鉱石|空瓶|器|薬学書|ごみ|壺|ツボ|宝箱|装備ドロップ/,
        excludeRe: /爆弾|罠|デバッグ|出口|女神像|休憩|転送|シンボル|霊体|看守|ボス|ミミック|Mimic/,
        breakableRe: /壺|ツボ/,
        questBoardRe: /クエストボード/
    },
    sideExcludeRe: /爆弾|爆發|罠/,
    enemyContact: true
})
