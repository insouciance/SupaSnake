import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  inspectProductionPublicSurface,
  type ProductionPublicSurfaceInspection,
} from '@/lib/server/productionPublicSurface';

export const dynamic = 'force-dynamic';

interface PublicDatabaseCheck {
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}

async function checkPublicDatabase(): Promise<PublicDatabaseCheck> {
  const startedAt = Date.now();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startedAt,
      error: 'Public database configuration missing',
    };
  }

  try {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.from('players').select('id').limit(1);
    if (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startedAt,
        error: error.message,
      };
    }
    return {
      status: 'healthy',
      responseTime: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const publicSurface: ProductionPublicSurfaceInspection =
    inspectProductionPublicSurface(process.env);
  const database = await checkPublicDatabase();
  const healthy = publicSurface.healthy && database.status === 'healthy';

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'unhealthy',
      release:
        process.env.SUPASNAKE_RELEASE_SHA ||
        process.env.VERCEL_GIT_COMMIT_SHA ||
        'unknown',
      checks: {
        publicSurface: {
          status: publicSurface.healthy ? 'healthy' : 'unhealthy',
          ...publicSurface,
        },
        database,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
