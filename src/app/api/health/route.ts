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
import * as Sentry from '@sentry/nextjs';
import { CAREER_SPINE_V1_ENABLED } from '@/lib/features/careerSpine';
import { RUN_FLOW_V1_ENABLED } from '@/lib/features/runFlow';
import { inspectProductionPublicSurface } from '@/lib/server/productionPublicSurface';

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  release: string;
  timestamp: string;
  version: string;
  releaseSha: string | null;
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
    careerSpine: HealthCheck & {
      surfaceEnabled: boolean;
      phase?: 'bridge' | 'ready';
      bridgeVersion?: number;
      careerVersion?: number | null;
    };
    runFlow: HealthCheck & {
      surfaceEnabled: boolean;
    };
    publicSurface: HealthCheck & {
      version: number;
      contractHash: string;
      declaredHash: string;
      projectRef: string | null;
      expectedProjectRef: string;
      enabledFlagCount: number;
      expectedFlagCount: number;
      disabledFlags: string[];
    };
    cohesiveRelease: HealthCheck & {
      version?: number;
      foundingBridgeVersion?: number;
      continuityVersion?: number;
      favoriteInvariantVersion?: number;
    };
    genomeV2: HealthCheck & {
      schemaVersion?: number;
      catalogVersion?: number;
      ascendanceVersion?: number;
      spliceCount?: number;
    };
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

async function checkCareerSpine(): Promise<HealthResponse['checks']['careerSpine']> {
  const start = Date.now();
  const surfaceEnabled = CAREER_SPINE_V1_ENABLED;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      status: 'unhealthy',
      surfaceEnabled,
      responseTime: Date.now() - start,
      error: 'Career settlement configuration missing',
    };
  }
  try {
    const client = createClient(supabaseUrl, serviceKey);
    const { data, error } = await client.rpc('get_career_settlement_capability');
    const capability =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const bridgeVersion = Number(capability?.bridgeVersion);
    const careerVersion = capability?.careerVersion;
    const phase = capability?.status;
    if (
      error ||
      bridgeVersion !== 1 ||
      (phase !== 'pending' && phase !== 'ready') ||
      (phase === 'pending' && careerVersion !== null) ||
      (phase === 'ready' && Number(careerVersion) !== 1)
    ) {
      return {
        status: 'unhealthy',
        surfaceEnabled,
        responseTime: Date.now() - start,
        error: error?.message ?? 'Career settlement capability invalid',
      };
    }
    return {
      status: 'healthy',
      surfaceEnabled,
      responseTime: Date.now() - start,
      phase: phase === 'ready' ? 'ready' : 'bridge',
      bridgeVersion,
      careerVersion: careerVersion === null ? null : Number(careerVersion),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      surfaceEnabled,
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkCohesiveRelease(): Promise<
  HealthResponse['checks']['cohesiveRelease']
> {
  const start = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      error: 'Cohesive release capability configuration missing',
    };
  }

  try {
    const client = createClient(supabaseUrl, serviceKey);
    const { data, error } = await client.rpc('get_cohesive_release_capability');
    const capability =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const version = Number(capability?.version);
    const foundingBridgeVersion = Number(capability?.foundingBridgeVersion);
    const continuityVersion = Number(capability?.continuityVersion);
    const favoriteInvariantVersion = Number(capability?.favoriteInvariantVersion);
    if (
      error ||
      capability?.status !== 'ready' ||
      version !== 1 ||
      foundingBridgeVersion !== 1 ||
      continuityVersion !== 1 ||
      favoriteInvariantVersion !== 1
    ) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error?.message ?? 'Cohesive release capability invalid',
      };
    }

    return {
      status: 'healthy',
      responseTime: Date.now() - start,
      version,
      foundingBridgeVersion,
      continuityVersion,
      favoriteInvariantVersion,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkGenomeV2(): Promise<HealthResponse['checks']['genomeV2']> {
  const start = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      error: 'Genome v2 capability configuration missing',
    };
  }

  try {
    const client = createClient(supabaseUrl, serviceKey);
    const { data, error } = await client.rpc('get_genome_v2_capability');
    const capability =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    const schemaVersion = Number(capability?.schemaVersion);
    const catalogVersion = Number(capability?.catalogVersion);
    const ascendanceVersion = Number(capability?.ascendanceVersion);
    const spliceCount = Number(capability?.spliceCount);
    if (
      error ||
      capability?.status !== 'ready' ||
      schemaVersion !== 2 ||
      catalogVersion !== 2 ||
      ascendanceVersion !== 2 ||
      spliceCount !== 8
    ) {
      const failure = error ?? new Error('Genome v2 capability invalid');
      Sentry.captureException(failure, {
        tags: {
          subsystem: 'health',
          dependency: 'genome-v2-capability',
        },
        extra: {
          status: capability?.status ?? null,
          schemaVersion,
          catalogVersion,
          ascendanceVersion,
          spliceCount,
        },
      });
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error?.message ?? 'Genome v2 capability invalid',
      };
    }

    return {
      status: 'healthy',
      responseTime: Date.now() - start,
      schemaVersion,
      catalogVersion,
      ascendanceVersion,
      spliceCount,
    };
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        subsystem: 'health',
        dependency: 'genome-v2-capability',
      },
    });
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
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
  const [
    databaseCheck,
    careerSpineCheck,
    cohesiveReleaseCheck,
    genomeV2Check,
  ] = await Promise.all([
    checkDatabase(),
    checkCareerSpine(),
    checkCohesiveRelease(),
    checkGenomeV2(),
  ]);

  // Get memory usage
  const memoryUsage = process.memoryUsage();
  const runFlowCheck: HealthResponse['checks']['runFlow'] = {
    // Flag-off is a valid rollback artifact, not a broken process. Production
    // promotion separately requires `surfaceEnabled == true`, while ordinary
    // rollback builds can still report healthy dependencies.
    status: 'healthy',
    surfaceEnabled: RUN_FLOW_V1_ENABLED,
  };
  const publicSurfaceInspection = inspectProductionPublicSurface(process.env);
  const publicSurfaceCheck: HealthResponse['checks']['publicSurface'] = {
    status: publicSurfaceInspection.healthy ? 'healthy' : 'unhealthy',
    ...publicSurfaceInspection,
  };

  // Determine overall health
  const isHealthy =
    databaseCheck.status === 'healthy' &&
    careerSpineCheck.status === 'healthy' &&
    cohesiveReleaseCheck.status === 'healthy' &&
    genomeV2Check.status === 'healthy' &&
    publicSurfaceCheck.status === 'healthy';

  const response: HealthResponse = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp,
    version: process.env.npm_package_version || '1.0.0',
    release:
      process.env.SUPASNAKE_RELEASE_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      'unknown',
    releaseSha:
      process.env.SUPASNAKE_RELEASE_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      null,
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
      publicSurface: publicSurfaceCheck,
      careerSpine: careerSpineCheck,
      runFlow: runFlowCheck,
      cohesiveRelease: cohesiveReleaseCheck,
      genomeV2: genomeV2Check,
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
