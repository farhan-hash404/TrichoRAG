/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy API calls to FastAPI so the browser sees a same-origin API (no CORS,
    // and the API host can change without rebuilding the client).
    const api = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
    return [
      { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
      { source: "/api/health", destination: `${api}/health` },
    ];
  },
};

export default nextConfig;
