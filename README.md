# ClaudeAutoNav

RPG Maker MV/MZ 게임용 자동 내비게이션 플러그인이에요. N 키로 메뉴를 열면 갈 수 있는 지역, 할 일 추천, 자동 이동, 아이템 줍기를 쓸 수 있어요.
처음에는 Unholy Maiden(MZ)용으로 만들었고, v2.0부터 엔진(core)과 게임별 설정(profile)을 나눠서 다른 게임에도 적용할 수 있어요.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `core/ClaudeAutoNav.js` | 공용 엔진 (MV/MZ 모두 동작). 수정은 여기서 함 |
| `profiles/<게임>.js` | 게임별 설정 (맵 제외 규칙, 장소 분류, H 이벤트 판정, 리전 등) |
| `dist/<게임>/ClaudeAutoNav_vN.js` | 배포본 (core + 프로필을 합친 파일) |
| `tools/` | 빌드, 테스트, 시뮬레이션 도구 |
| `games/<게임>/` | 게임별 인계 문서와 조사 기록 |

## 지원 게임

| 게임 | 엔진 | 프로필 | 최신 배포본 | 문서 |
|---|---|---|---|---|
| Unholy Maiden | MZ | `profiles/unholy_maiden.js` | `dist/unholy_maiden/ClaudeAutoNav_v50.js` | `games/unholy_maiden/HANDOFF.md` |
| Zombie's Retreat 2 | MV | `profiles/zombies_retreat_2.js` | `dist/zombies_retreat_2/ClaudeAutoNav_v2.js` | `games/zombies_retreat_2/NOTES.md` |

## 배포 방법

NW.js가 스크립트를 캐시하므로 **매번 새 버전 번호(새 파일명)** 로 배포해요.

1. 배포본 만들기: `node tools/build.js <프로필> <버전>` (예: `node tools/build.js zombies_retreat_2 3`)
2. 만들어진 `dist/<프로필>/ClaudeAutoNav_vN.js`를 게임의 플러그인 폴더에 복사
   - MZ: `<게임>/js/plugins/`
   - MV: `<게임>/www/js/plugins/` (`www` 폴더가 없는 게임은 `<게임>/js/plugins/`)
3. 같은 폴더 위의 `plugins.js`를 메모장으로 열고 등록
   - 처음 설치: 마지막 `]` 바로 앞 항목 끝에 `,`를 붙이고 빌드가 출력한 줄을 추가
     `{"name":"ClaudeAutoNav_vN","status":true,"description":"자동 내비게이션","parameters":{}}`
   - 업데이트: 기존 `ClaudeAutoNav_v(이전)` 이름을 새 이름으로 바꾸기
   - 처음 고치기 전에 `plugins.js`를 백업해 두세요.
4. 게임 재시작

## 엔진에 들어 있는 어댑터 (플러그인이 켜져 있으면 자동 적용)

| 플러그인 | 처리 |
|---|---|
| YEP_RegionRestrictions | 플레이어 통행 불가/허용 리전 (파라미터 + 맵 메모) |
| YEP_EventHitboxResize | 여러 칸을 차지하는 이벤트 (문, 버스 정류장 등) |
| YEP_EventChasePlayer | 추격형 적 (좀비 등)은 항상 피해서 이동 |
| YEP_SlipperyTiles | 미끄러운 바닥은 피하고, 미끄러져 위치가 바뀌면 경로 재계산 |
| YEP_CommonEventMenu | 공통 이벤트 메뉴(버스 정류장 등)를 이동 수단으로 인식하고 자동 선택 |
| HIME_HiddenChoiceConditions | `hide_choice`로 숨긴 선택지(잠긴 노선)를 조건으로 인식 |
| Galv_QuestLog | 진행 중 퀘스트의 다음 목표를 완료시키는 이벤트를 추천 |
| YEP_MessageCore 등 | `\n<이름>` 이름 상자에서 화자 이름 추출 |
| YEP_KeyboardConfig 등 | 키 설정을 덮어써도 N 키가 동작하도록 키 입력을 직접 감지 |
| OverpassTile | 다리(입체 교차) 위/아래층 |
| TemplateEvent | 템플릿 이벤트 (`\TE{식}` 조건 포함) |
| SoR_EnemySymbolEncounter | 기습 방지/선제공격 설정 |
| QuestSystem (MZ) | 변수 기반 퀘스트 보고/진행 추천 |

그 밖에 엔진 공통으로 분석하는 것: 장소 이동, 선택지 메뉴(선택지 → 변수 → 이동 패턴 포함), 상점, 아이템 획득, 스위치/변수/셀프 스위치 조건, 밀기 물체, 빗장 문, 피해 바닥.

## 새 게임에 적용하는 순서

1. 게임의 `data/` 폴더와 `js/plugins.js`를 받는다 (MV는 `www/` 안). 이미지와 소리는 필요 없음.
2. `profiles/_template.js`를 복사해 새 프로필을 만든다. 맵 트리(`MapInfos.json`)를 보고 제외할 맵(컷신/테스트/회상)과 장소 분류 규칙을 채운다.
3. 플러그인 목록을 보고, 위 표에 없는 이동/통행 관련 플러그인이 있으면 어댑터를 추가한다.
4. 도달 가능 지역 확인: `GAME=<폴더> PROFILE=profiles/<게임>.js node tools/reach.js`
5. 가상 진행: `GAME=... PROFILE=... STEPS=40 node tools/sim.js` (실제 세이브로 시작하려면 `SAVE=<세이브 파일>`)
6. 실제 엔진 테스트: `node tools/build.js <게임> 1` 후 `GAME=... PLUGIN=dist/<게임>/ClaudeAutoNav_v2.js START=맵,x,y node tools/browser_test.js`
   - 헤드리스 크롬에서 게임 엔진을 띄우고 이미지/소리는 빈 파일로 대체해 메뉴와 자동 이동을 시험한다. 시나리오는 `SCRIPT=`로 지정.
7. 배포하고 게임 폴더의 `autonav_log.txt`로 문제를 진단한다 (MV는 `www/autonav_log.txt`).

## 자동 진행 봇

N 키 메뉴 맨 위의 `▶ 봇 자동 진행 시작`으로 켜고, 방향키/ESC/메뉴의 `■ 봇 자동 진행 정지`로 끕니다.

- 추천(메인/서브 퀘스트 → 진입 컷신 → 조사 지점 → 대화 → 아이템 → 탐색)을 차례로 실행
- 대사 자동 넘김, 선택지 자동 선택(진행/수락 우선, 거절/치트 회피, 같은 선택지가 반복되면 다른 항목), 이름 입력은 기본값, 숫자 입력 확정, 상점/제작 화면은 닫기
- 할 일이 없으면 잠자기/시간 경과 이벤트로 시간을 넘김 (프로필 `botSleepChoiceRe`, `botSleepEventRe`, `botTimeCe`)
- 날짜 변수(`dayVar`)가 있으면 날이 바뀔 때 대화했던 캐릭터와 다시 대화
- 사격 전투(`botCombat`), 체력 회복(`botHeal`), 직접 해야 하는 장면 건너뛰기(`botManualRe`)
- 게임 오버: 봇 전용 세이브(`save/autonav_bot.rpgsave`, 게임 슬롯과 별개)에서 다시 시작, 같은 대상은 몇 번만 재시도
- 막힘 감시: 행동해도 진행(스위치/변수/셀프 스위치/퀘스트/아이템)이 없으면 시간을 넘기고, 그래도 안 되면 정지

기록 파일 (게임 폴더, MV는 `www/`):
- `autonav_bot_log.txt`: 봇이 한 일 전체 (DO/CHOICE/FIRE/HEAL/SAVE/FAIL)
- `autonav_bot_report.txt`: 멈췄을 때의 보고서 (이유, 추천 목록, 실패 대상, 최근 기록 300줄)
- `save/autonav_bot.rpgsave`: 봇 세이브. 보고서와 함께 보내 주면 `SAVE=... SCRIPT=tools/scenarios/bot_run.js node tools/browser_test.js`로 같은 지점부터 재현

개선 순서: 보고서 확인 → 봇 세이브로 헤드리스 엔진에서 재현 → 엔진/프로필 수정 → 같은 세이브로 재확인 → 새 버전 배포.

## 테스트 도구

| 도구 | 용도 |
|---|---|
| `tools/harness.js` | RPG Maker 전역을 흉내 내고 플러그인을 로드 (Node) |
| `tools/reach.js` | 지금 상태에서 갈 수 있는 지역과 경로 출력 |
| `tools/sim.js` | 추천을 따라가는 가상 플레이 (막히는 곳 찾기) |
| `tools/save.js` | 세이브 파일(MV `.rpgsave`, MZ `.rmmzsave`)을 읽어 상태로 사용 |
| `tools/browser_test.js` | 실제 엔진을 헤드리스 크롬에서 실행해 시험 |
| `tools/build.js` | 배포본 생성 |
