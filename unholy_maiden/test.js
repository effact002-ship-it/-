const fs=require('fs'),path=require('path');
const G="/mnt/user-data/uploads/Unholy_maiden_Ver.1.0.10_PART6_Final_한국어_합본";
const ld=f=>JSON.parse(fs.readFileSync(path.join(G,'data',f),'utf8'));
class S{}; const proto=()=>function(){};
global.window=global;
global.PluginManager={parameters:n=>n==='OverpassTile'?{overPathRegion:'1',gatewayRegion:'2'}:({})};
global.Input={keyMapper:{}};
for(const n of ['Game_Player','Window_ChoiceList','Scene_Map']){global[n]=function(){};}
global.Window_Message=function(){};global.Game_Event=function(){};global.ConfigManager={makeData(){return{}},applyData(){}};global.Graphics={};global.Window_Command=class{};global.Window_Base=class{}; global.Scene_MenuBase=class{};
process.mainModule={filename:path.join(G,'index.html')};
global.$dataMapInfos=ld('MapInfos.json');global.$dataTilesets=ld('Tilesets.json');global.$dataCommonEvents=ld('CommonEvents.json');global.$dataItems=ld('Items.json');
global.$dataTemplateEvents=ld('Map040.json').events;global.$dataWeapons=[];global.$dataArmors=[];
const sw=new Set(process.argv.slice(3).map(Number));
global.$gameSwitches={value:i=>sw.has(i)};global.$gameVariables={value:i=>0};global.$gameSelfSwitches={value:k=>false};
global.$gameParty={numItems:it=>(it&&it.id===1)?1:0,hasItem:it=>it&&it.id===1,members:()=>[],gold:()=>0};global.$gameActors={actor:i=>({name:()=>'A'+i})};
const [m,x,y]=process.argv[2].split(',').map(Number);
global.Game_Map=function(){};global.$gameSystem={};global.$gameSelfSwitches={value:k=>false,_data:{}};global.$gameMap={mapId:()=>m,event:id=>null,events:()=>[]};global.$gamePlayer={x,y};
require('./ClaudeAutoNav.js');
const {Index,Planner}=ClaudeAutoNav;
let t=Date.now();Index.build();console.log('build ms',Date.now()-t,'maps',Object.keys(Index.maps).length,'itemEdges',Index.itemEdges.map(e=>e.itemId+'->'+e.to.map));
// current map live page stub -> use computed

function require_cond(c){ if(c.switch1Valid&&!sw.has(c.switch1Id))return false; if(c.switch2Valid&&!sw.has(c.switch2Id))return false; if(c.selfSwitchValid) return false; if(c.variableValid&&c.variableValue>0) return false; if(c.itemValid||c.actorValid) return false; return true;}
t=Date.now();const by=Planner.destinations(null);console.log('plan ms',Date.now()-t);
const rows=Object.keys(by).map(k=>[Index.maps[k].full,by[k][0].hops,Planner.legsTo(by[k][0]).map(e=>e.kind==='item'?'ITEM':e.to.map).join('>')]).sort((a,b)=>a[1]-b[1]);
for(const r of rows) console.log(r.join(' | '));
for (const id of [115,6,50,54]) if(Index.maps[id]) console.log('ACT',id,Index.activitiesOf(id).map(a=>a.label).join(' / '));
if (process.env.EDGES) { const mid=Number(process.env.EDGES); const map=Index.maps[mid];
 for (const ev of map.events){ for(const [pi,pg] of ev.pages.entries()) for(const t of pg.transfers) console.log('E',ev.id,ev.name.slice(0,14),'p'+pi,'t'+pg.trigger,'battle',pg.battle,'ce',t.ce||'','->',t.map,Index.maps[t.map]?Index.maps[t.map].name:'(x)', t.conds.length);} }
