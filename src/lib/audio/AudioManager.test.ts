import { AudioManagerClass, audioManager } from './AudioManager';

// ---------------------------------------------------------------------------
// Web Audio API mocks
// ---------------------------------------------------------------------------

class MockAudioParam {
  value = 0;
  setValueAtTime = jest.fn();
  linearRampToValueAtTime = jest.fn();
  exponentialRampToValueAtTime = jest.fn();
}

class MockGainNode {
  gain = new MockAudioParam();
  connect = jest.fn();
}

class MockOscillatorNode {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam();
  connect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
}

class MockBufferSourceNode {
  buffer: unknown = null;
  connect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
}

class MockBiquadFilterNode {
  type = 'lowpass';
  frequency = new MockAudioParam();
  connect = jest.fn();
}

class MockAudioBuffer {
  private data: Float32Array;

  constructor(length: number) {
    this.data = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

class MockAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  sampleRate = 44100;
  destination = {} as AudioDestinationNode;

  gains: MockGainNode[] = [];
  oscillators: MockOscillatorNode[] = [];
  bufferSources: MockBufferSourceNode[] = [];
  filters: MockBiquadFilterNode[] = [];

  resume = jest.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });

  createGain = jest.fn(() => {
    const node = new MockGainNode();
    this.gains.push(node);
    return node;
  });

  createOscillator = jest.fn(() => {
    const node = new MockOscillatorNode();
    this.oscillators.push(node);
    return node;
  });

  createBufferSource = jest.fn(() => {
    const node = new MockBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  });

  createBiquadFilter = jest.fn(() => {
    const node = new MockBiquadFilterNode();
    this.filters.push(node);
    return node;
  });

  createBuffer = jest.fn(
    (_channels: number, length: number) => new MockAudioBuffer(length)
  );
}

const ALL_SOUNDS = [
  'collect',
  'death',
  'gameStart',
  'directionChange',
  'pause',
  'uiClick',
  'breedingSuccess',
  'energyRegen',
] as const;

describe('AudioManagerClass', () => {
  let manager: AudioManagerClass;
  let mockContext: MockAudioContext;
  let contextConstructor: jest.Mock;

  beforeEach(() => {
    manager = new AudioManagerClass();
    contextConstructor = jest.fn(() => {
      mockContext = new MockAudioContext();
      return mockContext;
    });
    // @ts-expect-error - Mocking AudioContext constructor
    window.AudioContext = contextConstructor;
  });

  afterEach(() => {
    // @ts-expect-error - cleanup mocked constructor
    delete window.AudioContext;
  });

  describe('initialization', () => {
    it('should not be initialized by default', () => {
      expect(manager.initialized).toBe(false);
    });

    it('should not create an AudioContext before init() (lazy creation)', () => {
      expect(contextConstructor).not.toHaveBeenCalled();
    });

    it('should create the AudioContext when init() is called', async () => {
      await manager.init();
      expect(manager.initialized).toBe(true);
      expect(contextConstructor).toHaveBeenCalledTimes(1);
    });

    it('should connect a master SFX gain to the destination', async () => {
      await manager.init();
      const masterGain = mockContext.gains[0];
      expect(mockContext.createGain).toHaveBeenCalled();
      expect(masterGain.connect).toHaveBeenCalledWith(mockContext.destination);
      // default: masterVolume 1.0 * sfxVolume 0.7
      expect(masterGain.gain.value).toBeCloseTo(0.7);
    });

    it('should resume a suspended context', async () => {
      contextConstructor.mockImplementationOnce(() => {
        mockContext = new MockAudioContext();
        mockContext.state = 'suspended';
        return mockContext;
      });

      await manager.init();
      expect(mockContext.resume).toHaveBeenCalled();
    });

    it('should not re-initialize if already initialized', async () => {
      await manager.init();
      await manager.init();
      expect(contextConstructor).toHaveBeenCalledTimes(1);
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

    it('should apply volume changes to the SFX bus gain', async () => {
      await manager.init();
      const masterGain = mockContext.gains[0];

      manager.setMasterVolume(0.5);
      expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(
        0.5 * 0.7,
        mockContext.currentTime
      );

      manager.setSfxVolume(0.2);
      expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(
        0.5 * 0.2,
        mockContext.currentTime
      );
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

    it('mute should zero the SFX bus gain, unmute should restore it', async () => {
      await manager.init();
      const masterGain = mockContext.gains[0];

      manager.setMuted(true);
      expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(
        0,
        mockContext.currentTime
      );

      manager.setMuted(false);
      expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(
        0.7,
        mockContext.currentTime
      );
    });
  });

  describe('play sound (synthesis)', () => {
    it('should not play if not initialized', () => {
      manager.play('collect');
      expect(contextConstructor).not.toHaveBeenCalled();
    });

    it('should not schedule anything if muted', async () => {
      await manager.init();
      manager.setMuted(true);
      manager.play('collect');
      expect(mockContext.createOscillator).not.toHaveBeenCalled();
    });

    it.each(ALL_SOUNDS)('should synthesize "%s" without throwing', async (sound) => {
      await manager.init();
      manager.play(sound);
      const scheduled =
        mockContext.oscillators.length + mockContext.bufferSources.length;
      expect(scheduled).toBeGreaterThan(0);
    });

    it('collect should schedule a two-note ascending sine arpeggio', async () => {
      await manager.init();
      manager.play('collect');

      expect(mockContext.oscillators).toHaveLength(2);
      const [first, second] = mockContext.oscillators;

      expect(first.type).toBe('sine');
      expect(second.type).toBe('sine');
      expect(first.frequency.setValueAtTime).toHaveBeenCalledWith(660, 0);
      expect(second.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0.06);
      expect(first.start).toHaveBeenCalledWith(0);
      expect(second.start).toHaveBeenCalledWith(0.06);
      expect(first.stop).toHaveBeenCalled();
      expect(second.stop).toHaveBeenCalled();
    });

    it('should schedule an attack/decay envelope per note', async () => {
      await manager.init();
      manager.play('collect');

      // gains[0] is the master bus; each note gets its own envelope gain
      const envelope = mockContext.gains[1];
      expect(envelope.gain.setValueAtTime).toHaveBeenCalledWith(0, 0);
      expect(envelope.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        0.15,
        expect.any(Number)
      );
      expect(envelope.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        0.0001,
        expect.any(Number)
      );
    });

    it('death should include a descending sawtooth and a noise burst', async () => {
      await manager.init();
      manager.play('death');

      expect(mockContext.oscillators).toHaveLength(1);
      const saw = mockContext.oscillators[0];
      expect(saw.type).toBe('sawtooth');
      expect(saw.frequency.setValueAtTime).toHaveBeenCalledWith(220, 0);
      expect(saw.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        55,
        expect.any(Number)
      );

      expect(mockContext.bufferSources).toHaveLength(1);
      expect(mockContext.bufferSources[0].start).toHaveBeenCalled();
      expect(mockContext.createBiquadFilter).toHaveBeenCalled();
    });

    it('uiClick should be a filtered noise click', async () => {
      await manager.init();
      manager.play('uiClick');

      expect(mockContext.oscillators).toHaveLength(0);
      expect(mockContext.bufferSources).toHaveLength(1);
      expect(mockContext.filters).toHaveLength(1);
      expect(mockContext.filters[0].type).toBe('bandpass');
      expect(mockContext.filters[0].frequency.setValueAtTime).toHaveBeenCalledWith(
        2000,
        0
      );
    });

    it('breedingSuccess should arpeggiate a major triad', async () => {
      await manager.init();
      manager.play('breedingSuccess');

      expect(mockContext.oscillators).toHaveLength(3);
      const [c, e, g] = mockContext.oscillators;
      expect(c.frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 0);
      expect(e.frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 0.11);
      expect(g.frequency.setValueAtTime).toHaveBeenCalledWith(783.99, 0.22);
    });

    it.each(ALL_SOUNDS)(
      'should keep "%s" envelope peaks at or below 0.2',
      async (sound) => {
        await manager.init();
        manager.play(sound);

        // Every envelope node (all gains after the master bus)
        for (const gain of mockContext.gains.slice(1)) {
          for (const call of gain.gain.linearRampToValueAtTime.mock.calls) {
            expect(call[0]).toBeLessThanOrEqual(0.2);
          }
          for (const call of gain.gain.setValueAtTime.mock.calls) {
            expect(call[0]).toBeLessThanOrEqual(0.2);
          }
        }
      }
    );

    it('should reuse the cached noise buffer across noise sounds', async () => {
      await manager.init();
      manager.play('uiClick');
      manager.play('uiClick');
      expect(mockContext.createBuffer).toHaveBeenCalledTimes(1);
    });
  });

  describe('music control (no music at launch)', () => {
    it('currentTrack should be null initially', () => {
      expect(manager.currentTrack).toBeNull();
    });

    it('playMusic should be a no-op and keep currentTrack null', async () => {
      await manager.init();
      manager.playMusic('cyber');
      expect(manager.currentTrack).toBeNull();
      expect(mockContext.createOscillator).not.toHaveBeenCalled();
    });

    it('stopMusic should not throw if no music playing', () => {
      manager.stopMusic();
      expect(manager.currentTrack).toBeNull();
    });

    it('pauseMusic and resumeMusic should not throw', () => {
      expect(() => {
        manager.pauseMusic();
        manager.resumeMusic();
      }).not.toThrow();
    });
  });
});

describe('audioManager singleton', () => {
  it('should preserve the public API surface', () => {
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
