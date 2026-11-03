// Optional nonblocking GPU measurements. Unsupported/disjoint queries are
// ignored; gameplay never waits on the GPU or reads an unfinished result.
export function createGpuTimer(){
 let gl,ext,current,pending=[],count=0,index=0;const samples=new Float32Array(240);
 const api={enabled:false,
  begin(renderer){
   if(!api.enabled)return;
   if(!gl){gl=renderer.getContext();ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');}
   if(!ext||!gl.createQuery||gl.isContextLost())return;
   const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);
   while(pending.length){
    const query=pending[0];if(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))break;
    pending.shift();const time=gl.getQueryParameter(query,gl.QUERY_RESULT);gl.deleteQuery(query);
    if(!disjoint){samples[index]=time/1e6;index=(index+1)%samples.length;count=Math.min(count+1,samples.length);}
   }
   if(disjoint){for(const q of pending)gl.deleteQuery(q);pending=[];return;}
   if(pending.length>=4)return;
   current=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,current);
  },
  end(){if(current){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(current);current=null;}},
  reset(){count=index=0;},
  report(){const a=Array.from(samples.slice(0,count)).sort((a,b)=>a-b);return {supported:!!ext,samples:count,medianMs:a[Math.floor(count*.5)]||0,p95Ms:a[Math.min(count-1,Math.floor(count*.95))]||0};}
 };
 return api;
}
