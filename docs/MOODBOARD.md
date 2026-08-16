# ADVO — Moodboard & Brand Direction

> Visual + verbal answer to Prince’s ask: *what do we want ADVO to be?*  
> Grounded in [VISION.md](./VISION.md). Designed so Ms. Imee can stress-test it — if a line fails the “does this make sense?” test, it does not ship.

**Visual panels:** [moodboard/index.html](./moodboard/index.html) (open in browser) · source frames in `docs/moodboard/*.jpg`

---

## One sentence

**ADVO is the operating layer for Philippine businesses that still run on paper, Viber, and tally sheets — software plus commodity hardware, shipped vertical by vertical, until we are infrastructure rather than a vendor.**

Not an AI studio. Not a generic web agency. Not global SaaS.

---

## What this company feels like

| Dimension | Direction | Why it holds |
|-----------|-----------|--------------|
| **Category** | Industry OS / full-stack vertical | Matches pricing (deploy + retainer), hiring (field-capable), and moat (embedded ops) |
| **Geography** | Philippines-first, developing-market comparable | Digitalization incomplete; competition thin; deals are relational |
| **Product** | Software + replaceable mall hardware | TV queue, tablet POS, phone + Bluetooth printer — no custom silicon until a vertical is proven |
| **Voice** | Calm, direct, engineer-owned | We ship systems people depend on; hype language undermines trust |
| **Look** | Public `/`: Runway marketing language — white field, cinematic stills, ghost + dark buttons, dense black footer. Admin/hub: Linear dark | `/` is the shipped `LandingPage` — do not document the old black 3D page or the orange editorial Codex page as live |

---

## Visual system (already in code)

Admin/hub tokens below live in `apps/web/src/index.css`. Public `/` tokens live in `landing-page.css` (white, `--landing-ink` / `--landing-ghost` / `--landing-dark`).

| Token | Value | Role |
|-------|-------|------|
| Background | `#0A0A0A` | Full page |
| Card / surface | `#0F0F0F` / `#1A1A1A` | Raised panels |
| Text | `#FAFAFA` / `#999` muted | Body / secondary |
| Accent | `#E67A3A` | CTAs, highlights only — never rainbow |
| Border | `#242424` | Hairline |
| Type | Landing: Inter on `.landing-page`. Admin/hub: Hanken Grotesk | No mono `01` numerals on `/`. Product chrome is dense sans, not display-mono |
| Radius | 10px | Default |

**Photography language**

1. **Team** — real faces, editorial portraits. `/` hero is type + workspace showcase, not a full-bleed photo. `/team` still has portraits.
2. **Floor** — PH operations with modern rails: queue LED, tablet at a stainless counter, receipt printer, cracked screens and stickers allowed. Grit is proof we understand the deployment surface.
3. **Product** — black studio shot of tablet + printer + display TV. Commodity hardware as hero objects.

**Motion** — landing: Framer reveal-on-view + reduced-motion path. Hub: `FloatingNav` spring. No ticker, circuit traces, or blob CTA on `/`.

---

## Moodboard panels (what each argues)

| # | File | Argument |
|---|------|----------|
| 01 | `01-hardware.jpg` | We sell an *outcome on devices that already exist* — not seats in the cloud. |
| 02 | `02-operations.jpg` | The customer is a real PH counter at night, not a Series-B landing page. Digitalization looks like this. |
| 03 | CSS system board in HTML | Palette + type discipline: black field, orange strike, mono labels. |
| 04 | `04-site-ui.jpg` | **Steal the layout language** (dark, huge type, pill nav, orange CTA). **Do not steal the SaaS copy** (“free trial”, “operate faster”). |

Panel 04 is a *composition reference*. Our pricing model is deployment + retainer, not freemium trial. Using trial language would fail Ms. Imee’s sense check against [VISION.md](./VISION.md).

---

## What we are / are not

### We are

- Product engineering + systems integration
- Vertical industry software (queue, order, bill, park, inventory…)
- On-site deployable (tablet, TV, phone, printer)
- Relationship-distributed (vouch > ads)
- Accountable for uptime once we are load-bearing

### We are not

| Anti-pattern | Why it dies under scrutiny |
|--------------|----------------------------|
| “AI agency” | Category trap; competes on hype; wrong buyers |
| Purple glassmorphism / gradient mesh / fake neural nets | Signals tool-of-the-week, not infrastructure |
| Global horizontal SaaS (“one platform for everyone”) | Price race to zero; no PH distribution edge |
| Free trial / per-seat pricing on the homepage | Contradicts deploy + retainer + SLA economics |
| Stock “diverse startup team high-fiving in glass office” | We already have real team photography — use it |
| ChatGPT / Midjourney logo soup as credibility | Tools are infrastructure, not the brand story |

---

## Startup website — information architecture

Goal: *transition the public site so we can use it as the company front door* — credibility first, lead capture second. Structure a serious early-stage company would stand behind.

| Section | Job | Copy direction (draft) |
|---------|-----|------------------------|
| **Hero** | Category in one breath | Keep spirit of “We digitalize for you.” Tighten subtext toward *operations systems*, not “web apps and portals” only. |
| **Proof** | Stats / logos / shipped work | Engineers, deployments, years — no inflated vanity metrics. |
| **Problem** | Paper / Viber / tally sheet reality | Mirror VISION market thesis in plain language. |
| **What we install** | Software + commodity hardware | Table from VISION (TV queue, tablet POS, phone + printer). |
| **How we work** | Deploy → embed → reference → repeat | Process steps already numbered `01`… — retarget labels to this loop. |
| **Work** | Portfolio / case slices | Outcome + vertical, not tech stack laundry lists. |
| **Team** | Faces + roles | `/team` already editorial — keep. |
| **Start** | `/start` lead form | Keep 24h response promise; drop SaaS trial language if it sneaks in. |

**Out of public IA (for now):** Admin scrapers, hub plumbing, Plaud internals — those are product, not homepage.

---

## Messaging map (public vs internal)

| Audience | Message |
|----------|---------|
| **Business owner** | “Your daily ops run on us — queue, bill, track — on hardware you can replace at the mall.” |
| **Referrer / partner** | “Small team that shows up, ships, and stays accountable after go-live.” |
| **Engineer recruit** | “Field-aware product work; real systems; not agency ticket roulette.” |
| **Internal (this doc)** | Industry OS; moat = embeddedness; support cost is the strategy. |

---

## Gap: site today vs direction

Honest inventory so we do not pretend the moodboard already shipped.

| Surface | Today | Direction |
|---------|-------|-----------|
| Hero subtext | Shipped `LandingPage`: "Build together. Ship with *clarity.*" + workspace showcase | Ops systems + hardware surfaces for PH businesses |
| Services defaults | Web / Mobile / Cloud (generic agency) | Vertical outcomes + deploy surfaces (or fewer, sharper services) |
| Why Digital defaults | Generic “24/7 presence / scale” | Incomplete digitalization thesis (first software, not replace software) |
| Visual system | `/` is white editorial (`landing-page.css`). Admin/hub stay Linear dark | Keep the split; do not restore black 3D / ticker / blob as current `/` |
| Vision doc | Clear | Site copy has not fully caught up |

**Finalize pass (next build, not this moodboard):** rewrite public section defaults + CMS content to match VISION without rewriting the design system.

---

## Decision checklist (before any public copy ships)

1. Does this sentence still work if we never say “AI”?
2. Would a restaurant / parking / clinic owner understand it in one read?
3. Does pricing language match deploy + retainer (no free-trial lie)?
4. Does the visual stay in black + orange + real photography?
5. Would Ms. Imee ask “ano ba talaga kayo?” after reading it? If yes — rewrite.

---

## Sources of truth

- Strategy: [VISION.md](./VISION.md)
- Near-term product bets: [SCOPE-PWA-MEETING.md](./SCOPE-PWA-MEETING.md)
- Live design tokens: `apps/web/src/index.css`, `apps/web/tailwind.config.ts`
- Public site structure: `apps/web/src/pages/Index.tsx`, `apps/web/src/components/landing/*`

---

*Drafted for team alignment (Prince / Mar / Imee). Visuals are direction, not final production assets.*
