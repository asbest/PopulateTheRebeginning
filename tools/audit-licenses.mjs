import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const allowed=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','0BSD','LGPL-3.0-or-later']);
const assetLicenses=new Set([...allowed,'CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0']);
const fingerprint=(file,bytes)=>createHash('sha256').update(/\.(js|json|txt|md)$/i.test(file)
    ?bytes.toString('utf8').replaceAll('\r\n','\n'):bytes).digest('hex');
const thirdParty=JSON.parse(await fs.readFile(path.join(root,'licenses/vendor.json'),'utf8'));
const assets=JSON.parse(await fs.readFile(path.join(root,'licenses/assets.json'),'utf8'));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
const errors=[],pending=[];
function licenseOK(expression,licenses=allowed){
    return typeof expression==='string'&&expression.length>0&&
        expression.replace(/[()]/g,'').split(/\s+(?:AND|OR)\s+/).every(id=>licenses.has(id.trim()));
}
const covered=new Set();
for(const component of thirdParty.components){
    if(!licenseOK(component.license))errors.push(`Unapproved vendor license: ${component.name}: ${component.license}`);
    if(!component.source)errors.push(`Missing upstream source: ${component.name}`);
    for(const file of component.notices){
        const content=await fs.readFile(path.join(root,file)).catch(()=>null);
        if(!content||content.length<200)errors.push(`Missing/truncated license notice: ${file}`);
        else if(component.noticeHashes?.[file]!==fingerprint(file,content))errors.push(`License notice changed without review: ${file}`);
    }
    for(const [file,hash] of Object.entries(component.files)){
        covered.add(file);
        const bytes=await fs.readFile(path.join(root,file)).catch(()=>null);
        if(!bytes||fingerprint(file,bytes)!==hash)errors.push(`Vendor file changed without license review: ${file}`);
    }
}
for(const file of files)if(file.startsWith('vendor/')&&/\.(js|wasm)$/i.test(file)&&!covered.has(file))
    errors.push(`Unreviewed vendor file: ${file}`);
let packages=0;
for(const [name,entry] of Object.entries(lock.packages||{})){
    if(!name)continue;packages++;
    if(!entry.version||!entry.integrity||!entry.resolved?.startsWith('https://registry.npmjs.org/'))errors.push(`Unpinned/untrusted dependency: ${name}`);
    if(!licenseOK(entry.license))errors.push(`Unapproved npm license: ${name}: ${entry.license||'MISSING'}`);
}
for(const section of ['dependencies','devDependencies','optionalDependencies']){
    if(JSON.stringify(pkg[section]||{})!==JSON.stringify(lock.packages?.['']?.[section]||{}))errors.push(`package-lock.json is out of date: ${section}`);
    for(const [name,version] of Object.entries(pkg[section]||{}))if(lock.packages?.[`node_modules/${name}`]?.version!==version)
        errors.push(`Direct dependency must use an exact reviewed version: ${name}`);
}
const media=file=>/\.(png|webp|gif|jpe?g|svg|mp3|mp4|wav|ogg|blend|ktx2)$/i.test(file)||
    file==='art/blender/mesh-pack.json'||file.startsWith('art/startup/models/');
for(const file of files.filter(media)){
    const record=assets.files[file];
    if(!record){errors.push(`Asset missing provenance review: ${file}`);continue;}
    const hash=fingerprint(file,await fs.readFile(path.join(root,file)));
    if(record.sha256!==hash)errors.push(`Asset changed without provenance review: ${file}`);
    if(!record.evidence)errors.push(`Asset has no provenance evidence: ${file}`);
    if(record.status==='unverified')pending.push(file);
    else if(record.status==='project-original'){
        if(record.license!==null)errors.push(`Project ownership is not a third-party license grant: ${file}`);
    }else if(record.status!=='third-party'||!licenseOK(record.license,assetLicenses))errors.push(`Unapproved asset license/status: ${file}`);
    else if(!record.creator||!record.source||!record.licenseURL||!record.attribution)
        errors.push(`Third-party asset is missing source/attribution/license evidence: ${file}`);
}
// This switch reports dependency work separately; it is never a complete asset clearance.
const dependenciesOnly=process.argv.includes('--dependencies-only');
const report={scope:dependenciesOnly?'dependencies-only':'full',vendorComponents:thirdParty.components.length,npmPackages:packages,
    assets:files.filter(media).length,errors,unverifiedAssets:pending,complete:errors.length===0&&pending.length===0};
await fs.mkdir(path.join(root,'test-results'),{recursive:true});
await fs.writeFile(path.join(root,'test-results/license-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length||(!dependenciesOnly&&pending.length))process.exitCode=1;
