/**** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  output: 'standalone',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:4000'
  }
};
module.exports = nextConfig;
