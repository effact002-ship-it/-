// 봇 장시간 실행: MINUTES(기본 5) 동안 돌리고 기록/보고서 저장
//   SAVE=... SPEED=8 MINUTES=10 SCRIPT=tools/scenarios/bot_run.js node tools/browser_test.js
const fs = require('fs'), path = require('path');
module.exports = async (page, h) => {
  await h.wait(1500);
  await page.evaluate(() => ClaudeAutoNav.Bot.start());
  const end = Date.now() + Number(process.env.MINUTES || 5) * 60000;
  let last = '';
  while (Date.now() < end) {
    await h.wait(10000);
    const st = await page.evaluate(() => ({ scene: SceneManager._scene.constructor.name, map: $gameMap.mapId(), name: $dataMapInfos[$gameMap.mapId()] && $dataMapInfos[$gameMap.mapId()].name, x: $gamePlayer.x, y: $gamePlayer.y, bot: ClaudeAutoNav.Bot.active, stats: ClaudeAutoNav.Bot.stats, day: $gameVariables.value(1), q: $gameSystem._quests && $gameSystem._quests.active, done: $gameSystem._quests && $gameSystem._quests.completed, msg: $gameMessage.isBusy() ? $gameMessage._texts.join(' ').slice(0, 60) : '' }));
    const line = JSON.stringify(st);
    if (line !== last) console.log(new Date().toISOString().slice(11, 19), line);
    last = line;
    if (!st.bot) break;
  }
  const out = await page.evaluate(() => ({ log: (window.__botlog || []).join('\n'), report: window.__botreport || '', navlog: (window.__navlog || []).join('\n'),
    save: (() => { try { return LZString.compressToBase64(JsonEx.stringify(DataManager.makeSaveContents())); } catch (e) { return ''; } })() }));
  fs.writeFileSync(path.join(process.env.OUT || '.', 'nav_log.txt'), out.navlog || '');
  if (out.save) fs.writeFileSync(path.join(process.env.OUT || '.', 'bot_end.rpgsave'), out.save);
  const dir = process.env.OUT || '.';
  fs.writeFileSync(path.join(dir, 'bot_log.txt'), out.log);
  if (out.report) fs.writeFileSync(path.join(dir, 'bot_report.txt'), out.report);
  await h.shot('bot_end');
  console.log('--- log tail ---\n' + out.log.split('\n').slice(-40).join('\n'));
};
