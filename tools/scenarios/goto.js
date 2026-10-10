// 자동 이동(Runner) 하나만 실행해서 경로/출입구/선택지 처리를 확인 (봇 판단 없이 이동만)
//   SAVE=... FROM=map,x,y [S40=0|1 같은 스위치는 SW=+40,-5] TARGET=map,ev [WAIT=25000] SCRIPT=tools/scenarios/goto.js node tools/browser_test.js
module.exports = async (page, h) => {
  const [tm, te] = process.env.TARGET.split(',').map(Number);
  await h.wait(1000);
  if (process.env.FROM) { const [m, x, y] = process.env.FROM.split(',').map(Number); await page.evaluate(([m, x, y]) => $gamePlayer.reserveTransfer(m, x, y, 2, 0), [m, x, y]); await h.wait(1500); }
  if (process.env.SW) await page.evaluate(sw => { for (const t of sw.split(',')) $gameSwitches.setValue(Number(t.slice(1)), t[0] === '+'); }, process.env.SW);
  await page.evaluate(([tm, te]) => { const C = ClaudeAutoNav; C.Index.build(); C.Planner.destinations(null);
    const pl = C.Planner.plan({ map: tm, evId: te }, null, null); window.__r = !!pl; if (pl) C.Runner.start(pl, 'goto test', { mode: 'talk', queue: te ? [te] : [], choices: [] }); }, [tm, te]);
  await h.wait(Number(process.env.WAIT || 25000));
  console.log(await page.evaluate(() => 'plan=' + window.__r + ' now ' + $gameMap.mapId() + ' ' + $gamePlayer.x + ',' + $gamePlayer.y + '\n' + (window.__navlog || []).slice(-30).join('\n')));
};
