import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

function loadRootEnvFallback(): void {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  if (!existsSync(rootEnvPath)) {
    return;
  }

  const content = readFileSync(rootEnvPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const delimiterIndex = line.indexOf("=");
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

// Keep Next's app-level env behavior, but allow root .env as fallback in this monorepo.
loadRootEnvFallback();

const nextConfig: NextConfig = {
  transpilePackages: ["@coach/shared", "@coach/db", "@coach/integrations", "@coach/ai", "@coach/observability"],
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
