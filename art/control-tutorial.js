export function createControlTutorial(state,storage,config){
    const key='rebeginning_controls_tutorial_v1';
    let root,step=0,baseline,highlight,steps,worker,school,dock,trainingSeen=false;
    const alive=u=>u&&u.faction===0&&u.state!=='dead'&&u.hp>0;
    const selected=u=>alive(u)&&state.selectedUnits.includes(u);
    const selectedWorker=()=>state.selectedUnits.find(u=>alive(u)&&u.type==='wild');
    const portrait=u=>u?`.unit-item[data-unit-id="${u.id}"]`:null;
    const workerPortrait=()=>portrait(state.units.find(u=>alive(u)&&u.type==='wild'));
    const builderHint=()=>workerPortrait()||(selected(state.shaman)?'#btn-create':portrait(state.shaman));
    const newBuilding=type=>state.buildings.find(b=>b.faction===0&&!b.dead&&b.type===type&&!baseline.buildings.has(b.id));
    const action=(id,title,text,check,target)=>({id,title,text,check,target});
    function lessons(){
        const costs=config.COSTS,trainingTime=config.BUILDING.TRAINING_TIME;
        const result=[
            action('select','Select your Shaman','Click or tap your Shaman’s portrait in the left panel. You can also select her directly in the world.',()=>selected(state.shaman),()=>portrait(state.shaman)),
            action('camera','Move the camera','Drag across the landscape to move the camera. On a touchscreen, drag with one finger.',()=>Math.hypot(state.cameraLookAt.x-baseline.x,state.cameraLookAt.z-baseline.z)>1),
            action('zoom','Zoom in or out','Scroll the mouse wheel, or pinch with two fingers. A close zoom lets you enter first-person view.',()=>Math.abs(state.viewScale-baseline.zoom)>.5),
            action('move','Give a move order','With your Shaman selected, right-click nearby land. On touchscreens, tap the ground with Move selected. Watch the golden destination marker.'),
            action('heal-icon','Choose a spell','Select your Shaman again if needed. Click or tap Heal in the right panel. Hold an icon to see its name and mana cost.',()=>selected(state.shaman)&&state.currentAction==='heal',()=>selected(state.shaman)?'#btn-heal':portrait(state.shaman)),
            action('heal','Cast Heal','Click or tap nearby ground inside the range circle. The spell activates when you choose its target.'),
            action('create-icon','Choose Create Brave',`Select your Shaman, then choose Create Brave in the right panel. A Brave is a worker. This spell costs ${costs.SPELLS.create} mana; wait for mana to regenerate if needed.`,()=>selected(state.shaman)&&state.currentAction==='create',()=>selected(state.shaman)?'#btn-create':portrait(state.shaman)),
            action('create-worker','Create a worker','Click or tap dry land inside the Shaman’s range circle. Wait for the spell to finish: a new worker will appear.',()=>{const u=state.units.find(u=>alive(u)&&u.type==='wild'&&!baseline.units.has(u.id));if(u)worker=u;return !!u;}),
            action('select-worker','Select your worker','Click or tap the new worker’s portrait on the left. The right panel now shows buildings instead of the Shaman’s spells.',()=>{const u=selectedWorker();if(u)worker=u;return !!u;},()=>portrait(alive(worker)?worker:state.units.find(u=>alive(u)&&u.type==='wild'))),
            action('warrior-icon','Choose a Warrior Training Hut',`With a worker selected, choose Warrior Training Hut in the right panel. It costs ${costs.BUILDING.warrior} mana.`,()=>{const u=selectedWorker();if(u)worker=u;return !!u&&state.currentAction==='build_warrior';},()=>selectedWorker()?'#btn-build_warrior':builderHint()),
            action('place-warrior','Place the training hut','Click or tap clear, dry land within 10 world units of a worker. Leave space between buildings so people can pass. Invalid sites do not place a building.',()=>{const b=newBuilding('warrior');if(b)school=b;return !!b;}),
            action('finish-warrior','Wait for construction','Wait for your Warrior Training Hut to finish. Scaffolding disappears when it is ready. Other training huts produce Firewarriors, Preachers or Spies.',()=>{if(school?.dead)school=newBuilding('warrior');return school&&!school.dead&&!school.underConstruction;}),
            action('send-trainee','Send a worker inside','Select a worker and right-click the completed Warrior Training Hut. On touchscreens, selecting the worker activates Move; tap the hut. Standing nearby does not train anyone: give an explicit order onto the hut.',()=>{const u=state.units.find(u=>alive(u)&&u.type==='wild'&&u.aiTrainingTarget===school?.id);if(u)worker=u;return !!u;},()=>selectedWorker()?null:builderHint()),
            action('finish-training','Watch the training progress',`The worker enters the hut and is used for training. Watch the progress bar above it: after ${trainingTime} seconds a Warrior emerges. The new Warrior has a different portrait and combat actions.`,()=>{trainingSeen ||= !!school?.trainingQueue?.some(t=>t.type==='warrior'&&t.faction===0);return trainingSeen&&state.units.some(u=>alive(u)&&u.type==='warrior'&&!baseline.units.has(u.id));})
        ];
        if(!state.matchSettings.noFlyers)result.push(
            action('another-worker','Select another builder','Training uses up the worker. Select another worker to build a Shipyard. If none remain, select your Shaman and cast Create Brave again, then select the new worker.',()=>{const u=selectedWorker();if(u)worker=u;return !!u;},builderHint),
            action('dock-icon','Choose a Shipyard',`Choose Shipyard in the worker’s right panel. It costs ${costs.BUILDING.shipyard} mana. Despite its name, place it on dry land.`,()=>!!selectedWorker()&&state.currentAction==='build_shipyard',()=>selectedWorker()?'#btn-build_shipyard':builderHint()),
            action('place-dock','Place the Shipyard','Click or tap a clear, dry site within 10 world units of a worker. Keep a walking gap from the training hut and other buildings.',()=>{const b=newBuilding('shipyard');if(b)dock=b;return !!b;}),
            action('finish-dock','Wait for the Shipyard','Wait until construction is complete. A Shipyard that is still under construction cannot produce an Airship.',()=>{if(dock?.dead)dock=newBuilding('shipyard');return dock&&!dock.dead&&!dock.underConstruction;}),
            action('ship-icon','Choose an Airship',`Select a worker again and choose Airship in the right panel. Each Airship costs ${costs.AIRSHIP} mana and needs a completed friendly Shipyard nearby.`,()=>!!selectedWorker()&&state.currentAction==='build_airship',()=>selectedWorker()?'#btn-build_airship':builderHint()),
            action('place-ship','Build your Airship','Click or tap dry land within 10 world units of a worker and less than 50 world units from your finished Shipyard. The Airship appears above the ground; select its portrait to control it.',()=>state.units.some(u=>alive(u)&&u.type==='airship'&&!baseline.units.has(u.id)))
        );
        result.push(action('complete','You are ready',state.matchSettings.noFlyers?
            'You can now create workers, build and train Warriors. Airships are disabled by No Flyers in Match Settings. Enable airships there and replay this introduction from Controls / Help to practise building them.':
            'You can now create workers, build training huts, train Warriors and build Airships. Use the left panel to select units and the right panel for their actions. Replay this introduction from Controls / Help at any time.'));
        return result;
    }
    const allowed=()=>!new URLSearchParams(location.search).has('test')||new URLSearchParams(location.search).has('tutorial');
    function clearHighlight(){highlight?.classList.remove('tutorial-highlight');highlight=null;}
    function finish(){storage.setItem(key,'done');clearHighlight();root?.remove();root=null;window.updateContextMenus();}
    function paint(){
        baseline={x:state.cameraLookAt.x,z:state.cameraLookAt.z,zoom:state.viewScale,
            units:new Set(state.units.map(u=>u.id)),buildings:new Set(state.buildings.map(b=>b.id))};
        root.querySelector('h2').textContent=steps[step].title;root.querySelector('p').textContent=steps[step].text;
        root.querySelector('small').textContent=step===steps.length-1?'Introduction complete':`Controls · ${step+1} / ${steps.length-1}`;
        root.querySelector('button').textContent=step===steps.length-1?'Finish':'Skip introduction';root.scrollTop=0;clearHighlight();
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
        worker=school=dock=null;trainingSeen=false;steps=lessons();
        root=document.createElement('section');root.id='control-tutorial';root.setAttribute('aria-label','Interactive controls introduction');
        root.innerHTML='<small></small><h2></h2><p aria-live="polite"></p><button type="button"></button>';
        root.querySelector('button').onclick=finish;document.body.appendChild(root);step=0;paint();
    }
    function advance(){if(root&&step<steps.length-1){step++;paint();}}
    function update(){
        if(!root)return;
        root.hidden=state.isPaused;
        if(root.hidden){clearHighlight();return;}
        if(steps[step].check?.())advance();
        const selector=steps[step].target?.();
        const element=selector?document.querySelector(selector):null;
        if(element!==highlight){clearHighlight();highlight=element;highlight?.classList.add('tutorial-highlight');}
    }
    function notify(action,units){if(!root)return;
        if(steps[step].id==='move'&&action==='move'&&units?.includes(state.shaman))advance();
        else if(steps[step].id==='heal'&&action==='heal'&&units?.includes(state.shaman))advance();
    }
    return {start,update,notify,get active(){return !!root;},get step(){return step;}};
}
