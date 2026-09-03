import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  transpilePackages: ['@aws-sdk/client-s3'],
};

export default nextConfig;
