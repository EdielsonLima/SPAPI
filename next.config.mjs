/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    '*.kirk.replit.dev',
    '*.replit.dev',
    '*.repl.co',
  ],
};

export default nextConfig;
