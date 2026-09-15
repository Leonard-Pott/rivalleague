import type { NextConfig } from "next";

/**
 * CORS nur in der Entwicklung: die Web-Ausgabe der App laeuft auf Port 8081
 * und ruft das Backend auf 3000 - fuer den Browser ist das cross-origin.
 * Die native App kennt kein CORS, deshalb ist das reine Testinfrastruktur
 * und hat in Produktion nichts verloren.
 */
const devCors = [
  {
    source: "/api/:path*",
    headers: [
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
      { key: "Access-Control-Allow-Headers", value: "authorization, content-type" },
      { key: "Access-Control-Max-Age", value: "86400" },
    ],
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return process.env.NODE_ENV === "production" ? [] : devCors;
  },
};

export default nextConfig;
