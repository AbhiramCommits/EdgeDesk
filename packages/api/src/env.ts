import type { UserRole } from "shared";

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  AGENT_RUNS: DurableObjectNamespace;
  TRIAGE_MODE: string;
  AGENT_TRIGGER?: string;
  APP_VERSION: string;
  GIT_COMMIT?: string;
}

export interface AuthUser {
  userId: string;
  role: UserRole;
  email: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
};
