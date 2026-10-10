# CLAUDE.md

RPG Maker MV/MZ 게임용 자동 내비게이션 + 자동 진행 봇 플러그인 (ClaudeAutoNav).

- 작업 시작 전에 `HANDOFF.md`(인계서)를 먼저 읽는다. 사용자 선호, 구조, 새 게임 적용 순서, 디버깅 절차, 그동안 겪은 함정이 정리되어 있다.
- 게임별 현재 상태는 `games/<게임>/NOTES.md`.
- 대화는 한국어, 보고는 짧게. 테스트는 최대 배속으로 짧게 돌리고, 사용자가 기다리면 지금 빌드를 먼저 보낸다.
- 수정은 `core/ClaudeAutoNav.js`와 `profiles/*.js`에서만. 배포는 `node tools/build.js <게임> <새 버전>`.
- 오래된 NW.js 호환: `flatMap`/`padStart` 등 최신 문법 사용 금지.
- 무언가를 새로 알게 되면 `HANDOFF.md` 6절(함정)과 게임 NOTES에 추가한다.
