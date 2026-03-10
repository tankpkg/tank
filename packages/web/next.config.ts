import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone'
};

const withMDX = createMDX({
  configPath: 'source.config.ts',
  outDir: '.source'
});

export default withMDX(nextConfig);
