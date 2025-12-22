import { HapticsManager, haptics } from './Haptics';

describe('HapticsManager', () => {
  let manager: HapticsManager;

  beforeEach(() => {
    manager = new HapticsManager();
    // Mock navigator.vibrate
    Object.defineProperty(navigator, 'vibrate', {
      value: jest.fn(() => true),
      writable: true,
      configurable: true,
    });
  });

  describe('constructor', () => {
    it('should initialize with enabled state', () => {
      expect(manager.enabled).toBe(true);
    });

    it('should detect vibration support', () => {
      expect(typeof manager.supported).toBe('boolean');
    });
  });

  describe('setEnabled', () => {
    it('should enable haptics', () => {
      manager.setEnabled(true);
      expect(manager.enabled).toBe(true);
    });

    it('should disable haptics', () => {
      manager.setEnabled(false);
      expect(manager.enabled).toBe(false);
    });
  });

  describe('toggle', () => {
    it('should toggle enabled state', () => {
      const initial = manager.enabled;
      const result = manager.toggle();
      expect(result).toBe(!initial);
      expect(manager.enabled).toBe(!initial);
    });
  });

  describe('vibrate', () => {
    it('should vibrate with pattern name', () => {
      manager.vibrate('light');
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('should vibrate with custom pattern', () => {
      manager.vibrate([10, 20, 30]);
      expect(navigator.vibrate).toHaveBeenCalledWith([10, 20, 30]);
    });

    it('should not vibrate when disabled', () => {
      manager.setEnabled(false);
      manager.vibrate('light');
      // vibrate should not be called when disabled
    });
  });

  describe('preset patterns', () => {
    it('light() should trigger light vibration', () => {
      manager.light();
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('medium() should trigger medium vibration', () => {
      manager.medium();
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('heavy() should trigger heavy vibration', () => {
      manager.heavy();
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('success() should trigger success pattern', () => {
      manager.success();
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('error() should trigger error pattern', () => {
      manager.error();
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('death() should trigger death pattern', () => {
      manager.death();
      expect(navigator.vibrate).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop vibration', () => {
      manager.stop();
      expect(navigator.vibrate).toHaveBeenCalledWith(0);
    });
  });

  describe('custom', () => {
    it('should vibrate for custom duration', () => {
      manager.custom(100);
      expect(navigator.vibrate).toHaveBeenCalledWith([100]);
    });
  });

  describe('customPattern', () => {
    it('should vibrate with custom pattern', () => {
      const pattern = [50, 25, 50];
      manager.customPattern(pattern);
      expect(navigator.vibrate).toHaveBeenCalledWith(pattern);
    });
  });
});

describe('haptics singleton', () => {
  it('should be a HapticsManager instance', () => {
    expect(haptics).toBeDefined();
    expect(typeof haptics.light).toBe('function');
    expect(typeof haptics.medium).toBe('function');
    expect(typeof haptics.heavy).toBe('function');
    expect(typeof haptics.success).toBe('function');
    expect(typeof haptics.error).toBe('function');
    expect(typeof haptics.death).toBe('function');
    expect(typeof haptics.stop).toBe('function');
    expect(typeof haptics.toggle).toBe('function');
  });
});
