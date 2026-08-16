// Moteur audio synthétisé Web Audio API (§12).
//
// 100 % génératif, zéro asset audio externe lourd, chargement instantané.
// Musique chiptune / MIDI 8-bit entraînante et effets sonores percutants.

const STORAGE_KEY = 'maxence_mute';

export function createAudio() {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let muted = false;
  let musicRunning = false;
  let musicTimer = null;
  let noteIndex = 0;

  // Récupérer le réglage persistant
  try {
    if (typeof localStorage !== 'undefined') {
      muted = localStorage.getItem(STORAGE_KEY) === '1';
    }
  } catch {}

  function init() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.25;
    musicGain.connect(masterGain);
  }

  function ensureResumed() {
    init();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function setMuted(val) {
    muted = !!val;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      }
    } catch {}
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
    }
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  // ─── Effets Sonores (SFX) ──────────────────────────────────────────────────

  function playTone(freqStart, freqEnd, type, duration, gain = 0.3) {
    if (muted || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, t);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + duration);
      }

      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(g);
      g.connect(sfxGain);

      osc.start(t);
      osc.stop(t + duration);
    } catch {}
  }

  function playNoise(duration, gain = 0.3, highpass = 800) {
    if (muted || !ctx) return;
    try {
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;

      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(filter);
      filter.connect(g);
      g.connect(sfxGain);

      noise.start(t);
      noise.stop(t + duration);
    } catch {}
  }

  const sfx = {
    jump(type = 'ollie') {
      ensureResumed();
      if (type === 'boost') {
        playTone(180, 720, 'square', 0.22, 0.4);
      } else if (type === 'flip') {
        playTone(220, 580, 'triangle', 0.16, 0.35);
      } else {
        playTone(160, 420, 'triangle', 0.12, 0.3);
      }
    },

    land(perfect = false) {
      ensureResumed();
      if (perfect) {
        playTone(880, 1320, 'sine', 0.15, 0.35);
        playNoise(0.08, 0.2, 1200);
      } else {
        playTone(120, 60, 'triangle', 0.08, 0.25);
      }
    },

    grindTick() {
      ensureResumed();
      playNoise(0.04, 0.15, 2000);
    },

    coin() {
      ensureResumed();
      if (muted || !ctx) return;
      const t = ctx.currentTime;
      // Double bip cristallin (B5 -> E6)
      playTone(987, 987, 'sine', 0.08, 0.25);
      setTimeout(() => playTone(1318, 1318, 'sine', 0.12, 0.3), 50);
    },

    cleanLine() {
      ensureResumed();
      // Fanfare 4 notes C5 -> E5 -> G5 -> C6
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, freq, 'triangle', 0.18, 0.35), i * 70);
      });
    },

    crash() {
      ensureResumed();
      playTone(120, 35, 'sawtooth', 0.35, 0.5);
      playNoise(0.35, 0.4, 300);
    },

    combo(multiplier) {
      ensureResumed();
      const baseFreq = 440 + Math.min(8, multiplier) * 60;
      playTone(baseFreq, baseFreq * 1.5, 'triangle', 0.14, 0.25);
    },
  };

  // ─── Musique Chiptune MIDI / 8-Bit entraînante ──────────────────────────────
  // Progression d'accords énergique style skate arcade (135 BPM)
  const BPM = 135;
  const STEP_TIME = (60 / BPM) / 4; // double croche (16th note)

  // Séquence de notes : Mélodie (Hz), Basse (Hz), Drum (0: silence, 1: kick, 2: snare, 3: hat)
  // Scale: Pentatonique mineure / Dorian (La, Do, Ré, Mi, Sol)
  const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63, G4 = 392, A4 = 440, B4 = 493.88, C5 = 523.25, D5 = 587.33, E5 = 659.25;
  const A2 = 110, F2 = 87.31, C3 = 130.81, G2 = 98.00, D3 = 146.83, E2 = 82.41;

  const PATTERN = [
    // Mesure 1 (Am)
    { mel: A4, bass: A2, drum: 1 },
    { mel: 0,  bass: A2, drum: 3 },
    { mel: C5, bass: A2, drum: 3 },
    { mel: D5, bass: A2, drum: 2 },
    { mel: E5, bass: A2, drum: 1 },
    { mel: 0,  bass: A2, drum: 3 },
    { mel: D5, bass: A2, drum: 3 },
    { mel: C5, bass: A2, drum: 2 },
    // Mesure 2 (F / Dm)
    { mel: D5, bass: F2, drum: 1 },
    { mel: 0,  bass: F2, drum: 3 },
    { mel: C5, bass: F2, drum: 3 },
    { mel: A4, bass: F2, drum: 2 },
    { mel: G4, bass: D3, drum: 1 },
    { mel: A4, bass: D3, drum: 3 },
    { mel: C5, bass: D3, drum: 3 },
    { mel: D5, bass: D3, drum: 2 },
    // Mesure 3 (C)
    { mel: E5, bass: C3, drum: 1 },
    { mel: 0,  bass: C3, drum: 3 },
    { mel: G4, bass: C3, drum: 3 },
    { mel: C5, bass: C3, drum: 2 },
    { mel: D5, bass: C3, drum: 1 },
    { mel: E5, bass: C3, drum: 3 },
    { mel: G4, bass: C3, drum: 3 },
    { mel: C5, bass: C3, drum: 2 },
    // Mesure 4 (G / Em turnaround)
    { mel: D5, bass: G2, drum: 1 },
    { mel: 0,  bass: G2, drum: 3 },
    { mel: C5, bass: G2, drum: 3 },
    { mel: B4 || 493.88, bass: G2, drum: 2 },
    { mel: A4, bass: E2, drum: 1 },
    { mel: G4, bass: E2, drum: 3 },
    { mel: E4, bass: E2, drum: 3 },
    { mel: G4, bass: E2, drum: 2 },
  ];

  function playStep() {
    if (!musicRunning || muted || !ctx) return;
    const step = PATTERN[noteIndex % PATTERN.length];
    noteIndex++;
    const t = ctx.currentTime;

    // 1. Basse funky (Triangle / Sawtooth)
    if (step.bass) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(step.bass, t);
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.01, t + STEP_TIME * 0.9);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + STEP_TIME * 0.9);
      } catch {}
    }

    // 2. Mélodie lead (Pulse / Square douce)
    if (step.mel) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(step.mel, t);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.005, t + STEP_TIME * 1.5);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + STEP_TIME * 1.5);
      } catch {}
    }

    // 3. Batterie 8-bit
    if (step.drum === 1) {
      // Kick
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.setValueAtTime(140, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.08);
        g.gain.setValueAtTime(0.35, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + 0.08);
      } catch {}
    } else if (step.drum === 2) {
      // Snare
      playNoise(0.07, 0.18, 1000);
    } else if (step.drum === 3) {
      // Hi-Hat
      playNoise(0.02, 0.08, 4000);
    }
  }

  function startMusic() {
    ensureResumed();
    // Sans Web Audio (environnement sans AudioContext — le harnais de test,
    // par exemple), ctx reste null et playStep() ne ferait jamais rien
    // d'observable. Armer quand même le setInterval garderait le process Node
    // vivant indéfiniment après la fin d'un script : plus aucun test ne
    // pourrait se terminer tout seul une fois l'audio exercé une fois.
    if (!ctx || musicRunning) return;
    musicRunning = true;
    noteIndex = 0;
    musicTimer = setInterval(playStep, STEP_TIME * 1000);
  }

  function stopMusic() {
    musicRunning = false;
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    init,
    ensureResumed,
    isMuted: () => muted,
    setMuted,
    toggleMute,
    sfx,
    startMusic,
    stopMusic,
  };
}
