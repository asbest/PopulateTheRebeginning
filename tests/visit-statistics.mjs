import assert from 'node:assert/strict';
import {createVisitStatistics,visitCounterKeys,countProductionVisit} from '../art/visit-statistics.js';

const date=new Date('2026-11-01T12:00:00Z');
assert.match(visitCounterKeys(new Date('2027-01-01T12:00:00Z')).week,/-week-2026-53$/);
assert.match(visitCounterKeys(new Date('2024-12-30T12:00:00Z')).week,/-week-2025-01$/);
assert.match(visitCounterKeys(date).month,/-month-2026-11$/);
for(const href of ['http://localhost:8765/PopulateTheRebeginning.html',
    'https://asbest.github.io/PopulateTheRebeginning/?test=1','https://other.example/PopulateTheRebeginning/',
    'https://asbest.github.io/unrelated/','file:///game/PopulateTheRebeginning.html'])
    assert.equal(countProductionVisit({href}),false,href);
assert.equal(countProductionVisit({href:'https://asbest.github.io/PopulateTheRebeginning/'}),true);
assert.equal(countProductionVisit({href:'https://asbest.github.io/PopulateTheRebeginning/PopulateTheRebeginning.html'}),true);

let clock=date,calls=[],last,mode='ok',stored=new Map(),values=new Map();
const storage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
const request=async(url,options)=>{
    calls.push({url,options});
    if(mode==='offline')throw new Error('offline');
    if(mode==='timeout')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true}));
    if(mode==='invalid')return {ok:true,status:200,json:async()=>({value:-1})};
    const key=url.split('/').at(-1),hit=url.includes('/hit/');
    if(mode==='partial'&&key.includes('-week-'))throw new Error('week blocked');
    if(mode==='missing')return {ok:false,status:404};
    const value=(values.get(key)||10)+(hit?1:0);values.set(key,value);
    return {ok:true,status:200,json:async()=>({value:String(value)})};
};
const client=createVisitStatistics({fetch:request,storage,now:()=>clock,timeoutMs:10,onChange:s=>{last=s;}});
const registration=client.start(true);assert.equal(client.refresh(),registration);await registration;await client.start(true);
assert.equal(calls.length,4);assert(calls.every(c=>c.url.includes('/hit/')));
assert.deepEqual(Object.values(last.values),[11,11,11,11]);
assert(calls.every(c=>c.options.credentials==='omit'&&c.options.referrerPolicy==='no-referrer'));
calls=[];const a=client.refresh(),b=client.refresh();assert.equal(a,b);await a;
assert.equal(calls.length,4);assert(calls.every(c=>c.url.includes('/get/')));
assert.deepEqual(Object.values(last.values),[11,11,11,11]);
console.log('PASS Production count is once per page; refresh is read-only and concurrent requests coalesce');

mode='offline';calls=[];await client.refresh();
assert.equal(calls.length,4);assert(Object.values(last.errors).every(Boolean));
assert.deepEqual(Object.values(last.values),[11,11,11,11]);assert.match(last.status,/unavailable/);
const restored=createVisitStatistics({fetch:request,storage,now:()=>clock,onChange:s=>{last=s;}});
await restored.start(false);assert.deepEqual(Object.values(last.values),[11,11,11,11]);
clock=new Date('2027-01-04T12:00:00Z');await restored.refresh();
assert.deepEqual(last.values,{total:11,year:null,month:null,week:null});
console.log('PASS Offline and reloaded counters preserve cached values without reusing stale period totals');

clock=date;mode='partial';await client.refresh();
assert.equal(last.errors.week,true);assert.equal(last.errors.total,false);assert.equal(last.values.week,11);
mode='invalid';await client.refresh();assert(Object.values(last.errors).every(Boolean));
mode='timeout';calls=[];await client.refresh();assert.equal(calls.length,4);assert(Object.values(last.errors).every(Boolean));
const failed=createVisitStatistics({fetch:request,now:()=>clock,timeoutMs:5});
calls=[];await failed.start(true);await failed.start(true);assert.equal(calls.length,4);
assert(calls.every(c=>c.url.includes('/hit/')));
mode='missing';await client.refresh();assert.deepEqual(Object.values(last.values),[0,0,0,0]);
assert(Object.values(last.errors).every(v=>!v));
console.log('PASS Partial failures, invalid responses, new periods, timeouts and no repeated increments');

calls=[];mode='ok';const blockedStorage={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('full');}};
const privateClient=createVisitStatistics({fetch:request,storage:blockedStorage,now:()=>date,onChange:s=>{last=s;}});
await privateClient.start(false);assert.equal(calls.length,0);assert.match(last.status,/not counted/);
await privateClient.refresh();assert.equal(calls.length,4);
const badCache=createVisitStatistics({fetch:request,storage:{getItem:()=> '42',setItem:()=>{}},now:()=>date});
await badCache.refresh();
console.log('PASS Local/test startups make no requests; blocked storage does not prevent statistics');
