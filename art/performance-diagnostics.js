import {ASSET_REVISION} from './asset-revisions.js';

export function createPerformanceDiagnostics({state,profiler,gpu,pause,resume}){
    let panel,output,status,startButton,copyButton,banner,running=false,started=0,last=0,previousGpu=false,report=null;
    const samples={},intervals=[];
    const names=['frame','physics','simulation','ai','units','buildings','batching','render','other'];
    function controls(){
        if(panel)return;
        panel=document.createElement('div');panel.id='performance-diagnostics';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Performance diagnostics');
        panel.style.cssText='display:none;position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.9);color:white;overflow:auto;padding:20px;box-sizing:border-box;';
        const body=document.createElement('div');body.style.cssText='max-width:760px;margin:auto;';panel.append(body);
        const title=document.createElement('h2');title.textContent='Performance diagnostics';body.append(title);
        const info=document.createElement('p');info.textContent='Record 15 seconds of normal gameplay. Move the camera or enter the situation that runs slowly. The game pauses when recording ends. No graphics settings are changed.';body.append(info);
        status=document.createElement('p');status.setAttribute('role','status');body.append(status);
        const button=(id,label,action)=>{const b=document.createElement('button');b.id=id;b.className='menu-btn';b.textContent=label;b.onclick=action;body.append(b);return b;};
        startButton=button('btn-diagnostics-start','Record 15 seconds',start);
        copyButton=button('btn-diagnostics-copy','Copy report',copy);copyButton.disabled=true;
        button('btn-diagnostics-close','Back',()=>{panel.style.display='none';});
        output=document.createElement('textarea');output.id='diagnostics-report';output.readOnly=true;output.setAttribute('aria-label','Diagnostic report');output.style.cssText='display:block;width:100%;height:48vh;box-sizing:border-box;background:#151515;color:white;font:12px monospace;';body.append(output);
        document.body.append(panel);
        banner=document.createElement('div');banner.style.cssText='display:none;position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:190;background:#111c;color:white;padding:8px;pointer-events:none;';document.body.append(banner);
    }
    function open(){controls();panel.style.display='block';status.textContent=report?'Report ready. Copy it to share the measurements.':'No recording yet.';}
    function start(){
        if(running)return;controls();report=null;output.value='';copyButton.disabled=true;
        for(const name of names)samples[name]=[];intervals.length=0;started=last=performance.now();
        previousGpu=gpu.enabled;gpu.reset();gpu.enabled=true;running=true;panel.style.display='none';banner.textContent='Recording diagnostics… 15s';banner.style.display='block';resume();
    }
    function summary(values){if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b);return {medianMs:+sorted[Math.floor(sorted.length*.5)].toFixed(2),p95Ms:+sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))].toFixed(2)};}
    function finish(reason){
        if(!running)return;running=false;banner.style.display='none';const elapsed=performance.now()-started,renderer=state.renderer;
        const gpuResult=gpu.report();gpu.enabled=previousGpu;
        let adapter=null;
        try{const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');adapter=gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER);}catch{}
        const cpu={};for(const name of names)cpu[name]=summary(samples[name]);
        report={revision:ASSET_REVISION,recordedAt:new Date().toISOString(),reason,durationSeconds:+(elapsed/1000).toFixed(2),frames:intervals.length,
            fps:intervals.length?+(intervals.length*1000/intervals.reduce((sum,n)=>sum+n,0)).toFixed(1):null,
            frameIntervals:summary(intervals),cpu,gpu:gpuResult.supported&&gpuResult.samples?gpuResult:{available:false,reason:'GPU timing unavailable or no completed samples'},
            graphics:{...state.graphicsQuality,width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles},
            scene:{units:state.units.length,buildings:state.buildings.length,chunks:Object.keys(state.chunks).length,tutorialActive:!!state.controlTutorial?.active},
            environment:{userAgent:navigator.userAgent,cores:navigator.hardwareConcurrency||null,memoryGB:navigator.deviceMemory||null,webgl2:!!renderer.capabilities.isWebGL2,adapter},
            notes:['CPU render includes driver waits and batching; it is not GPU execution time.','AI, units and buildings are parts of simulation; batching is part of rendering. Do not add overlapping timings.','Normal gameplay only; paused/hidden frames end the recording. No automatic bottleneck diagnosis is inferred from FPS alone.']};
        pause();open();output.value=JSON.stringify(report,null,2);copyButton.disabled=false;
    }
    async function copy(){
        if(!report)return;const text=output.value;
        try{if(!navigator.clipboard?.writeText)throw Error('Clipboard API unavailable');await navigator.clipboard.writeText(text);status.textContent='Report copied.';}
        catch{output.focus();output.select();let copied=false;try{copied=document.execCommand('copy');}catch{}
            status.textContent=copied?'Report copied.':'Automatic copying is blocked. The report is selected; use Copy or long-press to copy it.';}
    }
    function sample(){
        if(!running)return;
        if(state.isPaused||document.hidden){finish(document.hidden?'Page hidden':'Paused early');return;}
        const now=performance.now();intervals.push(now-last);last=now;
        const progress=`Recording diagnostics… ${Math.max(0,Math.ceil((15000-now+started)/1000))}s`;
        if(banner.textContent!==progress)banner.textContent=progress;
        for(const name of names)samples[name].push(profiler.last[name]||0);
        if(now-started>=15000||intervals.length>=3600)finish('Completed');
    }
    document.addEventListener('visibilitychange',()=>{if(running&&document.hidden)finish('Page hidden');});
    return {open,start,sample,finish,get running(){return running;},get report(){return report;}};
}
