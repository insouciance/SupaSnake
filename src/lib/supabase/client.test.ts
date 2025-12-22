/**
 * Tests for Supabase Client
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Supabase Client', () => {
  describe('Client Creation', () => {
    it('should create browser client with environment variables', () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      expect(supabaseUrl).toBeTruthy();
      expect(supabaseKey).toBeTruthy();
      expect(supabaseUrl).toContain('supabase.co');
    });

    it('should have valid URL format', () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      expect(supabaseUrl).toMatch(/^https:\/\//);
    });
  });

  describe('Client Export', () => {
    it('should export createClient function', async () => {
      const { createClient } = await import('./client');
      expect(typeof createClient).toBe('function');
    });

    it('should export getSupabaseClient function', async () => {
      const { getSupabaseClient } = await import('./client');
      expect(typeof getSupabaseClient).toBe('function');
    });
  });

  describe('Client Instance', () => {
    it('should return singleton client instance', async () => {
      const { getSupabaseClient } = await import('./client');
      const client1 = getSupabaseClient();
      const client2 = getSupabaseClient();
      expect(client1).toBe(client2);
    });

    it('should have auth methods', async () => {
      const { getSupabaseClient } = await import('./client');
      const client = getSupabaseClient();
      expect(client.auth).toBeDefined();
      expect(client.auth.signInAnonymously).toBeDefined();
      expect(client.auth.signOut).toBeDefined();
    });

    it('should have database methods', async () => {
      const { getSupabaseClient } = await import('./client');
      const client = getSupabaseClient();
      expect(client.from).toBeDefined();
      expect(typeof client.from).toBe('function');
    });
  });
});
