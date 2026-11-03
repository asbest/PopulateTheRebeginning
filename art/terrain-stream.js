// Bounded speculative preparation. Urgent terrain and all deformation keep the
// original synchronous path, including when Workers are blocked or stall.
export function createTerrainStream({snapshot,version,makeWorker,now=()=>performance.now()}){
 let worker,disabled=false,revision,sequence=0;
 const pending=new Map(),ready=new Map();
 const stats={workerJobs:0,completed:0,stale:0,failures:0,lastFailure:null,consumed:0,pending:0,ready:0};
 const sizes=()=>{stats.pending=pending.size;stats.ready=ready.size;};
 function clear(){pending.clear();ready.clear();revision=version();sizes();}
 function stop(reason='disabled'){worker?.terminate();worker=null;disabled=true;stats.failures++;stats.lastFailure=String(reason);clear();}
 function sync(){if(revision!==version())clear();}
 function start(){
  if(disabled)return false;if(worker)return true;
  try{
   worker=makeWorker();worker.onerror=event=>stop(event.message||'worker error');worker.onmessageerror=()=>stop('message error');
   worker.onmessage=({data})=>{
    sync();const job=[...pending.values()].find(j=>j.id===data.id);
    if(!job){stats.stale++;return;}
    if(data.error){stop(data.error);return;}
    const arrays=data.arrays,n=job.count;
    if(!arrays||!['position','normal','color','pattern','foam','depth'].every(name=>
     ArrayBuffer.isView(arrays[name])&&arrays[name].length===n*({position:3,normal:3,color:3,pattern:4}[name]||1))){stop('invalid arrays');return;}
    pending.delete(job.key);ready.set(job.key,data.arrays);stats.completed++;
    while(ready.size>8)ready.delete(ready.keys().next().value);
    sizes();
   };
   return true;
  }catch(error){stop(error);return false;}
 }
 return {stats,clear,disable:stop,get enabled(){return !disabled;},
  take(cx,cz){sync();const key=`${cx},${cz}`,data=ready.get(key);if(data){ready.delete(key);stats.consumed++;sizes();}return data;},
  prepare(cx,cz){
   sync();if(!start())return false;
   for(const j of pending.values())if(now()-j.start>3000){stop('timeout');return false;}
   const key=`${cx},${cz}`;
   if(!pending.has(key)&&!ready.has(key)&&pending.size<2){
    try{const id=++sequence,env=snapshot(cx,cz);pending.set(key,{key,id,start:now(),count:(env.CHUNK_RES+1)**2});
     worker.postMessage({id,cx,cz,env},[env.heightKeys,env.heightValues].filter(Boolean).map(a=>a.buffer));stats.workerJobs++;sizes();
    }catch(error){stop(error);return false;}
   }
   return true;
  },
  retain(keys){for(const key of ready.keys())if(!keys.has(key))ready.delete(key);sizes();}
 };
}
