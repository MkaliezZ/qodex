import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// Resolve workspace packages for Vite
const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@qodex/agent-runtime": path.resolve(
        workspaceRoot,
        "packages/agent-runtime/src/index.ts",
      ),
      "@qodex/provider-sdk": path.resolve(
        workspaceRoot,
        "packages/provider-sdk/src/index.ts",
      ),
      "@qodex/project-runtime": path.resolve(
        workspaceRoot,
        "packages/project-runtime/src/index.ts",
      ),
      "@qodex/context-engine": path.resolve(
        workspaceRoot,
        "packages/context-engine/src/index.ts",
      ),
      "@qodex/diff-engine": path.resolve(
        workspaceRoot,
        "packages/diff-engine/src/index.ts",
      ),
      "@qodex/marketplace-runtime": path.resolve(
        workspaceRoot,
        "packages/marketplace-runtime/src/index.ts",
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
