import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@sre/types'],
  output: 'standalone',
};

export default config;
