import assert from 'node:assert/strict';
import {recoverPages} from '../tools/recover-pages.mjs';

const old='a'.repeat(40),head='b'.repeat(40);
const defaults={repository:'asbest/PopulateTheRebeginning',currentSha:head,blockedSha:old,token:'fixture-token',log:()=>{}};
function fixture(replies) {
    const calls=[],waits=[];
    return {calls,waits,options:{...defaults,wait:async ms=>{waits.push(ms);},
        fetchImpl:async(url,options)=>{
            calls.push({url,method:options.method});
            assert.equal(new URL(url).origin,'https://api.github.com');
            assert.equal(options.headers.Authorization,'Bearer fixture-token');
            const next=replies.shift();assert.ok(next,'Unexpected API call');
            return new Response(next[0]===204?null:JSON.stringify(next[1]),{status:next[0]});
        }}};
}
const recovery=fixture([[200,{status:'updating_pages'}],[204],
    [200,{status:'cancel_in_progress'}],[200,{status:'deployment_cancelled'}],[201,{status:'queued'}]]);
assert.equal((await recoverPages(recovery.options)).status,'queued');
assert.deepEqual(recovery.calls.map(c=>c.method),['GET','POST','GET','GET','POST']);
assert.equal(recovery.calls[1].url,`https://api.github.com/repos/asbest/PopulateTheRebeginning/pages/deployments/${old}/cancel`);
assert.deepEqual(recovery.waits,[10000]);
for(const response of [[404,{}],[200,{status:'succeed'}],[200,{status:'deployment_failed'}]]) {
    const done=fixture([response,[201,{status:'queued'}]]);await recoverPages(done.options);
    assert.deepEqual(done.calls.map(c=>c.method),['GET','POST']);
    assert.ok(done.calls[1].url.endsWith('/pages/builds'));
}
const blocked=fixture([[200,{status:'updating_pages'}],[204],[200,{status:'updating_pages'}]]);
await assert.rejects(recoverPages({...blocked.options,pollLimit:1}),/still active/);
assert.ok(blocked.calls.every(c=>!c.url.endsWith('/builds')));
const forbidden=fixture([[403,{}]]);
await assert.rejects(recoverPages(forbidden.options),/HTTP 403/);
assert.equal(forbidden.calls.length,1);
for(const overrides of [{currentSha:old},{blockedSha:'main'},{repository:'another/repo'},{token:''},{pollLimit:0}]) {
    const invalid=fixture([]);await assert.rejects(recoverPages({...invalid.options,...overrides}));
    assert.equal(invalid.calls.length,0);
}
console.log('PASS scoped Pages recovery, cancellation polling, completed/missing deployments, permission errors and input guards');
