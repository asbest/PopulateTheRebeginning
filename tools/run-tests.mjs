import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const root=path.resolve(import.meta.dirname,'..');
const namedGroups={
    tutorial:['control-tutorial'],
    interface:['startup','peace-time','campaign-story','campaign-levels','live-gameplay','browser'],
    rendering:['blender-assets','ktx2','environment','terrain-variety','trees','sfx-assets','materials'],
    audio:['music','audio'],
    'strategy-long':['strategy-long']
};
const groups=Object.fromEntries(Object.entries(namedGroups).map(([name,files])=>[name,files.map(file=>`tests/${file}.mjs`)]));
const discovered=(await fs.readdir(path.join(root,'tests'))).filter(name=>name.endsWith('.mjs')).map(name=>`tests/${name}`);
const assigned=new Set(Object.values(groups).flat());
groups.simulation=discovered.filter(file=>!assigned.has(file)).sort();
groups.performance=['first-fireball','group-impact','firewarriors','hut-destruction','firestorm'].map(name=>`tools/benchmark-${name}.mjs`);
for(const file of Object.values(groups).flat())await fs.access(path.join(root,file));
const group=process.argv.find(arg=>arg.startsWith('--group='))?.slice(8)||'all';
if(group!=='all'&&!groups[group])throw new Error(`Unknown test group: ${group}`);
const files=group==='all'?Object.values(groups).flat():groups[group];
if(process.argv.includes('--list')){
    console.log(JSON.stringify({group,suites:files.length,groups},null,2));
    process.exit(0);
}
const forwarded=process.argv.slice(2).filter(arg=>!arg.startsWith('--group='));
const url=process.env.GAME_URL||'http://127.0.0.1:8765';
async function serverReady(){try{return (await fetch(url,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}}
let server;
const results=[];
const report=path.join(root,'test-results',`suite-summary-${group}.json`);
await fs.mkdir(path.dirname(report),{recursive:true});
try{
    if(!await serverReady()){
        if(process.env.GAME_URL)throw new Error(`Test server unavailable: ${url}`);
        server=spawn(process.execPath,['tools/serve.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});
        let launchError;server.on('error',error=>{launchError=error;});
        for(let attempt=0;attempt<30&&!await serverReady();attempt++){
            if(launchError)throw launchError;
            if(server.exitCode!==null)throw new Error('Test server exited during startup');
            await delay(200);
        }
        if(!await serverReady())throw new Error('Test server did not start');
    }
    for(const file of files){
        console.log(`\nRUN ${file}`);
        const started=Date.now();
        const result=await new Promise(resolve=>{
            const child=spawn(process.execPath,[file,...forwarded],{cwd:root,stdio:'inherit',windowsHide:true,timeout:30*60*1000});
            child.on('error',error=>resolve({code:null,error:String(error)}));
            child.on('exit',(code,signal)=>resolve({code,signal}));
        });
        results.push({file,pass:result.code===0,seconds:(Date.now()-started)/1000,...result});
        console.log(`${result.code===0?'PASS':'FAIL'} SUITE ${file}`);
        await fs.writeFile(report,JSON.stringify({group,results},null,2));
    }
}finally{server?.kill();}
const failed=results.filter(result=>!result.pass);
console.log(JSON.stringify({group,suites:results.length,passed:results.length-failed.length,failed:failed.map(result=>result.file)}));
process.exitCode=failed.length?1:0;
