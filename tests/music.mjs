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
    const result=await page.evaluate(async()=>{
        const sound=gameTestAPI.SoundManager;
        sound.init();
        const files=gameTestAPI.CONFIG.AUDIO.EXPLORATION_TRACKS;
        if(files.length!==2||files[0]!=='IngameMusic.mp3'||files[1]!=='IngameMusic2.mp3')
            throw new Error(`Unexpected gameplay playlist: ${files}`);
        for(const file of files){
            const response=await fetch(file);
            if(!response.ok||!(await response.arrayBuffer()).byteLength)
                throw new Error(`Gameplay music is missing: ${file} (${response.status})`);
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
            sound.updateMusic(true);
            if(sound.musicMode!=='combat'||!sound.explorationMusic.paused)
                throw new Error('Combat did not switch away from gameplay music');
            sound.updateMusic(false);
            const resumed=sound.explorationMusic;
            if(resumed===second||sound.musicMode!=='exploration')
                throw new Error('Returning from combat did not select another gameplay title');
            sound.setMusicEnabled(false);
            if(!resumed.paused||!sound.combatMusic.paused)
                throw new Error('Music toggle did not stop the playlist');
            return {first:first.src.split('/').at(-1),second:second.src.split('/').at(-1),
                resumed:resumed.src.split('/').at(-1)};
        }finally{
            Math.random=originalRandom;
            sound.setMusicEnabled(originalEnabled);
        }
    });
    console.log('PASS Gameplay music changes without immediate repeats and combat keeps its own score',result);
}finally{await browser.close();}
