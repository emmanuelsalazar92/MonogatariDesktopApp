import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Next development assets (including HMR) validate their Origin separately
// from application API routes. Discover the machine's current interface
// addresses when the server starts so DHCP changes never require a source edit.
const lanDevOrigins = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", ...new Set(lanDevOrigins)]
};

export default nextConfig;
