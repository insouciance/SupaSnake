/**
 * Haptics - Mobile Vibration Feedback
 * AAA 2026 Standard: Tactile feedback for mobile games
 */

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'death';

interface HapticPatterns {
  light: number[];
  medium: number[];
  heavy: number[];
  success: number[];
  error: number[];
  death: number[];
}

class HapticsManager {
  private isSupported: boolean;
  private isEnabled: boolean;

  private patterns: HapticPatterns = {
    light: [10],
    medium: [25],
    heavy: [50],
    success: [10, 50, 20],
    error: [50, 30, 50],
    death: [100, 50, 100, 50, 200],
  };

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    this.isEnabled = true;
  }

  /**
   * Check if haptics are supported on this device
   */
  get supported(): boolean {
    return this.isSupported;
  }

  /**
   * Check if haptics are enabled
   */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Enable or disable haptic feedback
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Toggle haptic feedback
   */
  toggle(): boolean {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  /**
   * Trigger a vibration pattern
   */
  vibrate(pattern: HapticPattern | number[]): boolean {
    if (!this.isSupported || !this.isEnabled) {
      return false;
    }

    try {
      const vibrationPattern = Array.isArray(pattern)
        ? pattern
        : this.patterns[pattern];

      return navigator.vibrate(vibrationPattern);
    } catch {
      return false;
    }
  }

  /**
   * Light tap - for UI interactions, direction changes
   */
  light(): boolean {
    return this.vibrate('light');
  }

  /**
   * Medium feedback - for food collection
   */
  medium(): boolean {
    return this.vibrate('medium');
  }

  /**
   * Heavy feedback - for important events
   */
  heavy(): boolean {
    return this.vibrate('heavy');
  }

  /**
   * Success pattern - for breeding success and run triumphs
   */
  success(): boolean {
    return this.vibrate('success');
  }

  /**
   * Error pattern - for failed actions
   */
  error(): boolean {
    return this.vibrate('error');
  }

  /**
   * Death pattern - dramatic feedback for game over
   */
  death(): boolean {
    return this.vibrate('death');
  }

  /**
   * Stop any ongoing vibration
   */
  stop(): void {
    if (this.isSupported) {
      navigator.vibrate(0);
    }
  }

  /**
   * Custom vibration with duration in ms
   */
  custom(duration: number): boolean {
    return this.vibrate([duration]);
  }

  /**
   * Custom pattern with alternating vibrate/pause durations
   */
  customPattern(pattern: number[]): boolean {
    return this.vibrate(pattern);
  }
}

// Singleton instance
export const haptics = new HapticsManager();

// Export class for testing
export { HapticsManager };
