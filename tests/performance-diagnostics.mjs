import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
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
 await page.locator('#btn-performance-diagnostics').click();
 await page.locator('#btn-diagnostics-start').click();
 await page.waitForFunction(()=>gameTestAPI.PerformanceDiagnostics.report?.reason==='Completed',null,{timeout:60000});
 const result=await page.evaluate(()=>{
  const report=gameTestAPI.PerformanceDiagnostics.report;
  if(!state.isPaused||gameTestAPI.GpuTimer.enabled||!report.frames||!report.fps||!report.cpu.physics||!report.cpu.ai||!report.cpu.units||report.durationSeconds<15)throw Error(JSON.stringify(report));
  return {frames:report.frames,fps:report.fps,gpu:report.gpu,cpu:report.cpu};
 });
 await page.locator('#btn-diagnostics-copy').click();
 await page.waitForFunction(()=>document.querySelector('#performance-diagnostics [role=status]').textContent==='Report copied.');
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 if(copied.replaceAll('\r\n','\n')!==await page.locator('#diagnostics-report').inputValue())throw Error('Copied report differs');
 await page.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(Error('Blocked'));document.execCommand=()=>false;});
 await page.locator('#btn-diagnostics-copy').click();
 await page.waitForFunction(()=>document.querySelector('#performance-diagnostics [role=status]').textContent.includes('report is selected'));
 await page.locator('#btn-diagnostics-start').click();
 await page.waitForFunction(()=>gameTestAPI.PerformanceDiagnostics.running&&!state.isPaused);
 await page.evaluate(()=>togglePause());
 await page.waitForFunction(()=>gameTestAPI.PerformanceDiagnostics.report?.reason==='Paused early');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS diagnostics measurement, CPU/GPU reporting, clipboard, rejected-clipboard fallback and paused cancellation '+JSON.stringify(result));
}finally{await browser.close();}
