# Landing Stripe Audit Benchmark

This benchmark is quarantined. It is not part of `npm test`.

Run:

```bash
node bench/roadmap/landing-stripe-audit/scoring.mjs
```

Visual viewport gate:

```bash
node bench/roadmap/landing-stripe-audit/viewport-check.mjs
```

The source checks are proxies for the Stripe audit roadmap. The implemented P1/P2 checks should now stay green. Future design roadmap items can add new expected-red checks here while they remain quarantined from the live app test gate.

The viewport gate is still quarantined from `npm test`. It expects the local landing page to be running at `http://127.0.0.1:6100/` unless `ADVO_LANDING_URL` is provided. It writes a JSON result under `runs/` and screenshots under `screenshots/<date>/`.
