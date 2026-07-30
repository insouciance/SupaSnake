const { withSentryConfig } = require('@sentry/nextjs');
const {
  validateProductionEnvironment,
} = require('./scripts/production-env-validation.cjs');

// Sensitive Vercel variables are deliberately unreadable to local CI and are
// decrypted only inside Vercel's build. Validate the real values here so a
// malformed production configuration cannot produce a releasable build.
if (
  process.env.VERCEL_ENV === 'production' ||
  process.env.VERCEL_TARGET_ENV === 'production'
) {
  const paymentsMode = process.env.EXPECTED_PAYMENTS_MODE || 'test';
  const { errors, warnings } = validateProductionEnvironment(
    process.env,
    paymentsMode
  );
  for (const warning of warnings) {
    console.warn(`Production environment warning: ${warning}`);
  }
  if (errors.length > 0) {
    throw new Error(
      `Production environment validation failed:\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`
    );
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],

  // Performance optimizations
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // Enable gzip compression
  compress: true,

  // Public browser source maps stay off: Sentry uploads source maps at build
  // time (withSentryConfig below), so shipping them publicly is unnecessary.
  productionBrowserSourceMaps: false,

  // Experimental features for performance
  experimental: {
    // Enable optimized package imports
    optimizePackageImports: ['three', '@amplitude/analytics-browser'],
  },

  // Headers for caching
  async headers() {
    return [
      {
        // API payloads may contain authoritative account state. Never permit
        // a browser, service worker, shared proxy or framework cache to retain
        // them. Static presentation outside progress-bearing routes can still
        // use its route-specific cache policy.
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
      {
        // A Chronicle is public by player choice, but remains earned progress.
        // Keep its HTML/RSC representation out of browser and shared caches.
        source: '/p/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.css',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.woff2',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Keep build logs clean.
  silent: true,

  sourcemaps: {
    // Local/CI builds without SENTRY_AUTH_TOKEN must not fail or warn:
    // skip all source map upload work when the token is absent.
    disable: !process.env.SENTRY_AUTH_TOKEN,
    // Uploaded to Sentry, then removed so they are never served publicly.
    deleteSourcemapsAfterUpload: true,
  },

  // Upload a larger set of client files for readable stack traces.
  widenClientFileUpload: true,

  // Strip Sentry logger statements from production bundles.
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },

  telemetry: false,
})
