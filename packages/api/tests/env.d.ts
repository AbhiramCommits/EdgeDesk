import type { Env } from "../src/env";

declare module "cloudflare:test" {
  // Module augmentation: bind the Worker's Env to the test `env` export.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
