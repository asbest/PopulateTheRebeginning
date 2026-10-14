import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=user-gesture-required'],...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('dialog',dialog=>dialog.accept());
const clickControl=async (target,selector)=>{
    const bounds=await target.locator(selector).first().boundingBox();
    if(!bounds)throw new Error(`Missing control: ${selector}`);
    return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
};
const startRecording=target=>target.evaluate(()=>{
    const chunks=[];
    const recorder=new MediaRecorder(testSpellAudioDestination.stream,{mimeType:'audio/webm;codecs=opus'});
    recorder.ondataavailable=event=>chunks.push(event.data);
    window.testSpellRecording={recorder,chunks};
    recorder.start();
});
const stopRecording=target=>target.evaluate(async()=>{
    const {recorder,chunks}=testSpellRecording;
    await new Promise(resolve=>setTimeout(resolve,1500));
    const stopped=new Promise(resolve=>{recorder.onstop=resolve;});
    recorder.stop();
    await stopped;
    const bytes=await new Blob(chunks,{type:recorder.mimeType}).arrayBuffer();
    if(!bytes.byteLength)return 0;
    const decoded=await gameTestAPI.SoundManager.ctx.decodeAudioData(bytes);
    let peak=0;
    for(const sample of decoded.getChannelData(0))peak=Math.max(peak,Math.abs(sample));
    return peak;
});

try {
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    await page.evaluate(async()=>{
        window.closeHelp();
        window.closeStoryOverlay();
        document.getElementById('pause-menu').style.display='none';
        state.isPaused=true;
        const sound=gameTestAPI.SoundManager;
        sound.setMusicEnabled(false);
        await sound.ensureContext().suspend();
        state.mana=1000;
        gameTestAPI.updateUnitList();
    });
    const unitPoint=await clickControl(page,'#unit-list .unit-item');
    await page.mouse.click(unitPoint.x,unitPoint.y);
    const blastPoint=await clickControl(page,'#btn-blast');
    await page.mouse.click(blastPoint.x,blastPoint.y);
    if(await page.evaluate(()=>state.currentAction)!=='blast')throw new Error('Real spell button did not select fireball');
    await page.evaluate(()=>{
        const sound=gameTestAPI.SoundManager;
        window.testSounds=[];
        const oldPlaySound=sound.playSound;
        sound.playSound=function(name){testSounds.push(name);return oldPlaySound.call(this,name);};
        const recordingDestination=sound.ctx.createMediaStreamDestination();
        sound.effectsBus.connect(recordingDestination);
        window.testSpellAudioDestination=recordingDestination;
    });
    await startRecording(page);
    const target=await page.evaluate(()=>{
        const point=state.shaman.mesh.position.clone();
        point.x+=2;
        point.project(state.camera);
        return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};
    });
    await page.mouse.click(target.x,target.y);
    if(await page.evaluate(()=>state.mana)!==990)throw new Error('Real terrain click did not cast fireball');
    const firstPeak=await stopRecording(page);
    if(firstPeak<0.03)throw new Error(`Real fireball click produced no audio (peak ${firstPeak})`);
    await page.waitForFunction(()=>gameTestAPI.SoundManager.ctx.state==='running');
    console.log(`PASS Real fireball button and terrain click unlock audio (peak ${firstPeak.toFixed(3)})`);

    await page.evaluate(()=>{state.mana=1000;state.selectedUnits=[state.shaman];});
    for(const spell of ['blast','heal','raise','lightning','firestorm']) {
        await startRecording(page);
        const before=await page.evaluate(()=>state.mana);
        const soundCount=await page.evaluate(()=>testSounds.length);
        await page.evaluate(spell=>{
            const shaman=state.shaman;
            gameTestAPI.performAction(shaman.mesh.position.x+2,shaman.mesh.position.z,spell);
        },spell);
        const after=await page.evaluate(()=>state.mana);
        if(after>=before)throw new Error(`${spell} was not cast`);
        await page.waitForFunction(count=>testSounds.length>count,soundCount);
        const soundName=await page.evaluate(()=>testSounds.at(-1));
        const expected={blast:'fireball',heal:'magic',raise:'rumble',lightning:'explosion',firestorm:'fireball'}[spell];
        if(soundName!==expected)throw new Error(`${spell} played ${soundName} instead of ${expected}`);
        const peak=await stopRecording(page);
        if(peak<0.015)throw new Error(`${spell} produced no audible signal (peak ${peak})`);
        console.log(`PASS ${spell} produces spell audio (peak ${peak.toFixed(3)})`);
    }
    await page.evaluate(()=>gameTestAPI.SoundManager.ctx.suspend());
    if(await page.evaluate(()=>gameTestAPI.SoundManager.ctx.state)!=='suspended')throw new Error('Audio context did not suspend');
    await page.keyboard.press('q');
    await page.waitForFunction(()=>gameTestAPI.SoundManager.ctx.state==='running');
    console.log('PASS Keyboard gesture resumes spell audio');
    await page.evaluate(()=>{state.isPaused=true;document.getElementById('pause-menu').style.display='flex';});
    await startRecording(page);
    const soundPoint=await clickControl(page,'#btn-test-sound');
    await page.mouse.click(soundPoint.x,soundPoint.y);
    const testPeak=await stopRecording(page);
    if(testPeak<0.03)throw new Error(`Pause-menu sound test was silent (peak ${testPeak})`);
    console.log(`PASS Pause-menu sound test (peak ${testPeak.toFixed(3)})`);

    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    try {
        const phone=await mobile.newPage();
        phone.on('pageerror',error=>errors.push(String(error)));
        phone.on('dialog',dialog=>dialog.accept());
        await phone.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
        await phone.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
        await phone.evaluate(async()=>{
            window.closeHelp();window.closeStoryOverlay();
            document.getElementById('pause-menu').style.display='none';
            state.isPaused=true;state.mana=1000;
            gameTestAPI.SoundManager.setMusicEnabled(false);
            await gameTestAPI.SoundManager.ensureContext().suspend();
            gameTestAPI.updateUnitList();
        });
        const mobileUnit=await clickControl(phone,'#unit-list .unit-item');
        await phone.touchscreen.tap(mobileUnit.x,mobileUnit.y);
        const mobileBlast=await clickControl(phone,'#btn-blast');
        await phone.touchscreen.tap(mobileBlast.x,mobileBlast.y);
        await phone.evaluate(()=>{
            const sound=gameTestAPI.SoundManager;
            const destination=sound.ctx.createMediaStreamDestination();
            sound.effectsBus.connect(destination);
            window.testSpellAudioDestination=destination;
        });
        await startRecording(phone);
        const mobileTarget=await phone.evaluate(()=>{
            const point=state.shaman.mesh.position.clone();point.x+=1;point.project(state.camera);
            return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};
        });
        await phone.touchscreen.tap(mobileTarget.x,mobileTarget.y);
        if(await phone.evaluate(()=>state.mana)!==990)throw new Error('Touch fireball did not cast');
        const mobilePeak=await stopRecording(phone);
        if(mobilePeak<0.03)throw new Error(`Touch fireball produced no audio (peak ${mobilePeak})`);
        console.log(`PASS Touch fireball unlocks audio (peak ${mobilePeak.toFixed(3)})`);
    } finally {
        await mobile.close();
    }
    if(errors.length)throw new Error(errors.join('\n'));
} finally {
    await browser.close();
}
