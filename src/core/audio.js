// Moteur audio synthétisé Web Audio API (§12).
//
// 100 % génératif, zéro asset audio externe lourd, chargement instantané.
// Musique chiptune / MIDI 8-bit entraînante et effets sonores percutants.

import { createMusic } from './music.js';

const STORAGE_KEY = 'maxence_mute';

export function createAudio() {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let muted = false;
  // Séquenceur de musique : un thème par ambiance (core/music.js, données générées par tools/compose_music.py).
  const music = createMusic({ getCtx: () => ctx, getOut: () => musicGain, estMuet: () => muted });

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

  // ─── Musique ───────────────────────────────────────────────────────────────
  function startMusic() {
    ensureResumed();
    // Sans Web Audio (environnement sans AudioContext — le harnais de test, par exemple), ctx reste
    // null : le séquenceur ne s'arme pas, ce qui évite de garder le process Node vivant indéfiniment.
    if (!ctx) return;
    music.start();
  }

  function stopMusic() {
    music.stop();
  }

  /** Jingle joué une seule fois (« gameover », « record »), à la place de la musique. */
  function jingle(id) {
    ensureResumed();
    if (!ctx) return;
    music.jouerUneFois(id);
  }

  /** Thème de l'ambiance (id de THEMES) : pris en compte à la prochaine mesure si la musique joue. */
  function setMusicTheme(id) {
    music.setTheme(id);
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
    setMusicTheme,
    jingle,
    music,
  };
}
