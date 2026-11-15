# Edge latency benchmark

Local Wrangler `unstable_dev` (Miniflare) on Node v26.13.0. N=500 requests per endpoint, concurrency 10, isolated local D1/KV/DO state. No Cloudflare account or network calls.

## Endpoint latency

| Endpoint | Method | N | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | req/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| /api/health | GET | 500 | 9.56 | 34.46 | 137.81 | 155.56 | 655.55 |
| /api/requests | POST | 500 | 416.88 | 904.25 | 963.67 | 976.49 | 21.43 |
| /api/requests | GET | 500 | 41.23 | 112.43 | 295.34 | 317.96 | 185.68 |
| /api/requests/:id | GET | 500 | 60.07 | 129.66 | 203.47 | 234.74 | 139.77 |

## Agent runs (from `agent_runs`)

| Runs | Finished with duration | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | mean (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 500 | 222 | 411 | 538 | 538 | 240.07 |

Run status counts: finished=500. Pending after wait: 0.

## Worker bundle (`wrangler deploy --dry-run`)

| Raw | Gzipped |
| ---: | ---: |
| 291.06 KiB | 59.31 KiB |

## Notes

- `POST /api/requests` returns after the D1 insert and queues the agent run with `waitUntil`, so its latency is the kickoff latency, not the agent run duration.
- Agent run durations are read back from the `agent_runs` table after all background runs finish.
- This is a single-machine local benchmark; absolute numbers will differ on Cloudflare's edge and other hardware.

