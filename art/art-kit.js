// Original mesh art, authored for this project. Uses the game's existing Three.js version.
import {createBlenderPack} from './blender-pack.js';
export function createArtKit(T) {
    const blender=createBlenderPack(T);
    const mats = new Map(), geos = new Map();
    const palette = {wood:0x67503a, stone:0x99a69b, straw:0xc4a96b, gold:0xdcc27f, cloth:0xe1d8ba, dark:0x283b43};
    function texture(kind) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,128,128);
        let seed = 947;
        const rand = () => { seed = (Math.imul(seed,1664525)+1013904223)|0; return (seed>>>0)/4294967296; };
        for(let i=0;i<700;i++) {
            ctx.fillStyle = `rgba(25,35,30,${rand()*0.12})`;
            const x = rand()*128, y = rand()*128;
            ctx.fillRect(x,y,kind==='wood'?1:rand()*4+1,kind==='wood'?rand()*44+4:rand()*4+1);
        }
        if(kind==='stone') {ctx.strokeStyle='rgba(30,40,40,0.23)';ctx.lineWidth=2;for(let y=0;y<128;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();for(let x=(y/32%2)*24;x<128;x+=48){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}}}
        if(kind==='thatch') {ctx.strokeStyle='rgba(80,55,20,0.3)';for(let x=0;x<128;x+=5){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+12,128);ctx.stroke();}}
        const t = new T.CanvasTexture(canvas); t.wrapS=t.wrapT=T.RepeatWrapping; t.encoding=T.sRGBEncoding;
        return t;
    }
    const loader=new T.TextureLoader();
    function surface(name) {
        const t=loader.load(new URL(`./materials/${name}.png`,import.meta.url).href);
        t.wrapS=t.wrapT=T.RepeatWrapping;
        t.encoding=T.sRGBEncoding;
        t.anisotropy=8;
        t.minFilter=T.LinearMipmapLinearFilter;
        t.magFilter=T.LinearFilter;
        return t;
    }
    const textures={wood:surface('wood'),stone:surface('stone'),thatch:surface('thatch'),grass:surface('grass'),cloth:blender.texture('cloth','map')};
    function material(color,kind='wood',metal=0,emission=0) {
        const key=[color,kind,metal,emission].join('/');
        if(!mats.has(key)) {
            const detailed=kind==='stone'||kind==='thatch'||kind==='wood'||kind==='cloth';
            const tint=new T.Color(color);
            if(detailed&&!metal)tint.lerp(new T.Color(0xffffff),kind==='wood'?0.75:0.45);
            mats.set(key,new T.MeshStandardMaterial({color:tint,map:textures[kind],
                normalMap:detailed?blender.texture(kind,'normal'):null,
                roughnessMap:detailed?blender.texture(kind,'roughness'):null,
                normalScale:new T.Vector2(kind==='stone'?.44:.28,kind==='stone'?.44:.28),
                roughness:metal?0.55:1,metalness:metal,emissive:emission}));
        }
        return mats.get(key);
    }
    function cachedGeometry(key,make) {if(!geos.has(key))geos.set(key,make());return geos.get(key);}
    function geometry(kind,args) {return cachedGeometry(kind+args.join(','),()=>new T[kind](...args));}
    function add(p,kind,args,pos,color,style='wood',metal=0) {
        const m=new T.Mesh(geometry(kind,args),material(color,style,metal));m.position.set(...pos);m.castShadow=m.receiveShadow=true;p.add(m);return m;
    }
    const box=(p,pos,size,c,style='wood',metal=0)=>add(p,'BoxGeometry',size,pos,c,style,metal);
    const cyl=(p,pos,top,bottom,h,c,style='wood',sides=32)=>add(p,'CylinderGeometry',[top,bottom,h,sides],pos,c,style);
    function beam(p,a,b,r,c=palette.wood) {const av=new T.Vector3(...a),bv=new T.Vector3(...b);const m=cyl(p,av.clone().add(bv).multiplyScalar(0.5).toArray(),r,r,av.distanceTo(bv),c);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bv.sub(av).normalize());return m;}
    function orb(p,pos,scale,c,style='cloth') {const m=add(p,'SphereGeometry',[0.5,16,10],pos,c,style);m.scale.set(...scale);return m;}
    function roofTrim(p,y,radius,color) {
        const ring=add(p,'TorusGeometry',[radius,0.045,5,48],[0,y,0],color,'wood');
        ring.rotation.x=Math.PI/2;
        return ring;
    }
    function building(kind, factionColor=0x4169e1) {
        const p = new T.Group(); p.userData.artVersion=1;
        cyl(p,[0,0.12,0],1.85,2,0.24,palette.stone,'stone');
        if(kind==='hut'||kind==='spy') {
            cyl(p,[0,0.9,0],1.22,1.4,1.5,kind==='spy'?palette.dark:0xb9a16e,'stone');
            for(let i=0;i<12;i++){let a=i*Math.PI/6;beam(p,[Math.sin(a)*1.38,0.2,Math.cos(a)*1.38],[Math.sin(a)*1.22,1.7,Math.cos(a)*1.22],0.055);}
            cyl(p,[0,2.15,0],0.04,1.8,1.35,kind==='spy'?0x4f6370:palette.straw,'thatch');
            cyl(p,[0,1.54,0],1.63,1.86,0.22,kind==='spy'?0x65727a:0xb8975c,'thatch',32);
            roofTrim(p,1.49,1.83,0x775737);
            roofTrim(p,2.11,1.05,0x846541);
            for(let i=0;i<20;i++){let a=i*Math.PI/10;beam(p,[0,2.83,0],[Math.sin(a)*1.8,1.47,Math.cos(a)*1.8],0.025,palette.wood);}
            box(p,[0,0.8,1.39],[0.65,1.18,0.14],palette.dark);
            box(p,[0,1.43,1.45],[0.82,0.13,0.15],palette.gold);
            box(p,[-0.84,1.0,1.13],[0.35,0.38,0.07],0xd7bb82,'cloth');
            for(const x of [-0.92,0.92]) {
                box(p,[x,1.0,1.09],[0.39,0.43,0.055],0x5a4632,'wood');
                box(p,[x,1.0,1.135],[0.25,0.28,0.02],0x273a3b,'wood');
                box(p,[x,1.0,1.15],[0.045,0.34,0.035],0xb49a65,'wood');
            }
            for(let i=0;i<12;i++) {
                const a=i*Math.PI/6;
                const stone=box(p,[Math.sin(a)*1.69,0.22,Math.cos(a)*1.69],[0.51,0.27,0.28],0xb1a48a,'stone');
                stone.rotation.y=a;
            }
            box(p,[0,0.17,1.64],[0.96,0.18,0.51],0x9b8970,'stone');
            cyl(p,[0,2.95,0],0.08,0.12,0.3,palette.gold);
        } else if(kind==='tower') {
            cyl(p,[0,1.85,0],0.7,1,3.5,palette.stone,'stone');
            cyl(p,[0,3.7,0],1.45,1.2,0.35,palette.wood);
            for(let i=0;i<6;i++){let a=i*Math.PI/3;beam(p,[Math.sin(a)*0.9,0.2,Math.cos(a)*0.9],[Math.sin(a)*1.14,4.8,Math.cos(a)*1.14],0.065);}
            cyl(p,[0,5.1,0],0.03,1.6,1.05,palette.straw,'thatch');
            for(let i=0;i<8;i++)box(p,[0,0.5+i*0.4,1],[0.6,0.055,0.07],palette.wood);
            for(let i=0;i<12;i++){let a=i*Math.PI/6;box(p,[Math.sin(a)*1.3,4,Math.cos(a)*1.3],[0.12,0.65,0.12],palette.wood);}
        } else if(kind==='warrior') {
            box(p,[0,0.9,0],[3,1.5,2],palette.stone,'stone');
            for(const side of [-1,1]) {
                const roof=box(p,[0,2.15,side*0.63],[3.65,0.16,1.94],0x986b48,'thatch');
                roof.rotation.x=side*0.64;
                beam(p,[-1.72,1.56,side*1.4],[1.72,1.56,side*1.4],0.06,0x705033);
            }
            beam(p,[-1.75,2.83,0],[1.75,2.83,0],0.075,0x705033);
            for(let x of [-1.55,1.55])for(let z of [-0.85,0.85])beam(p,[x,0.18,z],[x,1.83,z],0.075,0x76583b);
            box(p,[0,0.75,1.05],[0.7,1.2,0.13],palette.dark);
            for(let x of [-1.4,0,1.4])box(p,[x,0.9,1.05],[0.13,1.8,0.15],palette.wood);
            for(let x of [-1,1]){beam(p,[x,0.2,1.5],[x,1.6,1.5],0.04);box(p,[x,1.5,1.5],[0.07,0.65,0.07],0xbec9c9,'stone',0.7);box(p,[x,1.18,1.5],[0.3,0.07,0.09],palette.gold);}
        } else if(kind==='fire') {
            for(let i=0;i<3;i++)cyl(p,[0,0.3+i*0.4,0],1.8-i*0.32,1.95-i*0.32,0.4,palette.stone,'stone');
            for(let i=0;i<6;i++){let a=i*Math.PI/3;cyl(p,[Math.sin(a)*1.3,2,Math.cos(a)*1.3],0.13,0.18,2,palette.wood);}
            cyl(p,[0,3.25,0],0.05,1.85,1.3,palette.gold,'thatch');
            cyl(p,[0,1.55,0],0.5,0.3,0.35,palette.gold);
            const fire=orb(p,[0,2.1,0],[0.5,1,0.5],0xffa357);fire.material=new T.MeshStandardMaterial({color:0xffc17d,emissive:0xff611b,emissiveIntensity:0.65});
        } else if(kind==='shipyard') {
            for(let i=0;i<12;i++)box(p,[0,0.22,-2.15+i*0.4],[3,0.2,0.35],palette.wood);
            for(let x of [-1.3,1.3])for(let z of [-2,2])cyl(p,[x,0.35,z],0.18,0.21,1.0,palette.wood);
            beam(p,[-1,0.2,-1],[-1,3.8,-1],0.13);beam(p,[-1,3.8,-1],[1.2,3.8,-1],0.1);beam(p,[1.2,3.8,-1],[1.2,1.1,-1],0.025,palette.cloth);
            for(let i=0;i<3;i++)cyl(p,[-0.7+i*0.7,0.7,1.2],0.28,0.28,0.65,palette.wood);
            orb(p,[0,1.1,0],[1.8,0.6,2.6],palette.cloth);
        }
        beam(p,[1.5,0.15,-1.35],[1.5,3.0,-1.35],0.04);
        const banner=box(p,[1.82,2.66,-1.35],[0.65,0.45,0.025],factionColor,'cloth');
        banner.userData.isFactionBanner=true;
        blender.attach(p,'building/'+kind+'/root',factionColor);
        return p;
    }
    const crownMaterial=new T.MeshStandardMaterial({vertexColors:true,map:textures.grass,
        normalMap:blender.texture('grass','normal'),roughnessMap:blender.texture('grass','roughness'),
        roughness:1,side:T.DoubleSide});
    function tree() {
        // First two children remain the trunk and a single crown mesh for burnTreesAt.
        const p=new T.Group();
        cyl(p,[0,1.35,0],0.16,0.29,2.7,palette.wood,'wood',12);
        const crownGeometry=cachedGeometry('tree-crown-v2',()=>{
            const crownGeometry = new T.BufferGeometry();
            const vertices=[],normals=[],colors=[],uvs=[];
            const leafGeometry=geometry('IcosahedronGeometry',[0.5,1]);
            const leaves=[0x315d31,0x3d7237,0x4d8240,0x628e49,0x789d52];
            for(let i=0;i<24;i++) {
                const a=i*2.39996,ring=Math.sqrt((i+0.5)/24);
                const geometryCopy=leafGeometry.clone();
                const sx=0.72+(i%5)*0.085,sy=0.45+(i%4)*0.06;
                geometryCopy.scale(sx,sy,sx*0.85);
                geometryCopy.rotateY(a);geometryCopy.rotateZ(Math.sin(i*1.7)*0.27);
                geometryCopy.translate(Math.sin(a)*ring*1.15,2.75+Math.sin(i*2.1)*0.26-ring*0.15,Math.cos(a)*ring*1.05);
                const flat=geometryCopy.toNonIndexed();vertices.push(...flat.attributes.position.array);normals.push(...flat.attributes.normal.array);uvs.push(...flat.attributes.uv.array);
                const tone=new T.Color(leaves[i%leaves.length]);
                for(let k=0;k<flat.attributes.position.count;k++)colors.push(tone.r,tone.g,tone.b);
                geometryCopy.dispose();flat.dispose();
            }
            crownGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));crownGeometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
            crownGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
            crownGeometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
            return crownGeometry;
        });
        const crown=new T.Mesh(crownGeometry,crownMaterial);crown.castShadow=crown.receiveShadow=true;p.add(crown);
        for(let i=0;i<4;i++) {
            const a=i*Math.PI/2+0.4;
            beam(p,[0,1.65,0],[Math.sin(a)*0.83,2.55,Math.cos(a)*0.83],0.065,0x5c4932);
        }
        blender.attach(p.children[0],'tree/trunk');
        blender.attach(crown,'tree/crown');
        return p;
    }
    function dress(unit) {
        if(unit.type==='airship') {
            for(let z of [-1.5,0,1.5]) {const band=add(unit.mesh,'TorusGeometry',[2.45,0.055,6,32],[0,4.5,z],palette.gold,'cloth');band.rotation.x=Math.PI/2;band.scale.set(1,1,0.8);}
            box(unit.mesh,[0,0.7,1.55],[1.6,0.35,0.08],palette.gold);
            return;
        }
        if(!unit.torso)return;
        // Attach to existing animated bones; locomotion and collision remain untouched.
        cyl(unit.torso,[0,-0.18,0],0.265,0.265,0.075,palette.wood);
        box(unit.torso,[0,-0.17,0.17],[0.10,0.085,0.07],palette.gold,'cloth',0.6);
        for(let side of [-1,1])orb(unit.torso,[side*0.24,0.1,0],[0.18,0.13,0.2],unit.type==='warrior'?palette.stone:palette.gold,'stone');
        if(unit.type==='shaman') {beam(unit.mesh,[0.42,0.15,0],[0.42,2.1,0],0.035);const crystal=add(unit.mesh,'OctahedronGeometry',[0.13],[0.42,2.25,0],palette.gold,'cloth',0.5);crystal.material=material(0xffd899,'cloth',0.5,0x554000);}
        if(unit.type==='wild')box(unit.torso,[0,0.02,-0.2],[0.29,0.34,0.15],palette.wood);
    }
    function terrainDetail(material) {
        material.roughness=0.94; material.metalness=0;
        material.onBeforeCompile = shader => {
            shader.uniforms.artGrass={value:textures.grass};
            shader.vertexShader='varying vec3 vArtPosition;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArtPosition = (modelMatrix * vec4(position,1.0)).xyz;');
            shader.fragmentShader='uniform sampler2D artGrass;\nvarying vec3 vArtPosition;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
                float grassWeight=smoothstep(0.035,0.15,diffuseColor.g-max(diffuseColor.r,diffuseColor.b));
                vec3 grassA=pow(texture2D(artGrass,vArtPosition.xz*0.5).rgb,vec3(2.2));
                vec3 grassB=pow(texture2D(artGrass,mat2(0.8,-0.6,0.6,0.8)*vArtPosition.xz*0.17).rgb,vec3(2.2));
                vec3 grass=mix(grassA,grassB,0.22);
                diffuseColor.rgb=mix(diffuseColor.rgb,grass*1.5,grassWeight*0.65);
            `);
        };
        material.customProgramCacheKey=()=> 'island-terrain-detail-v2';
    }
    return {building,tree,dress,terrainDetail,textures,palette,ready:blender.ready,blender};
}
