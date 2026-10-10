# ClaudeAutoNav 인계서

새 채팅에서 이 저장소만 보고 이어서 작업할 수 있도록 정리한 문서. 작업 전에 이 문서 → `README.md` → 해당 게임의 `games/<게임>/NOTES.md` 순서로 읽는다.

## 0. 사용자와 일하는 방식

- 한국어로 대화. 불필요한 이모지 없이, 보고는 짧게 (무엇을 고쳤고 / 무엇을 확인했고 / 무엇이 남았는지).
- 사용자는 실제 게임을 직접 플레이하며 결과를 본다. **빨리 써 보고 싶어 하므로** 긴 테스트를 오래 돌리지 말 것.
  - 테스트는 **최대 배속(SPEED=15)** + **짧게(2~5분)** + **확인할 장면에서 바로 시작**(세이브/위치 지정).
  - 테스트 중이라도 "언제 끝나?"라고 물으면 그때까지 만든 빌드를 먼저 보내고, 확인 못 한 부분을 솔직히 말한다.
- 배포: 매번 **새 버전 번호(새 파일명)** 로 빌드해서 보낸다 (NW.js 캐시). 사용자는 `www\js\plugins\`(MV) 또는 `js\plugins\`(MZ)에 복사하고 `plugins.js`의 이름만 바꾼다.
- 사용자가 보내 주는 진단 자료: `www\autonav_bot_report.txt`, `www\autonav_bot_log.txt`, `www\save\autonav_bot.rpgsave`, 게임 세이브(`fileN.rpgsave`), `www\data`(zip).
- 커밋/푸시: 작업 브랜치에 바로 커밋하고 푸시 (stop hook이 미커밋 변경을 막음).

## 1. 저장소 구조

| 경로 | 내용 |
|---|---|
| `core/ClaudeAutoNav.js` | 공용 엔진 (MV/MZ). 모든 수정은 여기서 |
| `profiles/<게임>.js` | 게임별 설정 (JS 객체 리터럴, 함수 사용 가능) |
| `profiles/_template.js` | 새 게임 프로필 템플릿 (봇 설정 포함) |
| `dist/<게임>/ClaudeAutoNav_vN.js` | 배포본 = core + 프로필 (`node tools/build.js <게임> <N>`) |
| `tools/harness.js` | Node에서 RPG Maker 전역을 흉내 내고 플러그인 로드 (빠른 분석용) |
| `tools/probe.js` | **분석 1순위 도구**: 추천/막힌 이유/경로/페이지/변수/아이템/동료/퀘스트 출력 |
| `tools/reach.js`, `tools/sim.js` | 도달 가능 지역 / 추천 따라가는 가상 플레이 |
| `tools/save.js` | 세이브(MV `.rpgsave` LZString, MZ `.rmmzsave`) 읽기 |
| `tools/browser_test.js` | 실제 엔진을 헤드리스 크롬(Playwright)에서 실행. 이미지/소리는 빈 파일 |
| `tools/scenarios/bot_run.js` | 봇을 N분 돌리고 로그/보고서/끝 세이브 저장 |
| `tools/scenarios/trace.js` | 게임 오버/공통 이벤트/스위치 변화 추적 (원인 모를 게임 오버) |
| `tools/scenarios/goto.js` | 자동 이동 하나만 실행 (출입구/선택지 처리 확인) |
| `games/<게임>/NOTES.md` | 게임별 조사 기록, 버전 기록, 막힌 곳 |

## 2. 엔진 구조 (core/ClaudeAutoNav.js)

위에서 아래 순서:

1. **DEFAULT_PROFILE / PROF**: 프로필 기본값. 빌드 시 `window.ClaudeAutoNavProfile`로 주입.
2. **Adapt**: 플러그인 어댑터 (`$plugins`로 자동 감지). 리전 통행, 판정 확장(hitbox), 추격형 적(`_chaseRange`), 미끄러운 바닥, `hide_choice` 숨김 선택지, 공통 이벤트 메뉴 토큰(`#ce:`).
3. **Cond**: 조건 평가 (스위치/변수/셀프 스위치/아이템/동료/스크립트/선택지).
4. **scanList / compilePage**: 이벤트 명령 분석 → 페이지 요약
   - transfers(장소 이동+조건), gains/gainIds(획득, 공통 이벤트 안 포함), swOn/swOff/ssOn, vops(변수 조작), partyAdd(동료 추가 **갈래별 전부**), quest(Galv 퀘스트 조작), pmove/pmoves(이동 루트 순간이동, 선택지 갈래별), push(밀기 물체), enemy(추격형/투사체 적), danger(게임 오버/타이틀), synth(제작 화면)
5. **Index**: 맵 컴파일, 활성 페이지, `edgesOf`(출입구 그래프), obstacles, itemSources, varSetters, partySetters, questAdv, synth(제작법), volatileSw(시간대처럼 자주 바뀌는 스위치)
   - `Index._ignoreConds = true`: 조건 무시 모드 (막힌 이유 분석용)
6. **Planner**: 맵 간 다익스트라 (`destinations`, `plan`, `legsTo`), 맵 안 BFS (`staticBfs`, `spotDist`)
7. **Runner**: 실제 자동 이동 (다리 단위). walkTo → triggerEvent → 도착 확인. 선택지 예약(`pendingChoices`), 출입구 선택지 보정(`fixWarpChoice`), 제자리 15초 정지 시 포기.
8. **Recommender**: 할 일 추천
   - 퀘스트 단위(units) → 다음(next) → 그룹(prio 순) → 탐색
   - 막힌 퀘스트: `blockedInfo`(조건 무시로 길 찾고 첫 막힌 다리) → `gateConds`(길을 막은 철책/문 이벤트의 여는 페이지 조건) → `prereqItems`(스위치: findSetter / 아이템: findItem(제작 포함) / 변수: varPrereq / 동료: partySetters)
9. **Bot**: 자동 진행 루프 (아래 4절)
10. **UI**: N 키 메뉴 (봇 시작/정지, 추천, 지역, 설정: 봇 배속 x1~x10 등)

## 3. 새 게임에 적용하는 순서

1. 사용자에게 `www\data`(MV) 또는 `data`(MZ) 폴더 zip, `js\plugins.js`, 가능하면 세이브 파일과 퀘스트 텍스트(Galv: `img\Quests.txt`)를 받는다. 이미지/소리는 필요 없음.
   - 압축은 스크래치패드의 새 빈 폴더에 푼다. 엔진 테스트에는 `js\`(rpg_*.js, libs, plugins)도 필요.
2. `plugins.js`의 플러그인 목록을 본다. README의 어댑터 표에 없는 **이동/통행/메시지/퀘스트/전투 관련 플러그인**이 있으면 플러그인 소스를 읽고 어댑터를 추가.
3. `MapInfos.json`으로 맵 트리를 보고 프로필 작성 (`profiles/_template.js` 복사): 제외 맵, 장소 분류, H 판정, 무시 이벤트(치트/디버그/미니게임).
4. 게임 시스템 조사 (공통 이벤트 이름 목록을 먼저 훑는다):
   - 시간대/날짜 변수와 스위치 → `ignoreSwitches`, `dayVar`, `botTimeCe`, `botSleepChoiceRe`
   - HP/회복 → `botHeal`, 전투 방식 → `botCombat`
   - 생존 자원(식량 등 매일 소비) → `botFood`
   - 게임 오버 공통 이벤트(353/354 명령) 찾기
   - 미니게임(낚시, 크레인, 리듬 등) → `botManualRe`/`ignoreEventRe`
5. `node tools/probe.js units`, `reach`로 추천 확인 → `node tools/build.js <게임> 1` → `browser_test.js`로 메뉴/이동 확인 → `bot_run.js`로 봇 확인.
6. 사용자에게 배포하고 로그로 개선 반복.

## 4. 봇 설계 요약

- 루프(대기 30프레임마다): 직전 결과 기록 → 날 바뀌면 실패 기록 초기화 → 진행 서명(스위치/변수/셀프 스위치/퀘스트/아이템) 비교 → 안전하면 봇 세이브 → 추천 계산 → 고르기 → Runner로 실행.
- 고르기(`pickNext`):
  1. 하던 퀘스트 단계(goalQuest)가 남아 있으면 계속
  2. 첫 후보와 우선순위 0.5 이내인 것 중 **가장 가까운 곳**
  3. 실패 2번(하루) / 누적 4번 / 같은 대상 연속 3번 / 진행 없이 끝난 것 2번 → 제외
- 식량(`botFood`): 오늘 밤 몫이 모자라면 최우선, 여유분(buffer일 치)은 급한 일이 없을 때. 경고 상태에서 구할 곳이 없으면 **잠들지 않고 멈춤**(보고서).
- 전투(`botCombat`): 좀비 이동 방향/속도로 총알 도착 시점 위치를 예측해 사격. 이동 중에도 맞힐 수 있으면 멈춰서 쏨. 상호작용 직전 쫓아오는 좀비가 있으면 최대 10초 사격 대기(HUNT).
- 회복(`botHeal`): below/items에 함수 사용 가능 (최대 HP 변수 기준).
- 게임 오버: 봇 전용 세이브(`save/autonav_bot.rpgsave`)에서 복구.
- 선택지: 경로가 정한 답 → 출입구는 실행 중 페이지 기준으로 보정 → 없으면 정책(진행/수락 우선, 거절/치트 회피, 반복 시 다른 답).
- 대사: `botTextWait`(기본 45프레임) 간격으로 넘김.
- 배속: N 메뉴 설정. MV는 `SceneManager._getTimeInMsWithoutMobileSafari`, MZ는 `determineRepeatNumber` 후킹. **봇/Runner 갱신은 게임 갱신마다(`$gameMap._navTick`)** 해야 배속에서 봇만 느려지지 않음.

## 5. 디버깅 절차 (이 순서가 가장 빠름)

1. 사용자 보고서/로그에서 `FAIL`, `NO-EFFECT`, `GAME OVER`, `BOT STOP`, 같은 `DO`가 반복되는 곳을 찾는다.
2. 봇 세이브나 테스트 끝 세이브로 **Node 분석**(수 초):
   ```
   GAME=<게임> PROFILE=profiles/<게임>.js SAVE=<세이브> [POS=map,x,y] [SW=+1,-5] node tools/probe.js units
   ... probe.js blocked <map> [ev]   # 왜 못 가는지
   ... probe.js plan <map> [ev]      # 경로와 선택지
   ... probe.js page <map> <ev>      # 페이지 조건/활성 페이지/pmoves
   ... probe.js var|item|party|quests
   ```
   - 시간대 스위치가 세이브 시점 그대로라 결과가 달라질 수 있음 → `SW=`로 아침 상태 등을 만든다.
3. 엔진에서 재현(배속 15, 짧게):
   ```
   GAME=<게임> PLUGIN=dist/<게임>/ClaudeAutoNav_vN.js SAVE=<세이브> SPEED=15 MINUTES=3 OUT=<폴더> SCRIPT=tools/scenarios/bot_run.js node tools/browser_test.js
   ```
   - 원인 모를 게임 오버: `SCRIPT=tools/scenarios/trace.js` (직전 공통 이벤트/스위치)
   - 출입구/이동 문제: `FROM=map,x,y TARGET=map,ev SCRIPT=tools/scenarios/goto.js`
   - 백그라운드 실행 시 Bash `timeout`을 테스트 시간보다 넉넉히 (기본 10분 제한에 걸려 로그를 잃은 적 있음).
   - `nav_log.txt`는 마지막 300줄만 남으므로 반복 루프가 있으면 앞부분이 잘림.
4. 고친 뒤 같은 세이브로 다시 확인 → 새 버전 빌드 → 커밋/푸시 → 사용자에게 파일과 짧은 보고.

## 6. 그동안 겪은 함정 (다른 게임에서도 반복될 가능성 높음)

**배포/실행 환경**
- plugins.js 항목을 `];` 밖에 넣으면 검은 화면. 앞 항목 끝 쉼표 필요.
- 오래된 NW.js(MV 기본 실행기)는 `flatMap`, `padStart` 없음 → 사용 금지(엔진에 보조 코드 있음). `OLDJS=1`로 시험.
- 배속은 MV 엔진 구조상 화면 프레임당 0.25초로 묶여 약 x15가 상한.
- 프레임 카운터(`Graphics.frameCount`)는 화면 프레임 기준. 게임 로직 타이밍은 게임 갱신 기준으로 셀 것.
- 엔진 코드에서 `SceneManager` 같은 전역을 쓸 때는 `typeof` 확인 (Node 하네스에서 터짐).

**이벤트 분석**
- 문 연출: '앞으로 n칸' 이동 루트 → 다가가는 방향마다 도착 칸이 다름 (simMoveOps).
- 밟는 출입구(그리드 출입구 등): 선택지 갈래마다 이동 방향이 다르고, **이벤트가 시작하자마자 자기 스위치를 바꿔서** 선택지가 뜰 때의 활성 페이지가 실행 중 페이지와 다름. 실행 중 페이지는 인터프리터 `_list`로 찾고, 플러그인이 목록을 복사하면 명령 코드 서명으로 찾는다.
- 동료 추가(129)는 분기마다 조건이 다름 → 첫 번째만 기록하면 안 됨 (모든 갈래 보관).
- 아이템 획득이 공통 이벤트 안(무작위 전리품 목록)에 있는 경우가 많음 → 117 따라가서 gainIds 합침.
- 철책/문: 칸 자체는 통행 불가이고 열린 뒤 이벤트가 플레이어를 반대편으로 옮김 → 막힌 이유 분석에서 맞은편 칸 기준으로 확인.
- 상자 밀기: '플레이어 쪽 보기(25) → 뒤로 이동(13)' 패턴도 밀기.
- 아이템 개수를 변수에 넣어 비교하는 조건 → 실시간 개수로 평가(varItem).
- 무작위 값 변수(난수 대입)와 무시 이벤트가 바꾸는 변수는 스토리 변수에서 제외.
- 시간대 스위치(자주 켜고 꺼짐)는 막힌 이유에서 제외(volatileSw + ignoreSwitches).
- 진입 대사가 몇 줄 있는 출입구(문 앞 대사)도 경로로 써야 함 → `maxStoryMessages`.
- 완료 장면이 회상/특수 맵에만 있는 퀘스트는 자동 진행 불가로 표시.

**봇 행동**
- 생존 자원(식량) 소비를 모르면 며칠 뒤 갑자기 게임 오버. 공통 이벤트 이름에 '소비/식량/굶주림' 같은 것이 있는지 먼저 확인.
- 밤에는 지역이 닫히는 게임이 많음 → 낮에 할 일을 몰아서.
- 우선순위만으로 고르면 지도 양 끝을 왔다 갔다 함 → 가까운 순 + 하던 목표 유지.
- 진행 없이 끝나는 대화/이벤트를 반복 → 진행 서명 비교로 제외.
- 미니게임(크레인 등)은 봇이 무한 반복 → 처음 발견 즉시 `botManualRe`/`ignoreEventRe`.
- 이동 중에는 플레이어가 계속 움직이므로 "멈춰 있을 때만 사격"이면 영영 안 쏨.

## 7. 다음에 할 일 (공통 개선)

- **시간을 쓰는 출입구 비용**: Zombie's Retreat 2는 그리드를 나갈 때마다 시간대가 넘어감(공통 이벤트 6). 경로 비용에 반영해서 한 번 나가면 여러 일을 처리하게 하기. 지금은 식량 수집으로 들락날락하다 밤이 되어 멈추는 경우가 있음.
- 상점 구매 자동화 (식량 등 소모품).
- 들키지 않고 이동(은신 리전, 좀비 시야 방향) / 좀비 처치 후 파밍의 효과 측정 (사격 명중률 로그).
- Unholy Maiden(v50 이후 공용 엔진)은 그 게임 데이터로 회귀 테스트를 못 함 (`games/unholy_maiden/HANDOFF.md`).
