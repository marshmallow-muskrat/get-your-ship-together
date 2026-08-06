# Get Your Ship Together

Isometric sci-fi action prototype evaluating **two** directions:

1. **Campaign** — manual combat vertical slice  
2. **Containment Protocol** — survivor/horde experiment  

## Quick start

```bash
npm install
npm run dev
```

Open the local URL (default `http://localhost:5173/`).

```bash
npm test
npm run build
npm run preview
```

## Mode selection

1. Select a hero.
2. **CONTINUE** → Campaign  
3. **CONTAINMENT PROTOCOL** → Survivor experiment  

## Dev fixtures

### Campaign

- `/?fixture=combat&hero=bee`
- `/?fixture=boss&hero=frog`
- `/?fixture=mech&hero=flamingo`

### Survivor

- `/?mode=survivor&fixture=survivor-start&hero=bee`
- `/?mode=survivor&fixture=survivor-horde&hero=bee`
- `/?mode=survivor&fixture=survivor-boss&hero=frog`
- `/?mode=survivor&fixture=survivor-mech&hero=flamingo`
- `/?mode=survivor&fixture=survivor-levelup&hero=red-panda`

## Docs

- `GAME_CONCEPT.md` — dual-direction status
- `docs/VERTICAL_SLICE.md` — campaign slice
- `docs/SURVIVOR_MODE_VERTICAL_SLICE.md` — survivor experiment

## Stack

Vite · TypeScript · Three.js `0.180.0` · Vitest
