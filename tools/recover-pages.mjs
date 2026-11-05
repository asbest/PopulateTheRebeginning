import {pathToFileURL} from 'node:url';

const repositoryName='asbest/PopulateTheRebeginning';
const finished=new Set(['succeed','failed','cancelled','canceled','deployment_cancelled',
    'deployment_failed','deployment_content_failed','deployment_lost','deployment_attempt_error',
    'deployment_attempt_errored','deployment_content_error','deployment_execution_error','infrastructure_error']);

// Runs inside GitHub Actions using only its repository-scoped Pages token.
// No personal credentials, repository settings or Actions permissions are used.
export async function recoverPages({repository,currentSha,blockedSha,token,
    fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
    log=console.log,pollLimit=18}={}) {
    if(repository!==repositoryName)throw Error('Pages recovery is restricted to '+repositoryName);
    if(!/^[a-f0-9]{40}$/i.test(currentSha||'')||!/^[a-f0-9]{40}$/i.test(blockedSha||''))
        throw Error('Both deployment references must be full commit SHAs');
    if(currentSha.toLowerCase()===blockedSha.toLowerCase())throw Error('Refusing to cancel the current commit');
    if(!token)throw Error('A repository-scoped Pages token is required');
    if(!Number.isInteger(pollLimit)||pollLimit<1||pollLimit>30)throw Error('Invalid cancellation polling limit');
    const base=`https://api.github.com/repos/${repository}/pages`;
    async function request(method,path,allowMissing=false) {
        const response=await fetchImpl(base+path,{method,headers:{
            Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,
            'X-GitHub-Api-Version':'2022-11-28'
        },signal:AbortSignal.timeout(20000)});
        if(response.status===404&&allowMissing)return null;
        if(!response.ok)throw Error(`Pages API ${method} ${path} returned HTTP ${response.status}`);
        return response.status===204?{}:response.json();
    }
    const path=`/deployments/${blockedSha}`;
    let deployment=await request('GET',path,true);
    if(deployment&&!finished.has(deployment.status)) {
        log(`Cancelling blocked Pages deployment ${blockedSha.slice(0,7)} (${deployment.status})`);
        await request('POST',path+'/cancel',true);
        for(let attempt=0;attempt<pollLimit;attempt++) {
            deployment=await request('GET',path,true);
            if(!deployment||finished.has(deployment.status))break;
            if(attempt===pollLimit-1)throw Error('The old Pages deployment is still active; no new build was requested');
            await wait(10000);
        }
    } else log('The old Pages deployment no longer needs cancellation');
    const build=await request('POST','/builds');
    log('Requested a Pages build from the latest main revision ('+(build.status||'accepted')+')');
    return build;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
    try {
        await recoverPages({repository:process.env.GITHUB_REPOSITORY,currentSha:process.env.GITHUB_SHA,
            blockedSha:process.env.BLOCKED_PAGES_SHA,token:process.env.GH_TOKEN});
    } catch(error) {
        console.error(error.message);process.exitCode=1;
    }
}
