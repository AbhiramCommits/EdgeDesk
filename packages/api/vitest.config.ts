import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        isolatedStorage: false,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          compatibilityDate: "2024-12-18",
          bindings: {
            // Unit tests drive runAgent() explicitly instead of leaving a
            // waitUntil() task running past the test's isolated storage frame.
            AGENT_TRIGGER: "manual",
          },
        },
      },
    },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
