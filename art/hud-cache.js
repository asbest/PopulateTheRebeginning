export function createHudCache(document){
    const elements=new Map();
    function get(id){let e=elements.get(id);if(!e?.isConnected){e=document.getElementById(id);if(e)elements.set(id,e);}return e;}
    function text(id,value){const e=get(id);if(e&&e.textContent!==value)e.textContent=value;}
    return {get,text};
}
