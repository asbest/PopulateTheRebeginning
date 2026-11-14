// Long rendering tasks prevent both timers and image callbacks from running.
// Count responsive time so a blocked frame cannot declare the server offline
// before an already downloaded image gets its load callback.
export function loadDeadline(callback, milliseconds, {
    now=()=>performance.now(), schedule=setTimeout, cancel=clearTimeout
}={}) {
    let remaining=milliseconds, previous=now(), timer, stopped=false;
    const tick=()=>{
        if(stopped)return;
        const current=now();
        remaining-=Math.min(500,Math.max(0,current-previous));previous=current;
        if(remaining<=0){stopped=true;callback();}
        else timer=schedule(tick,Math.min(250,remaining));
    };
    timer=schedule(tick,Math.min(250,remaining));
    return ()=>{stopped=true;cancel(timer);};
}
