// 실제 엔진(MV/MZ)을 헤드리스 크롬에서 띄워 플러그인을 시험한다. 이미지/소리/폰트는 빈 파일로 대체.
//   GAME=<data, js 가 있는 폴더> PLUGIN=dist/<프로필>/ClaudeAutoNav_vN.js START=map,x,y OUT=<스크린샷 폴더>
//   [SCRIPT=<시나리오 js>] node tools/browser_test.js
// 시나리오 파일은 async function(page, helpers) 를 module.exports 로 내보낸다.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

const G = process.env.GAME, PLUGIN = process.env.PLUGIN, OUT = process.env.OUT || '.';
const START = (process.env.START || '').split(',').map(Number);
const pluginName = path.basename(PLUGIN, '.js');
const isMZ = !!JSON.parse(fs.readFileSync(path.join(G, 'data', 'System.json'), 'utf8')).advanced;
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const coreFiles = isMZ ? ['rmmz_core', 'rmmz_managers', 'rmmz_objects', 'rmmz_scenes', 'rmmz_sprites', 'rmmz_windows']
    : ['rpg_core', 'rpg_managers', 'rpg_objects', 'rpg_scenes', 'rpg_sprites', 'rpg_windows'];
const libs = fs.readdirSync(path.join(G, 'js', 'libs')).filter(f => f.endsWith('.js'));
const order = ['pixi.js', 'pixi-tilemap.js', 'pixi-picture.js'];
libs.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
const indexHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="fonts/gamefont.css"></head><body style="background:#000">
${libs.map(l => `<script src="js/libs/${l}"></script>`).join('\n')}
${coreFiles.map(f => `<script src="js/${f}.js"></script>`).join('\n')}
<script src="__stub.js"></script>
<script src="js/plugins.js"></script>
<script src="__plugins_add.js"></script>
<script src="js/main.js"></script></body></html>`;
// 소리/암호화/폰트 대기 무력화
const stub = `
Decrypter.checkImgIgnore = function() { return true; };
['playBgm','playBgs','playMe','playSe','playStaticSe','replayBgm','replayBgs'].forEach(function(k){ AudioManager[k] = function(){}; });
AudioManager.checkErrors = function(){};
// 창 스킨이 빈 그림이라 글자색이 투명해지므로 테스트용 고정 색
if (typeof Window_Base !== 'undefined' && !window.ColorManager) Window_Base.prototype.textColor = function(n){ return ['#ffffff','#20a0d6','#ff784c','#ff7878','#ffa0a0','#a0d0ff','#c080ff','#80ff80','#c0c0c0','#2080cc'][n % 10] || '#ffffff'; };
if (typeof Graphics !== 'undefined') { Graphics.isFontLoaded = function(){ return true; }; }
window.__errors = [];
${process.env.OLDJS ? 'delete Array.prototype.flatMap; delete Array.prototype.flat; delete String.prototype.padStart; delete String.prototype.padEnd;' : ''}
window.addEventListener('error', function(e){ window.__errors.push(String(e.message) + ' @' + e.filename + ':' + e.lineno); });
`;
const pluginsAdd = `$plugins.push({name:${JSON.stringify(pluginName)},status:true,description:'',parameters:{}});`;
const fontCss = `@font-face { font-family: GameFont; src: local("WenQuanYi Zen Hei"); } @font-face { font-family: rmmz-mainfont; src: local("WenQuanYi Zen Hei"); } @font-face { font-family: rmmz-numberfont; src: local("WenQuanYi Zen Hei"); }`;

const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const send = (body, type) => { res.writeHead(200, { 'Content-Type': type }); res.end(body); };
    if (u === '/' || u === '/index.html') return send(indexHtml, 'text/html');
    if (u === '/__stub.js') return send(stub, 'text/javascript');
    if (u === '/__plugins_add.js') return send(pluginsAdd, 'text/javascript');
    if (u === '/fonts/gamefont.css') return send(fontCss, 'text/css');
    if (u === '/js/plugins/' + pluginName + '.js') return send(fs.readFileSync(PLUGIN), 'text/javascript');
    const f = path.join(G, u);
    if (f.startsWith(G) && fs.existsSync(f) && fs.statSync(f).isFile()) return send(fs.readFileSync(f), /\.js$/.test(f) ? 'text/javascript' : /\.json$/.test(f) ? 'application/json' : 'application/octet-stream');
    if (/^\/img\//.test(u)) return send(PNG1, 'image/png');
    if (/^\/save\//.test(u)) { res.writeHead(404); return res.end(); }
    res.writeHead(404); res.end();
});

(async () => {
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
    const logs = [];
    page.on('console', m => logs.push('[console] ' + m.text()));
    page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => window.SceneManager && SceneManager._scene && /Title|Map/.test(SceneManager._scene.constructor.name), null, { timeout: 60000 });
    // 새 게임 시작 후 지정 위치로
    await page.evaluate(([m, x, y]) => {
        DataManager.setupNewGame();
        $gamePlayer.reserveTransfer(m, x, y, 2, 0);
        SceneManager.goto(Scene_Map);
    }, START);
    await page.waitForFunction(() => SceneManager._scene instanceof Scene_Map && SceneManager._scene.isActive() && !$gamePlayer.isTransferring(), null, { timeout: 30000 });
    const helpers = {
        shot: async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); },
        wait: ms => page.waitForTimeout(ms),
        key: async (k, ms) => { await page.keyboard.down(k); await page.waitForTimeout(ms || 80); await page.keyboard.up(k); },
        logs
    };
    try {
        if (process.env.SCRIPT) await require(path.resolve(process.env.SCRIPT))(page, helpers);
        else { await helpers.wait(500); await helpers.key('n'); await helpers.wait(1500); await helpers.shot('menu'); }
    } catch (e) { logs.push('[scenario error] ' + e.stack); }
    const errs = await page.evaluate(() => window.__errors);
    console.log(logs.slice(-60).join('\n'));
    console.log('page errors:', JSON.stringify(errs));
    await browser.close(); server.close();
})();
