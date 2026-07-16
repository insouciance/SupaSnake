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
  'https://ogsnake.com',
  'https://www.ogsnake.com',
  'https://staging.ogsnake.com',
];

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
    "connect-src 'self' https://*.supabase.co https://api.stripe.com https://eu.i.posthog.com https://eu-assets.i.posthog.com wss://*.supabase.co",
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
