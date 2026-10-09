# ClaudeAutoNav 인계 문서

Unholy Maiden (RPG Maker MZ) 자동 내비게이션 플러그인 개발 기록. 다른 Claude 세션이 이 폴더만 보고 이어서 작업할 수 있도록 정리함.

- 게임 폴더: `D:\야겜\Unholy_maiden_Ver.1.0.10_PART6_Final_한국어_합본`
- 이 폴더: 게임 폴더 안 `_claude_autonav_dev\`
- 현재 배포 버전: **v49** (`js\plugins\ClaudeAutoNav_v49.js`, `js\plugins.js` 마지막 항목 이름 `ClaudeAutoNav_v49`)
- 원본 plugins.js 백업: `js\plugins.js.bak_autonav`

## 1. 배포 절차 (반드시 지킬 것)

NW.js가 스크립트를 캐시하므로 **매번 새 파일명**으로 배포한다.

1. 원본 소스 `ClaudeAutoNav.js`(이 폴더)를 수정. 소스 안의 `const PN = 'ClaudeAutoNav';`는 그대로 둔다.
2. 배포본 생성: `PN`을 `'ClaudeAutoNav_vNN'`으로 바꾼 사본을 `js\plugins\ClaudeAutoNav_vNN.js`로 저장.
   - `sed "s/const PN = 'ClaudeAutoNav';/const PN = 'ClaudeAutoNav_vNN';/" ClaudeAutoNav.js > ClaudeAutoNav_vNN.js`
3. `js\plugins.js`의 `ClaudeAutoNav_v(이전)` 이름을 `ClaudeAutoNav_vNN`으로 치환 (항목은 맨 마지막 한 줄, 압축된 JSON 한 줄).
4. 사용자에게 게임 재시작 요청.

## 2. 테스트 하네스 (Node, 클라우드 쪽)

- 게임 `data\` 폴더 JSON을 스테이징한 경로를 `test.js` 2행의 `G` 상수로 지정해야 함 (현재 `/mnt/user-data/uploads/Unholy_maiden_Ver.1.0.10_PART6_Final_한국어_합본`). 맵 파일이 많으므로 필요한 것만 스테이징해도 됨 (없는 맵은 무시됨).
- `test.js`는 RPG Maker 전역(`$dataMap`, `$gameMap` 등)을 스텁하고 플러그인을 로드. `process.argv[2]='map,x,y'`로 시작 위치 지정.
- `PluginManager.parameters('OverpassTile')`는 test.js 6행에서 `{overPathRegion:'1', gatewayRegion:'2'}`로 스텁됨.
- 주요 테스트
  - `t24.js`: 회귀 테스트 (`node t24.js` 정상 종료 확인)
  - `sim.js`: 메인 스토리 가상 플레이스루. `STEPS=40 node sim.js`. 디버그 env: `DBG=맵`, `DBG3=맵`(그 맵으로 들어가는 출입구), `DBG5=맵`(출입구 막힌 원인), `DBG6`, `DBG7`.
  - `t44.js`: 퀘스트 단위 추천 출력 (`S=1,41,13 node t44.js`)
  - `t45.js`: 현재 맵 실시간 경로(liveField) 스텁 테스트 (`M=맵 P=x,y T=x,y TE=이벤트ID`)
  - `t47.js`: 지나가며 줍기(checkSide) 테스트
  - `t53.js`, `t35.js`: 맵 통행 ASCII 출력

## 3. 소스 구조 (ClaudeAutoNav.js)

- `scanList / compilePage`: 이벤트 명령 분석. transfers, shop, gains, swOn/ssOn, danger(엔딩), pmove(이동 루트 순간이동), push(밀기 물체), noPush(밀 수 없는 방향), faceDir(빗장 방향), hev(H 이벤트) 등.
- `Index`: 맵 컴파일(통행 비트, 리전 43/45 통과, 44/46 불가, 다리 리전 ovr, 피해 칸 haz), 활성 페이지, edgesOf(출입구), activitiesOf(지역 항목), obstacles, 아이템 출처, placeType/placeLabel(장소 분류), buildingOf/buildingRooms(건물 단위), oneWayDir(빗장), isPushable/pushNo, isOpenable(문/항아리).
- `Planner`: staticBfs(다리 2층 상태 포함, 밀기·빗장 처리), explore(맵 간 다익스트라), plan/reach.
- `Runner`: 실제 이동. liveField(가중치 탐색: 독늪/대미지 25, 밀기 8, 문 3, 적 통과 40, 다리 위/아래 층 상태), walkTo, openDoor(문/밀기/빗장), checkSide(경로 5칸 이내 아이템·빗장 들르기), tour(여러 맵 순회), finish/reopen(자동 이어하기).
- `Recommender`: build(퀘스트 단위 units, groups(건물 단위), hItems), mainGoal(층 해금 역추적: 관문 조건 → 스위치 세터 → 아이템 출처), blockedInfo.
- 게임 훅: 자동 달리기(updateDashing), 대사 자동 넘김, 선택지 자동(잠긴 문/상자 자물쇠), 기습 방지(SoR_EnemySymbolEncounter의 EncountDir 보정), 방향키 수동 중단(이벤트/메시지 중엔 무시).
- `Scene_AutoNav`: N 키 메뉴. 추천 진행(메인/서브 퀘스트, H 이벤트 목록, 기타 지역별), 지역 목록([분류] 이름 · 지역), 지역 항목(H 이벤트, 대화, 상점, 출입구, 아이템, 건물 전체 아이템), 설정 토글.
- `NavLog`: 게임 폴더 `autonav_log.txt` (최근 300줄, 1초마다 저장). 메뉴 열 때 맵 상태(밀기 물체, 출구별 경로)를 기록 → 사용자가 "로그 확인해"라고 하면 이 파일을 읽어 진단.

## 4. 설정 (ConfigManager에 저장)

자동 대사 넘김(기본 켬), 완료 후 추천 자동 열기, 잠긴 문/상자 선택지(직접/자물쇠/억지로), 함정 통과, 적 기습(기습 방지 기본/항상 선제/게임 그대로), 자동 이동 달리기(기본 켬), 지나가며 근처 아이템 줍기(기본 켬, 5칸).

## 5. 게임 데이터 사실 (조사 결과)

- 층 해금 스위치: 215(2층) 216(3층) 1238(4층) 1237(5층) 1248(심층 무녀의 부락). 텔레포터 공통 이벤트 14의 선택지 조건.
- 2층: 고성 전송실은 액터 5(동료)가 파티에 있으면 막힘. 대안: 화약고(맵 128) 상자의 발파용 폭탄(아이템 428) → 도서관 지하 통로 금 간 벽(맵 13 ev7). 폭탄은 Roseford Northeast 상점(맵 227)에서도 판매.
- 3층: 봉인석 단계(스위치 185) → 산제물의 영묘(172) → 봉인석의 제단(78) 보스(ev16, 승리 시 s590) → 전송 함정 ev11(이동 루트로 순간이동) → 관문 ev7(22,20).
- 4층: 비닉의 숲 호반 야영지(81) 무녀상 2개에 더럽혀진 무녀상(아이템 134) 설치 → s1227 → 문 ev17. 무녀상은 부정의 지하 신전 우상의 방(73) 등에서 회수.
- 5층: 오즈 성당 쪽에서 진행 (시뮬레이션상 해금 확인).
- 심층(1248): 관문에 수해의 보물 지도(아이템 381) 필요. 펍(맵 15) ev14 p5(s358) ← 지하 감옥(맵 63) 쪽 선행(s417, 오스카) ← 옛 무녀의 집(맵 61) 책장 뒤. 아직 자동 연결 안 됨.
- 플러그인: TMRegionPassable(43 통과, 44 불가), MPP_HiddenPassage(45 통과, 46 불가), OverpassTile(리전 1 다리, 2 입구), SoR_EnemySymbolEncounter(같은 방향일 때만 선제/기습), MOD/SOP_SexCombat(성 기술: `<SexHub>` 있는 적 26종에게만 유효).
- 템플릿 이벤트: 맵 40. ID23/24/27 밀기 물체, ID46/47 빗장 문(한쪽에서만 열림), ID15/18/64 층 보물상자(자물쇠 선택지), ID25/38/39 등 항아리, ID9/36 독늪(지형 태그 1), ID35 전류(태그 7).

## 6. 남은 과제

- 심층 무녀의 부락(1248) 메인 연결: 보물 지도 퀘스트 체인 자동 추적.
- 실제 게임 미검증 기능이 많음: 다리 2층 경로, 밀기, 빗장, 건물 순회, H 이벤트 전체 진행, 출입구 안내. 문제 보고 시 `autonav_log.txt` 확인.
- 사용자 선호: 불필요한 이모지 금지, 한국어, 간결한 보고.
