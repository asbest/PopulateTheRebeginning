import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require = createRequire(import.meta.url);
const modulePath = process.argv.find(a => a.startsWith('--playwright='))?.slice(13);
const {chromium} = modulePath ? await import(pathToFileURL(modulePath).href) : require('playwright');
const browser = await chromium.launch({headless:true,...(process.platform === 'win32' ? {channel:'chrome'} : {})});
const context = await browser.newContext({viewport:{width:1440,height:900}});
const page = await context.newPage();
const errors = [], missing = [];
const workflowEscape = value => String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
const reportFailure = error => {
  if(process.env.GITHUB_ACTIONS === 'true') console.log(`::error title=Live gameplay integration::${workflowEscape(error?.stack || error)}`);
};
page.on('pageerror', e => errors.push(e.stack || String(e)));
page.on('response', r => {if(r.status() === 404) missing.push(r.url());});
page.on('dialog', d => d.accept());

try {
  await page.goto((process.env.GAME_URL || 'http://127.0.0.1:8765') + '/PopulateTheRebeginning.html?test=1', {waitUntil:'load',timeout:60000});
  await page.waitForFunction(() => window.state?.shaman && window.enemyAIs?.length, null, {timeout:60000});
  await page.evaluate(() => {closeHelp();closeStoryOverlay();});

  // The Shaman's spells must be available without selecting her first.
  if(!await page.locator('#btn-blast').count()) throw new Error('Blast is hidden with no unit selected');
  const enemy = await page.evaluate(() => state.units.filter(u => u.faction === 1).map(u => ({id:u.id,x:u.mesh.position.x,z:u.mesh.position.z})));
  await page.waitForFunction(() => window.enemyAIs[0].pendingBuild && state.units.some(u => u.faction === 1 && u.aiRole === 'builder' && u.state === 'move'), null, {timeout:20000});
  const moving = await page.evaluate(() => {const u=state.units.find(u => u.faction === 1 && u.aiRole === 'builder' && u.state === 'move');return {id:u.id,x:u.mesh.position.x,z:u.mesh.position.z,target:window.enemyAIs[0].pendingBuild};});
  await page.waitForFunction(({id,x,z}) => {const u=state.units.find(u => u.id === id);return u && Math.hypot(u.mesh.position.x-x,u.mesh.position.z-z) > 0.6;}, moving, {timeout:12000});
  console.log('PASS enemy AI orders a builder and the unit physically moves', {start:enemy,moving});

  const point = await page.evaluate(() => {const p=state.shaman.mesh.position,target=gameTestAPI.findNearestLand(p.x+8,p.z+2),v=new THREE.Vector3(target.x,getHeight(target.x,target.z),target.z).project(state.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};});
  await page.keyboard.press('1');
  if(await page.evaluate(() => state.currentAction) !== 'blast') throw new Error('Blast hotkey did not select the spell');
  await page.evaluate(() => {const original=state.projectiles.push;state.projectiles.push=function(...shots){for(const shot of shots){window.__blastStart={x:shot.mesh.position.x,z:shot.mesh.position.z};window.__blastTarget={x:shot.target.x,z:shot.target.z};const explode=shot.explode;shot.explode=function(){window.__blastImpact={x:this.mesh.position.x,z:this.mesh.position.z};return explode.call(this);};}return original.apply(this,shots);};window.__manaBeforeBlast=state.mana;});
  await page.mouse.click(point.x,point.y);
  await page.waitForFunction(() => window.__blastImpact, null, {timeout:10000});
  const blast = await page.evaluate(() => ({manaSpent:window.__manaBeforeBlast-state.mana,start:window.__blastStart,target:window.__blastTarget,impact:window.__blastImpact}));
  if(blast.manaSpent < 9 || blast.manaSpent > 10.5) throw new Error('Blast mana charge incorrect: '+JSON.stringify(blast));
  if(Math.hypot(blast.impact.x-blast.target.x,blast.impact.z-blast.target.z) > 0.5) throw new Error('Blast detonated before reaching its target: '+JSON.stringify(blast));
  if(Math.hypot(blast.start.x-blast.target.x,blast.start.z-blast.target.z) < 5) throw new Error('Blast test target too close');
  console.log('PASS fireball hotkey, terrain click, mana cost and target impact',blast);
  if(errors.length) throw new Error('Browser runtime errors: '+errors.join('\n'));
  console.log('PASS no browser runtime errors');
  if(missing.length) console.log('MISSING RESOURCES',missing);
} catch(error) {
  reportFailure(error);
  throw error;
} finally {await browser.close();}
