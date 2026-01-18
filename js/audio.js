export const SoundManager = {
    ctx: null,
    init: function() {
        if (this.ctx) return;
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            if(window.AudioContext) {
                this.ctx = new AudioContext();
            } else {
                console.warn("WebAudio not supported");
            }
        } catch(e) {
            console.warn("AudioContext creation failed:", e);
        }
    },
    playTone: function(freq, type, duration, vol=0.1) {
        if(!this.ctx) this.init();
        if(!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    playNoise: function(duration, vol=0.1) {
        if(!this.ctx) this.init();
        if(!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },
    playSound: function(name) {
        if(!this.ctx) this.init();
        if(!this.ctx) return;
        if(this.ctx.state === 'suspended') this.ctx.resume();

        switch(name) {
            case 'attack':
                this.playNoise(0.1, 0.2);
                this.playTone(150, 'square', 0.1, 0.1);
                break;
            case 'fireball':
                this.playTone(400, 'sine', 0.3, 0.1);
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.frequency.setValueAtTime(400, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.3);
                break;
            case 'explosion':
                this.playNoise(0.5, 0.5);
                this.playTone(50, 'sawtooth', 0.5, 0.3);
                break;
            case 'magic':
                this.playTone(800, 'sine', 0.5, 0.1);
                this.playTone(1200, 'sine', 0.5, 0.05);
                break;
            case 'construct':
                 this.playTone(200, 'square', 0.1, 0.1);
                 setTimeout(()=>this.playTone(200, 'square', 0.1, 0.1), 200);
                 break;
            case 'rumble':
                this.playTone(80, 'sawtooth', 0.5, 0.2);
                break;
        }
    }
};
