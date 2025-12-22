/**
 * Screen Shake Effect - Camera shake for impact
 * AAA 2026 Standard: Juicy visual feedback
 */

import { Vector3 } from 'three';

export interface ShakeConfig {
  intensity: number;    // Max displacement (units)
  duration: number;     // Total duration (ms)
  decay: boolean;       // Whether to decay over time
  frequency: number;    // Shakes per second
}

export interface ShakeState {
  active: boolean;
  startTime: number;
  config: ShakeConfig;
  offset: Vector3;
}

const defaultConfig: ShakeConfig = {
  intensity: 0.5,
  duration: 500,
  decay: true,
  frequency: 30,
};

export class ScreenShakeManager {
  private state: ShakeState = {
    active: false,
    startTime: 0,
    config: defaultConfig,
    offset: new Vector3(),
  };

  private animationFrame: number | null = null;
  private onUpdate: ((offset: Vector3) => void) | null = null;

  /**
   * Start a screen shake effect
   */
  shake(config: Partial<ShakeConfig> = {}): void {
    this.state = {
      active: true,
      startTime: Date.now(),
      config: { ...defaultConfig, ...config },
      offset: new Vector3(),
    };

    if (this.animationFrame === null) {
      this.animate();
    }
  }

  /**
   * Light shake - for food collection
   */
  light(): void {
    this.shake({
      intensity: 0.1,
      duration: 100,
      decay: true,
      frequency: 40,
    });
  }

  /**
   * Medium shake - for collisions
   */
  medium(): void {
    this.shake({
      intensity: 0.3,
      duration: 300,
      decay: true,
      frequency: 30,
    });
  }

  /**
   * Heavy shake - for death/game over
   */
  heavy(): void {
    this.shake({
      intensity: 0.8,
      duration: 600,
      decay: true,
      frequency: 25,
    });
  }

  /**
   * Set callback for offset updates
   */
  setUpdateCallback(callback: (offset: Vector3) => void): void {
    this.onUpdate = callback;
  }

  /**
   * Clear callback
   */
  clearCallback(): void {
    this.onUpdate = null;
  }

  /**
   * Get current shake offset
   */
  getOffset(): Vector3 {
    return this.state.offset.clone();
  }

  /**
   * Check if shaking
   */
  get isShaking(): boolean {
    return this.state.active;
  }

  /**
   * Stop shaking immediately
   */
  stop(): void {
    this.state.active = false;
    this.state.offset.set(0, 0, 0);
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private animate = (): void => {
    if (!this.state.active) {
      this.animationFrame = null;
      return;
    }

    const now = Date.now();
    const elapsed = now - this.state.startTime;
    const { duration, intensity, decay, frequency } = this.state.config;

    if (elapsed >= duration) {
      this.stop();
      if (this.onUpdate) {
        this.onUpdate(new Vector3());
      }
      return;
    }

    // Calculate decay multiplier
    const progress = elapsed / duration;
    const decayMultiplier = decay ? 1 - progress : 1;

    // Calculate current intensity
    const currentIntensity = intensity * decayMultiplier;

    // Generate random offset based on frequency
    const t = (elapsed / 1000) * frequency * Math.PI * 2;

    // Use perlin-like noise for smoother shake
    const x = Math.sin(t) * Math.cos(t * 0.7) * currentIntensity;
    const y = Math.cos(t * 1.3) * Math.sin(t * 0.9) * currentIntensity * 0.7;
    const z = Math.sin(t * 0.8) * Math.cos(t * 1.1) * currentIntensity;

    this.state.offset.set(x, y, z);

    if (this.onUpdate) {
      this.onUpdate(this.state.offset);
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  };
}

// Singleton instance
export const screenShake = new ScreenShakeManager();

/**
 * React hook for screen shake
 */
export function useScreenShake() {
  return {
    shake: screenShake.shake.bind(screenShake),
    light: screenShake.light.bind(screenShake),
    medium: screenShake.medium.bind(screenShake),
    heavy: screenShake.heavy.bind(screenShake),
    stop: screenShake.stop.bind(screenShake),
    isShaking: screenShake.isShaking,
    setUpdateCallback: screenShake.setUpdateCallback.bind(screenShake),
    clearCallback: screenShake.clearCallback.bind(screenShake),
  };
}
