import type { NextConfig } from "next";

/** Попадает в клиентский бандл — по значению видно, что контейнер/сборка обновлены. */
const appBuild =
  process.env.NEXT_PUBLIC_APP_BUILD?.trim() ||
  `dev-${new Date().toISOString().slice(0, 10)}`;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    NEXT_PUBLIC_APP_BUILD: appBuild,
  },
};

export default nextConfig;
