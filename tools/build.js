// 배포본 만들기: node tools/build.js <프로필 이름> <버전 번호>
//   예) node tools/build.js zombies_retreat_2 1  ->  dist/zombies_retreat_2/ClaudeAutoNav_v1.js
// NW.js가 스크립트를 캐시하므로 배포할 때마다 버전 번호를 올려 새 파일명으로 만든다.
const fs = require('fs'), path = require('path');
const [prof, ver] = process.argv.slice(2);
if (!prof || !ver) { console.log('사용법: node tools/build.js <프로필 이름> <버전 번호>'); process.exit(1); }
const root = path.join(__dirname, '..');
const profFile = path.join(root, 'profiles', prof + '.js');
const profile = fs.readFileSync(profFile, 'utf8').trim().replace(/;?\s*$/, '');
eval(profile); // 문법 확인
const core = fs.readFileSync(path.join(root, 'core', 'ClaudeAutoNav.js'), 'utf8');
const name = 'ClaudeAutoNav_v' + ver;
if (!core.includes("const PN = 'ClaudeAutoNav';")) throw new Error('core에서 PN 선언을 찾지 못함');
const body = core.replace("const PN = 'ClaudeAutoNav';", "const PN = '" + name + "';");
// 플러그인 헤더(/*: ... */)는 맨 앞에 있어야 에디터가 읽으므로 헤더 뒤에 프로필을 넣음
const end = body.indexOf('*/') + 2;
const out = body.slice(0, end) + '\n\n// ===== 게임 프로필: ' + prof + ' =====\nwindow.ClaudeAutoNavProfile = ' + profile + ';\n' + body.slice(end);
const dir = path.join(root, 'dist', prof);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, name + '.js'), out);
new Function(out); // 문법 확인
console.log('생성:', path.relative(root, path.join(dir, name + '.js')));
console.log('plugins.js 마지막 항목으로 추가할 줄:');
console.log('{"name":"' + name + '","status":true,"description":"자동 내비게이션","parameters":{}}');
