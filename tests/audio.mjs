import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=user-gesture-required'],...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('dialog',dialog=>dialog.accept());

try {
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,{timeout:60000});
    await page.mouse.click(500,300);
    await page.waitForFunction(()=>gameTestAPI.SoundManager.ctx?.state==='running');

    await page.evaluate(()=>{
        state.isPaused=true;
        const sound=gameTestAPI.SoundManager;
        sound.setMusicEnabled(false);
        window.testSounds=[];
        const oldPlaySound=sound.playSound;
        sound.playSound=function(name){testSounds.push(name);return oldPlaySound.call(this,name);};
        const recordingDestination=sound.ctx.createMediaStreamDestination();
        sound.effectsBus.connect(recordingDestination);
        window.testSpellAudioDestination=recordingDestination;
        state.mana=1000;
        state.selectedUnits=[state.shaman];
    });
    for(const spell of ['blast','heal','raise','lightning','firestorm']) {
        await page.evaluate(()=>{
            const chunks=[];
            const recorder=new MediaRecorder(testSpellAudioDestination.stream,{mimeType:'audio/webm;codecs=opus'});
            recorder.ondataavailable=event=>chunks.push(event.data);
            window.testSpellRecording={recorder,chunks};
            recorder.start();
        });
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
        const peak=await page.evaluate(async()=>{
            const {recorder,chunks}=testSpellRecording;
            await new Promise(resolve=>setTimeout(resolve,650));
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
        if(peak<0.015)throw new Error(`${spell} produced no audible signal (peak ${peak})`);
        console.log(`PASS ${spell} produces spell audio (peak ${peak.toFixed(3)})`);
    }
    await page.evaluate(()=>gameTestAPI.SoundManager.ctx.suspend());
    if(await page.evaluate(()=>gameTestAPI.SoundManager.ctx.state)!=='suspended')throw new Error('Audio context did not suspend');
    await page.keyboard.press('q');
    await page.waitForFunction(()=>gameTestAPI.SoundManager.ctx.state==='running');
    console.log('PASS Keyboard gesture resumes spell audio');
    if(errors.length)throw new Error(errors.join('\n'));
} finally {
    await browser.close();
}
