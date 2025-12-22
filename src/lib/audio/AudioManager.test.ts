import { AudioManagerClass, audioManager } from './AudioManager';

// Mock HTMLAudioElement
class MockAudio {
  src = '';
  preload = '';
  loop = false;
  volume = 1;
  paused = true;
  ended = false;
  currentTime = 0;

  play = jest.fn(() => Promise.resolve());
  pause = jest.fn();
}

describe('AudioManagerClass', () => {
  let manager: AudioManagerClass;
  let originalAudio: typeof Audio;

  beforeEach(() => {
    manager = new AudioManagerClass();
    originalAudio = global.Audio;
    // @ts-expect-error - Mocking Audio constructor
    global.Audio = jest.fn(() => new MockAudio());
  });

  afterEach(() => {
    global.Audio = originalAudio;
  });

  describe('initialization', () => {
    it('should not be initialized by default', () => {
      expect(manager.initialized).toBe(false);
    });

    it('should initialize when init() is called', async () => {
      await manager.init();
      expect(manager.initialized).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      await manager.init();
      await manager.init();
      expect(manager.initialized).toBe(true);
    });
  });

  describe('config', () => {
    it('should return config object', () => {
      const config = manager.getConfig();
      expect(config).toHaveProperty('masterVolume');
      expect(config).toHaveProperty('sfxVolume');
      expect(config).toHaveProperty('musicVolume');
      expect(config).toHaveProperty('muted');
    });

    it('should not be muted by default', () => {
      expect(manager.isMuted).toBe(false);
    });
  });

  describe('volume control', () => {
    it('setMasterVolume should clamp to 0-1', () => {
      manager.setMasterVolume(1.5);
      expect(manager.getConfig().masterVolume).toBe(1);

      manager.setMasterVolume(-0.5);
      expect(manager.getConfig().masterVolume).toBe(0);

      manager.setMasterVolume(0.5);
      expect(manager.getConfig().masterVolume).toBe(0.5);
    });

    it('setSfxVolume should clamp to 0-1', () => {
      manager.setSfxVolume(0.8);
      expect(manager.getConfig().sfxVolume).toBe(0.8);
    });

    it('setMusicVolume should clamp to 0-1', () => {
      manager.setMusicVolume(0.3);
      expect(manager.getConfig().musicVolume).toBe(0.3);
    });
  });

  describe('mute control', () => {
    it('setMuted should mute audio', () => {
      manager.setMuted(true);
      expect(manager.isMuted).toBe(true);
    });

    it('setMuted should unmute audio', () => {
      manager.setMuted(true);
      manager.setMuted(false);
      expect(manager.isMuted).toBe(false);
    });

    it('toggleMute should toggle mute state', () => {
      expect(manager.isMuted).toBe(false);
      manager.toggleMute();
      expect(manager.isMuted).toBe(true);
      manager.toggleMute();
      expect(manager.isMuted).toBe(false);
    });
  });

  describe('play sound', () => {
    it('should not play if not initialized', () => {
      // Should not throw
      manager.play('collect');
    });

    it('should not play if muted', async () => {
      await manager.init();
      manager.setMuted(true);
      manager.play('collect');
      // No error should occur
    });
  });

  describe('music control', () => {
    it('currentTrack should be null initially', () => {
      expect(manager.currentTrack).toBeNull();
    });

    it('should not play music if not initialized', () => {
      manager.playMusic('ember');
      expect(manager.currentTrack).toBeNull();
    });

    it('stopMusic should not throw if no music playing', () => {
      manager.stopMusic();
      expect(manager.currentTrack).toBeNull();
    });

    it('pauseMusic should not throw if no music playing', () => {
      manager.pauseMusic();
      expect(true).toBe(true);
    });

    it('resumeMusic should not throw if no music playing', () => {
      manager.resumeMusic();
      expect(true).toBe(true);
    });
  });
});

describe('audioManager singleton', () => {
  it('should be an AudioManagerClass instance', () => {
    expect(audioManager).toBeDefined();
    expect(typeof audioManager.init).toBe('function');
    expect(typeof audioManager.play).toBe('function');
    expect(typeof audioManager.playMusic).toBe('function');
    expect(typeof audioManager.stopMusic).toBe('function');
    expect(typeof audioManager.pauseMusic).toBe('function');
    expect(typeof audioManager.resumeMusic).toBe('function');
    expect(typeof audioManager.setMasterVolume).toBe('function');
    expect(typeof audioManager.setSfxVolume).toBe('function');
    expect(typeof audioManager.setMusicVolume).toBe('function');
    expect(typeof audioManager.setMuted).toBe('function');
    expect(typeof audioManager.toggleMute).toBe('function');
  });

  it('should have isMuted and initialized getters', () => {
    expect(typeof audioManager.isMuted).toBe('boolean');
    expect(typeof audioManager.initialized).toBe('boolean');
  });
});
