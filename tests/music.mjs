import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage();
try{
    const base=process.env.GAME_URL||'http://127.0.0.1:8765';
    await page.goto(`${base}/PopulateTheRebeginning.html?test=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    await page.keyboard.press('q');
    const result=await page.evaluate(async()=>{
        const sound=gameTestAPI.SoundManager;
        sound.init();
        const files=gameTestAPI.CONFIG.AUDIO.EXPLORATION_TRACKS;
        if(files.join(',')!=='IngameMusic.mp3,IngameMusic2.mp3,Populate_ingame3.mp3')
            throw new Error(`Unexpected gameplay playlist: ${files}`);
        const combatFiles=gameTestAPI.CONFIG.AUDIO.COMBAT_TRACKS;
        if(combatFiles.join(',')!=='FightMusic.mp3,Populate_fight2.mp3')
            throw new Error(`Unexpected combat playlist: ${combatFiles}`);
        for(const file of [...files,...combatFiles]){
            const response=await fetch(file);
            const bytes=await response.arrayBuffer();
            if(!response.ok||!bytes.byteLength)
                throw new Error(`Music is missing: ${file} (${response.status})`);
            if(['Populate_fight2.mp3','Populate_ingame3.mp3'].includes(file)){
                const decoded=await new OfflineAudioContext(1,1,32000).decodeAudioData(bytes);
                if(decoded.duration<=0)throw new Error('Music did not decode: '+file);
            }
        }
        const originalRandom=Math.random,originalEnabled=sound.musicEnabled;
        try{
            Math.random=()=>0;
            sound.setMusicEnabled(true);
            sound.musicMode=null;
            sound.lastExplorationTrack=-1;
            sound.explorationMusic=null;
            sound.updateMusic(false);
            const first=sound.explorationMusic;
            first.dispatchEvent(new Event('ended'));
            const second=sound.explorationMusic;
            if(first===second||first.src===second.src)
                throw new Error('Gameplay track did not change after the first title ended');
            Math.random=()=>.99;
            second.dispatchEvent(new Event('ended'));
            const third=sound.explorationMusic;
            if(new URL(third.src).pathname.split('/').at(-1)!==files[2])
                throw new Error('The third gameplay track was not selected');
            await third.play();
            third.currentTime=Math.min(5,third.duration/2);
            Math.random=()=>0;
            sound.updateMusic(true);
            const pausedAt=third.currentTime;
            if(pausedAt<=0)throw new Error('The gameplay track was not seekable');
            if(sound.musicMode!=='combat'||!sound.explorationMusic.paused)
                throw new Error('Combat did not switch away from gameplay music');
            const fight=sound.combatMusic;
            const fileName=()=>new URL(fight.src).pathname.split('/').at(-1);
            if(fight.loop||fileName()!==combatFiles[0])throw new Error('Combat playlist did not start with the original score');
            fight.dispatchEvent(new Event('ended'));
            if(fileName()!==combatFiles[1])throw new Error('The second combat track did not start');
            fight.dispatchEvent(new Event('ended'));
            if(fileName()!==combatFiles[0])throw new Error('The combat playlist did not wrap');
            sound.updateMusic(false);
            fight.dispatchEvent(new Event('ended'));
            if(!fight.paused||fileName()!==combatFiles[0])throw new Error('Combat playlist advanced after combat ended');
            const resumed=sound.explorationMusic;
            if(resumed!==third||resumed.paused||sound.musicMode!=='exploration'||Math.abs(resumed.currentTime-pausedAt)>.25)
                throw new Error('Returning from combat did not resume the same gameplay title at its paused position');
            sound.setMusicEnabled(false);
            if(!resumed.paused||!sound.combatMusic.paused)
                throw new Error('Music toggle did not stop the playlist');
            return {first:first.src.split('/').at(-1),second:second.src.split('/').at(-1),
                third:third.src.split('/').at(-1),resumed:resumed.src.split('/').at(-1),pausedAt};
        }finally{
            Math.random=originalRandom;
            sound.setMusicEnabled(originalEnabled);
        }
    });
    console.log('PASS Gameplay music rotates, pauses in combat and resumes at the same position',result);
}finally{await browser.close();}
