// 새 게임 프로필 템플릿: 복사해서 profiles/<게임>.js 로 저장하고 채운다.
// 비워 둔 항목은 엔진 기본값(core/ClaudeAutoNav.js 의 DEFAULT_PROFILE)을 쓴다.
({
    name: '게임 이름',
    // 경로 계산에서 뺄 맵: 최상위 ID(하위 맵 포함) / 이름 패턴 (컷신, 회상, 테스트, 미사용 등)
    excludeMapIds: [],
    excludeMapPattern: '이벤트용|백업|테스트|더미|미사용|구버전|컷신|cutscene|test|unused|backup|debug',
    // 이 맵(하위 포함)으로 이동하는 이벤트는 엔딩/게임오버로 보고 추천하지 않음
    endingRootIds: [],
    // 사용하면 순간이동하는 아이템 이름 패턴 (없으면 '(?!)')
    travelItemPattern: '(?!)',
    // H 이벤트 판정: 공통 이벤트 이름 / 그림 이름
    hEventCeRe: null,
    hPictureRe: null,
    // 던전 층 맵 이름 (예: /^제\s*(\d+)\s*층/), 없으면 null
    floorRe: null,
    // 장소 분류: [맵 이름 패턴, 분류] 순서대로 처음 맞는 것
    placeRules: [
        [/상점|가게|shop/i, '상점'],
        [/거리|마을|town|street/i, '거리'],
        [/집|방|house|room/i, '건물']
    ],
    // 정적 통행 리전 (어댑터로 자동 처리되지 않는 리전 플러그인용)
    regionPass: [],
    regionBlock: [],
    // 이름 상자 없이 대사만 있는 NPC도 대화 상대로 볼지
    talkWithoutName: true,
    // 잠긴 문/상자 선택지 자동 선택 문구 (없으면 null)
    lockChoice: null,
    // 지나가며 줍기에서 뺄 이벤트 이름
    sideExcludeRe: /bomb|trap|폭탄|함정/i,
    // 길을 막은 추격형 적에게 부딪혀서라도 지나갈지
    enemyContact: false
})
