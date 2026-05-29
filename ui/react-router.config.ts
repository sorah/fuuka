import type { Config } from "@react-router/dev/config";

export default {
  // Static SPA: no server-side rendering. Build output (build/client) is
  // deployed to S3 and served behind CloudFront.
  ssr: false,
} satisfies Config;
