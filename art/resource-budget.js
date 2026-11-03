// One indivisible preparation step per frame. Downloads/transcoding may run in
// parallel; GPU work stays in the game's context and yields to busy frames.
export function createResourceBudget({now=()=>performance.now(),schedule=cb=>requestAnimationFrame(cb)}={}){
 const jobs=new Map();let scheduled=false,loading=true,paused=true,cost=0,backoff=0,combat=false;
 const stats={queued:0,completed:0,deferred:0,errors:0,maxStepMs:0,lastStepMs:0};
 function arm(){if(!scheduled&&jobs.size){scheduled=true;schedule(pump);}}
 function pump(){
  scheduled=false;
  if(!jobs.size)return;
  if(!loading&&!paused&&(cost>22||backoff>0)){if(backoff)backoff--;stats.deferred++;arm();return;}
  let first,priority=Infinity;
  for(const job of jobs.values()){const value=typeof job.priority==='function'?job.priority():job.priority;if(value<priority){first=job;priority=value;}}
  if(combat&&!loading&&!paused&&priority>0){stats.deferred++;arm();return;}
  jobs.delete(first.key);stats.queued=jobs.size;const start=now();
  try{first.resolve(first.run());stats.completed++;}catch(error){stats.errors++;first.reject(error);}
  const elapsed=now()-start;stats.lastStepMs=elapsed;stats.maxStepMs=Math.max(stats.maxStepMs,elapsed);
  backoff=Math.min(60,Math.max(0,Math.ceil(elapsed/2)-1));arm();
 }
 return {stats,
  enqueue(key,run,priority=1){
   if(jobs.has(key))return jobs.get(key).promise;
   let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
   jobs.set(key,{key,run,priority,promise,resolve,reject});stats.queued=jobs.size;arm();return promise;
  },
  cancel(key){const job=jobs.get(key);if(!job)return; jobs.delete(key);stats.queued=jobs.size;job.resolve(false);},
  frame(cpuMs,isPaused,isLoading=false,inCombat=false){cost=cpuMs;paused=isPaused;loading=isLoading;combat=inCombat;arm();},
  setLoading(value){loading=value;arm();}
 };
}
