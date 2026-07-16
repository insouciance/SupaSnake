import { checkRateLimit, RATE_LIMITS } from './rateLimit';

const mockSelect = jest.fn();
const mockUpsert = jest.fn();

const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: mockSelect,
        })),
      })),
    })),
    upsert: mockUpsert,
  })),
};

describe('Rate Limiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
  });

  describe('checkRateLimit', () => {
    it('should allow action when no previous record exists', async () => {
      mockSelect.mockResolvedValue({ data: null, error: null });

      const result = await checkRateLimit(
        mockSupabase as never,
        'player-123',
        'game_start'
      );

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('should allow action when enough time has passed', async () => {
      const oldTime = new Date(Date.now() - 10000).toISOString();
      mockSelect.mockResolvedValue({
        data: { last_action_at: oldTime },
        error: null,
      });

      const result = await checkRateLimit(
        mockSupabase as never,
        'player-123',
        'game_start'
      );

      expect(result.allowed).toBe(true);
    });

    it('should block action when rate limit exceeded', async () => {
      const recentTime = new Date(Date.now() - 1000).toISOString();
      mockSelect.mockResolvedValue({
        data: { last_action_at: recentTime },
        error: null,
      });

      const result = await checkRateLimit(
        mockSupabase as never,
        'player-123',
        'game_start'
      );

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(RATE_LIMITS.game_start);
    });

    it('should use correct rate limit for breeding action', async () => {
      const recentTime = new Date(Date.now() - 1000).toISOString();
      mockSelect.mockResolvedValue({
        data: { last_action_at: recentTime },
        error: null,
      });

      const result = await checkRateLimit(
        mockSupabase as never,
        'player-123',
        'breeding'
      );

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeLessThanOrEqual(RATE_LIMITS.breeding);
    });

    it('should use correct rate limit for purchase action', async () => {
      const recentTime = new Date(Date.now() - 500).toISOString();
      mockSelect.mockResolvedValue({
        data: { last_action_at: recentTime },
        error: null,
      });

      const result = await checkRateLimit(
        mockSupabase as never,
        'player-123',
        'purchase'
      );

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeLessThanOrEqual(RATE_LIMITS.purchase);
    });

    it('should update rate limit record on allowed action', async () => {
      mockSelect.mockResolvedValue({ data: null, error: null });

      await checkRateLimit(mockSupabase as never, 'player-123', 'game_start');

      expect(mockSupabase.from).toHaveBeenCalledWith('rate_limits');
    });
  });

  describe('RATE_LIMITS', () => {
    it('should have correct limits for each action type', () => {
      expect(RATE_LIMITS.game_start).toBe(5000);
      expect(RATE_LIMITS.breeding).toBe(5000);
      expect(RATE_LIMITS.purchase).toBe(1000);
    });
  });
});
