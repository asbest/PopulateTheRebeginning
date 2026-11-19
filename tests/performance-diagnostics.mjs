import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {clickVisibleControl} from './fixtures/click-control.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 await page.evaluate(()=>{closeHelp();closeStoryOverlay();state.isPaused=false;togglePause();});
 if(await page.locator('#btn-test-sound').count())throw Error('Retired sound test remains');
 await clickVisibleControl(page,'#btn-performance-diagnostics');
 await clickVisibleControl(page,'#btn-diagnostics-start');
 await page.waitForFunction(()=>gameTestAPI.PerformanceDiagnostics.report?.reason==='Completed',null,{timeout:60000});
 const result=await page.evaluate(()=>{
  const report=gameTestAPI.PerformanceDiagnostics.report;
  const draws=report.landscapeDraws;
  const calls=draws&&Object.values(draws.main).reduce((sum,entry)=>sum+entry.calls,0);
  if(!draws?.main.terrain.calls||!draws.shadowCpu||calls!==report.graphics.drawCalls)
   throw Error('Landscape draw attribution failed '+JSON.stringify({draws,calls,graphics:report.graphics}));
  if(!state.isPaused||gameTestAPI.GpuTimer.enabled||!report.frames||!report.fps||!report.cpu.physics||!report.cpu.ai||!report.cpu.units||report.durationSeconds<15)throw Error(JSON.stringify(report));
  for(const name of ['modelLod','buildingBatches','terrainLod','overviewDetails','characterBatches','sceneryBatches','shadowCache'])
   if(!report.cpu[name]||!Number.isFinite(report.cpu[name].medianMs))throw Error('Missing batching phase '+name);
  if(!report.scene.lodVisibility||!report.scene.characterBatching||!report.scene.sceneryBatching.reason||!Number.isFinite(report.scene.sceneryBatching.potentialSavings))throw Error('Missing visibility/batching decision');
  const recording=report.scene.terrainLodRecording;
  if(recording.samples!==report.frames||recording.activeFrames+recording.fullDetailFrames!==report.frames||
   !report.scene.terrainLod.reasons||!report.scene.terrainLod.cameraMode||!report.scene.sceneryBatching||!report.scene.buildingBatching||!report.scene.overviewDetails||!report.scene.modelLod)
   throw Error('Missing LOD recording/camera/cache diagnostics '+JSON.stringify(report.scene));
  const before=JSON.stringify(report.scene.terrainLod),reasons=state.terrainLodStats.reasons;
  reasons.active++;try{if(JSON.stringify(report.scene.terrainLod)!==before)throw Error('Report shares live LOD counters');}finally{reasons.active--;}
  const buildingBefore=JSON.stringify(report.scene.buildingBatching),buildingStats=state.buildingBatchStats;
  buildingStats.rebuilt++;try{if(JSON.stringify(report.scene.buildingBatching)!==buildingBefore)throw Error('Report shares live building counters');}finally{buildingStats.rebuilt--;}
  return {frames:report.frames,fps:report.fps,gpu:report.gpu,cpu:report.cpu};
 });
 await clickVisibleControl(page,'#btn-diagnostics-copy');
 await page.waitForFunction(()=>document.querySelector('#performance-diagnostics [role=status]').textContent==='Report copied.');
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 if(copied.replaceAll('\r\n','\n')!==await page.locator('#diagnostics-report').inputValue())throw Error('Copied report differs');
 await page.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(Error('Blocked'));document.execCommand=()=>false;});
 await clickVisibleControl(page,'#btn-diagnostics-copy');
 await page.waitForFunction(()=>document.querySelector('#performance-diagnostics [role=status]').textContent.includes('report is selected'));
 await clickVisibleControl(page,'#btn-diagnostics-start');
 await page.waitForFunction(()=>gameTestAPI.PerformanceDiagnostics.running&&!state.isPaused);
 await page.evaluate(()=>togglePause());
 await page.waitForFunction(()=>gameTestAPI.PerformanceDiagnostics.report?.reason==='Paused early');
 await page.evaluate(()=>{
  const profiler=gameTestAPI.BattleProfiler,descriptor=Object.getOwnPropertyDescriptor(profiler,'last');
  Object.defineProperty(profiler,'last',{get:()=>undefined,configurable:true});
  try{
   const diagnostics=gameTestAPI.PerformanceDiagnostics,clock=performance.now.bind(performance),now=clock();
   diagnostics.start();
   try{performance.now=()=>now+16000;diagnostics.sample();}finally{performance.now=clock;}
   if(diagnostics.report?.reason!=='Completed'||!diagnostics.report.missingCpuFrames||!diagnostics.report.measurementWarnings.length||diagnostics.running)
    throw Error('Missing profiler left the recording broken or unreported');
  }finally{Object.defineProperty(profiler,'last',descriptor);}
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS diagnostics measurement, CPU/GPU reporting, clipboard, rejected-clipboard fallback and paused cancellation '+JSON.stringify(result));
}finally{await browser.close();}
