import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@aws-sdk/client-s3'],
  outputFileTracingExcludes: {
    '/*': [
      './node_modules/@electric-sql/**/*',
      './node_modules/@prisma/dev/**/*',
      './node_modules/@prisma/studio-core/**/*',
      './node_modules/prisma/build/**/*',
    ],
  },
};

export default nextConfig;
