import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),results=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(path.join(root,'test-results'),{recursive:true});
async function fixture(){
    const dir=await fs.mkdtemp(path.join(root,'test-results/license-case-'));
    for(const folder of ['tools','licenses','vendor'])await fs.mkdir(path.join(dir,folder));
    await fs.copyFile(path.join(root,'tools/audit-licenses.mjs'),path.join(dir,'tools/audit-licenses.mjs'));
    const source='export const example=true;\n',media=Buffer.from('original fixture artwork');
    const notice=(await fs.readFile(path.join(root,'vendor/SIMPLEX-LICENSE.txt'),'utf8')).replaceAll('\r\n','\n');
    const pkg={name:'license-check-fixture',private:true,devDependencies:{demo:'1.0.0'}};
    const lock={lockfileVersion:3,packages:{'':{devDependencies:pkg.devDependencies},'node_modules/demo':{
        version:'1.0.0',license:'MIT',resolved:'https://registry.npmjs.org/demo/-/demo-1.0.0.tgz',integrity:'sha512-fixture'}}};
    const vendor={components:[{name:'example',license:'MIT',source:'https://example.org/source',
        notices:['vendor/TEST-LICENSE.txt'],noticeHashes:{'vendor/TEST-LICENSE.txt':hash(notice)},files:{'vendor/example.js':hash(source)}}]};
    const assets={files:{'artwork.png':{status:'project-original',license:null,evidence:'Created for this isolated test fixture.',sha256:hash(media)}}};
    const write=async(file,value)=>fs.writeFile(path.join(dir,file),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));
    await write('vendor/example.js',source);await write('vendor/TEST-LICENSE.txt',notice);await write('artwork.png',media);
    await write('package.json',pkg);await write('package-lock.json',lock);await write('licenses/vendor.json',vendor);await write('licenses/assets.json',assets);
    execFileSync('git',['init','--quiet',dir],{windowsHide:true,stdio:'ignore'});
    return {dir,pkg,lock,vendor,assets,write};
}
async function check(name,mutate,expected=1,args=[]){
    try{
        const f=await fixture();await mutate(f);
        execFileSync('git',['add','.'],{cwd:f.dir,windowsHide:true,stdio:'ignore'});
        const result=spawnSync(process.execPath,['tools/audit-licenses.mjs',...args],{cwd:f.dir,encoding:'utf8',windowsHide:true});
        if(result.status!==expected)throw new Error(`Expected ${expected}, got ${result.status}: ${result.stdout} ${result.stderr}`);
        if(args.includes('--dependencies-only')){
            const report=JSON.parse(result.stdout);
            if(report.complete||report.scope!=='dependencies-only'||report.unverifiedAssets.length!==1)
                throw new Error('Dependency-only mode falsely reported complete clearance');
        }
        results.push({name,pass:true});console.log('PASS '+name);
    }catch(error){results.push({name,pass:false,error:String(error)});console.error('FAIL '+name,error);}
}
await check('Reviewed free software and documented original art pass',async()=>{},0);
await check('A proprietary npm license fails',async f=>{f.lock.packages['node_modules/demo'].license='UNLICENSED';await f.write('package-lock.json',f.lock);});
await check('A missing npm license fails',async f=>{delete f.lock.packages['node_modules/demo'].license;await f.write('package-lock.json',f.lock);});
await check('Restricted optional packages are checked too',async f=>{f.lock.packages['node_modules/optional-demo']={version:'1.0.0',optional:true,license:'CC-BY-NC-4.0',resolved:'https://registry.npmjs.org/optional-demo/-/optional-demo-1.0.0.tgz',integrity:'sha512-fixture'};await f.write('package-lock.json',f.lock);});
await check('Changed vendor bytes require a new review',async f=>f.write('vendor/example.js','export const changed=true;'));
await check('New vendor files cannot bypass the inventory',async f=>f.write('vendor/unreviewed.js','export const unreviewed=true;'));
await check('Replaced license notices fail even if they are long enough',async f=>f.write('vendor/TEST-LICENSE.txt','Unreviewed terms. '.repeat(40)));
await check('Changed art requires provenance review',async f=>f.write('artwork.png','different artwork'));
await check('New art cannot bypass the provenance inventory',async f=>f.write('unreviewed.png','unreviewed artwork'));
await check('Unverified original media blocks full clearance',async f=>{f.assets.files['artwork.png'].status='unverified';await f.write('licenses/assets.json',f.assets);});
await check('Dependency-only mode remains explicitly incomplete for unverified art',async f=>{f.assets.files['artwork.png'].status='unverified';await f.write('licenses/assets.json',f.assets);},0,['--dependencies-only']);
await check('A non-commercial asset license is rejected',async f=>{Object.assign(f.assets.files['artwork.png'],{status:'third-party',license:'CC-BY-NC-4.0'});await f.write('licenses/assets.json',f.assets);});
await check('Third-party art without attribution evidence fails',async f=>{Object.assign(f.assets.files['artwork.png'],{status:'third-party',license:'CC-BY-4.0'});await f.write('licenses/assets.json',f.assets);});
await check('A documented commercial-use CC BY asset passes',async f=>{Object.assign(f.assets.files['artwork.png'],{status:'third-party',license:'CC-BY-4.0',creator:'Fixture artist',source:'https://example.org/fixture-art',licenseURL:'https://creativecommons.org/licenses/by/4.0/',attribution:'Fixture artwork by Fixture artist, CC BY 4.0; unchanged.'});await f.write('licenses/assets.json',f.assets);},0);
await check('Package/lockfile version drift is rejected',async f=>{f.pkg.devDependencies.demo='2.0.0';await f.write('package.json',f.pkg);});
await fs.writeFile(path.join(root,'test-results/license-guard-tests.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length}));
if(results.some(r=>!r.pass))process.exitCode=1;
