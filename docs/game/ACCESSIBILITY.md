# Accessibility Guidelines - SupaSnake

## Overview

SupaSnake is committed to providing an inclusive gaming experience for all players, regardless of their physical, sensory, or cognitive abilities. This document outlines accessibility requirements, implementation strategies, and testing methodologies to ensure WCAG 2.1 AA compliance.

**Target Platforms:** iOS, Android (React Native/Expo)
**Game Type:** Fast-paced arcade snake game with color-coded dynasties
**Compliance Goal:** WCAG 2.1 AA + Mobile Accessibility Guidelines

---

## 1. Visual Accessibility

### 1.1 Color-Blind Modes

**Problem:** Dynasty colors (red, blue, purple, green, yellow) may be indistinguishable for players with color vision deficiencies.

**Solutions:**

#### Color-Blind Mode Variants
- **Protanopia Mode** (Red-blind, ~1% of males)
  - Replace red with dark blue
  - Replace green with yellow-green
  - Use blue/yellow color palette

- **Deuteranopia Mode** (Green-blind, ~1% of males)
  - Replace green with orange-brown
  - Replace red with magenta
  - Use blue/magenta/yellow palette

- **Tritanopia Mode** (Blue-blind, ~0.01% of population)
  - Replace blue with teal
  - Replace yellow with pink
  - Use red/teal/pink palette

#### Color Palette Reference

```typescript
// File: src/shared/config/accessibility/color-palettes.ts

export interface ColorPalette {
  red: string;
  blue: string;
  purple: string;
  green: string;
  yellow: string;
  orange: string;
}

export const COLOR_PALETTES: Record<string, ColorPalette> = {
  standard: {
    red: '#FF0000',
    blue: '#0000FF',
    purple: '#9B30FF',
    green: '#00FF00',
    yellow: '#FFFF00',
    orange: '#FF6600',
  },
  protanopia: {
    red: '#003F87',      // Dark blue (replaces red)
    blue: '#87CEEB',     // Light blue
    purple: '#6A0DAD',   // Purple (unchanged)
    green: '#B8C600',    // Yellow-green (replaces green)
    yellow: '#FFD700',   // Gold (unchanged)
    orange: '#FF8C00',   // Dark orange
  },
  deuteranopia: {
    red: '#D62598',      // Magenta (replaces red)
    blue: '#0066CC',     // Blue (unchanged)
    purple: '#9B30FF',   // Purple (unchanged)
    green: '#CC6600',    // Orange-brown (replaces green)
    yellow: '#FFDD00',   // Yellow (unchanged)
    orange: '#FF9900',   // Orange
  },
  tritanopia: {
    red: '#FF4040',      // Red (unchanged)
    blue: '#00CED1',     // Teal (replaces blue)
    purple: '#C71585',   // Medium violet-red
    green: '#90EE90',    // Light green (unchanged)
    yellow: '#FFB6C1',   // Pink (replaces yellow)
    orange: '#FF7F50',   // Coral
  },
};
```

#### Implementation Steps

1. **Settings Toggle**
```typescript
// File: src/lib/accessibility/color-mode-manager.ts

import { ColorPalette, COLOR_PALETTES } from '@/shared/config/accessibility/color-palettes';

export type ColorBlindMode = 'standard' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export class ColorModeManager {
  private currentMode: ColorBlindMode = 'standard';

  setMode(mode: ColorBlindMode): void {
    this.currentMode = mode;
    this.applyPalette(COLOR_PALETTES[mode]);
  }

  private applyPalette(palette: ColorPalette): void {
    // Update CSS variables
    document.documentElement.style.setProperty('--color-dynasty-red', palette.red);
    document.documentElement.style.setProperty('--color-dynasty-blue', palette.blue);
    document.documentElement.style.setProperty('--color-dynasty-purple', palette.purple);
    document.documentElement.style.setProperty('--color-dynasty-green', palette.green);
    document.documentElement.style.setProperty('--color-dynasty-yellow', palette.yellow);
    document.documentElement.style.setProperty('--color-dynasty-orange', palette.orange);
  }

  getCurrentPalette(): ColorPalette {
    return COLOR_PALETTES[this.currentMode];
  }
}
```

2. **Pattern Overlays** (Redundant Coding)
   - Add texture patterns to dynasty colors
   - Red: Diagonal stripes (///)
   - Blue: Dots (...)
   - Purple: Cross-hatch (XXX)
   - Green: Vertical lines (|||)
   - Yellow: Horizontal lines (===)

```typescript
// File: src/components/game/DynastySnake.tsx

interface DynastySnakeProps {
  color: string;
  pattern: 'stripes' | 'dots' | 'cross-hatch' | 'vertical' | 'horizontal';
  enablePatterns: boolean;
}

function DynastySnake({ color, pattern, enablePatterns }: DynastySnakeProps) {
  const backgroundStyle = enablePatterns
    ? { backgroundColor: color, backgroundImage: `url(/patterns/${pattern}.svg)` }
    : { backgroundColor: color };

  return <View style={[styles.snake, backgroundStyle]} />;
}
```

### 1.2 High Contrast Mode

**Goal:** Ensure 7:1 contrast ratio for text, 3:1 for UI components (WCAG AAA)

#### Contrast Requirements
- **Text on Background:** 7:1 minimum
- **UI Components:** 3:1 minimum
- **Game Elements:** 3:1 against background

#### Implementation

```typescript
// File: src/shared/config/accessibility/high-contrast.ts

export const HIGH_CONTRAST_THEME = {
  background: '#000000',
  text: '#FFFFFF',
  primary: '#FFFF00',      // Yellow (maximum contrast)
  secondary: '#00FFFF',    // Cyan
  danger: '#FF0000',       // Red
  success: '#00FF00',      // Green
  border: '#FFFFFF',
  gridLines: '#808080',    // Gray (minimum 3:1 with black)
};

export function applyHighContrastMode(enabled: boolean): void {
  if (enabled) {
    document.body.classList.add('high-contrast-mode');
  } else {
    document.body.classList.remove('high-contrast-mode');
  }
}
```

```css
/* File: src/app/globals.css */

.high-contrast-mode {
  --background: #000000;
  --text: #FFFFFF;
  --primary: #FFFF00;
  --secondary: #00FFFF;
  --border: #FFFFFF;
}

.high-contrast-mode .game-grid {
  border: 2px solid var(--border);
}

.high-contrast-mode .snake-segment {
  border: 1px solid var(--border);
}

.high-contrast-mode button {
  border: 2px solid var(--text);
  font-weight: bold;
}
```

### 1.3 Text Scaling

**Goal:** Support dynamic type sizes from 100% to 200% (platform standard)

#### Font Size Standards
- **Minimum Base:** 16px (iOS/Android standard)
- **Small Text:** 14px (labels, metadata)
- **Body Text:** 16px (descriptions, instructions)
- **Headings:** 20px-32px (titles, section headers)
- **Maximum Scale:** 200% (accessibility settings)

#### Implementation

```typescript
// File: src/lib/accessibility/text-scaling.ts

export type TextScale = 100 | 125 | 150 | 175 | 200;

export function getScaledFontSize(baseSize: number, scale: TextScale): number {
  return Math.round(baseSize * (scale / 100));
}

export const FONT_SIZES = {
  xs: 12,   // Minimum for metadata
  sm: 14,   // Small labels
  base: 16, // Body text
  lg: 18,   // Emphasized text
  xl: 20,   // Subheadings
  '2xl': 24,
  '3xl': 32,
};
```

```typescript
// File: src/components/ui/ScaledText.tsx

import { Text, TextProps } from 'react-native';
import { useAccessibilitySettings } from '@/hooks/useAccessibilitySettings';
import { getScaledFontSize, FONT_SIZES } from '@/lib/accessibility/text-scaling';

interface ScaledTextProps extends TextProps {
  size?: keyof typeof FONT_SIZES;
}

export function ScaledText({ size = 'base', style, ...props }: ScaledTextProps) {
  const { textScale } = useAccessibilitySettings();
  const baseSize = FONT_SIZES[size];
  const scaledSize = getScaledFontSize(baseSize, textScale);

  return <Text style={[{ fontSize: scaledSize }, style]} {...props} />;
}
```

### 1.4 Icon + Color Redundancy

**Principle:** Never use color alone to convey information

#### Icon System

```typescript
// File: src/components/game/DynastyIcon.tsx

import { View, Image } from 'react-native';

interface DynastyIconProps {
  dynasty: 'red' | 'blue' | 'purple' | 'green' | 'yellow' | 'orange';
  size?: number;
}

const DYNASTY_ICONS = {
  red: require('@/assets/icons/dynasties/dragon.png'),     // Red dragon
  blue: require('@/assets/icons/dynasties/wave.png'),      // Blue wave
  purple: require('@/assets/icons/dynasties/crown.png'),   // Purple crown
  green: require('@/assets/icons/dynasties/leaf.png'),     // Green leaf
  yellow: require('@/assets/icons/dynasties/sun.png'),     // Yellow sun
  orange: require('@/assets/icons/dynasties/flame.png'),   // Orange flame
};

export function DynastyIcon({ dynasty, size = 24 }: DynastyIconProps) {
  return (
    <Image
      source={DYNASTY_ICONS[dynasty]}
      style={{ width: size, height: size }}
      accessibilityLabel={`${dynasty} dynasty icon`}
    />
  );
}
```

#### Usage Example

```typescript
// Always pair color with icon
<View style={{ flexDirection: 'row', alignItems: 'center' }}>
  <DynastyIcon dynasty="red" size={24} />
  <ScaledText>Red Dynasty</ScaledText>
</View>
```

---

## 2. Motor Accessibility

### 2.1 Touch Target Sizes

**Requirement:** Minimum 44x44pt touch targets (iOS HIG, Android Material Design)

#### Touch Target Standards

```typescript
// File: src/shared/config/accessibility/touch-targets.ts

export const TOUCH_TARGET_SIZES = {
  minimum: 44,      // Absolute minimum (WCAG 2.1 AA)
  recommended: 48,  // Recommended (Android Material)
  comfortable: 56,  // Comfortable for one-handed use
};

export const SPACING = {
  betweenTargets: 8, // Minimum spacing between interactive elements
};
```

#### Button Component

```typescript
// File: src/components/ui/AccessibleButton.tsx

import { Pressable, Text, ViewStyle } from 'react-native';
import { TOUCH_TARGET_SIZES } from '@/shared/config/accessibility/touch-targets';

interface AccessibleButtonProps {
  onPress: () => void;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function AccessibleButton({
  onPress,
  label,
  variant = 'primary',
  disabled = false,
}: AccessibleButtonProps) {
  const buttonStyle: ViewStyle = {
    minHeight: TOUCH_TARGET_SIZES.recommended,
    minWidth: TOUCH_TARGET_SIZES.recommended,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={buttonStyle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}
```

### 2.2 Swipe Sensitivity Settings

**Goal:** Adjustable sensitivity for players with motor impairments

#### Sensitivity Levels

```typescript
// File: src/lib/game/input-manager.ts

export type SwipeSensitivity = 'low' | 'medium' | 'high' | 'custom';

export const SWIPE_THRESHOLDS = {
  low: {
    minDistance: 20,    // Pixels to register swipe
    maxTime: 500,       // Milliseconds
  },
  medium: {
    minDistance: 40,
    maxTime: 300,
  },
  high: {
    minDistance: 60,
    maxTime: 200,
  },
};

export class InputManager {
  private sensitivity: SwipeSensitivity = 'medium';
  private customThreshold?: { minDistance: number; maxTime: number };

  setSensitivity(sensitivity: SwipeSensitivity, customThreshold?: typeof this.customThreshold): void {
    this.sensitivity = sensitivity;
    this.customThreshold = customThreshold;
  }

  detectSwipe(startX: number, startY: number, endX: number, endY: number, duration: number): 'up' | 'down' | 'left' | 'right' | null {
    const threshold = this.sensitivity === 'custom' && this.customThreshold
      ? this.customThreshold
      : SWIPE_THRESHOLDS[this.sensitivity];

    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Check if swipe meets threshold
    if (distance < threshold.minDistance || duration > threshold.maxTime) {
      return null;
    }

    // Determine direction
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }
}
```

### 2.3 One-Handed Touch Play

**Goal:** Keep ordinary touch steering usable with either hand without a
separate control cluster.

- The playable touch region is one continuous flick surface, so the player can
  begin a gesture from the left, center, or right according to their grip.
- The surface reports accepted/rejected direction feedback without relying on
  color alone.
- At most two unresolved flick directions are buffered. This preserves a fast
  intentional L-turn while preventing a third incidental direction from
  producing an unfair U-turn during tight coiling.
- Pause and every destructive or strategic action remain explicit controls
  outside the playable board; steering gestures cannot activate them.

### 2.4 Auto-Play / Assisted Mode

**Goal:** Reduced difficulty mode for players with severe motor impairments

#### Features
- Slower game speed (50% default)
- Auto-collect nearby food (within 2 tiles)
- Collision warnings (visual + haptic)
- Optional AI assistance (suggest next move)

```typescript
// File: src/lib/game/assisted-mode.ts

export interface AssistedModeConfig {
  enabled: boolean;
  speedMultiplier: number;       // 0.5 = half speed
  autoCollectRadius: number;     // Tiles
  collisionWarnings: boolean;
  aiAssistance: boolean;
}

export const DEFAULT_ASSISTED_CONFIG: AssistedModeConfig = {
  enabled: false,
  speedMultiplier: 0.5,
  autoCollectRadius: 2,
  collisionWarnings: true,
  aiAssistance: false,
};

export function calculateAssistedSpeed(baseSpeed: number, config: AssistedModeConfig): number {
  return config.enabled ? baseSpeed * config.speedMultiplier : baseSpeed;
}

export function shouldAutoCollect(
  snakeHead: { x: number; y: number },
  food: { x: number; y: number },
  config: AssistedModeConfig
): boolean {
  if (!config.enabled) return false;

  const distance = Math.abs(snakeHead.x - food.x) + Math.abs(snakeHead.y - food.y);
  return distance <= config.autoCollectRadius;
}
```

---

## 3. Audio Accessibility

### 3.1 Subtitles for Audio Cues

**Requirement:** All gameplay-relevant audio must have visual equivalents

#### Audio Events → Visual Indicators

```typescript
// File: src/lib/accessibility/audio-captioning.ts

export type AudioEvent =
  | 'food-collected'
  | 'collision'
  | 'level-up'
  | 'power-up-activated'
  | 'game-over'
  | 'achievement-unlocked';

export interface AudioCaption {
  event: AudioEvent;
  text: string;
  color: string;
  icon?: string;
}

export const AUDIO_CAPTIONS: Record<AudioEvent, AudioCaption> = {
  'food-collected': {
    event: 'food-collected',
    text: 'Food collected',
    color: '#00FF00',
    icon: '🍎',
  },
  'collision': {
    event: 'collision',
    text: 'Collision!',
    color: '#FF0000',
    icon: '💥',
  },
  'level-up': {
    event: 'level-up',
    text: 'Level Up!',
    color: '#FFD700',
    icon: '⭐',
  },
  'power-up-activated': {
    event: 'power-up-activated',
    text: 'Power-up activated',
    color: '#9B30FF',
    icon: '⚡',
  },
  'game-over': {
    event: 'game-over',
    text: 'Game Over',
    color: '#FF4500',
    icon: '🏁',
  },
  'achievement-unlocked': {
    event: 'achievement-unlocked',
    text: 'Achievement unlocked!',
    color: '#FFD700',
    icon: '🏆',
  },
};
```

#### Caption Display Component

```typescript
// File: src/components/game/AudioCaption.tsx

import { useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { AudioCaption, AUDIO_CAPTIONS } from '@/lib/accessibility/audio-captioning';

interface AudioCaptionProps {
  event: AudioEvent | null;
}

export function AudioCaptionDisplay({ event }: AudioCaptionProps) {
  const [caption, setCaption] = useState<AudioCaption | null>(null);
  const opacity = useState(new Animated.Value(0))[0];

  useEffect(() => {
    if (!event) return;

    const captionData = AUDIO_CAPTIONS[event];
    setCaption(captionData);

    // Fade in
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setCaption(null));
  }, [event]);

  if (!caption) return null;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 100,
        left: 0,
        right: 0,
        alignItems: 'center',
        opacity,
      }}
    >
      <View
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          borderLeftWidth: 4,
          borderLeftColor: caption.color,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 4,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' }}>
          {caption.icon} {caption.text}
        </Text>
      </View>
    </Animated.View>
  );
}
```

### 3.2 Haptic Feedback

**Goal:** Provide tactile alternatives to audio cues

#### Haptic Patterns

```typescript
// File: src/lib/accessibility/haptic-feedback.ts

import * as Haptics from 'expo-haptics';

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export async function triggerHaptic(pattern: HapticPattern): Promise<void> {
  switch (pattern) {
    case 'light':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'medium':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'heavy':
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'success':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'warning':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      break;
    case 'error':
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
  }
}

// Map audio events to haptic patterns
export const AUDIO_TO_HAPTIC_MAP: Record<AudioEvent, HapticPattern> = {
  'food-collected': 'light',
  'collision': 'error',
  'level-up': 'success',
  'power-up-activated': 'medium',
  'game-over': 'heavy',
  'achievement-unlocked': 'success',
};

export async function handleAudioEvent(
  event: AudioEvent,
  settings: { soundEnabled: boolean; hapticsEnabled: boolean }
): Promise<void> {
  // Play sound if enabled
  if (settings.soundEnabled) {
    // Play audio...
  }

  // Trigger haptic if enabled
  if (settings.hapticsEnabled) {
    const pattern = AUDIO_TO_HAPTIC_MAP[event];
    await triggerHaptic(pattern);
  }
}
```

### 3.3 Visual Sound Indicators

**Goal:** On-screen indicators for directional audio (e.g., power-up spawn location)

```typescript
// File: src/components/game/SoundIndicator.tsx

import { View } from 'react-native';

interface SoundIndicatorProps {
  x: number;
  y: number;
  type: 'power-up' | 'danger' | 'reward';
}

export function SoundIndicator({ x, y, type }: SoundIndicatorProps) {
  const colors = {
    'power-up': '#9B30FF',
    'danger': '#FF0000',
    'reward': '#FFD700',
  };

  return (
    <View
      style={{
        position: 'absolute',
        left: x - 20,
        top: y - 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 3,
        borderColor: colors[type],
        opacity: 0.6,
      }}
      accessibilityLabel={`${type} at position ${x}, ${y}`}
    />
  );
}
```

---

## 4. Cognitive Accessibility

### 4.1 Tutorial Replay

**Goal:** Allow players to re-watch tutorials at any time

```typescript
// File: src/lib/tutorials/tutorial-manager.ts

export type TutorialId = 'basic-movement' | 'food-collection' | 'dynasty-system' | 'power-ups';

export interface Tutorial {
  id: TutorialId;
  title: string;
  steps: TutorialStep[];
}

export interface TutorialStep {
  text: string;
  image?: string;
  duration: number; // Milliseconds to display
}

export class TutorialManager {
  private completedTutorials: Set<TutorialId> = new Set();

  markCompleted(tutorialId: TutorialId): void {
    this.completedTutorials.add(tutorialId);
  }

  isCompleted(tutorialId: TutorialId): boolean {
    return this.completedTutorials.has(tutorialId);
  }

  replay(tutorialId: TutorialId): void {
    // Reset progress and replay tutorial
    this.completedTutorials.delete(tutorialId);
  }
}
```

#### Tutorial UI

```typescript
// File: src/components/game/TutorialOverlay.tsx

import { View, Text, Pressable } from 'react-native';
import { Tutorial, TutorialStep } from '@/lib/tutorials/tutorial-manager';

interface TutorialOverlayProps {
  tutorial: Tutorial;
  onComplete: () => void;
  onSkip: () => void;
}

export function TutorialOverlay({ tutorial, onComplete, onSkip }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < tutorial.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const step = tutorial.steps[currentStep];

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 24, marginBottom: 20 }}>
        {tutorial.title}
      </Text>
      <Text style={{ color: '#FFFFFF', fontSize: 18, textAlign: 'center', marginBottom: 40 }}>
        {step.text}
      </Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <AccessibleButton onPress={onSkip} label="Skip Tutorial" variant="secondary" />
        <AccessibleButton onPress={handleNext} label={currentStep === tutorial.steps.length - 1 ? 'Finish' : 'Next'} />
      </View>
    </View>
  );
}
```

### 4.2 Clear Iconography

**Requirement:** All icons must be recognizable and have text labels

#### Icon Design Guidelines
- **Size:** Minimum 24x24pt
- **Simplicity:** Clear silhouettes (recognizable at small sizes)
- **Labels:** Always include text label or tooltip
- **Consistency:** Use same icon for same action across app

```typescript
// File: src/components/ui/IconWithLabel.tsx

import { View, Image, Text } from 'react-native';

interface IconWithLabelProps {
  icon: any;
  label: string;
  size?: number;
}

export function IconWithLabel({ icon, label, size = 24 }: IconWithLabelProps) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Image
        source={icon}
        style={{ width: size, height: size }}
        accessibilityLabel={label}
      />
      <Text style={{ fontSize: 12 }}>{label}</Text>
    </View>
  );
}
```

### 4.3 Reduced Motion Mode

**Goal:** Minimize animations for players sensitive to motion

```typescript
// File: src/lib/accessibility/reduced-motion.ts

export function useReducedMotion(): boolean {
  const { reducedMotionEnabled } = useAccessibilitySettings();
  return reducedMotionEnabled;
}

// Usage in animations
function AnimatedComponent() {
  const reducedMotion = useReducedMotion();

  const animationConfig = reducedMotion
    ? { duration: 0 }  // Instant transitions
    : { duration: 300 }; // Normal animations

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
      }}
    >
      {/* Content */}
    </Animated.View>
  );
}
```

#### Affected Animations
- Snake movement: Instant position updates (no interpolation)
- Screen transitions: Fade only (no slide/scale)
- Particle effects: Disabled
- Screen shake: Disabled
- Pulse/breathing effects: Disabled

### 4.4 Pause Anywhere

**Goal:** Allow pausing at any point in gameplay

```typescript
// File: src/lib/game/pause-manager.ts

export class PauseManager {
  private isPaused: boolean = false;
  private pauseCallbacks: Array<() => void> = [];

  pause(): void {
    this.isPaused = true;
    this.pauseCallbacks.forEach(callback => callback());
  }

  resume(): void {
    this.isPaused = false;
  }

  onPause(callback: () => void): void {
    this.pauseCallbacks.push(callback);
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }
}
```

#### Pause UI

```typescript
// File: src/components/game/PauseMenu.tsx

export function PauseMenu({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 32, marginBottom: 40 }}>Paused</Text>
      <View style={{ gap: 16 }}>
        <AccessibleButton onPress={onResume} label="Resume" />
        <AccessibleButton onPress={onQuit} label="Quit to Menu" variant="secondary" />
      </View>
    </View>
  );
}
```

---

## 5. Implementation Checklist

### 5.1 WCAG 2.1 AA Compliance

#### Level A (Must Have)
- [ ] **1.1.1 Non-text Content:** All images have alt text
- [ ] **1.3.1 Info and Relationships:** Semantic HTML structure
- [ ] **1.4.1 Use of Color:** Never use color alone to convey information
- [ ] **1.4.2 Audio Control:** Ability to pause/stop audio
- [ ] **2.1.1 Keyboard:** All functionality available via keyboard
- [ ] **2.2.1 Timing Adjustable:** Extend time limits or disable
- [ ] **2.2.2 Pause, Stop, Hide:** Control over moving content
- [ ] **2.4.1 Bypass Blocks:** Skip navigation links
- [ ] **2.4.2 Page Titled:** Descriptive page titles
- [ ] **3.1.1 Language of Page:** lang attribute set
- [ ] **3.2.1 On Focus:** No automatic context changes
- [ ] **3.2.2 On Input:** No unexpected behavior on input
- [ ] **4.1.1 Parsing:** Valid HTML
- [ ] **4.1.2 Name, Role, Value:** Accessible names for UI components

#### Level AA (Target)
- [ ] **1.2.4 Captions (Live):** Live captions for audio (if applicable)
- [ ] **1.2.5 Audio Description:** Describe visual-only content
- [ ] **1.4.3 Contrast (Minimum):** 4.5:1 text, 3:1 UI
- [ ] **1.4.4 Resize Text:** Support 200% text zoom
- [ ] **1.4.5 Images of Text:** Use real text (not images)
- [ ] **2.4.5 Multiple Ways:** Multiple navigation paths
- [ ] **2.4.6 Headings and Labels:** Descriptive headings
- [ ] **2.4.7 Focus Visible:** Visible focus indicator
- [ ] **3.1.2 Language of Parts:** Language changes marked
- [ ] **3.2.3 Consistent Navigation:** Same nav order
- [ ] **3.2.4 Consistent Identification:** Same components labeled consistently
- [ ] **3.3.3 Error Suggestion:** Provide error correction suggestions
- [ ] **3.3.4 Error Prevention:** Confirm before submission

### 5.2 Platform-Specific Guidelines

#### iOS (Human Interface Guidelines)
- [ ] **Dynamic Type:** Support system text size settings
- [ ] **VoiceOver:** Full screen reader support
- [ ] **Reduce Motion:** Honor system setting
- [ ] **Bold Text:** Support bold text preference
- [ ] **Button Shapes:** Add outlines when enabled
- [ ] **Reduce Transparency:** Disable blur effects when enabled
- [ ] **Differentiate Without Color:** Pattern overlays

#### Android (Material Design Accessibility)
- [ ] **TalkBack:** Full screen reader support
- [ ] **Font Scaling:** Support up to 200% scaling
- [ ] **Touch Target Size:** Minimum 48x48dp
- [ ] **Color Contrast:** Meet Material contrast guidelines
- [ ] **Content Labeling:** Descriptive content descriptions

### 5.3 Testing Methodology

#### Automated Testing

```typescript
// File: src/__tests__/accessibility/contrast.test.ts

import { render } from '@testing-library/react-native';
import { getContrast } from '@/lib/accessibility/color-utils';

test('All text meets 4.5:1 contrast ratio', () => {
  const { getAllByRole } = render(<App />);
  const textElements = getAllByRole('text');

  textElements.forEach(element => {
    const { color, backgroundColor } = element.props.style;
    const contrast = getContrast(color, backgroundColor);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
```

```typescript
// File: src/__tests__/accessibility/touch-targets.test.ts

test('All interactive elements meet 44x44pt minimum', () => {
  const { getAllByRole } = render(<App />);
  const buttons = getAllByRole('button');

  buttons.forEach(button => {
    const { width, height } = button.props.style;
    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });
});
```

#### Manual Testing Checklist

**Visual:**
- [ ] Test all color-blind modes (screenshot comparison)
- [ ] Verify high contrast mode (7:1 text, 3:1 UI)
- [ ] Scale text to 200% (no overlapping content)
- [ ] Verify icon + color redundancy (every color has icon)

**Motor:**
- [ ] Test with one hand (left and right)
- [ ] Verify touch targets (use finger, not stylus)
- [ ] Test swipe sensitivity (low/medium/high)
- [ ] Try assisted mode (slower speed, auto-collect)

**Audio:**
- [ ] Play with sound off (all captions appear)
- [ ] Verify haptic feedback (every audio event)
- [ ] Check visual sound indicators (directional cues)

**Cognitive:**
- [ ] Replay all tutorials
- [ ] Verify clear iconography (no ambiguous icons)
- [ ] Test reduced motion mode (no animations)
- [ ] Pause during gameplay (anywhere, anytime)

**Screen Readers:**
- [ ] iOS VoiceOver: Navigate entire app
- [ ] Android TalkBack: Navigate entire app
- [ ] Verify all images have alt text
- [ ] Verify all buttons have labels

#### Beta Testing with Accessibility Users

**Recruitment:**
- Partner with accessibility organizations
- Recruit users with diverse disabilities
- Offer compensation for testing time

**Test Plan:**
1. **Onboarding:** Can user create account and understand tutorial?
2. **Gameplay:** Can user play game independently?
3. **Settings:** Can user customize accessibility settings?
4. **Feedback:** What barriers remain?

**Success Criteria:**
- 80% of accessibility users can complete onboarding
- 60% of accessibility users can play game independently
- 90% satisfaction with accessibility features

---

## 6. Accessibility Settings UI

### 6.1 Settings Screen

```typescript
// File: src/app/settings/accessibility.tsx

import { View, ScrollView, Switch } from 'react-native';
import { ScaledText } from '@/components/ui/ScaledText';
import { useAccessibilitySettings } from '@/hooks/useAccessibilitySettings';

export default function AccessibilitySettingsScreen() {
  const {
    colorBlindMode,
    setColorBlindMode,
    highContrastEnabled,
    setHighContrastEnabled,
    textScale,
    setTextScale,
    reducedMotionEnabled,
    setReducedMotionEnabled,
    hapticsEnabled,
    setHapticsEnabled,
    audioCaptionsEnabled,
    setAudioCaptionsEnabled,
    oneHandedMode,
    setOneHandedMode,
    swipeSensitivity,
    setSwipeSensitivity,
    assistedModeEnabled,
    setAssistedModeEnabled,
  } = useAccessibilitySettings();

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <ScaledText size="2xl" style={{ marginBottom: 24 }}>
        Accessibility Settings
      </ScaledText>

      {/* Visual Settings */}
      <SettingsSection title="Visual">
        <SettingRow label="Color-Blind Mode">
          <Picker
            selectedValue={colorBlindMode}
            onValueChange={setColorBlindMode}
          >
            <Picker.Item label="Standard" value="standard" />
            <Picker.Item label="Protanopia (Red-blind)" value="protanopia" />
            <Picker.Item label="Deuteranopia (Green-blind)" value="deuteranopia" />
            <Picker.Item label="Tritanopia (Blue-blind)" value="tritanopia" />
          </Picker>
        </SettingRow>

        <SettingRow label="High Contrast Mode">
          <Switch value={highContrastEnabled} onValueChange={setHighContrastEnabled} />
        </SettingRow>

        <SettingRow label="Text Size">
          <Slider
            value={textScale}
            onValueChange={setTextScale}
            minimumValue={100}
            maximumValue={200}
            step={25}
          />
          <ScaledText>{textScale}%</ScaledText>
        </SettingRow>

        <SettingRow label="Reduced Motion">
          <Switch value={reducedMotionEnabled} onValueChange={setReducedMotionEnabled} />
        </SettingRow>
      </SettingsSection>

      {/* Motor Settings */}
      <SettingsSection title="Motor">
        <SettingRow label="One-Handed Mode">
          <Picker selectedValue={oneHandedMode} onValueChange={setOneHandedMode}>
            <Picker.Item label="Off" value="off" />
            <Picker.Item label="Left Hand" value="left" />
            <Picker.Item label="Right Hand" value="right" />
          </Picker>
        </SettingRow>

        <SettingRow label="Swipe Sensitivity">
          <Picker selectedValue={swipeSensitivity} onValueChange={setSwipeSensitivity}>
            <Picker.Item label="Low (Easy)" value="low" />
            <Picker.Item label="Medium" value="medium" />
            <Picker.Item label="High (Hard)" value="high" />
          </Picker>
        </SettingRow>

        <SettingRow label="Assisted Mode">
          <Switch value={assistedModeEnabled} onValueChange={setAssistedModeEnabled} />
        </SettingRow>
      </SettingsSection>

      {/* Audio Settings */}
      <SettingsSection title="Audio">
        <SettingRow label="Haptic Feedback">
          <Switch value={hapticsEnabled} onValueChange={setHapticsEnabled} />
        </SettingRow>

        <SettingRow label="Audio Captions">
          <Switch value={audioCaptionsEnabled} onValueChange={setAudioCaptionsEnabled} />
        </SettingRow>
      </SettingsSection>
    </ScrollView>
  );
}
```

### 6.2 Accessibility Hook

```typescript
// File: src/hooks/useAccessibilitySettings.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AccessibilitySettings {
  colorBlindMode: ColorBlindMode;
  highContrastEnabled: boolean;
  textScale: TextScale;
  reducedMotionEnabled: boolean;
  hapticsEnabled: boolean;
  audioCaptionsEnabled: boolean;
  oneHandedMode: 'off' | 'left' | 'right';
  swipeSensitivity: SwipeSensitivity;
  assistedModeEnabled: boolean;

  setColorBlindMode: (mode: ColorBlindMode) => void;
  setHighContrastEnabled: (enabled: boolean) => void;
  setTextScale: (scale: TextScale) => void;
  setReducedMotionEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setAudioCaptionsEnabled: (enabled: boolean) => void;
  setOneHandedMode: (mode: 'off' | 'left' | 'right') => void;
  setSwipeSensitivity: (sensitivity: SwipeSensitivity) => void;
  setAssistedModeEnabled: (enabled: boolean) => void;
}

export const useAccessibilitySettings = create<AccessibilitySettings>()(
  persist(
    (set) => ({
      colorBlindMode: 'standard',
      highContrastEnabled: false,
      textScale: 100,
      reducedMotionEnabled: false,
      hapticsEnabled: true,
      audioCaptionsEnabled: false,
      oneHandedMode: 'off',
      swipeSensitivity: 'medium',
      assistedModeEnabled: false,

      setColorBlindMode: (mode) => set({ colorBlindMode: mode }),
      setHighContrastEnabled: (enabled) => set({ highContrastEnabled: enabled }),
      setTextScale: (scale) => set({ textScale: scale }),
      setReducedMotionEnabled: (enabled) => set({ reducedMotionEnabled: enabled }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setAudioCaptionsEnabled: (enabled) => set({ audioCaptionsEnabled: enabled }),
      setOneHandedMode: (mode) => set({ oneHandedMode: mode }),
      setSwipeSensitivity: (sensitivity) => set({ swipeSensitivity: sensitivity }),
      setAssistedModeEnabled: (enabled) => set({ assistedModeEnabled: enabled }),
    }),
    {
      name: 'accessibility-settings',
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
      },
    }
  )
);
```

---

## 7. Resources & References

### 7.1 Standards & Guidelines
- **WCAG 2.1:** https://www.w3.org/WAI/WCAG21/quickref/
- **iOS Human Interface Guidelines:** https://developer.apple.com/design/human-interface-guidelines/accessibility
- **Android Material Design Accessibility:** https://material.io/design/usability/accessibility.html
- **Game Accessibility Guidelines:** http://gameaccessibilityguidelines.com/

### 7.2 Tools
- **Color Contrast Checker:** https://webaim.org/resources/contrastchecker/
- **Color-Blind Simulator:** https://www.color-blindness.com/coblis-color-blindness-simulator/
- **Screen Readers:**
  - iOS VoiceOver (built-in)
  - Android TalkBack (built-in)

### 7.3 Organizations
- **AbleGamers:** https://ablegamers.org/
- **IGDA Game Accessibility SIG:** https://igda-gasig.org/
- **W3C WAI:** https://www.w3.org/WAI/

---

## 8. Maintenance & Updates

### 8.1 Regular Audits
- **Quarterly:** Review accessibility settings usage analytics
- **Bi-annual:** Conduct automated accessibility scans
- **Annual:** User testing with accessibility community

### 8.2 Update Process
1. Monitor platform updates (iOS, Android)
2. Review new accessibility APIs
3. Incorporate user feedback
4. Update documentation
5. Re-test with accessibility users

### 8.3 Analytics to Track
- % of users enabling accessibility features
- Most-used accessibility settings
- Completion rates (accessible vs non-accessible users)
- Feedback from accessibility-focused reviews

---

## 9. Legal Compliance

### 9.1 Applicable Laws
- **ADA (Americans with Disabilities Act):** US federal law
- **Section 508:** US government procurement
- **EAA (European Accessibility Act):** EU requirement (2025)
- **AODA (Accessibility for Ontarians with Disabilities Act):** Canada

### 9.2 App Store Requirements
- **iOS App Store:** Accessibility description required
- **Google Play:** Accessibility statement encouraged

### 9.3 Privacy Considerations
- Accessibility settings stored locally (not transmitted)
- No tracking of specific disability types
- User consent for analytics on accessibility feature usage

---

## 10. Success Metrics

### 10.1 Quantitative Metrics
- **Adoption Rate:** % of users enabling accessibility features
- **Retention:** 7-day retention for accessibility users vs general
- **Completion Rate:** % of accessibility users completing tutorial
- **Session Length:** Average session duration (should be comparable)

### 10.2 Qualitative Metrics
- **User Reviews:** Accessibility mentions in reviews
- **Support Tickets:** Accessibility-related issues
- **User Feedback:** Direct feedback from accessibility users

### 10.3 Target Goals
- **Year 1:** 5% of users enable accessibility features
- **Year 2:** 10% adoption, 4.5+ star rating from accessibility users
- **Year 3:** Featured in accessibility-focused publications

---

## Conclusion

Accessibility is not an add-on—it's a core design principle. By following these guidelines, SupaSnake will be playable by the widest possible audience, including players with visual, motor, audio, and cognitive disabilities.

**Key Takeaways:**
1. **Visual:** Color-blind modes, high contrast, text scaling, icon redundancy
2. **Motor:** Touch target sizes, swipe sensitivity, one-handed mode, assisted mode
3. **Audio:** Captions, haptics, visual sound indicators
4. **Cognitive:** Tutorial replay, clear icons, reduced motion, pause anywhere
5. **Testing:** Automated + manual + user testing with accessibility community

**Next Steps:**
1. Implement accessibility settings UI
2. Add color-blind mode support
3. Implement haptic feedback system
4. Conduct accessibility audit with external consultants
5. Beta test with accessibility users
6. Iterate based on feedback

**Remember:** Every feature should be designed with accessibility in mind from the start, not bolted on afterwards.

---

**Document Version:** 1.0
**Last Updated:** 2025-12-19
**Owner:** SupaSnake Development Team
**Review Cycle:** Quarterly
