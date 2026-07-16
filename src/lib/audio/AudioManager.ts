/**
 * Audio Manager - Game Sound System
 * AAA 2026 Standard: Immersive audio feedback
 *
 * All sound effects are synthesized at runtime with the Web Audio API.
 * No audio assets are shipped - each SFX is a short oscillator/noise
 * envelope, kept deliberately quiet (peak gain <= 0.2).
 *
 * Music: no music tracks ship at launch. playMusic/stopMusic remain as
 * no-ops to preserve the public API surface for callers.
 */

type SoundEffect =
  | 'collect'
  | 'death'
  | 'gameStart'
  | 'directionChange'
  | 'pause'
  | 'uiClick'
  | 'breedingSuccess'
  | 'energyRegen';

type MusicTrack = 'cyber' | 'primal' | 'cosmic' | 'menu';

interface AudioConfig {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

/** Options for a single synthesized tone */
interface ToneOptions {
  /** Oscillator frequency in Hz at note start */
  frequency: number;
  /** Optional frequency to glide to by note end */
  frequencyEnd?: number;
  /** Offset from "now" in seconds */
  startOffset: number;
  /** Note length in seconds */
  duration: number;
  /** Peak envelope gain (kept <= 0.2 for tasteful volume) */
  peak: number;
  /** Oscillator waveform */
  type: OscillatorType;
  /** Attack time in seconds (default 0.005) */
  attack?: number;
}

/** Options for a synthesized noise burst */
interface NoiseOptions {
  startOffset: number;
  duration: number;
  peak: number;
  /** Band-pass center frequency in Hz (omit for unfiltered noise) */
  filterFrequency?: number;
}

/** Hard ceiling for any single envelope peak */
const MAX_PEAK = 0.2;

class AudioManagerClass {
  private context: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private currentMusicTrack: MusicTrack | null = null;
  private isInitialized: boolean = false;

  private config: AudioConfig = {
    masterVolume: 1.0,
    sfxVolume: 0.7,
    musicVolume: 0.4,
    muted: false,
  };

  /**
   * Initialize the audio context.
   * Call this after user interaction (to comply with autoplay policies) -
   * the AudioContext is created lazily here, never at module load.
   */
  async init(): Promise<void> {
    if (this.isInitialized || typeof window === 'undefined') return;

    try {
      const ContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!ContextClass) return;

      this.context = new ContextClass();

      // Browsers may hand back a suspended context before a user gesture
      if (this.context.state === 'suspended') {
        await this.context.resume().catch(() => {
          // Will resume on a later gesture; playback simply stays silent
        });
      }

      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.effectiveSfxGain();
      this.sfxGain.connect(this.context.destination);

      this.isInitialized = true;
    } catch (error) {
      console.warn('Audio initialization failed:', error);
    }
  }

  /**
   * Play a synthesized sound effect
   */
  play(sound: SoundEffect): void {
    if (this.config.muted || !this.isInitialized) return;
    if (!this.context || !this.sfxGain) return;

    try {
      switch (sound) {
        case 'collect':
          this.playCollect();
          break;
        case 'death':
          this.playDeath();
          break;
        case 'gameStart':
          this.playGameStart();
          break;
        case 'directionChange':
          this.playDirectionChange();
          break;
        case 'pause':
          this.playPause();
          break;
        case 'uiClick':
          this.playUiClick();
          break;
        case 'breedingSuccess':
          this.playBreedingSuccess();
          break;
        case 'energyRegen':
          this.playEnergyRegen();
          break;
      }
    } catch {
      // Never let audio failures break gameplay
    }
  }

  /**
   * Play background music.
   * No-op: no music tracks ship at launch. Kept for API compatibility.
   */
  playMusic(_track: MusicTrack, _fadeIn: boolean = true): void {
    // Intentionally empty - music is deferred post-launch
  }

  /**
   * Stop current music. No-op (see playMusic).
   */
  stopMusic(_fadeOut: boolean = true): void {
    this.currentMusicTrack = null;
  }

  /**
   * Pause current music. No-op (see playMusic).
   */
  pauseMusic(): void {
    // Intentionally empty - music is deferred post-launch
  }

  /**
   * Resume current music. No-op (see playMusic).
   */
  resumeMusic(): void {
    // Intentionally empty - music is deferred post-launch
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateSfxGain();
  }

  /**
   * Set SFX volume (0-1)
   */
  setSfxVolume(volume: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, volume));
    this.updateSfxGain();
  }

  /**
   * Set music volume (0-1). Retained for API compatibility.
   */
  setMusicVolume(volume: number): void {
    this.config.musicVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Mute/unmute all audio
   */
  setMuted(muted: boolean): void {
    this.config.muted = muted;
    this.updateSfxGain();
  }

  /**
   * Toggle mute
   */
  toggleMute(): boolean {
    this.setMuted(!this.config.muted);
    return this.config.muted;
  }

  /**
   * Get current mute state
   */
  get isMuted(): boolean {
    return this.config.muted;
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioConfig {
    return { ...this.config };
  }

  /**
   * Check if audio is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current playing music track (always null - no music at launch)
   */
  get currentTrack(): MusicTrack | null {
    return this.currentMusicTrack;
  }

  // ---------------------------------------------------------------------
  // Synthesis internals
  // ---------------------------------------------------------------------

  /** Combined SFX bus gain from config */
  private effectiveSfxGain(): number {
    return this.config.muted
      ? 0
      : this.config.masterVolume * this.config.sfxVolume;
  }

  /** Push current config volumes onto the SFX bus */
  private updateSfxGain(): void {
    if (this.sfxGain && this.context) {
      this.sfxGain.gain.setValueAtTime(
        this.effectiveSfxGain(),
        this.context.currentTime
      );
    }
  }

  /**
   * Schedule a single oscillator tone with a fast-attack /
   * exponential-decay envelope on the SFX bus.
   */
  private tone(options: ToneOptions): void {
    if (!this.context || !this.sfxGain) return;

    const {
      frequency,
      frequencyEnd,
      startOffset,
      duration,
      type,
      attack = 0.005,
    } = options;
    const peak = Math.min(options.peak, MAX_PEAK);
    const start = this.context.currentTime + startOffset;
    const end = start + duration;

    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (frequencyEnd !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(frequencyEnd, 1),
        end
      );
    }

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(envelope);
    envelope.connect(this.sfxGain);

    oscillator.start(start);
    oscillator.stop(end + 0.01);
  }

  /**
   * Schedule a white-noise burst (optionally band-passed) with a
   * decay envelope on the SFX bus.
   */
  private noise(options: NoiseOptions): void {
    if (!this.context || !this.sfxGain) return;

    const { startOffset, duration, filterFrequency } = options;
    const peak = Math.min(options.peak, MAX_PEAK);
    const start = this.context.currentTime + startOffset;
    const end = start + duration;

    const source = this.context.createBufferSource();
    source.buffer = this.getNoiseBuffer();

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(peak, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    let head: AudioNode = source;
    if (filterFrequency !== undefined) {
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFrequency, start);
      head.connect(filter);
      head = filter;
    }

    head.connect(envelope);
    envelope.connect(this.sfxGain);

    source.start(start);
    source.stop(end + 0.01);
  }

  /** Lazily build (and cache) 1 second of white noise */
  private getNoiseBuffer(): AudioBuffer {
    if (!this.noiseBuffer && this.context) {
      const length = Math.floor(this.context.sampleRate * 1);
      this.noiseBuffer = this.context.createBuffer(
        1,
        length,
        this.context.sampleRate
      );
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return this.noiseBuffer as AudioBuffer;
  }

  // --- Individual SFX recipes -------------------------------------------

  /** Quick two-note sine blip arpeggio up (~120ms) */
  private playCollect(): void {
    this.tone({ frequency: 660, startOffset: 0, duration: 0.06, peak: 0.15, type: 'sine' });
    this.tone({ frequency: 880, startOffset: 0.06, duration: 0.06, peak: 0.15, type: 'sine' });
  }

  /** Descending saw sweep + noise burst (~400ms) */
  private playDeath(): void {
    this.tone({
      frequency: 220,
      frequencyEnd: 55,
      startOffset: 0,
      duration: 0.4,
      peak: 0.12,
      type: 'sawtooth',
    });
    this.noise({ startOffset: 0, duration: 0.3, peak: 0.1, filterFrequency: 400 });
  }

  /** Rising three-note triangle fanfare (~260ms) */
  private playGameStart(): void {
    this.tone({ frequency: 330, startOffset: 0, duration: 0.09, peak: 0.12, type: 'triangle' });
    this.tone({ frequency: 440, startOffset: 0.08, duration: 0.09, peak: 0.12, type: 'triangle' });
    this.tone({ frequency: 660, startOffset: 0.16, duration: 0.1, peak: 0.12, type: 'triangle' });
  }

  /** Tiny square blip (~30ms) */
  private playDirectionChange(): void {
    this.tone({ frequency: 440, startOffset: 0, duration: 0.03, peak: 0.06, type: 'square' });
  }

  /** Two-note descending triangle (~160ms) */
  private playPause(): void {
    this.tone({ frequency: 520, startOffset: 0, duration: 0.08, peak: 0.1, type: 'triangle' });
    this.tone({ frequency: 390, startOffset: 0.08, duration: 0.08, peak: 0.1, type: 'triangle' });
  }

  /** 5ms band-pass filtered click */
  private playUiClick(): void {
    this.noise({ startOffset: 0, duration: 0.005, peak: 0.1, filterFrequency: 2000 });
  }

  /** Major-triad sine arpeggio C5-E5-G5 (~350ms) */
  private playBreedingSuccess(): void {
    this.tone({ frequency: 523.25, startOffset: 0, duration: 0.12, peak: 0.14, type: 'sine' });
    this.tone({ frequency: 659.25, startOffset: 0.11, duration: 0.12, peak: 0.14, type: 'sine' });
    this.tone({ frequency: 783.99, startOffset: 0.22, duration: 0.13, peak: 0.14, type: 'sine' });
  }

  /** Soft two-partial chime (~300ms) */
  private playEnergyRegen(): void {
    this.tone({
      frequency: 880,
      startOffset: 0,
      duration: 0.3,
      peak: 0.08,
      type: 'sine',
      attack: 0.02,
    });
    this.tone({
      frequency: 1320,
      startOffset: 0,
      duration: 0.25,
      peak: 0.04,
      type: 'sine',
      attack: 0.02,
    });
  }
}

// Singleton instance
export const audioManager = new AudioManagerClass();

// Export class for testing
export { AudioManagerClass };
