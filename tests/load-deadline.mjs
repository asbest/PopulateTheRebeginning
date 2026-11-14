import assert from 'node:assert/strict';
import {loadDeadline} from '../art/load-deadline.js';

let time=0, task, fired=0;
const clock={now:()=>time,schedule:callback=>{task=callback;return callback;},cancel:id=>{if(task===id)task=null;}};
const advance=milliseconds=>{time+=milliseconds;const callback=task;task=null;callback?.();};
const stop=loadDeadline(()=>fired++,5000,clock);
// A software-GPU stall must leave time for queued successful image callbacks.
advance(20000);assert.equal(fired,0);
stop();advance(250);assert.equal(fired,0);
loadDeadline(()=>fired++,5000,clock);
for(let i=0;i<19;i++)advance(250);
assert.equal(fired,0);advance(250);assert.equal(fired,1);assert.equal(task,null);
console.log('PASS Asset deadlines survive blocked rendering, cancel on load and expire for genuinely stalled requests');
