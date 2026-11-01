// Original HTTP client. No provider SDK or third-party script is loaded.
export const VISIT_COUNTER_BASE='https://countapi.mileshilliard.com/api/v1';
export const VISIT_COUNTER_PREFIX='ptr-asbest-1123789879-global-20261101';
export function visitCounterKeys(now=new Date(),prefix=VISIT_COUNTER_PREFIX){
    const year=now.getUTCFullYear(),month=String(now.getUTCMonth()+1).padStart(2,'0');
    const thursday=new Date(Date.UTC(year,now.getUTCMonth(),now.getUTCDate()));
    thursday.setUTCDate(thursday.getUTCDate()+4-(thursday.getUTCDay()||7));
    const weekYear=thursday.getUTCFullYear();
    const week=Math.ceil(((thursday-Date.UTC(weekYear,0,1))/86400000+1)/7);
    return {total:`${prefix}-total`,year:`${prefix}-year-${year}`,
        month:`${prefix}-month-${year}-${month}`,week:`${prefix}-week-${weekYear}-${String(week).padStart(2,'0')}`};
}
export function countProductionVisit(location){
    const url=new URL(location.href);
    return url.hostname==='asbest.github.io'&&/^\/PopulateTheRebeginning(?:\/|$)/i.test(url.pathname)&&
        !url.searchParams.has('test');
}
export function createVisitStatistics({fetch:request=globalThis.fetch,storage,now=()=>new Date(),
    timeoutMs=6000,prefix=VISIT_COUNTER_PREFIX,onChange=()=>{}}={}){
    let pending=null,started=false,cache={};
    try{cache=JSON.parse(storage?.getItem('global-visit-statistics-v2')||'{}')||{};}catch{}
    if(typeof cache!=='object'||Array.isArray(cache))cache={};
    const snapshot={values:{total:null,year:null,month:null,week:null},errors:{},status:''};
    const notify=()=>onChange({values:{...snapshot.values},errors:{...snapshot.errors},status:snapshot.status});
    const cached=keys=>{
        for(const [field,key] of Object.entries(keys))snapshot.values[field]=Number.isSafeInteger(cache[key])&&cache[key]>=0?cache[key]:null;
    };
    async function counter(key,increment){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),timeoutMs);
        try{
            const response=await request(`${VISIT_COUNTER_BASE}/${increment?'hit':'get'}/${encodeURIComponent(key)}`,
                {cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
            if(!increment&&response.status===404)return 0; // A new period has no visits yet.
            if(!response.ok)throw new Error(`Counter HTTP ${response.status}`);
            const data=await response.json(),raw=data?.value;
            if(!((typeof raw==='number')||(typeof raw==='string'&&/^\d+$/.test(raw))))throw new Error('Invalid counter response');
            const value=Number(raw);
            if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid counter value');
            return value;
        }finally{clearTimeout(timer);}
    }
    function load(increment){
        if(pending)return pending;
        const keys=visitCounterKeys(now(),prefix);cached(keys);
        snapshot.errors={};snapshot.status=increment?'Recording this page load…':'Updating global page loads…';notify();
        pending=(async()=>{
            const entries=Object.entries(keys);
            // Never retry a hit: a lost response may already have incremented it.
            const results=await Promise.allSettled(entries.map(([,key])=>counter(key,increment)));
            let failures=0;
            for(let i=0;i<entries.length;i++){
                const [field,key]=entries[i],result=results[i];
                snapshot.errors[field]=result.status==='rejected';
                if(result.status==='fulfilled')cache[key]=snapshot.values[field]=result.value;
                else failures++;
            }
            // Retain only the current period and total; old cache entries are unnecessary.
            cache=Object.fromEntries(Object.values(keys).filter(key=>Number.isSafeInteger(cache[key])).map(key=>[key,cache[key]]));
            try{storage?.setItem('global-visit-statistics-v2',JSON.stringify(cache));}catch{}
            snapshot.status=failures?(failures===4?'Counter unavailable or blocked.':'Some counters are unavailable.')+
                ' Previously loaded values are shown where available. Refresh to try reading again.'
                :'Global page loads since 1 November 2026. Periods use UTC. Refresh does not add visits.';
            notify();return snapshot;
        })().finally(()=>{pending=null;});
        return pending;
    }
    return {
        refresh:()=>load(false),
        start(production){
            if(started)return pending||Promise.resolve(snapshot);
            started=true;
            if(production)return load(true);
            cached(visitCounterKeys(now(),prefix));
            snapshot.errors={total:true,year:true,month:true,week:true};
            snapshot.status='Local and test starts are not counted. Refresh to view global page loads.';notify();
            return Promise.resolve(snapshot);
        }
    };
}
