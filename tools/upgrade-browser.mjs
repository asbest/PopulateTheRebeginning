// One-time migration with explicit anchors; aborts if the upstream layout changes.
import fs from 'node:fs';
const file=new URL('../PopulateTheRebeginning.html',import.meta.url);
let html=fs.readFileSync(file,'utf8').replaceAll('\r\n','\n');
function replace(from,to){if(!html.includes(from))throw new Error('Missing migration anchor: '+from.slice(0,80));html=html.replace(from,to);}
replace('</head>','    <link rel="stylesheet" href="art/presentation.css">\n</head>');
replace('window.THREE = THREE;',"import { createArtKit } from './art/art-kit.js';\nconst Art = createArtKit(THREE);\nwindow.THREE = THREE;\nwindow.Art = Art;");
const start=html.indexOf('function buildHut() {'),end=html.indexOf('// --- js/ai.js',start);
// Locate the AI class marker independently of comments.
const ai=html.indexOf('class EnemyAI',start);
if(start<0||ai<0)throw new Error('Building block missing');
html=html.slice(0,start)+`function buildHut() { return Art.building('hut'); }
function buildTower() { return Art.building('tower'); }
function buildBarracks() { return Art.building('warrior'); }
function buildFireTemple() { return Art.building('fire'); }
function buildSpyHut() { return Art.building('spy'); }
function buildShipyard() { return Art.building('shipyard'); }

`+html.slice(ai);
replace('        applyUnitTexture(this);\n        this.initPhysics(x, z);','        applyUnitTexture(this);\n        Art.dress(this);\n        this.initPhysics(x, z);');
replace('    // Increase water resolution for better foam','    Art.terrainDetail(chunkTerrainMat);\n    // Increase water resolution for better foam');
replace('        state.renderer.setSize(window.innerWidth, window.innerHeight);','        state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));\n        state.renderer.toneMapping = THREE.ACESFilmicToneMapping;\n        state.renderer.toneMappingExposure = 1.05;\n        state.renderer.setSize(window.innerWidth, window.innerHeight);');
replace('const amb = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);','const amb = new THREE.HemisphereLight(0xd6e9ec, 0x56604a, 1.0);');
replace('sun.shadow.bias = -0.0005;','sun.shadow.bias = -0.0003;\n        sun.shadow.normalBias = 0.035;');
replace('water: 0x1E90FF, sand: 0xEEDC82, grass: 0x228B22, rock: 0x696969, snow: 0xFFFFFF,','water: 0x278e9c, sand: 0xd9c897, grass: 0x739867, rock: 0x969e94, snow: 0xe7efea,');
replace('treeLeaves: 0x006400,','treeLeaves: 0x447754,');
// Higher silhouette quality for characters; reuse the existing animation rig and texture atlas.
html=html.replaceAll('0.18, 8, 8','0.18, 16, 12').replaceAll('0.25, 8, 8','0.25, 16, 12').replaceAll('0.065, 8, 8','0.065, 12, 10').replaceAll('0.055, 8, 8','0.055, 12, 10');
replace('            vec3 baseColor = color;', '            vec3 baseColor = color * vec3(0.72, 0.9, 0.91);\n            float swell = sin(vUv.x * 28.0 + time * 0.6) * cos(vUv.y * 22.0 - time * 0.5);\n            baseColor += vec3(0.02, 0.055, 0.05) * swell;');
replace('vec3 finalColor = mix(baseColor, vec3(1.0, 1.0, 1.0), foamAmount);','vec3 finalColor = mix(baseColor, vec3(0.83, 0.95, 0.9), foamAmount);\n            float glint = pow(max(0.0, ripples * swell), 14.0) * 0.13;\n            finalColor += vec3(glint);');
replace('gl_FragColor = vec4(finalColor, finalAlpha);','gl_FragColor = vec4(finalColor, finalAlpha);\n            #include <tonemapping_fragment>\n            #include <encodings_fragment>');
fs.writeFileSync(file,html);
console.log('Browser art migration complete; simulation, costs, campaign and network code unchanged.');
