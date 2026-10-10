// 봇을 돌리면서 게임 오버/공통 이벤트 호출/스위치 변화를 추적 (원인 모를 게임 오버, 갑작스러운 장면 전환 분석용)
//   SAVE=... SPEED=15 [WATCHVARS=18,41] [SECONDS=70] SCRIPT=tools/scenarios/trace.js node tools/browser_test.js
// 게임 오버가 나오면 바로 멈추고 직전 기록을 출력한다.
module.exports = async (page, h) => {
  await h.wait(1500);
  await page.evaluate(watch => {
    window.__trace = [];
    const T = m => { window.__trace.push(Graphics.frameCount + ' [' + $gameMap.mapId() + ' ' + $gamePlayer.x + ',' + $gamePlayer.y + '] ' + m); if (window.__trace.length > 400) window.__trace.shift(); };
    const g = SceneManager.goto; SceneManager.goto = function(c) { if (c === Scene_Gameover) T('GAMEOVER ev=' + $gameMap._interpreter._eventId); return g.apply(this, arguments); };
    const sc = Game_Interpreter.prototype.setupChild; Game_Interpreter.prototype.setupChild = function(l, e) { const c = this.currentCommand(); T('CE ' + (c && c.parameters[0]) + ' (' + (($dataCommonEvents[c && c.parameters[0]] || {}).name || '') + ') from ev ' + this._eventId); return sc.apply(this, arguments); };
    const sw = Game_Switches.prototype.setValue; Game_Switches.prototype.setValue = function(i, v) { if (this.value(i) !== !!v) T('sw ' + i + '=' + v); return sw.apply(this, arguments); };
    const vr = Game_Variables.prototype.setValue; Game_Variables.prototype.setValue = function(i, v) { if (watch.includes(i)) T('v' + i + '=' + v); return vr.apply(this, arguments); };
    ClaudeAutoNav.Bot.start();
  }, (process.env.WATCHVARS || '').split(',').filter(Boolean).map(Number));
  const end = Date.now() + Number(process.env.SECONDS || 70) * 1000;
  while (Date.now() < end) { await h.wait(3000); if (await page.evaluate(() => /GAMEOVER/.test(window.__trace.join('\n')))) break; }
  console.log(await page.evaluate(() => window.__trace.slice(-80).join('\n')));
  console.log('--- bot log ---\n' + await page.evaluate(() => (window.__botlog || []).slice(-15).join('\n')));
};
