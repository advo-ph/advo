# park.advo.ph off Vercel · advo.ph behind Cloudflare

Date: 2026-08-21. Status: **app staged and serving on the VPS; DNS not cut over.**

## What was actually wrong with the premise

`advo` itself was never on Vercel. Measured 2026-08-21:

| host | resolves to | served by |
|---|---|---|
| `advo.ph` | 62.146.237.12 | `nginx/1.24.0 (Ubuntu)` — the Contabo VPS |
| `api.advo.ph` | 62.146.237.12 | same |
| `www.advo.ph` | → `advo.ph` | same |
| **`park.advo.ph`** | **`vercel-dns-016.com`** | **`server: Vercel`, `x-vercel-id: sin1`** |

There is no `vercel.json` anywhere in this repo and `deploy.sh` rsyncs to `/opt/advo` behind
PM2 + nginx. **One advo.ph surface was on Vercel — `park.advo.ph`, the `advopark` marketing
site — and that is what moved.** Nameservers are Namecheap (`dns1/dns2.registrar-servers.com`)
and nothing is proxied: no `cf-ray` on any response.

## Done — the app is on the VPS

| step | detail |
|---|---|
| Node | **24.19.0 via nvm at `/root/.nvm/versions/node/v24.19.0/bin/node`.** System `/usr/bin/node` stays **22.22.2** — `advo-api`, `fourlinq` and `fourlinq-hr` run on it and an apt upgrade would have moved all three. advopark declares `engines.node >= 24`, so it gets its own interpreter rather than the box getting a new default. |
| pnpm | 10.30.3 via corepack, matching the repo's `packageManager` |
| source | `/opt/advopark` |
| build | `@advopark/core` and `@advopark/protocol` build **first** — a filtered `--filter @advopark/web build` fails with *"Failed to resolve entry for package @advopark/core"* because `core` publishes `./dist/index.js` and the filter skips its workspace dependency |
| process | PM2 `advopark-web`, fork mode, `next start -p 6420 -H 127.0.0.1`, `max_memory_restart 500M`, config at `/opt/advopark/ecosystem.config.cjs`. `pm2 save` run; `pm2-root` systemd unit already enabled, so it survives reboot |
| port | **6420** — advo's own block `6400–6499`, "extra apps +10, +20" per the ledger rule. Claimed in `PORTS.md`. Every 100-block from 6100 to 9999 is already taken |
| nginx | `/etc/nginx/sites-available/advopark`, symlinked enabled. `_next/static/` gets a 1-year immutable cache; everything else proxies with upgrade headers |
| verified | `curl -H "Host: park.advo.ph" http://127.0.0.1/` → **200**, `<title>AdvoPark — Automated parking for Philippine properties</title>`. `advo.ph` and `api.advo.ph` still **200** after the reload |

**Live traffic is untouched.** `park.advo.ph` still resolves to Vercel and still serves from
Vercel. The VPS copy is reachable only by Host header until DNS moves.

## Not done — needs credentials this session does not have

Both remaining steps need accounts I have no access to, and one is a nameserver change on a
live earning domain. **They are deliberately left for a human.**

### 1. Cloudflare zone for `advo.ph`

1. Add `advo.ph` in Cloudflare. Let it import the existing records, then **check them against
   the table below before changing nameservers** — an import that misses `api.advo.ph` takes
   the API down at propagation.
2. Records to end up with:

   | name | type | value | proxy |
   |---|---|---|---|
   | `advo.ph` | A | 62.146.237.12 | **Proxied** |
   | `www` | CNAME | `advo.ph` | Proxied |
   | `api` | A | 62.146.237.12 | **DNS only** at first — see the caveat |
   | `park` | A | 62.146.237.12 | Proxied — **this is the Vercel cutover** |

3. SSL/TLS mode **Full (strict)**. Not Flexible: Flexible would serve the browser HTTPS while
   fetching the origin over plain HTTP, which is a downgrade dressed as encryption.
4. Change nameservers at Namecheap to the pair Cloudflare issues. Propagation is up to 24 h.

**Caveat on `api`:** proxying an API through Cloudflare changes upload limits, timeouts and
WebSocket behaviour. `advo` runs Playwright/Puppeteer scrapers and a GitHub webhook through
that host. Move it to Proxied **after** the web surfaces are proven, not in the same change.

### 2. TLS at the origin

Let's Encrypt HTTP-01 **cannot** validate `park.advo.ph` while it still resolves to Vercel, which
is why the vhost is HTTP-only today. After DNS points at the VPS:

```bash
ssh advo 'certbot --nginx -d park.advo.ph --non-interactive --agree-tos -m <ops-email>'
```

If Cloudflare proxying is already on, use a **DNS-01** challenge or turn the proxy to
DNS-only for the minute the challenge runs — HTTP-01 through an orange cloud fails.

### 3. Origin hardening — only after Cloudflare is live

Not applied yet, because applying it while DNS is still direct would lock out real visitors.

```nginx
# in the park.advo.ph server block, once Cloudflare fronts it
set_real_ip_from 173.245.48.0/20;   # full list: https://www.cloudflare.com/ips-v4
# ... remaining Cloudflare ranges ...
real_ip_header CF-Connecting-IP;
```

Then firewall :80/:443 to Cloudflare ranges only, so the origin IP cannot be hit directly and
the proxy cannot be bypassed. **Do this last** — it is the step that locks the door, and doing
it early locks it with you outside.

## Rollback

Instant, at every stage before DNS moves: `pm2 delete advopark-web`, remove the nginx symlink,
reload. Nothing else on the box references advopark.

After DNS moves, rollback is to point `park` back at the Vercel CNAME
(`890ffc44aa4de4b0.vercel-dns-016.com`) — keep the Vercel project alive until the VPS copy has
run a full week, and do not delete it on cutover day.

## Redeploy

```bash
ssh advo 'export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh; nvm use 24 >/dev/null
  cd /opt/advopark && git pull 2>/dev/null
  pnpm install --frozen-lockfile
  pnpm --filter @advopark/core --filter @advopark/protocol build
  pnpm --filter @advopark/web build
  pm2 restart advopark-web'
```

`/opt/advopark` was seeded by `rsync` from a shallow clone and **has no git remote** — either
`git clone` it properly on the box or keep rsyncing from a workstation. Decide before the
second deploy, not during it.
