import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href)
    :createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const root=path.resolve(import.meta.dirname,'..');
const report={pass:false};
try{
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    Object.assign(report,await page.evaluate(()=>{
        state.isPaused=true;state.selectedUnits=[state.shaman];
        const shaman=state.shaman,p=shaman.mesh.position;
        const target=gameTestAPI.findNearestLand(p.x+3,p.z+2);
        const before=state.particles.filter(effect=>effect.mesh?.name==='MoveDestinationMarker').length;
        gameTestAPI.performAction(target.x,target.z,'move');
        const markers=state.particles.filter(effect=>effect.mesh?.name==='MoveDestinationMarker');
        if(markers.length!==before+1)throw new Error('Move order did not create one target marker');
        const effect=markers.at(-1),mesh=effect.mesh;
        if(effect.maxLife!==2||Math.hypot(mesh.position.x-target.x,mesh.position.z-target.z)>.01||
            mesh.geometry.type==='RingGeometry'||mesh.geometry.type==='TorusGeometry'||
            !shaman.finalDest||shaman.finalDest.distanceTo(new THREE.Vector3(target.x,0,target.z))>.01)
            throw new Error('Marker position, duration, shape or movement order is wrong');
        if(!effect.update(1.99)||!mesh.parent)throw new Error('Marker disappeared before two seconds');
        if(effect.update(.02)||mesh.parent)throw new Error('Marker remained after two seconds');
        const count=state.particles.filter(item=>item.mesh?.name==='MoveDestinationMarker').length;
        state.selectedUnits=[];
        gameTestAPI.performAction(target.x+2,target.z,'move');
        if(state.particles.filter(item=>item.mesh?.name==='MoveDestinationMarker').length!==count)
            throw new Error('Move marker appeared without a selected unit');
        return {duration:effect.maxLife,target,geometry:mesh.geometry.type};
    }));
    if(errors.length)throw new Error(errors.join('; '));
    report.pass=true;
    console.log('PASS movement target marker lasts two seconds '+JSON.stringify(report));
}catch(error){report.error=String(error);console.error('FAIL movement target marker '+error);process.exitCode=1;}
finally{
    await browser.close();
    await fs.mkdir(path.join(root,'test-results'),{recursive:true});
    await fs.writeFile(path.join(root,'test-results','move-marker.json'),JSON.stringify(report,null,2));
}
