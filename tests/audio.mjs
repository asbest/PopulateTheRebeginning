import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=user-gesture-required'],...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
let checkpoint='desktop startup';
page.on('pageerror',error=>errors.push(String(error)));
page.on('dialog',dialog=>dialog.accept());
const clickControl=async (target,selector)=>{
    const point=await target.evaluate(selector=>{
        const control=document.querySelector(selector);
        if(!control)return null;
        const bounds=control.getBoundingClientRect();
        return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
    },selector);
    if(!point)throw new Error(`Missing control: ${selector}`);
    return point;
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
    if(await page.evaluate(()=>gameTestAPI.SoundManager.ctx!==null))
        throw new Error('AudioContext was created before the first user gesture');
    console.log('PASS Sound assets preload without opening a blocked AudioContext');
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
    checkpoint='desktop fireball click';
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
        checkpoint=`desktop ${spell} sound`;
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
        const expected={blast:'fireball',heal:'heal',raise:'raise',lightning:'lightning',firestorm:'firestorm'}[spell];
        if(soundName!==expected)throw new Error(`${spell} played ${soundName} instead of ${expected}`);
        const peak=await stopRecording(page);
        if(peak<0.015)throw new Error(`${spell} produced no audible signal (peak ${peak})`);
        console.log(`PASS ${spell} produces spell audio (peak ${peak.toFixed(3)})`);
    }
    await page.evaluate(()=>gameTestAPI.SoundManager.ctx.suspend());
    checkpoint='desktop keyboard unlock and sound test';
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

    checkpoint='desktop sustained firestorm';
    const sustain=await page.evaluate(()=>{
        document.getElementById('pause-menu').style.display='none';
        state.isPaused=false;
        const sound=gameTestAPI.SoundManager;
        sound.syncSustains(false);
        state.mana=1000;
        state.selectedUnits=[state.shaman];
        gameTestAPI.performAction(state.shaman.mesh.position.x+2,state.shaman.mesh.position.z,'firestorm');
        const effect=state.activeEffects.at(-1),handle=effect?.soundLoop;
        if(effect?.constructor.name!=='Firestorm'||!handle||!sound.activeSustains.has(handle))
            throw new Error('Firestorm did not start its persistent sound');
        window.testSustainHandle=handle;
        window.testSustainEffect=effect;
        return {duration:effect.timer,loop:handle.audio.loop,src:handle.audio.currentSrc};
    });
    if(sustain.duration<9||!sustain.loop||!sustain.src.endsWith('/sfx/firestorm_loop.wav'))
        throw new Error(`Wrong firestorm sustain: ${JSON.stringify(sustain)}`);
    await page.waitForFunction(()=>testSustainHandle.audio.currentTime>.1,null,{timeout:15000});
    await page.evaluate(()=>{state.isPaused=true;gameTestAPI.SoundManager.syncSustains(true);});
    if(!await page.evaluate(()=>testSustainHandle.audio.paused))
        throw new Error('Sustained spell kept playing while paused');
    await page.evaluate(()=>{
        const sound=gameTestAPI.SoundManager,effect=testSustainEffect;
        state.isPaused=false;sound.syncSustains(false);
        effect.timer=0;effect.update(.01);
    });
    await page.waitForFunction(()=>!gameTestAPI.SoundManager.activeSustains.has(testSustainHandle));
    await page.waitForFunction(()=>testSustainHandle.audio.paused,null,{timeout:3000});
    console.log('PASS Firestorm bed plays through its lifetime, pauses and stops on expiry');

    checkpoint='Android startup';
    const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
        userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
    try {
        const phone=await mobile.newPage();
        phone.on('pageerror',error=>errors.push(String(error)));
        phone.on('dialog',dialog=>dialog.accept());
        await phone.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
        await phone.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
        if(await phone.evaluate(()=>gameTestAPI.SoundManager.ctx!==null))
            throw new Error('Android AudioContext was created before the first touch');
        await phone.evaluate(async()=>{
            window.closeHelp();window.closeStoryOverlay();
            document.getElementById('pause-menu').style.display='none';
            state.isPaused=true;state.mana=1000;
            gameTestAPI.SoundManager.setMusicEnabled(false);
            await gameTestAPI.SoundManager.ensureContext().suspend();
            gameTestAPI.SoundManager.prepareMediaEffects();
            window.testMediaPlayback={played:false,maxTime:0,playCount:0};
            for(const voice of gameTestAPI.SoundManager.mediaEffects.get('fireball')){
                voice.addEventListener('play',()=>{testMediaPlayback.played=true;testMediaPlayback.playCount++;});
                voice.addEventListener('timeupdate',()=>{testMediaPlayback.maxTime=Math.max(testMediaPlayback.maxTime,voice.currentTime);});
                voice.addEventListener('ended',()=>{testMediaPlayback.maxTime=Math.max(testMediaPlayback.maxTime,voice.duration);});
            }
            gameTestAPI.updateUnitList();
        });
        const mobileUnit=await clickControl(phone,'#unit-list .unit-item');
        checkpoint='Android fireball touch';
        await phone.touchscreen.tap(mobileUnit.x,mobileUnit.y);
        const mobileBlast=await clickControl(phone,'#btn-blast');
        await phone.touchscreen.tap(mobileBlast.x,mobileBlast.y);
        const mobileTarget=await phone.evaluate(()=>{
            const point=state.shaman.mesh.position.clone();point.x+=1;point.project(state.camera);
            return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};
        });
        await phone.touchscreen.tap(mobileTarget.x,mobileTarget.y);
        if(await phone.evaluate(()=>state.mana)!==990)throw new Error('Touch fireball did not cast');
        await phone.waitForFunction(()=>testMediaPlayback.maxTime>.25,null,{timeout:30000});
        const mobileAudio=await phone.evaluate(async()=>{
            const response=await fetch('sfx/fireball.wav');
            if(!response.ok||response.headers.get('content-type')!=='audio/wav')throw new Error('Fireball WAV is not served as audio');
            const bytes=await response.arrayBuffer(),view=new DataView(bytes);
            const samples=(start,end)=>{
                let sum=0,count=0;
                for(let i=Math.round(start*32000);i<Math.round(end*32000);i++){
                    const sample=view.getInt16(44+i*2,true)/32768;sum+=sample*sample;count++;
                }
                return Math.sqrt(sum/count);
            };
            return {played:testMediaPlayback.played,maxTime:testMediaPlayback.maxTime,
                duration:(bytes.byteLength-44)/(32000*2),onset:samples(0,.005),body:samples(.15,.35),
                webAudioState:gameTestAPI.SoundManager.ctx.state};
        });
        if(!mobileAudio.played||mobileAudio.duration<.65||mobileAudio.body<.02||
            mobileAudio.onset>=mobileAudio.body*.7)
            throw new Error(`Android-style fireball was not a sustained media effect: ${JSON.stringify(mobileAudio)}`);
        console.log(`PASS Android touch fireball plays a sustained WAV effect: ${JSON.stringify(mobileAudio)}`);
        const assets=await phone.evaluate(async()=>Promise.all(
            [...gameTestAPI.SoundManager.mediaEffects.keys()].map(async name=>{
                const response=await fetch(`sfx/${name}.wav`);
                return {name,ok:response.ok,type:response.headers.get('content-type'),bytes:(await response.arrayBuffer()).byteLength};
            })));
        if(assets.length!==28||assets.some(asset=>!asset.ok||asset.type!=='audio/wav'||asset.bytes<12000))
            throw new Error(`Missing Android effect assets: ${JSON.stringify(assets)}`);
        console.log(`PASS Android can load all ${assets.length} spell effects and ambient beds`);
        await phone.evaluate(()=>{
            state.isPaused=false;state.mana=1000;
            gameTestAPI.SoundManager.syncSustains(false);
            state.selectedUnits=[state.shaman];
        });
        const stormPoint=await clickControl(phone,'#btn-firestorm');
        checkpoint='Android sustained firestorm';
        await phone.touchscreen.tap(stormPoint.x,stormPoint.y);
        const stormTarget=await phone.evaluate(()=>{
            const point=state.shaman.mesh.position.clone();point.x+=2;point.project(state.camera);
            return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2};
        });
        await phone.touchscreen.tap(stormTarget.x,stormTarget.y);
        await phone.waitForFunction(()=>[...gameTestAPI.SoundManager.activeSustains]
            .some(handle=>handle.audio.currentSrc.endsWith('/sfx/firestorm_loop.wav')&&handle.audio.currentTime>.1),null,{timeout:15000});
        await phone.evaluate(()=>{
            const sound=gameTestAPI.SoundManager;
            window.phoneStorm=[...sound.activeSustains].find(handle=>handle.audio.currentSrc.endsWith('/sfx/firestorm_loop.wav'));
            state.isPaused=true;sound.syncSustains(true);
            if(!phoneStorm.audio.paused)throw new Error('Android storm audio ignored pause');
            const effect=state.activeEffects.find(item=>item.constructor.name==='Firestorm');
            effect.timer=0;effect.update(.01);
        });
        await phone.waitForFunction(()=>phoneStorm.audio.paused&&phoneStorm.stopped,null,{timeout:3000});
        console.log('PASS Android touch firestorm sustains, pauses and stops with the spell');
        await phone.waitForFunction(()=>gameTestAPI.SoundManager.effectBuffers.has('heal')&&
            gameTestAPI.SoundManager.effectBuffers.has('swamp_loop'));
        checkpoint='Android blocked-media fallback';
        await phone.evaluate(()=>{
            const sound=gameTestAPI.SoundManager;
            const destination=sound.ctx.createMediaStreamDestination();
            sound.effectsBus.connect(destination);
            window.testSpellAudioDestination=destination;
            for(const voice of sound.mediaEffects.get('heal'))
                voice.play=()=>Promise.reject(new DOMException('Media playback blocked','NotAllowedError'));
        });
        await startRecording(phone);
        const fallbackResult=await phone.evaluate(()=>gameTestAPI.SoundManager.playSound('heal'));
        const fallbackPeak=await stopRecording(phone);
        if(!fallbackResult||fallbackPeak<.015||!await phone.evaluate(()=>gameTestAPI.SoundManager.mediaEffectsBlocked))
            throw new Error(`Blocked Android media did not fall back to audible Web Audio: ${fallbackPeak}`);
        console.log(`PASS Blocked Android media uses audible Web Audio fallback (peak ${fallbackPeak.toFixed(3)})`);
        await phone.evaluate(()=>{state.isPaused=false;gameTestAPI.SoundManager.syncSustains(false);});
        const webLoop=await phone.evaluate(async()=>{
            const sound=gameTestAPI.SoundManager;
            const analyser=sound.ctx.createAnalyser();
            analyser.fftSize=2048;
            sound.effectsBus.connect(analyser);
            const handle=sound.startSustain('swamp_loop');
            window.testWebLoop=handle;
            const data=new Float32Array(analyser.fftSize);
            let peak=0;
            for(let frame=0;frame<12;frame++){
                await new Promise(resolve=>setTimeout(resolve,50));
                analyser.getFloatTimeDomainData(data);
                for(const sample of data)peak=Math.max(peak,Math.abs(sample));
            }
            sound.effectsBus.disconnect(analyser);
            analyser.disconnect();
            return {playing:Boolean(handle?.usingWebAudio&&handle.webSource),peak};
        });
        if(!webLoop.playing||webLoop.peak<.005)throw new Error(`Blocked Android loop was silent: ${JSON.stringify(webLoop)}`);
        await phone.evaluate(()=>{
            const sound=gameTestAPI.SoundManager;
            state.isPaused=true;sound.syncSustains(true);
            if(testWebLoop.webSource)throw new Error('Web Audio loop ignored pause');
            state.isPaused=false;sound.syncSustains(false);
            if(!testWebLoop.webSource)throw new Error('Web Audio loop did not resume');
            testWebLoop.stop(true);
            if(sound.activeSustains.has(testWebLoop))throw new Error('Web Audio loop did not stop');
        });
        console.log(`PASS Blocked Android spell loop plays, pauses and stops (peak ${webLoop.peak.toFixed(3)})`);
        await phone.evaluate(()=>{state.isPaused=true;document.getElementById('pause-menu').style.display='flex';});
        checkpoint='Android pause-menu sound test';
        await startRecording(phone);
        const phoneSoundPoint=await clickControl(phone,'#btn-test-sound');
        await phone.touchscreen.tap(phoneSoundPoint.x,phoneSoundPoint.y);
        const phoneTestPeak=await stopRecording(phone);
        if(phoneTestPeak<.03)throw new Error(`Android pause-menu sound test was silent after media rejection (peak ${phoneTestPeak})`);
        console.log(`PASS Android pause-menu sound test remains audible after media rejection (peak ${phoneTestPeak.toFixed(3)})`);
    } finally {
        await mobile.close();
    }
    if(errors.length)throw new Error(errors.join('\n'));
} catch(error) {
    const message=String(error?.stack||error).slice(0,1400)
        .replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
    console.error(`::error title=Spell audio at ${checkpoint}::${message}`);
    throw error;
} finally {
    await browser.close();
}
