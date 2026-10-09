// Zombie's Retreat 2 (RPG Maker MV) - v1.1.0 손번역판 기준
// 자동 감지되는 플러그인 어댑터: YEP_RegionRestrictions(리전 1/3 불가, 4 통과), YEP_EventHitboxResize(큰 이벤트),
// YEP_EventChasePlayer(좀비 = 추격형 적, 닿으면 피해/게임오버), YEP_SlipperyTiles(리전 24), YEP_CommonEventMenu(버스 정류장),
// HIME_HiddenChoiceConditions(지하철 노선 숨김), Galv_QuestLog(퀘스트 목표 추적), YEP_MessageCore(\n<이름>)
({
    name: "Zombie's Retreat 2",
    // 12 특별한 순간(회상), 240 크레딧, 220 오토바이 컷신/테스트 (1 도입부 아래 맵은 1일 차 스토리에서 실제로 돌아다님)
    excludeMapIds: [12, 220, 240],
    excludeMapPattern: '컷신|미사용|구버전|원본 백업|테스트|회상|크레딧|장면|^MAP\\d+$|cutscene|test|unused',
    endingRootIds: [240],
    travelItemPattern: '(?!)',
    hPictureRe: /Sex|HJ|BJ|FJ|TF\d|Paizuri|Thigh|Massage|Fondle/,
    floorRe: null,
    placeRules: [
        [/지하철/, '역'],
        [/병원|의료|진료|처방|비품/, '의료'],
        [/편의점|가게|상점|의상점|쇼핑몰|식당|카페|고물상|수리점|대리점|오락실/, '상점'],
        [/목욕탕/, '목욕탕'],
        [/화장실/, '화장실'],
        [/구역|골목|공원|교외|들판|습지|부두|현장|주택단지|축제|광장|코트$/, '거리'],
        [/학교|교실|도서관|체육관|수영장|복도|탈의실|구내식당/, '학교'],
        [/경찰서|사무실|사무소|타워|발전기|급수|제어실|연구소|연구실|공장|창고|하수도|수로|콜로세움|아지트|은신처/, '시설'],
        [/집|방|아파트|숙소|다락방|저택|^\d+호/, '건물']
    ],
    talkWithoutName: true,
    // 추천에서 뺄 이벤트: 치트 일지, 업데이트/조명 처리, 미니게임(낚시)
    ignoreEventRe: /^Journal$|Cheat|Debug|Updater|Lighting|^Light$|Fishing/i,
    dayVar: 1,                                            // 날짜 변수: 날이 바뀌면 대화했던 캐릭터와 다시 대화 (대화 단계 변수로 스토리 진행)
    // 봇 설정
    botHeal: { hpVar: 18, below: 1, items: [12, 5] },     // HP(변수 18)가 1 이하면 구급상자 -> 약초
    botCombat: { key: 'pageup', range: 7, interval: 20, requireSwitches: [40] }, // 무기 장착(스위치 40) 상태에서 PageUp = 사격
    botSleepChoiceRe: /잠자기|다음 날/,                 // 할 일이 없을 때 고를 '시간 넘기기' 선택지
    botTimeCe: [11, 6],                                   // 시간을 넘기는 공통 이벤트: 11 다음 날, 6 시간 경과(그리드 출구)
    botSleepEventRe: /^Sleep Icon$/,                      // 시간 넘기기 이벤트 이름 (자정에는 선택지가 '네'로 바뀜)
    botChoiceAvoid: /치트|cheat/i,                        // 봇이 절대 고르지 않을 선택지
    botManualRe: /보스|Boss|낚시|오토바이|콜로세움|바이올렛 컵|난투/, // 직접 해야 하는 장면(봇이 건너뜀)
    sideExcludeRe: /Zombie|Trap|Bomb|함정|폭탄/i,
    enemyContact: false
})
