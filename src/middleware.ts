/**
 * Security Middleware
 * Applies security headers and handles CORS for all routes
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Allowed origins for CORS
 */
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://supasnake.com',
  'https://www.supasnake.com',
  'https://supasnake.vercel.app',
];

const staticConnectSources = [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://api.stripe.com',
  'https://eu.i.posthog.com',
  'https://eu-assets.i.posthog.com',
];

function addUrlOrigin(
  sources: Set<string>,
  value: string | undefined,
  includeWebSocket = false
): void {
  if (!value) return;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

    sources.add(url.origin);
    if (includeWebSocket) {
      const socketProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      sources.add(`${socketProtocol}//${url.host}`);
    }
  } catch {
    // Invalid environment URLs are excluded instead of entering a CSP header.
  }
}

/** Build the browser connection allowlist from validated public service URLs. */
export function buildConnectSources(
  env: Readonly<Record<string, string | undefined>> = process.env
): string[] {
  const sources = new Set(staticConnectSources);
  addUrlOrigin(sources, env.NEXT_PUBLIC_SUPABASE_URL, true);
  addUrlOrigin(sources, env.NEXT_PUBLIC_SENTRY_DSN);
  addUrlOrigin(sources, env.NEXT_PUBLIC_POSTHOG_HOST);
  return Array.from(sources);
}

/**
 * Main middleware function
 */
export function middleware(request: NextRequest): NextResponse {
  // Generate request ID inline
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;

  const origin = request.headers.get('origin');
  const isProduction = process.env.NODE_ENV === 'production';

  // Check if origin is allowed inline
  const originAllowed = origin ? allowedOrigins.includes(origin) : false;

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });

    if (originAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin!);
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    response.headers.set('Access-Control-Max-Age', '86400');

    return response;
  }

  // Create response and add security headers
  const response = NextResponse.next();

  // Request tracking
  response.headers.set('X-Request-ID', requestId);

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy - disable unnecessary browser features
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Build CSP inline
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://eu-assets.i.posthog.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src ${buildConnectSources().join(' ')}`,
    "frame-src 'self' https://js.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // HSTS header for production only
  if (isProduction) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // CORS headers for allowed origins
  if (originAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin!);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

/**
 * Configure which paths the middleware runs on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
