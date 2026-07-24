import { renderHook } from '@testing-library/react';
import { useDynastyTheme, dynastyThemes } from './useDynastyTheme';

describe('useDynastyTheme', () => {
  describe('CYBER dynasty', () => {
    it('should return CYBER theme for "CYBER" input', () => {
      const { result } = renderHook(() => useDynastyTheme('CYBER'));

      expect(result.current.primary).toBe('#00FFFF');
      expect(result.current.secondary).toBe('#FF00FF');
      expect(result.current.gradient).toBe('linear-gradient(135deg, #00FFFF 0%, #FF00FF 100%)');
      expect(result.current.shadow).toBe('0 4px 20px rgba(0, 255, 255, 0.3)');
      expect(result.current.textOnPrimary).toBe('#000000');
    });

    it('should handle lowercase "cyber" input', () => {
      const { result } = renderHook(() => useDynastyTheme('cyber'));

      expect(result.current.primary).toBe('#00FFFF');
    });
  });

  describe('PRIMAL dynasty', () => {
    it('should return PRIMAL theme for "PRIMAL" input', () => {
      const { result } = renderHook(() => useDynastyTheme('PRIMAL'));

      expect(result.current.primary).toBe('#2d5016');
      expect(result.current.secondary).toBe('#8b4513');
      expect(result.current.gradient).toBe('linear-gradient(135deg, #2d5016 0%, #8b4513 100%)');
      expect(result.current.shadow).toBe('0 4px 20px rgba(45, 80, 22, 0.3)');
      expect(result.current.textOnPrimary).toBe('#FFFFFF');
    });

    it('should handle mixed case "Primal" input', () => {
      const { result } = renderHook(() => useDynastyTheme('Primal'));

      expect(result.current.primary).toBe('#2d5016');
    });
  });

  describe('COSMIC dynasty', () => {
    it('should return COSMIC theme for "COSMIC" input', () => {
      const { result } = renderHook(() => useDynastyTheme('COSMIC'));

      expect(result.current.primary).toBe('#4a0e4e');
      expect(result.current.secondary).toBe('#ffd700');
      expect(result.current.gradient).toBe('linear-gradient(135deg, #4a0e4e 0%, #ffd700 100%)');
      expect(result.current.shadow).toBe('0 4px 20px rgba(74, 14, 78, 0.3)');
      expect(result.current.textOnPrimary).toBe('#FFFFFF');
    });
  });

  describe('default behavior', () => {
    it('should default to PRIMAL theme for unknown dynasty', () => {
      const { result } = renderHook(() => useDynastyTheme('UNKNOWN'));

      expect(result.current.primary).toBe('#2d5016');
      expect(result.current.secondary).toBe('#8b4513');
    });

    it('should default to PRIMAL theme for empty string', () => {
      const { result } = renderHook(() => useDynastyTheme(''));

      expect(result.current.primary).toBe('#2d5016');
    });
  });

  describe('DynastyTheme interface', () => {
    it('should have all required properties', () => {
      const { result } = renderHook(() => useDynastyTheme('CYBER'));

      expect(result.current).toHaveProperty('primary');
      expect(result.current).toHaveProperty('secondary');
      expect(result.current).toHaveProperty('gradient');
      expect(result.current).toHaveProperty('shadow');
      expect(result.current).toHaveProperty('textOnPrimary');
    });

    it('should return valid CSS color values', () => {
      const { result } = renderHook(() => useDynastyTheme('CYBER'));

      // Check hex color format
      expect(result.current.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(result.current.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(result.current.textOnPrimary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('should return valid CSS gradient string', () => {
      const { result } = renderHook(() => useDynastyTheme('CYBER'));

      expect(result.current.gradient).toContain('linear-gradient');
      expect(result.current.gradient).toContain('135deg');
    });

    it('should return valid CSS box-shadow string', () => {
      const { result } = renderHook(() => useDynastyTheme('PRIMAL'));

      expect(result.current.shadow).toContain('rgba');
      expect(result.current.shadow).toMatch(/^\d+\s+\d+px/); // e.g., "0 4px..."
    });
  });

  describe('exported themes object', () => {
    it('should export dynastyThemes with all three dynasties', () => {
      expect(dynastyThemes).toHaveProperty('CYBER');
      expect(dynastyThemes).toHaveProperty('PRIMAL');
      expect(dynastyThemes).toHaveProperty('COSMIC');
    });

    it('should allow direct access to theme values', () => {
      expect(dynastyThemes.CYBER.primary).toBe('#00FFFF');
      expect(dynastyThemes.PRIMAL.primary).toBe('#2d5016');
      expect(dynastyThemes.COSMIC.primary).toBe('#4a0e4e');
    });
  });

  describe('accessibility - textOnPrimary', () => {
    it('should use black text on light backgrounds (CYBER)', () => {
      // CYBER primary is #00FFFF (cyan) which is a light color
      expect(dynastyThemes.CYBER.textOnPrimary).toBe('#000000');
    });

    it('should use white text on dark backgrounds (PRIMAL)', () => {
      // PRIMAL primary is #2d5016 (dark green)
      expect(dynastyThemes.PRIMAL.textOnPrimary).toBe('#FFFFFF');
    });

    it('should use white text on dark backgrounds (COSMIC)', () => {
      // COSMIC primary is #4a0e4e (dark purple)
      expect(dynastyThemes.COSMIC.textOnPrimary).toBe('#FFFFFF');
    });
  });

  describe('memoization', () => {
    it('should return same reference for same dynasty name', () => {
      const { result, rerender } = renderHook(
        ({ dynasty }) => useDynastyTheme(dynasty),
        { initialProps: { dynasty: 'CYBER' } }
      );

      const firstResult = result.current;

      rerender({ dynasty: 'CYBER' });

      expect(result.current).toBe(firstResult);
    });

    it('should return new reference when dynasty changes', () => {
      const { result, rerender } = renderHook(
        ({ dynasty }) => useDynastyTheme(dynasty),
        { initialProps: { dynasty: 'CYBER' } }
      );

      const firstResult = result.current;

      rerender({ dynasty: 'PRIMAL' });

      expect(result.current).not.toBe(firstResult);
      expect(result.current.primary).toBe('#2d5016');
    });
  });
});
