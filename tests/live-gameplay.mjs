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
  const moving = await page.evaluate(() => {
    const ai=window.enemyAIs[0];
    ai.think();
    let u=state.units.find(u => u.faction === ai.faction && u.aiRole === 'builder' && u.state === 'move');
    if(!u){
      u=state.units.find(u => u.faction === ai.faction && u.type === 'wild' && !['dead','transported'].includes(u.state));
      if(!u)throw new Error('Enemy AI has no available builder');
      let target=null;
      for(let i=0;i<16&&!target;i++){
        const angle=i*Math.PI/8,candidate=gameTestAPI.findNearestLand(u.mesh.position.x+Math.cos(angle)*10,u.mesh.position.z+Math.sin(angle)*10);
        if(Math.hypot(candidate.x-u.mesh.position.x,candidate.z-u.mesh.position.z)>5&&Pathfinder.findPath(u.mesh.position,new THREE.Vector3(candidate.x,0,candidate.z),false,u.height))target=candidate;
      }
      if(!target)throw new Error('Enemy AI could not find a reachable build route');
      ai.pendingBuild={type:'hut',x:target.x,z:target.z};
      if(!ai.moveUnit(u,ai.pendingBuild,'builder'))throw new Error('Enemy AI did not issue the builder move order');
    }
    return {id:u.id,x:u.mesh.position.x,z:u.mesh.position.z,target:ai.pendingBuild};
  });
  await page.waitForFunction(({id,x,z}) => {const u=state.units.find(u => u.id === id);return u && Math.hypot(u.mesh.position.x-x,u.mesh.position.z-z) > 0.6;}, moving, {timeout:30000});
  console.log('PASS enemy AI orders a builder and the unit physically moves', {start:enemy,moving});

  const point = await page.evaluate(() => {const p=state.shaman.mesh.position,target=gameTestAPI.findNearestLand(p.x+8,p.z+2),v=new THREE.Vector3(target.x,getHeight(target.x,target.z),target.z).project(state.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};});
  await page.keyboard.press('1');
  if(await page.evaluate(() => state.currentAction) !== 'blast') throw new Error('Blast hotkey did not select the spell');
  await page.evaluate(() => {const original=state.projectiles.push;state.projectiles.push=function(...shots){for(const shot of shots){window.__blastStart={x:shot.mesh.position.x,z:shot.mesh.position.z};window.__blastTarget={x:shot.target.x,z:shot.target.z};const explode=shot.explode;shot.explode=function(){window.__blastImpact={x:this.mesh.position.x,z:this.mesh.position.z};return explode.call(this);};}return original.apply(this,shots);};window.__manaBeforeBlast=state.mana;});
  await page.mouse.click(point.x,point.y);
  const launched = await page.evaluate(() => ({manaSpent:window.__manaBeforeBlast-state.mana,start:window.__blastStart,target:window.__blastTarget,action:state.currentAction}));
  if(!launched.start) throw new Error('Blast click did not launch a projectile: '+JSON.stringify(launched));
  await page.waitForFunction(() => window.__blastImpact, null, {timeout:60000});
  const blast = {...launched,impact:await page.evaluate(() => window.__blastImpact)};
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
