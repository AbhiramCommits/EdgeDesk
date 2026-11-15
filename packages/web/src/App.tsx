import { useEffect, useState } from "react";
import type { HealthResponse } from "shared";

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as HealthResponse;
      })
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1>EdgeDesk</h1>
      <p>People-Ops request desk running on Cloudflare&rsquo;s edge.</p>
      {error ? <p role="alert">Worker health check failed: {error}</p> : null}
      {health ? <pre data-testid="health-json">{JSON.stringify(health, null, 2)}</pre> : <p>Checking worker…</p>}
    </main>
  );
}
