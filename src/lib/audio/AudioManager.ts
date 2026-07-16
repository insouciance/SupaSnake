/**
 * Audio Manager - Game Sound System
 * AAA 2026 Standard: Immersive audio feedback
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

class AudioManagerClass {
  private sounds: Map<SoundEffect, HTMLAudioElement[]> = new Map();
  private music: Map<MusicTrack, HTMLAudioElement> = new Map();
  private currentMusic: HTMLAudioElement | null = null;
  private currentMusicTrack: MusicTrack | null = null;
  private isInitialized: boolean = false;

  private config: AudioConfig = {
    masterVolume: 1.0,
    sfxVolume: 0.7,
    musicVolume: 0.4,
    muted: false,
  };

  // Sound effect paths
  private readonly soundPaths: Record<SoundEffect, string> = {
    collect: '/assets/audio/collect.mp3',
    death: '/assets/audio/death.mp3',
    gameStart: '/assets/audio/game_start.mp3',
    directionChange: '/assets/audio/direction.mp3',
    pause: '/assets/audio/pause.mp3',
    uiClick: '/assets/audio/click.mp3',
    breedingSuccess: '/assets/audio/breeding_success.mp3',
    energyRegen: '/assets/audio/energy_regen.mp3',
  };

  // Music paths
  private readonly musicPaths: Record<MusicTrack, string> = {
    cyber: '/assets/audio/music/cyber_theme.mp3',
    primal: '/assets/audio/music/primal_theme.mp3',
    cosmic: '/assets/audio/music/cosmic_theme.mp3',
    menu: '/assets/audio/music/menu_theme.mp3',
  };

  // Pool size for concurrent sound effects
  private readonly poolSize = 3;

  /**
   * Initialize and preload all audio
   * Call this after user interaction (to comply with autoplay policies)
   */
  async init(): Promise<void> {
    if (this.isInitialized || typeof window === 'undefined') return;

    try {
      // Preload sound effects with pooling for concurrent playback
      for (const [name, path] of Object.entries(this.soundPaths)) {
        const pool: HTMLAudioElement[] = [];
        for (let i = 0; i < this.poolSize; i++) {
          const audio = new Audio(path);
          audio.preload = 'auto';
          pool.push(audio);
        }
        this.sounds.set(name as SoundEffect, pool);
      }

      // Preload music tracks
      for (const [name, path] of Object.entries(this.musicPaths)) {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.loop = true;
        this.music.set(name as MusicTrack, audio);
      }

      this.isInitialized = true;
    } catch (error) {
      console.warn('Audio initialization failed:', error);
    }
  }

  /**
   * Play a sound effect
   */
  play(sound: SoundEffect): void {
    if (this.config.muted || !this.isInitialized) return;

    const pool = this.sounds.get(sound);
    if (!pool) return;

    // Find an audio element that's not playing
    const audio = pool.find(a => a.paused || a.ended) || pool[0];

    try {
      audio.volume = this.config.masterVolume * this.config.sfxVolume;
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay failures
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Play background music
   */
  playMusic(track: MusicTrack, fadeIn: boolean = true): void {
    if (this.config.muted || !this.isInitialized) return;

    const audio = this.music.get(track);
    if (!audio) return;

    // Stop current music
    if (this.currentMusic && this.currentMusic !== audio) {
      this.fadeOutMusic(this.currentMusic);
    }

    this.currentMusic = audio;
    this.currentMusicTrack = track;

    try {
      if (fadeIn) {
        audio.volume = 0;
        audio.play().catch(() => {});
        this.fadeInMusic(audio);
      } else {
        audio.volume = this.config.masterVolume * this.config.musicVolume;
        audio.play().catch(() => {});
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Stop current music
   */
  stopMusic(fadeOut: boolean = true): void {
    if (!this.currentMusic) return;

    if (fadeOut) {
      this.fadeOutMusic(this.currentMusic);
    } else {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }

    this.currentMusic = null;
    this.currentMusicTrack = null;
  }

  /**
   * Pause current music
   */
  pauseMusic(): void {
    this.currentMusic?.pause();
  }

  /**
   * Resume current music
   */
  resumeMusic(): void {
    if (this.currentMusic && this.currentMusic.paused && !this.config.muted) {
      this.currentMusic.play().catch(() => {});
    }
  }

  /**
   * Fade in music over duration
   */
  private fadeInMusic(audio: HTMLAudioElement, duration: number = 1000): void {
    const targetVolume = this.config.masterVolume * this.config.musicVolume;
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = targetVolume / steps;
    let currentStep = 0;

    const fade = setInterval(() => {
      currentStep++;
      audio.volume = Math.min(targetVolume, volumeStep * currentStep);
      if (currentStep >= steps) {
        clearInterval(fade);
      }
    }, stepDuration);
  }

  /**
   * Fade out music over duration
   */
  private fadeOutMusic(audio: HTMLAudioElement, duration: number = 500): void {
    const startVolume = audio.volume;
    const steps = 10;
    const stepDuration = duration / steps;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    const fade = setInterval(() => {
      currentStep++;
      audio.volume = Math.max(0, startVolume - volumeStep * currentStep);
      if (currentStep >= steps) {
        clearInterval(fade);
        audio.pause();
        audio.currentTime = 0;
      }
    }, stepDuration);
  }

  /**
   * Set master volume (0-1)
   */
  setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateMusicVolume();
  }

  /**
   * Set SFX volume (0-1)
   */
  setSfxVolume(volume: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set music volume (0-1)
   */
  setMusicVolume(volume: number): void {
    this.config.musicVolume = Math.max(0, Math.min(1, volume));
    this.updateMusicVolume();
  }

  /**
   * Update current music volume
   */
  private updateMusicVolume(): void {
    if (this.currentMusic) {
      this.currentMusic.volume = this.config.masterVolume * this.config.musicVolume;
    }
  }

  /**
   * Mute/unmute all audio
   */
  setMuted(muted: boolean): void {
    this.config.muted = muted;
    if (muted) {
      this.pauseMusic();
    } else if (this.currentMusic) {
      this.resumeMusic();
    }
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
   * Get current playing music track
   */
  get currentTrack(): MusicTrack | null {
    return this.currentMusicTrack;
  }
}

// Singleton instance
export const audioManager = new AudioManagerClass();

// Export class for testing
export { AudioManagerClass };
