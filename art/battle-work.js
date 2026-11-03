// Budget only decisions/path searches. Physics, attacks and animation never skip
// a timestep. The caller supplies the existing exact pathfinder and Worker.
export function createBattleWork({state,worker,findPath,walkable,treeConflict,makePath,version,enemy=()=>true}){
    const queue=new Map(),pending=new Map(),completed=new Map();
    const stats={searches:0,deferredSearches:0,paths:0,workerPaths:0,fallbackPaths:0,stale:0,queued:0,pending:0};
    let active=false,searchBudget=Infinity,sequence=0;
    const valid=job=>state.network?.role!=='client'&&state.units.includes(job.unit)&&job.unit.state==='combat'&&job.unit.attackTarget===job.target&&
        job.unit.faction===job.faction&&job.target.state!=='dead'&&!job.target.dead&&enemy(job.unit,job.target);
    function request(unit,target){
        const existing=pending.get(unit);
        if(existing&&existing.target===target)return;
        if(completed.get(unit)?.job.target===target)return;
        if(existing){clearTimeout(existing.timeout);pending.delete(unit);}
        completed.delete(unit);
        queue.set(unit,{unit,target,faction:unit.faction});
    }
    function apply(job,path){
        if(!valid(job)||job.version!==version()||job.unit.mesh.position.distanceTo(job.origin)>3||
            job.target.mesh.position.distanceTo(job.goal)>2.5){stats.stale++;return;}
        if(path===null){job.unit.state='idle';job.unit.attackTarget=null;job.unit.path=[];return;}
        job.unit.path=path;job.unit.pathIndex=0;job.unit.pathTimer=0;
        job.unit.lastCombatPathTarget=job.goal.clone();job.unit.lastCombatTargetId=job.target.id;
    }
    function flush(){
        let count=0;const start=performance.now();
        for(const [unit,result]of completed){
            if(count>=3||count&&performance.now()-start>3)break;
            completed.delete(unit);count++;
            const {job,raw}=result;
            if(!valid(job)||job.version!==version()){stats.stale++;continue;}
            const path=makePath(raw);
            if(path&&treeConflict(job.origin,path,job.goal)){queue.set(unit,{...job,sync:true});continue;}
            stats.workerPaths++;apply(job,path);
        }
        for(const [unit,job]of queue){
            if(count>=3||count&&performance.now()-start>3)break;
            if(!worker.canAccept()&&!job.sync)continue;
            if(pending.has(unit))continue;
            queue.delete(unit);if(!valid(job))continue;
            job.version=version();job.origin=unit.mesh.position.clone();job.goal=job.target.mesh.position.clone();job.sequence=++sequence;
            const flying=unit.type==='airship',avoid=unit.faction!==0&&!flying&&!unit.aiWaterEscape;
            const synchronous=()=>findPath(job.origin,job.goal,flying,unit.height,avoid,!!unit.aiWaterEscape);
            count++;stats.paths++;
            if(walkable(job.origin,job.goal,flying,unit.height,avoid)){
                apply(job,[job.goal.clone()]);continue;
            }
            if(job.sync){stats.fallbackPaths++;apply(job,synchronous());continue;}
            pending.set(unit,job);
            const accepted=worker.request(job.origin,job.goal,flying,avoid,!!unit.aiWaterEscape,(raw,fallback)=>{
                if(pending.get(unit)!==job)return;
                clearTimeout(job.timeout);pending.delete(unit);
                if(!valid(job)||job.version!==version()){stats.stale++;return;}
                if(fallback){queue.set(unit,{...job,sync:true});return;}
                completed.set(unit,{job,raw});
            });
            if(!accepted){pending.delete(unit);stats.fallbackPaths++;apply(job,synchronous());}
            else if(pending.get(unit)===job)job.timeout=setTimeout(()=>{
                if(pending.get(unit)!==job)return;
                pending.delete(unit);queue.set(unit,{...job,sync:true});
            },500);
        }
        stats.queued=queue.size+completed.size;stats.pending=pending.size;
    }
    return {stats,request,get active(){return active;},
        begin(){active=true;searchBudget=state.units.length>=32?8:Infinity;stats.searches=stats.deferredSearches=stats.paths=0;flush();},
        end(){active=false;searchBudget=Infinity;},
        canSearch(){if(!active)return true;if(searchBudget<=0){stats.deferredSearches++;return false;}searchBudget--;stats.searches++;return true;},
        flush,
        clear(){queue.clear();completed.clear();for(const job of pending.values())clearTimeout(job.timeout);pending.clear();stats.queued=stats.pending=0;}
    };
}

export function createBattleProfiler(){
    const names=['frame','physics','simulation','render','other'],size=240;
    const samples=Object.fromEntries(names.map(n=>[n,new Float32Array(size)]));
    let count=0,index=0,started=0,current={};
    return {
        begin(){started=performance.now();current.physics=current.simulation=current.render=0;},
        add(name,time){current[name]=(current[name]||0)+time;},
        end(){current.frame=performance.now()-started;current.other=Math.max(0,current.frame-current.physics-current.simulation-current.render);for(const n of names)samples[n][index]=current[n]||0;index=(index+1)%size;count=Math.min(size,count+1);},
        reset(){count=index=0;},
        report(){return Object.fromEntries(names.map(n=>{const a=Array.from(samples[n].slice(0,count)).sort((a,b)=>a-b);return[n,{samples:count,medianMs:a[Math.floor(count*.5)]||0,p95Ms:a[Math.min(count-1,Math.floor(count*.95))]||0}];}));}
    };
}
