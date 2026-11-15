# Edge latency benchmark

Local Wrangler `unstable_dev` (Miniflare) on Node v26.13.0. N=500 requests per endpoint, concurrency 10, isolated local D1/KV/DO state. No Cloudflare account or network calls.

## Endpoint latency

| Endpoint | Method | N | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | req/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| /api/health | GET | 500 | 12.45 | 32.44 | 114.81 | 124.96 | 611.31 |
| /api/requests | POST | 500 | 383.27 | 1169.4 | 4110.17 | 4116.42 | 17.21 |
| /api/requests | GET | 500 | 52.24 | 101.75 | 197.17 | 198.43 | 168.63 |
| /api/requests/:id | GET | 500 | 57.54 | 113.13 | 182.51 | 263.71 | 153.16 |

## Agent runs (from `agent_runs`)

| Runs | Finished with duration | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | mean (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 500 | 206 | 459 | 507 | 519 | 223.16 |

Run status counts: finished=500. Pending after wait: 0.

## Worker bundle (`wrangler deploy --dry-run`)

| Raw | Gzipped |
| ---: | ---: |
| 291.06 KiB | 59.31 KiB |

## Notes

- `POST /api/requests` returns after the D1 insert and queues the agent run with `waitUntil`, so its latency is the kickoff latency, not the agent run duration.
- Agent run durations are read back from the `agent_runs` table after all background runs finish.
- This is a single-machine local benchmark; absolute numbers will differ on Cloudflare's edge and other hardware.

