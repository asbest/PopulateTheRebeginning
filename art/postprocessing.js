// Project-authored WebGL postprocessing, compatible with the bundled Three.js r128.
export function createPostprocessing(THREE,renderer){
    const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
    const target=(w,h)=>new THREE.WebGLRenderTarget(w,h,{depthBuffer:false,stencilBuffer:false});
    const image=target(1,1);image.depthBuffer=true;image.texture.encoding=THREE.sRGBEncoding;
    const glowA=target(1,1),glowB=target(1,1);
    const scene=new THREE.Scene(),camera=new THREE.Camera();
    const geometry=new THREE.PlaneBufferGeometry(2,2);
    const material=(uniforms,fragmentShader)=>new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,depthTest:false,depthWrite:false,toneMapped:false});
    const blur=material({source:{value:null},step:{value:new THREE.Vector2()},extract:{value:0}},`
        varying vec2 vUv; uniform sampler2D source; uniform vec2 step; uniform float extract;
        vec3 sampleLight(vec2 uv){vec3 c=texture2D(source,uv).rgb;return mix(c,c*smoothstep(.68,.98,max(c.r,max(c.g,c.b))),extract);}
        void main(){vec3 c=sampleLight(vUv)*.227027;
          c+=(sampleLight(vUv+step*1.384615)+sampleLight(vUv-step*1.384615))*.316216;
          c+=(sampleLight(vUv+step*3.230769)+sampleLight(vUv-step*3.230769))*.070270;
          gl_FragColor=vec4(c,1.);}`);
    const finish=material({source:{value:image.texture},glow:{value:glowB.texture},bloom:{value:0}},`
        varying vec2 vUv; uniform sampler2D source,glow; uniform float bloom;
        void main(){vec3 c=texture2D(source,vUv).rgb;
          c+=texture2D(glow,vUv).rgb*bloom*(1.-c);
          float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(vec3(l),c,1.045);
          c=(c-.5)*1.035+.5;
          c+=vec3(.009,.003,-.006)*smoothstep(.25,.85,l);
          vec2 p=vUv*(1.-vUv);float vignette=smoothstep(0.,.16,p.x*p.y*4.);
          c*=mix(.95,1.,vignette);
          gl_FragColor=vec4(clamp(c,0.,1.),1.);}`);
    const quad=new THREE.Mesh(geometry,finish);quad.frustumCulled=false;scene.add(quad);
    let width=0,height=0,failed=false,enabled=true,bloomAllowed=true;
    const size=new THREE.Vector2();
    function render(world,view,quality){
        if(failed||!enabled||quality?.tier==='low'){renderer.render(world,view);return;}
        const previous=renderer.getRenderTarget();
        const oldAutoReset=renderer.info.autoReset;
        try{
            renderer.getDrawingBufferSize(size);
            if(width!==size.x||height!==size.y){
                width=size.x;height=size.y;image.setSize(width,height);
                glowA.setSize(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)));
                glowB.setSize(glowA.width,glowA.height);
            }
            renderer.info.reset();renderer.info.autoReset=false;
            renderer.setRenderTarget(image);renderer.render(world,view);
            const bloom=bloomAllowed&&['high','ultra'].includes(quality?.tier);
            if(bloom){
                quad.material=blur;blur.uniforms.source.value=image.texture;
                blur.uniforms.extract.value=1;blur.uniforms.step.value.set(1/glowA.width,0);
                renderer.setRenderTarget(glowA);renderer.render(scene,camera);
                blur.uniforms.source.value=glowA.texture;blur.uniforms.extract.value=0;
                blur.uniforms.step.value.set(0,1/glowA.height);
                renderer.setRenderTarget(glowB);renderer.render(scene,camera);
            }
            quad.material=finish;finish.uniforms.bloom.value=bloom ? .16 : 0;
            renderer.setRenderTarget(previous);renderer.render(scene,camera);
        }catch(error){
            failed=true;renderer.setRenderTarget(previous);renderer.render(world,view);
            console.warn('Postprocessing disabled; using direct rendering.',error);
        }finally{renderer.info.autoReset=oldAutoReset;}
    }
    return {render,adapt(fps){if(fps<34)bloomAllowed=false;else if(fps>45)bloomAllowed=true;
        if(fps<28)enabled=false;else if(fps>40)enabled=true;},
        get status(){return {enabled:enabled&&!failed,bloom:bloomAllowed,failed,width,height};},
        dispose(){image.dispose();glowA.dispose();glowB.dispose();geometry.dispose();blur.dispose();finish.dispose();}};
}
