# Implementation Agent Instructions

## Read first

1. `GAME_CONCEPT.md`
2. `docs/CONTAINMENT_PROTOCOL.md`
3. `README.md`

## Authoritative product direction

- **Containment Protocol is GYST.** It is not an experiment or secondary mode.
- The former campaign prototype is retired and must not remain selectable, documented as active, or used as a product constraint.
- Preserve the hero-selection screen and its four-hero identity.
- The game is one-map endless survival: upward timer, automatic weapons, Energy/XP upgrades, bosses every two minutes, and death-only completion.
- Active controls provide agency: Dodge, Repulsor Burst, Afterburner ship form, and Mech Overdrive.
- Each hero has an independent local leaderboard.

## Architecture guardrails

- Keep Vite + TypeScript + Three.js `0.180.0`.
- Simulation owns combat; rendering presents only.
- Use one RAF loop and one WebGL renderer at a time.
- Every screen/runtime must dispose listeners, effects, models, and renderer resources completely.
- Keep hero identity separate from astronaut, ship, and mech form.
- Keep deterministic fixed-step simulation and deterministic fixtures.
- Centralize content and balance definitions; do not scatter hero, weapon, or boss special cases through hot loops.
- Use bounded pools/caps for enemies, bosses, projectiles, hazards, particles, and damage-number presentation.
- Do not retain campaign routes, buttons, fixtures, runtime code, tests, or documentation after the removal migration is implemented.

## Endless progression guardrails

- Weapon levels 1–5 are authored behavioral tiers.
- Level 6 onward uses repeatable Overclock scaling while still displaying normal levels (L6, L7, L8...).
- Repeatable damage growth is additive, not compounding.
- Eligible passive upgrades may continue with safe/diminishing returns.
- Hard safety caps remain for cooldown, speed, area, projectile count, pickup reach, transformation duration, and damage reduction.
- Weapon slots remain limited.
- Enemy and boss growth must eventually outpace the player.

## Product scope

Do not add without explicit owner direction:

- Additional maps
- Accounts, databases, or cloud saves
- Online leaderboards
- Permanent metagame progression
- Shops, currencies, inventory, or rarity
- Co-op
- Gamepad or touch support
- Audio production

## Assets

- Source packs: `assets/space-packs/` (not published wholesale)
- Runtime subset: `public/runtime/`
- Profile scale, collider, animation, boss aura, ship pickup, and thruster configuration belong in content definitions.
- Reuse the provided Quaternius CC0 assets and document any new runtime subset.

## Quality

Compilation is not completion. Exercise the game in a real browser, inspect the console, and verify the relevant fixtures before claiming work is done.

For balance work, preserve a seeded benchmark snapshot before changing production
values, run the same seeds and policy after each coherent experiment, and record the
delta in `docs/SURVIVAL_EXPERIMENTS.md`. The simulator is a regression instrument;
human Test Center playtests remain authoritative for feel. Do not tune blindly until
the current simulated policies have been calibrated against real runs.

Minimum verification:

```bash
npm test -- --run
npm run typecheck
npm run build
```

Two CPU-bound benchmark tests can exceed vitest's 5000ms default on slow hardware
and fail as timeouts rather than assertions (`per-level effective gains`,
`pressure director > never stacks surges`). With headroom both suites pass in
full. CI runs `npm test -- --testTimeout=120000`. If you see exactly those two
failing on time, raise the timeout and re-run before treating it as a
regression — and never "fix" it by changing a balance value or an acceptance
band.

Browser QA is scriptable and does not require a human:

```bash
npm run build
python3 -m http.server 8899 --directory dist &
node scripts/browserQa.mjs http://127.0.0.1:8899 --screenshots qa-shots
```

It sweeps the required viewport x UI-scale matrix (75/100/125/150% at desktop,
laptop, and narrow widths), reporting console errors, WebGL canvas presence, and
per-edge clipping of interactive elements. It accepts any base URL, so the same
harness runs against a deployed alias. Narrow/mobile widths are measured but
non-blocking: this is not currently a mobile game.

## Deployment

Deployment is owned by the **Cloudflare Pages Git integration** on the existing
`get-your-ship-together` project. Pushing a branch builds and publishes it.

- Never create a replacement Cloudflare project.
- Do not add a second deploy path (wrangler direct upload, a deploy workflow).
  Two publishers racing the same alias is how deployments become unexplainable.
- Required project build configuration: build command `npm run build`, build
  output directory `dist`, root directory `/`. Node 22.

Branch to URL:

| Branch | URL |
| --- | --- |
| `main` | `https://get-your-ship-together.pages.dev` |
| any other branch | `https://<branch>.get-your-ship-together.pages.dev` |

Long branch names are truncated in the alias.

## Verifying a deployment

**"Deploy successful" does not mean the site works.** If the project's build
configuration is missing, Pages publishes the repository verbatim: the deploy is
reported green, the URL returns HTTP 200, and the served page is the development
`index.html` pointing at `/src/main.ts`, which no browser can execute. This has
happened in production. Assume nothing from deploy status.

A deployment is verified only when all of these hold:

1. Served `index.html` references `/assets/*.js` and `/assets/*.css`, and does
   **not** reference `/src/main.ts`.
2. Each served asset matches a clean local build of the deployed commit by byte
   size and SHA-256.
3. The served JavaScript contains the expected `SURVIVOR_BALANCE_VERSION` marker
   and does not contain the marker of any other partition.
4. Browser QA against the deployed URL reports no console or page errors.

`.github/workflows/verify-deployment.yml` (workflow_dispatch) does all four and
writes a byte/SHA-256 comparison table to the run summary. It takes a URL, a
reference commit, and optional expected/forbidden markers, and needs no
Cloudflare credentials — it only makes public HTTP requests. Use it when your
own environment cannot reach `*.pages.dev`.

## Environment notes for agents

- Some sandboxes deny egress to Cloudflare entirely (`api.cloudflare.com`,
  `*.pages.dev`). Credentials do not help; the connection is refused before
  authentication. Run deployed verification from CI instead, and say plainly
  that you could not reach the site rather than inferring it from deploy status.
- Headless Chromium does not inherit `HTTPS_PROXY` the way curl does. Pass the
  proxy explicitly when QA-ing a remote URL.
- Pushing tags may fail where branch pushes succeed, depending on how git
  credentials are proxied. Do not assume a tag landed; confirm with
  `git ls-remote --tags origin`.
