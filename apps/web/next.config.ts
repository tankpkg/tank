import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable standalone output for Docker builds (incompatible with Vercel serverless)
  ...(process.env.STANDALONE === 'true' && { output: 'standalone' }),
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: '**' },
      { protocol: 'https', hostname: '**' }
    ]
  }
};

const withMDX = createMDX({
  configPath: 'source.config.ts',
  outDir: '.source'
});

export default withMDX(nextConfig);
