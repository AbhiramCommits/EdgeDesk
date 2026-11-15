import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    // All suites share one runtime and one D1 because Durable Object isolated
    // storage is unreliable with the agent's storage writes. Run files
    // sequentially so the explicit beforeEach reset cannot race.
    fileParallelism: false,
    maxWorkers: 1,
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
