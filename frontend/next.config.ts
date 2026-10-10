import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pilot builds live outside frontend/.next so validating an update cannot mix
  // assets with the currently running accepted demo release.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
    ],
  },
};

export default nextConfig;
