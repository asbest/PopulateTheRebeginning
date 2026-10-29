export function createControlTutorial(state,storage){
    const key='rebeginning_controls_tutorial_v1';
    const steps=[
        ['Select your Shaman','Click or tap your Shaman’s portrait in the left panel. You can also select her directly in the world.'],
        ['Move the camera','Drag across the landscape to move the camera. On a touchscreen, drag with one finger.'],
        ['Zoom in or out','Scroll the mouse wheel, or pinch with two fingers. A close zoom lets you enter first-person view.'],
        ['Give a move order','With your Shaman selected, right-click nearby land. On touchscreens, tap the ground with Move selected. Watch the golden destination marker.'],
        ['Choose a spell','Select your Shaman again if needed. Click or tap Heal in the right panel. Hold an icon to see its name.'],
        ['Cast Heal','Click or tap nearby ground inside the range circle. The spell activates when you choose its target.'],
        ['You are ready','Use the left panel to select units and the right panel for their actions. Open Controls / Help to replay this introduction at any time.']
    ];
    let root,step=0,baseline,highlight;
    const allowed=()=>!new URLSearchParams(location.search).has('test')||new URLSearchParams(location.search).has('tutorial');
    function clearHighlight(){highlight?.classList.remove('tutorial-highlight');highlight=null;}
    function finish(){storage.setItem(key,'done');clearHighlight();root?.remove();root=null;window.updateContextMenus();}
    function paint(){
        baseline={x:state.cameraLookAt.x,z:state.cameraLookAt.z,zoom:state.viewScale};
        root.querySelector('h2').textContent=steps[step][0];root.querySelector('p').textContent=steps[step][1];
        root.querySelector('small').textContent=step===6?'Introduction complete':`Controls · ${step+1} / 6`;
        root.querySelector('button').textContent=step===6?'Finish':'Skip introduction';clearHighlight();
    }
    function start(replay=false){
        if(!replay&&(!allowed()||storage.getItem(key)))return;
        if(root){clearHighlight();root.remove();root=null;}
        if(!storage.getItem(key))storage.setItem(key,'seen');
        document.getElementById('help-overlay').style.display='none';document.getElementById('story-overlay').style.display='none';
        document.getElementById('pause-menu').style.display='none';state.isPaused=false;
        document.getElementById('btn-pause').textContent='⏸️';
        state.selectedUnits.forEach(u=>u.selectRing.visible=false);state.selectedUnits=[];state.selectedBuilding=null;
        window.selectAction('move');window.updateContextMenus();window.updateUnitListSelection();
        root=document.createElement('section');root.id='control-tutorial';root.setAttribute('aria-label','Interactive controls introduction');
        root.innerHTML='<small></small><h2></h2><p aria-live="polite"></p><button type="button"></button>';
        root.querySelector('button').onclick=finish;document.body.appendChild(root);step=0;paint();
    }
    function advance(){if(root&&step<6){step++;paint();}}
    function update(){
        if(!root)return;
        root.hidden=state.isPaused;
        if(root.hidden){clearHighlight();return;}
        const selected=state.selectedUnits.some(u=>u===state.shaman&&u.state!=='dead');
        if(step===0&&selected)advance();
        else if(step===1&&Math.hypot(state.cameraLookAt.x-baseline.x,state.cameraLookAt.z-baseline.z)>1)advance();
        else if(step===2&&Math.abs(state.viewScale-baseline.zoom)>.5)advance();
        else if(step===4&&selected&&state.currentAction==='heal')advance();
        const selector=step===0?`.unit-item[data-unit-id="${state.shaman?.id}"]`:step===4?'#btn-heal':null;
        const element=selector?document.querySelector(selector):null;
        if(element!==highlight){clearHighlight();highlight=element;highlight?.classList.add('tutorial-highlight');}
    }
    function notify(action,units){if(!root)return;
        if(step===3&&action==='move'&&units?.includes(state.shaman))advance();
        else if(step===5&&action==='heal'&&units?.includes(state.shaman))advance();
    }
    return {start,update,notify,get active(){return !!root;},get step(){return step;}};
}
