/**** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
  // Remove 'standalone' for Vercel deployment - Vercel handles optimization
  env: {
    API_URL:
      process.env.API_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://gmail-app-w-sq-g.fly.dev'
        : 'http://localhost:4000')
  }
};
module.exports = nextConfig;
