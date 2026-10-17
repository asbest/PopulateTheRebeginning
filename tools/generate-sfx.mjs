import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deterministic, locally authored effects. Short seamless beds are looped only
// while their matching world effect exists; long spells do not load long WAVs.
const output = path.resolve(fileURLToPath(new URL('../sfx/', import.meta.url)));
const sampleRate = 32000;
const sounds = [
    ['attack', .28, 'attack'], ['construct', .46, 'construct'],
    ['fireball', .92, 'fireball'], ['explosion', 1.12, 'explosion'],
    ['magic', .86, 'magic'], ['rumble', 1.05, 'earth'],
    ['lightning', 1.36, 'lightning'], ['raise', 1.16, 'raise'],
    ['lower', 1.18, 'lower'], ['flatten', 1.1, 'flatten'],
    ['landbridge', 1.55, 'landbridge'], ['swamp', 1.16, 'swamp'],
    ['invisibility', .92, 'invisibility'], ['shield', .9, 'shield'],
    ['hypnotise', 1.25, 'hypnotise'], ['swarm', 1.12, 'swarm'],
    ['tornado', 1.38, 'tornado'], ['firestorm', 1.47, 'firestorm'],
    ['volcano', 1.64, 'volcano'], ['heal', 1.08, 'heal'],
    ['teleport', 1.18, 'teleport'], ['create', 1.08, 'create'],
    ['phantom', 1.16, 'phantom'],
    ['bunny_nibble', .72, 'bunnyNibble'],
    ['bird_call', .84, 'birdCall'],
    ['hurt', .36, 'hurt'],
    ['hurt_heavy', .49, 'hurtHeavy'],
    ['swamp_loop', 2.72, 'swampLoop', true],
    ['swarm_loop', 2.44, 'swarmLoop', true],
    ['tornado_loop', 3.12, 'tornadoLoop', true],
    ['firestorm_loop', 2.76, 'firestormLoop', true],
    ['volcano_loop', 2.92, 'volcanoLoop', true]
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const fade = (t, duration, attack = .02, release = .12) =>
    clamp(t / attack) * clamp((duration - t) / release);
const pulse = (t, at, width) => t < at ? 0 : Math.exp(-(t - at) / width);
const hash = name => [...name].reduce((seed, char) => Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261);

function render(name, duration, kind, loop) {
    const count = Math.round(duration * sampleRate);
    const wrap = loop ? Math.round(.18 * sampleRate) : 0;
    const raw = new Float32Array(count + wrap);
    let seed = hash(name), bass = 0, middle = 0, air = 0, phase = 0, phase2 = 0, voicePhase = 0, crackle = 0;
    let bubbleAge = 100, bubblePitch = 300;
    const random = () => {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        return (seed >>> 0) / 2147483648 - 1;
    };
    for (let i = 0; i < raw.length; i++) {
        const t = i / sampleRate, p = clamp(t / duration);
        const noise = random(), extra = random();
        bass += (noise - bass) * .017;
        middle += (noise - middle) * .19;
        air += (noise - air) * .55;
        const low = bass * 2.2, grit = middle - bass, hiss = noise - middle;
        if (random() > .9987) crackle = .6 + random() * .3;
        const spark = crackle * extra;
        crackle *= .955;
        if (random() > .99984) { bubbleAge = 0; bubblePitch = 280 + (random() + 1) * 190; }
        bubbleAge += 1 / sampleRate;
        const bubble = bubbleAge < .075 ? Math.sin(2 * Math.PI * bubblePitch * bubbleAge * (1 + bubbleAge * 2)) * Math.exp(-bubbleAge * 45) : 0;
        const frequency = 780 * Math.pow(125 / 780, p);
        phase += 2 * Math.PI * frequency / sampleRate;
        phase2 += 2 * Math.PI * (290 + 450 * p) / sampleRate;
        const down = Math.sin(phase), up = Math.sin(phase2);
        const wind = (grit * .65 + hiss * .25) * (0.8 + .2 * Math.sin(2 * Math.PI * 1.4 * t));
        const fire = grit * .42 + spark * .58 + low * .12;
        const earth = low * .55 + grit * .42 + spark * .25;
        let value = 0;
        switch (kind) {
            case 'attack': value = (grit * .65 + down * .15) * pulse(t, 0, .065); break;
            case 'construct': value = (grit * .45 + low * .25) * (pulse(t, 0, .055) + pulse(t, .22, .075)); break;
            case 'fireball': value = (wind * .7 + down * .18 + fire * .3) * (1 - p) ** .65; break;
            case 'explosion': value = (low * 1.25 + grit * .65 + spark * .22) * pulse(t, .025, .27) + fire * pulse(t, .18, .38) * .35; break;
            case 'magic': value = (up * .3 + Math.sin(phase2 * 1.498) * .15 + hiss * .1) * (1 - p) ** .9; break;
            case 'earth': value = earth * (.85 - p * .3) + down * .09; break;
            case 'lightning': value = (hiss * .9 + spark * .7) * pulse(t, .012, .055) + (low * 1.25 + grit * .4) * pulse(t, .10, .43); break;
            case 'raise': value = earth * (.35 + .6 * p) + down * .11; break;
            case 'lower': value = earth * (1 - .55 * p) - down * .13; break;
            case 'flatten': value = earth * .72 + grit * Math.sin(2 * Math.PI * 9 * t) * .13; break;
            case 'landbridge': value = earth * (.65 + .2 * Math.sin(2 * Math.PI * 5 * t)) + low * .35; break;
            case 'swamp': value = low * .35 + bubble * .8 + grit * .18; break;
            case 'invisibility': value = (wind * .3 + up * .22) * (1 - p) + Math.sin(phase2 * 1.97) * .1; break;
            case 'shield': value = up * .26 + Math.sin(phase2 * 1.5) * .17 + hiss * .07; break;
            case 'hypnotise': value = (up * .3 + Math.sin(phase2 * .502) * .22 + wind * .12) * (1 - p * .3); break;
            case 'swarm': value = (grit * .5 + hiss * .25) * (0.5 + .5 * Math.sin(2 * Math.PI * 82 * t)) + up * .09; break;
            case 'tornado': value = wind * (.38 + .62 * p) + low * .2 + spark * .09; break;
            case 'firestorm': value = fire * (.36 + .64 * p) + low * .22 + down * .09; break;
            case 'volcano': value = earth * .85 + fire * .45 + low * .5; break;
            case 'heal': value = up * .22 + Math.sin(phase2 * 1.501) * .17 + Math.sin(phase2 * 2.003) * .08 + hiss * .045; break;
            case 'teleport': value = (wind * .52 + up * .24) * (1 - p * .4) + hiss * pulse(t, .63, .10) * .25; break;
            case 'create': value = (up * .19 + Math.sin(phase2 * .749) * .15 + bubble * .15) * (1 - p * .3); break;
            case 'phantom': value = (up * .14 + Math.sin(phase2 * .498) * .16 + wind * .18) * (1 - p * .45); break;
            case 'bunnyNibble': {
                // Small uneven chewing clicks over a faint, close grass rustle.
                const chew=[.07,.19,.31,.47,.59].reduce((level,at)=>level+pulse(t,at,.012),0);
                value=(grit*.7+hiss*.15+low*.12)*chew + (grit*.09+low*.04)*(.5+.5*Math.sin(2*Math.PI*5*t));
                break;
            }
            case 'birdCall': {
                // Two airy rising whistles and a shorter answering chirp.
                const phrase=[{at:.05,length:.17,base:1450},{at:.30,length:.19,base:1710},{at:.59,length:.11,base:1900}];
                for(const note of phrase) {
                    const age=t-note.at;
                    if(age<0||age>note.length) continue;
                    const envelope=Math.sin(Math.PI*age/note.length)**1.5;
                    const frequency=note.base*(1+.22*age/note.length);
                    value+=envelope*(Math.sin(2*Math.PI*(note.base*age+.11*note.base*age*age/note.length))*.64+
                        Math.sin(4*Math.PI*frequency*age)*.12+hiss*.05);
                }
                break;
            }
            case 'hurt':
            case 'hurtHeavy': {
                // A short breathy voiced grunt, lower and longer for a hard hit.
                const heavy=kind==='hurtHeavy';
                const pitch=(heavy?165:225)*(1-(heavy?.3:.4)*p)+7*Math.sin(2*Math.PI*11*t)+middle*11;
                voicePhase+=2*Math.PI*pitch/sampleRate;
                const voiced=Math.sin(voicePhase)*.5+Math.sin(2*voicePhase)*.27+
                    Math.sin(3*voicePhase)*.13+Math.sin(4*voicePhase)*.07;
                const breath=grit*.18+hiss*.05;
                value=(voiced+breath)*(1-.35*p)*(.86+.14*Math.sin(2*Math.PI*15*t));
                break;
            }
            case 'swampLoop': value = low * .24 + bubble * .75 + grit * .09; break;
            case 'swarmLoop': value = (grit * .38 + hiss * .18) * (0.7 + .3 * Math.sin(2 * Math.PI * 78 * t)) + low * .08; break;
            case 'tornadoLoop': value = wind * .52 + low * .21 + spark * .08; break;
            case 'firestormLoop': value = fire * .52 + low * .16; break;
            case 'volcanoLoop': value = fire * .33 + low * .42 + bubble * .15; break;
            default: throw new Error(`Unknown sound recipe: ${kind}`);
        }
        raw[i] = value * (loop ? 1 : fade(t, duration, kind === 'lightning' ? .004 : .025, Math.min(.35, duration * .32)));
    }
    if (loop) {
        // Crossfade the wrap so HTMLAudioElement.loop has no pop at the seam.
        for (let i = 0; i < wrap; i++) {
            const blend = i / wrap;
            raw[i] = raw[count + i] * (1 - blend) + raw[i] * blend;
        }
        // A short final blend also aligns the last PCM sample with the first.
        // Random high-frequency textures can otherwise leave a one-sample click.
        const tail=Math.round(.005*sampleRate);
        const first=raw[0];
        for(let i=0;i<tail;i++){
            const index=count-tail+i,blend=(i+1)/tail;
            raw[index]=raw[index]*(1-blend)+first*blend;
        }
    }
    let peak = 0;
    for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(raw[i]));
    const gain = peak ? .78 / peak : 0;
    const pcm = Buffer.alloc(44 + count * 2);
    pcm.write('RIFF', 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8);
    pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(sampleRate, 24); pcm.writeUInt32LE(sampleRate * 2, 28);
    pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
    pcm.write('data', 36); pcm.writeUInt32LE(count * 2, 40);
    for (let i = 0; i < count; i++) pcm.writeInt16LE(Math.round(clamp(raw[i] * gain, -1, 1) * 32767), 44 + i * 2);
    fs.writeFileSync(path.join(output, `${name}.wav`), pcm);
    console.log(`${name}: ${duration.toFixed(2)}s, ${pcm.length} bytes`);
}

fs.mkdirSync(output, { recursive: true });
for (const [name, duration, kind, loop = false] of sounds) render(name, duration, kind, loop);
