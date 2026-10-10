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
    maxStoryMessages: 6,                                  // 문 열기 전에 대사가 몇 줄 나오는 출입구도 경로로 사용 (201호 등)
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
    ignoreEventRe: /^Journal$|Cheat|Debug|Updater|Lighting|^Light$|Fishing|Crane|Z-Cola/i,
    ignoreSwitches: [1, 2, 3, 4, 5, 12],                  // 시간대 스위치(아침~자정): 진행 조건 역추적에서 제외 (시간이 지나면 바뀜)
    dayVar: 1,                                            // 날짜 변수: 날이 바뀌면 대화했던 캐릭터와 다시 대화 (대화 단계 변수로 스토리 진행)
    // 봇 설정
    // HP(변수 18, 최대 변수 19): 1칸 깎이면 약초(+1), 1만 남으면 구급상자(완전 회복)
    botHeal: { hpVar: 18, below: () => Math.max(1, $gameVariables.value(19) - 1), items: () => $gameVariables.value(18) <= 1 ? [12, 5] : [5] },
    botCombat: { key: 'pageup', range: 7, interval: 20, bulletSpeed: 0.25, requireSwitches: [40] }, // 무기 장착(스위치 40) 상태에서 PageUp = 사격
    botSleepChoiceRe: /잠자기|다음 날/,                 // 할 일이 없을 때 고를 '시간 넘기기' 선택지
    botTimeCe: [11, 6],                                   // 시간을 넘기는 공통 이벤트: 11 다음 날, 6 시간 경과(그리드 출구)
    botSleepEventRe: /^Sleep Icon$/,                      // 시간 넘기기 이벤트 이름 (자정에는 선택지가 '네'로 바뀜)
    // 식량: 매일 밤 공통 이벤트 100이 인원(변수 15)과 스위치 21/22에 따라 식량을 소비. 모자라면 경고(스위치 25), 경고 상태에서 또 모자라면 게임 오버
    botFood: {
        items: [7, 8, 9, 13],
        warnSwitch: 25,
        buffer: 3,                                        // 3일 치까지 모아 둠 (수색 결과가 무작위라 여유분)
        need: () => { const n = $gameVariables.value(15), a = $gameSwitches.value(22), b = $gameSwitches.value(21);
            const base = n >= 6 ? 5 : n >= 4 ? 4 : n >= 2 ? 3 : 2; return a ? base + 1 : b ? base - 1 : base; }
    },
    botChoiceAvoid: /치트|cheat/i,                        // 봇이 절대 고르지 않을 선택지
    botManualRe: /보스|Boss|낚시|오토바이|콜로세움|바이올렛 컵|난투|Crane|크레인|Z-Cola/, // 직접 해야 하는 장면(봇이 건너뜀)
    sideExcludeRe: /Zombie|Trap|Bomb|함정|폭탄/i,
    enemyContact: false
})
