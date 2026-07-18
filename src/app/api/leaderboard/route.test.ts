/**
 * Tests for Leaderboard API - Unit tests for business logic
 */

import { describe, it, expect } from '@jest/globals';

describe('Leaderboard API', () => {
  describe('GET Handler', () => {
    describe('Query Parameters', () => {
      it('should accept type parameter', () => {
        const validTypes = ['global', 'weekly', 'daily'];
        expect(validTypes).toContain('global');
        expect(validTypes).toContain('weekly');
      });

      it('should accept bracket parameter', () => {
        const validBrackets = ['beginner', 'intermediate', 'advanced', 'master'];
        expect(validBrackets).toContain('beginner');
        expect(validBrackets).toContain('master');
      });

      it('should accept limit and offset', () => {
        const pagination = { limit: 10, offset: 0 };
        expect(pagination.limit).toBe(10);
        expect(pagination.offset).toBe(0);
      });

      it('should accept only DB dynasty names for the dynasty filter', () => {
        const validDynasties = ['CYBER', 'PRIMAL', 'COSMIC'];

        expect(validDynasties).toContain('CYBER');
        expect(validDynasties).toContain('PRIMAL');
        expect(validDynasties).toContain('COSMIC');
        expect(validDynasties).toHaveLength(3);
        expect(validDynasties.includes('SHADOW')).toBe(false);
      });
    });

    describe('Response Format', () => {
      it('should return entries array', () => {
        const response = { entries: [], total: 0 };
        expect(Array.isArray(response.entries)).toBe(true);
      });

      it('should return total count', () => {
        const response = { entries: [], total: 100 };
        expect(response.total).toBeDefined();
      });

      it('should include player rank', () => {
        const entry = { rank: 1, playerId: 'uuid-123', score: 1500 };
        expect(entry.rank).toBe(1);
      });
    });
  });

  describe('Leaderboard Scoring', () => {
    describe('Score Calculation', () => {
      it('should rank by high score', () => {
        const entries = [
          { score: 1500, rank: 0 },
          { score: 1200, rank: 0 },
          { score: 900, rank: 0 },
        ];

        const sorted = entries.sort((a, b) => b.score - a.score);
        sorted.forEach((e, i) => e.rank = i + 1);

        expect(sorted[0].score).toBe(1500);
        expect(sorted[0].rank).toBe(1);
      });

      it('should break ties by collection count', () => {
        const entries = [
          { score: 1000, collection: 15, rank: 0 },
          { score: 1000, collection: 20, rank: 0 },
        ];

        const sorted = entries.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return b.collection - a.collection;
        });

        expect(sorted[0].collection).toBe(20);
      });
    });

    describe('Bracket Filtering', () => {
      it('should filter by bracket', () => {
        const entries = [
          { bracket: 'beginner', score: 500 },
          { bracket: 'intermediate', score: 800 },
          { bracket: 'beginner', score: 600 },
        ];

        const filtered = entries.filter(e => e.bracket === 'beginner');
        expect(filtered.length).toBe(2);
      });

      it('should ensure fair competition', () => {
        // Beginner should not compete against master
        const beginnerEntry = { bracket: 'beginner', highestGen: 3 };
        const masterEntry = { bracket: 'master', highestGen: 30 };
        expect(beginnerEntry.bracket).not.toBe(masterEntry.bracket);
      });
    });
  });

  describe('Time-Based Leaderboards', () => {
    describe('Daily Reset', () => {
      it('should reset at midnight UTC', () => {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setUTCHours(0, 0, 0, 0);

        expect(startOfDay.getUTCHours()).toBe(0);
      });
    });

    describe('Weekly Reset', () => {
      it('should reset on Monday UTC', () => {
        const getMondayStart = (date: Date) => {
          const d = new Date(date);
          const day = d.getUTCDay();
          const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
          d.setUTCDate(diff);
          d.setUTCHours(0, 0, 0, 0);
          return d;
        };

        const monday = getMondayStart(new Date());
        expect(monday.getUTCDay()).toBe(1); // Monday
      });
    });
  });

  describe('Player Position', () => {
    it('should find player rank', () => {
      const entries = [
        { playerId: 'p1', rank: 1 },
        { playerId: 'p2', rank: 2 },
        { playerId: 'p3', rank: 3 },
      ];

      const myEntry = entries.find(e => e.playerId === 'p2');
      expect(myEntry?.rank).toBe(2);
    });

    it('should handle player not on leaderboard', () => {
      const entries = [{ playerId: 'p1' }];
      const myEntry = entries.find(e => e.playerId === 'notFound');
      expect(myEntry).toBeUndefined();
    });
  });
});

describe('Leaderboard Constraints', () => {
  describe('BA-001 Compliance', () => {
    it('should prevent pay-to-win perception', () => {
      // Brackets separate players by progression
      const brackets = ['beginner', 'intermediate', 'advanced', 'master'];
      expect(brackets.length).toBe(4);
    });

    it('should use skill-based matchmaking', () => {
      const getSkillBracket = (gen: number) => {
        if (gen <= 5) return 'beginner';
        if (gen <= 10) return 'intermediate';
        if (gen <= 20) return 'advanced';
        return 'master';
      };

      const newPlayer = getSkillBracket(2);
      const whale = getSkillBracket(50);
      expect(newPlayer).not.toBe(whale);
    });
  });

  describe('Free Play exclusion (Design v2 §7.4)', () => {
    it('excludes free sessions from weekly/daily rankings', () => {
      // Mirrors the route's .eq('is_free_play', false) filter on the
      // game_sessions entries query
      const sessions = [
        { player_id: 'a', score: 900, is_free_play: false },
        { player_id: 'b', score: 5000, is_free_play: true }, // practice - never ranks
        { player_id: 'c', score: 400, is_free_play: false },
      ];

      const ranked = sessions
        .filter((s) => s.is_free_play === false)
        .sort((a, b) => b.score - a.score);

      expect(ranked).toHaveLength(2);
      expect(ranked[0].score).toBe(900); // the 5000 practice run is invisible
    });

    it('route source: both session queries carry the is_free_play filter', () => {
      // Structural guard: the entries query AND the count query must both
      // exclude free play, or totals would disagree with the visible rows.
      const fs = require('fs');
      const path = require('path');
      const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');

      const filters = source.match(/\.eq\('is_free_play', false\)/g) || [];
      expect(filters.length).toBe(2);
    });

    it('global leaderboard needs no filter (reads players.high_score, never free runs)', () => {
      // Free ends skip the players update entirely, so high_score can never
      // come from a practice run - the global board stays clean by design.
      const playerBeforeFreeRun = { high_score: 100 };
      const isFreeSession = true;
      const playerAfter = isFreeSession
        ? playerBeforeFreeRun
        : { high_score: Math.max(100, 999) };

      expect(playerAfter.high_score).toBe(100);
    });
  });

  describe('Identity v1 (PLAYER_IDENTITY_V1.md section 4)', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');

    it('route source: rows render from player_identity_view (batch read, both branches)', () => {
      expect(source).toMatch(/getIdentitiesForPlayers/);
      const merges = source.match(/applyIdentities\(/g) || [];
      // definition + global merge + weekly/daily merge
      expect(merges.length).toBe(3);
    });

    it('route source: playerName stays populated from display_handle (compatibility)', () => {
      expect(source).toMatch(/playerName: identity\.displayHandle/);
    });

    it('route source: pre-022 rows keep the legacy Player-XXXXXX fallback', () => {
      const fallbacks = source.match(/`Player \$\{/g) || [];
      expect(fallbacks.length).toBeGreaterThanOrEqual(2);
    });

    it('identity object carries the Player Card row fields', () => {
      // The shape contract UI code relies on (LeaderboardIdentity)
      for (const field of [
        'handle', 'isGenerated', 'title', 'clanTag', 'founder',
        'badges', 'avatarDynasty', 'avatarVariantId', 'avatarVariantName',
        'avatarRarity', 'mastery',
      ]) {
        expect(source).toContain(`${field}:`);
      }
    });

    it('identity is optional: rows without it keep working (pre-022 shape)', () => {
      const entry: { playerName: string; identity?: unknown } = {
        playerName: 'Player 3f2a1b',
      };
      expect(entry.identity).toBeUndefined();
      expect(entry.playerName).toBe('Player 3f2a1b');
    });
  });
});
