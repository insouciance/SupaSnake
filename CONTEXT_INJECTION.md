# SupaSnake: Context Injection for AAA Development

## 1. Project Status & Vision Gap
**Current State:** The project has been reset. We have platform infrastructure (scripts, docs) but **no game code**.
**AAA Vision:** "SupaSnake" is not just a snake clone. It is a **Collection RPG** where the Snake game is the *resource gathering mechanic* (DNA) for a deep meta-game (Breeding/Genetics).
**The Goal:** Rebuild the `SnakeGame` component not as a standalone toy, but as the **Core Loop Engine** of a larger system.

## 2. Core Design Principles (The "Why")
*From `vision/aaa_design_principles.md`:*
1.  **Theme as North Star:** "Skill creates Legacy." The better you play Snake, the more DNA you earn, the better Snakes you can breed.
2.  **Visual Language:** 3 Distinct Dynasties. Even in the MVP, visuals must communicate identity:
    *   **CYBER:** Neon, Digital, Glitch, Angular. (Blue/Cyan/Magenta)
    *   **PRIMAL:** Organic, Tribal, Visceral, Curves. (Green/Brown/Orange)
    *   **COSMIC:** Ethereal, Float, Particle-heavy. (Purple/Gold/Teal)
3.  **Feel:** 60FPS fluid movement. Haptic feedback on collect. Particle bursts. "Juice" is mandatory, not optional.

## 3. Implementation Directives (The "How")

### Architecture
*   **Framework:** Next.js 14 (App Router) + React.
*   **Graphics:** `react-three-fiber` (Three.js) for the game board. **Do not use 2D Canvas.** We need 3D for the "AAA" lighting/material effects later.
*   **State:** Use `zustand` for game state (score, speed, DNA collected, current dynasty theme).
*   **Backend Sync:** The game must inherently support "Sessions".
    *   `startGame(sessionId)`
    *   `endGame(score, dnaCollected)` -> Sends to API.

### MVP Features (Sprint 1)
1.  **The Board:** 3D Grid.
2.  **The Snake:** 3D Segmented Mesh (Sphere/Cube depending on Dynasty).
    *   *Requirement:* Smooth interpolation between grid cells (not jerky 90-degree turns).
3.  **Visuals:**
    *   Implement a `ThemeManager` that swaps colors/materials based on selected Dynasty.
    *   Simple Particle System for "Food" (DNA) collection.
4.  **UI:**
    *   Minimal HUD (Score, DNA).
    *   "Game Over" screen that emphasizes *DNA Earned* (Currency) over just High Score.

## 4. Immediate Task
**Objective:** Create `src/components/game/SnakeEngine.tsx` (and necessary sub-components).
**Constraints:**
*   Use `react-three-fiber`.
*   Implement "Cyber" theme as default.
*   Ensure movement logic is decoupled from rendering (Update loop vs Render loop).
