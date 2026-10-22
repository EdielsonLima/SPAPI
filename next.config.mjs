/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    '*.kirk.replit.dev',
    '*.replit.dev',
    '*.repl.co',
  ],
  // Suprimentos saiu deste app (Edielson, 22/10/2026: aqui ficam só Financeiro
  // e Comercial). Favoritos antigos caem no Dashboard em vez de 404.
  async redirects() {
    return [
      { source: "/suprimentos", destination: "/dashboard", permanent: false },
      { source: "/suprimentos/:path*", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
