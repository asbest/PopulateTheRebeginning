// Original tribal character meshes. Shared geometry and atlas materials keep large armies affordable.
import {createBlenderPack} from './blender-pack.js';
// The public pivots match the gameplay rig; collision shapes and unit statistics are untouched.
export function createCharacters(T,art) {
    const blender=createBlenderPack(T);
    const cache = new Map(), materials = new Map();
    const hairCanvas=document.createElement('canvas');hairCanvas.width=hairCanvas.height=512;
    const hairContext=hairCanvas.getContext('2d');
    hairContext.fillStyle='#d6cbc0';hairContext.fillRect(0,0,512,512);
    for(let i=0;i<1100;i++) {
        const x=(i*127.13)%512,y=(i*283.71)%512;
        hairContext.strokeStyle=i%3===0?'rgba(49,43,39,.19)':'rgba(255,250,230,.18)';
        hairContext.lineWidth=i%7===0?2:1;
        hairContext.beginPath();hairContext.moveTo(x,y);hairContext.bezierCurveTo(x+3,y+12,x-4,y+28,x+2,y+46);hairContext.stroke();
    }
    const hairTexture=new T.CanvasTexture(hairCanvas);
    hairTexture.wrapS=hairTexture.wrapT=T.RepeatWrapping;
    hairTexture.encoding=T.sRGBEncoding;
    hairTexture.anisotropy=4;
    const tiles = {};
    let ready=blender.ready;
    function configureTextures(){
        for(const kind of ['skin','cloth']){
            const url=new URL(kind==='skin'?'./character-skin-v2.png':'./character-cloth.png',import.meta.url).href;
            tiles[kind]=art.loadTexture(url,{srgb:true,anisotropy:8});
            tiles[kind].userData={dedicated:true};
        }
        for(const material of materials.values()){
            const kind=material.userData.characterKind;
            if(tiles[kind]){
                material.map=tiles[kind];
                material.needsUpdate=true;
            }
        }
        ready=Promise.all([blender.ready,...Object.values(tiles).map(art.textureReady)]);
    }
    function mat(kind,color=0xffffff) {
        if(color===0xffffff&&kind==='leather')color=0x8d6443;
        if(color===0xffffff&&kind==='gold')color=0xc5a45f;
        const key=kind+'/'+color;
        if(!materials.has(key)) {
            const crafted=kind==='leather'?'leather':kind==='gold'?'bronze':null;
            const m=new T.MeshStandardMaterial({color,map:kind==='hair'?hairTexture:crafted?blender.texture(crafted,'map'):tiles[kind]||null,
                roughness:kind==='gold'?.39:kind==='skin'?.67:kind==='hair'?.79:.89,metalness:kind==='gold'?.72:0});
            m.color.convertSRGBToLinear();
            if(kind==='skin'||kind==='cloth'||crafted){
                const source=crafted||kind;
                m.normalMap=blender.texture(source,'normal');
                m.roughnessMap=blender.texture(source,'roughness');
                m.normalScale.setScalar(kind==='skin' ? .22 : crafted ? .32 : .3);
                m.roughness=1;
            } else if(tiles[kind]){m.bumpMap=tiles[kind];m.bumpScale=.003;}
            if(kind==='hair'){m.bumpMap=hairTexture;m.bumpScale=.012;}
            m.name='Tribal/'+kind+'/'+color; m.userData.characterKind=kind; materials.set(key,m);
        }
        return materials.get(key);
    }
    const skin=mat('skin',0xdccabf), leather=mat('leather'), gold=mat('gold'), bone=mat('cloth',0xe6d8ad), dark=mat('cloth',0x293744);
    const eye=mat('plain',0x172028), ivory=mat('plain',0xede0c2), lip=mat('skin',0x754b48);
    function geo(key,fn){if(!cache.has(key))cache.set(key,fn());return cache.get(key);}
    function mesh(parent,g,m,pos=[0,0,0],scale=[1,1,1],name='Detail') {
        const n=new T.Mesh(g,m);n.name=name;n.position.set(...pos);n.scale.set(...scale);n.castShadow=n.receiveShadow=true;
        parent.add(n);return n;
    }
    const oval=(p,pos,size,m,name)=>mesh(p,geo('oval',()=>new T.SphereGeometry(1,16,12)),m,pos,size,name);
    function loft(rings,segments=16) {
        if(rings[0][0]>rings[rings.length-1][0])rings=[...rings].reverse();
        const key='loft/'+JSON.stringify(rings)+'/'+segments;
        return geo(key,()=>{
            const positions=[],uv=[],indices=[];
            rings.forEach(([y,rx,rz,z=0],r)=>{for(let s=0;s<=segments;s++){
                const a=s/segments*Math.PI*2;positions.push(Math.sin(a)*rx,y,Math.cos(a)*rz+z);uv.push(s/segments,r/(rings.length-1));
                if(r&&s){const b=r*(segments+1)+s;indices.push(b,b-1,b-segments-2,b,b-segments-2,b-segments-1);}
            }});
            const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
        });
    }
    function tube(p,points,r,m,name='Braid') {
        const key='tube/'+JSON.stringify(points)+'/'+r;
        return mesh(p,geo(key,()=>new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),12,r,6,false)),m,[0,0,0],[1,1,1],name);
    }
    function band(p,y,rx,rz,m,height=.055) {return mesh(p,loft([[y-height/2,rx,rz],[y+height/2,rx,rz]]),m);}
    function cloth(p,points,m,name) {
        const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
        return mesh(p,geo('cloth/'+JSON.stringify(points),()=>{
            const g=new T.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.008,bevelThickness:.004,bevelSegments:1,steps:1});
            const uv=g.attributes.uv;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            for(let i=0;i<uv.count;i++){minX=Math.min(minX,uv.getX(i));minY=Math.min(minY,uv.getY(i));maxX=Math.max(maxX,uv.getX(i));maxY=Math.max(maxY,uv.getY(i));}
            for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-minX)/(maxX-minX||1),(uv.getY(i)-minY)/(maxY-minY||1));
            return g;
        }),m,[0,0,0],[1,1,1],name);
    }
    function factionPiece(n) {n.userData.characterFaction=true;return n;}
    function build(u,color) {
        const root=u.mesh, role=u.type, faction=mat('cloth',color), female=role==='shaman';
        root.userData.characterVersion=2;root.userData.characterRole=role;
        if(role==='airship'){
            const visual=new T.Group();visual.name='AirshipVisual';root.add(visual);
            airship(visual,faction);blender.attach(visual,'character/airship/root',color);
            u.airshipVisual=visual;
            return;
        }
        u.torso=new T.Group();u.torso.name='Torso';u.torso.position.y=.9;root.add(u.torso);
        const chest=role==='warrior'?.25:female?.185:.205;
        mesh(u.torso,loft([[-.27,.14,.095],[-.16,.145,.10],[-.02,chest*.85,.125],[.14,chest,.115],[.23,.13,.08],[.26,.07,.065]]),skin,[0,0,0],[1,1,1],'AnatomicalBody');
        if(role!=='warrior')factionPiece(mesh(u.torso,loft([[-.29,.17,.115],[-.17,.155,.12],[0,.205,.14],[.16,.22,.135],[.24,.10,.09]]),role==='spy'?dark:faction,[0,0,0],[1,1,1],'WovenTunic'));
        // Split robe panels allow the independent knee and hip animation to remain visible.
        const long=female||role==='firewarrior'||role==='preacher';
        for(const side of [-1,1]) {
            const panel=cloth(u.torso,[[side*.02,-.15],[side*.18,-.15],[side*(long?.27:.20),long?-.73:-.45],[side*.015,long?-.69:-.43]],faction,'SplitRobe');
            panel.position.z=.135;factionPiece(panel);
        }
        band(u.torso,-.17,.177,.146,leather,.095);band(u.torso,-.17,.183,.15,gold,.025);
        oval(u.torso,[0,-.17,.158],[.055,.043,.017],gold,'BeltMedallion');
        mesh(u.torso,loft([[.22,.071,.067],[.34,.069,.063]]),skin,[0,0,0],[1,1,1],'Neck');
        u.head=new T.Group();u.head.name='Head';u.head.position.y=.4;u.torso.add(u.head);
        mesh(u.head,loft([[-.14,.035,.045,.035],[-.115,.084,.07,.013],[-.04,.115,.09],[.035,.127,.095],[.10,.116,.097],[.15,.093,.08],[.17,.01,.012]]),skin,[0,0,0],[1,1,1],'SculptedFace');
        for(const side of [-1,1]) {
            oval(u.head,[side*.123,-.012,0],[.021,.035,.014],skin,'Ear');
            oval(u.head,[side*.046,.026,.087],[.023,.009,.006],ivory,'Eye');
            oval(u.head,[side*.045,.026,.092],[.008,.008,.004],eye,'Iris');
            tube(u.head,[[side*.022,.039,.084],[side*.049,.045,.099],[side*.073,.038,.083]],.0045,skin,'UpperEyelid');
            tube(u.head,[[side*.025,.052,.091],[side*.051,.055,.098],[side*.075,.048,.081]],.006,eye,'Brow');
            if(female||role==='warrior')oval(u.head,[side*.145,-.044,.014],[.013,.025,.009],gold,'Earring');
        }
        oval(u.head,[0,-.012,.101],[.017,.031,.019],skin,'NoseBridge');
        oval(u.head,[0,-.039,.114],[.021,.012,.012],skin,'NoseTip');
        oval(u.head,[0,-.079,.085],[.029,.005,.005],lip,'Mouth');
        u.hairMat=mat('hair',female?0xb94e21:0x2b211b).clone();
        u.hairMesh=mesh(u.head,geo('haircap',()=>new T.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.57)),u.hairMat,[0,.049,-.018],[.132,.14,.105],'Hair');
        for(const side of [-1,1])for(let i=0;i<(female?3:1);i++) {
            tube(u.head,[[side*(.095+i*.012),.12,-.03],[side*(.139+i*.013),.015,-.045],[side*(.13+i*.015),-.13,-.065],[side*(.15+i*.018),female?-.40:-.22,-.07]],female?.022:.017,u.hairMat);
            if(female)oval(u.head,[side*(.15+i*.018),-.37,-.07],[.025,.034,.027],gold,'BraidBead');
        }
        function limb(side,arm) {
            const g=new T.Group();g.name=arm?(side>0?'LeftArm':'RightArm'):(side>0?'LeftLeg':'RightLeg');
            g.position.set(side*(arm?.235:.10),arm?.13:.65,0);
            const len=arm?.25:.3,r=arm?(role==='warrior'?.074:.055):.076;
            mesh(g,loft([[0,r*.8,r*.85],[-len*.25,r,r],[-len*.8,r*.72,r*.78],[-len,r*.65,r*.65]]),skin,[0,0,0],[1,1,1],'UpperLimb');
            const lower=new T.Group();lower.name=arm?'Forearm':'Shin';lower.position.y=-len;g.add(lower);g.userData.lower=lower;
            mesh(lower,loft([[0,r*.69,r*.7],[-len*.3,r*.81,r*.77],[-len*.9,r*.45,r*.5],[-len,r*.44,r*.46]]),skin,[0,0,0],[1,1,1],'LowerLimb');
            if(arm){
                band(lower,-.15,r*.75,r*.77,leather,.11);band(lower,-.10,r*.8,r*.81,gold,.027);
                oval(lower,[0,-len-.031,.006],[.042,.056,.028],skin,'Hand');
                oval(lower,[side*.038,-len-.021,.02],[.016,.032,.016],skin,'Thumb');
                if(role==='firewarrior'||role==='spy'||role==='preacher')factionPiece(mesh(g,loft([[0,r*1.12,r*1.12],[-.20,r*.86,r*.89]]),faction,[0,0,0],[1,1,1],'Sleeve'));
            }else{
                factionPiece(mesh(g,loft([[0,r*1.13,r*1.13],[-.27,r*.85,r*.88]]),faction,[0,0,0],[1,1,1],'Trouser'));
                const ankle=new T.Group();ankle.name='Sandal';ankle.position.y=-len;lower.add(ankle);
                oval(ankle,[0,.01,.034],[.055,.032,.108],leather,'SandalMesh');
                band(lower,-.21,r*.67,r*.67,leather,.095);
            }
            return g;
        }
        u.armL=limb(1,true);u.armR=limb(-1,true);u.legL=limb(1,false);u.legR=limb(-1,false);
        u.torso.add(u.armL,u.armR);root.add(u.legL,u.legR);
        const robePanels=u.torso.children.filter(n=>n.name==='SplitRobe');
        robePanels.forEach((n,i)=>{(i===0?u.legR:u.legL).add(n);n.position.y=.27;n.position.x=i===0?.1:-.1;});
        // Hand-bound weapons follow the combat animation instead of floating beside the body.
        const hand=u.armR.userData.lower;
        if(female){
            root.scale.setScalar(1.5);
            const cape=cloth(u.torso,[[-.19,.17],[.19,.17],[.30,-.76],[.13,-.82],[-.23,-.73]],faction,'CeremonialCape');cape.position.z=-.155;cape.rotation.x=-.14;factionPiece(cape);
            band(u.head,.12,.135,.11,gold,.05);
            for(let i=-2;i<=2;i++){
                const feather=cloth(u.head,[[-.028,0],[.028,.05],[.025,.22],[0,.30],[-.02,.19]],i%2?bone:faction,'CrownFeather');feather.position.set(i*.045,.15,-.015);feather.rotation.z=-i*.24;if(!(i%2))factionPiece(feather);
            }
            tube(hand,[[0,-.30,.07],[0,.03,.08],[.015,.50,.08],[0,.82,.08]],.021,leather,'RitualStaff');
            const orb=oval(hand,[0,.79,.08],[.067,.075,.067],mat('plain',0x53d7dd),'StaffCrystal');orb.material.emissive.setHex(0x159fa8);orb.material.emissiveIntensity=.6;
            mesh(hand,geo('staffring',()=>new T.TorusGeometry(.105,.015,6,16)),gold,[0,.81,.08]);
            for(let i=0;i<7;i++)oval(u.torso,[(i-3)*.045,.13-Math.sin(i/6*Math.PI)*.11,.14],[.018,.023,.017],i%2?bone:gold,'RitualBeads');
        }else if(role==='warrior'){
            band(u.head,.095,.134,.11,gold,.065);
            for(const side of [-1,1])oval(u.torso,[side*.23,.11,0],[.11,.07,.13],leather,'ShoulderArmor');
            u.weaponGrip=new T.Group();u.weaponGrip.name='WeaponGrip';u.weaponGrip.position.set(0,-.28,.025);hand.add(u.weaponGrip);
            tube(u.weaponGrip,[[0,.04,0],[0,-.20,0],[0,-.42,0]],.029,leather,'WarClub');
            u.weaponTip=oval(u.weaponGrip,[0,-.42,0],[.085,.11,.072],gold,'ClubHead');
            for(let i=0;i<5;i++){const tooth=mesh(u.weaponGrip,geo('spike',()=>new T.ConeGeometry(.021,.09,6)),bone,[Math.sin(i*1.26)*.08,-.42,Math.cos(i*1.26)*.08]);tooth.rotation.z=-Math.PI/2;tooth.rotation.y=i*1.26;}
            u.shieldGrip=new T.Group();u.shieldGrip.name='ShieldGrip';u.shieldGrip.position.set(.055,-.14,.09);u.armL.userData.lower.add(u.shieldGrip);
            const shield=mesh(u.shieldGrip,geo('shield',()=>new T.CylinderGeometry(.18,.18,.045,20)),leather,[0,0,0]);shield.rotation.x=Math.PI/2;
            mesh(u.shieldGrip,geo('shieldrim',()=>new T.TorusGeometry(.18,.015,6,24)),gold,[0,0,.026]);
            oval(u.shieldGrip,[0,0,.032],[.048,.048,.025],gold,'ShieldBoss');
        }else if(role==='firewarrior'){
            const mask=cloth(u.head,[[-.10,.12],[.10,.12],[.12,-.02],[.055,-.12],[0,-.16],[-.055,-.12],[-.12,-.02]],gold,'RitualMask');mask.position.z=.105;
            for(const side of [-1,1])oval(u.head,[side*.045,.025,.128],[.024,.009,.005],eye,'MaskEyeSlit');
            for(let i=-1;i<=1;i++)tube(u.head,[[i*.065,.15,0],[i*.1,.27,-.012],[i*.12,.34,-.05]],.012,bone,'MaskCrown');
            oval(hand,[0,-.28,.025],[.04,.048,.04],gold,'FireFocus');
        }else if(role==='preacher'){
            band(u.head,.11,.14,.11,gold,.06);
            oval(u.torso,[0,.12,.17],[.075,.095,.028],gold,'FaithEmblem');
            tube(hand,[[0,-.28,.05],[0,.05,.05],[0,.34,.05]],.025,leather,'PreacherStaff');
            oval(hand,[0,.36,.05],[.09,.11,.055],gold,'PreacherStaffHead');
        }else if(role==='spy'){
            mesh(u.head,geo('hood',()=>new T.SphereGeometry(1,16,12,Math.PI*.30,Math.PI*1.4)),dark,[0,.012,-.035],[.16,.215,.16],'OpenHood');
            const scarf=cloth(u.head,[[-.11,-.025],[.11,-.025],[.075,-.145],[-.075,-.145]],faction,'FaceScarf');scarf.position.z=.116;factionPiece(scarf);
            const cape=cloth(u.torso,[[-.2,.16],[.2,.16],[.24,-.60],[-.17,-.65]],dark,'SpyCloak');cape.position.z=-.17;
            mesh(hand,geo('dagger',()=>new T.ConeGeometry(.025,.20,4)),gold,[0,-.05,.08],[1,1,.45],'Dagger');
        }else{
            oval(u.torso,[0,-.02,-.17],[.135,.18,.085],leather,'GatheringSatchel');
            for(const side of [-1,1])tube(u.torso,[[side*.12,.18,-.04],[side*.13,.02,.13],[side*.10,-.18,.12]],.016,leather,'SatchelStrap');
            band(u.head,.105,.13,.105,faction,.037).userData.characterFaction=true;
            tube(hand,[[0,-.28,.07],[0,.18,.08]],.025,leather,'StoneTool');oval(hand,[0,.19,.08],[.09,.065,.045],bone,'ToolHead');
        }
        for(const [part,pivot] of Object.entries({torso:u.torso,head:u.head,armL:u.armL,armR:u.armR,legL:u.legL,legR:u.legR})) {
            blender.attach(pivot,'character/'+role+'/'+part,color);
        }
        return root;
    }
    function airship(root,faction) {
        mesh(root,loft([[.05,.65,1],[.4,.85,1.2],[.7,.88,1.25]]),leather,[0,0,0],[1,1,1],'Gondola');
        oval(root,[0,4.5,0],[1.9,1.52,2.85],faction,'WovenBalloon').userData.characterFaction=true;
        for(const x of [-.8,.8])for(const z of [-1.1,1.1])tube(root,[[x,.6,z],[x*1.7,3.9,z*1.8]],.028,leather,'Rigging');
        for(const z of [-1.65,0,1.65])mesh(root,geo('hoop',()=>new T.TorusGeometry(1,.025,6,32)),gold,[0,4.5,z],[1.83,1.46,1],'BalloonHoop');
    }
    function setFaction(u,color){u.mesh.traverse(n=>{if(n.userData.characterFaction)n.material=mat('cloth',color);});}
    return {build,setFaction,get ready(){return ready;},configureTextures,atlas:null,tiles};
}
