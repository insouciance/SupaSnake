/**
 * Health Check Endpoint
 * Returns system health status for monitoring and load balancers
 *
 * GET /api/health
 *
 * Response:
 * - 200: All systems healthy
 * - 503: One or more systems unhealthy
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  checks: {
    database: HealthCheck;
  };
}

// Track process start time for uptime calculation
const startTime = Date.now();

/**
 * Check database connectivity
 * Performs a simple query to verify database is accessible
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: 'Database configuration missing',
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Simple query to check connectivity
    const { error } = await supabase
      .from('players')
      .select('id')
      .limit(1);

    const responseTime = Date.now() - start;

    if (error) {
      return {
        status: 'unhealthy',
        responseTime,
        error: error.message,
      };
    }

    return {
      status: 'healthy',
      responseTime,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * GET /api/health
 * Returns comprehensive health status
 */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const timestamp = new Date().toISOString();
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Perform health checks
  const databaseCheck = await checkDatabase();

  // Get memory usage
  const memoryUsage = process.memoryUsage();

  // Determine overall health
  const isHealthy = databaseCheck.status === 'healthy';

  const response: HealthResponse = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp,
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime,
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
    },
    checks: {
      database: databaseCheck,
    },
  };

  return NextResponse.json(response, {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
