# Self-hosted webfonts

Latin subsets of three Google Fonts families, served from this origin instead of
`fonts.googleapis.com`.

| Family | Weights | Licence |
| --- | --- | --- |
| Audiowide | 400 | SIL Open Font License 1.1 |
| Chakra Petch | 500, 600, 700 | SIL Open Font License 1.1 |
| Space Mono | 400, 700 | SIL Open Font License 1.1 |

All three are OFL 1.1, which permits redistribution — including bundled inside a
commercial product — provided the fonts are not sold on their own and the licence
travels with them. Keep this file next to the `.woff2` files, and reproduce the
attribution in the credits of any packaged (Steam) build.

- Audiowide — Copyright (c) Astigmatic (AOETI)
- Chakra Petch — Copyright (c) Cadson Demak
- Space Mono — Copyright (c) Colophon Foundry

Full licence text: <https://openfontlicense.org/>

## Regenerating

```bash
node scripts/fetchFonts.mjs
```

Then paste `fonts.css` over the `@font-face` block at the top of
`src/styles/app.css`. The faces are inlined into the bundled stylesheet on purpose —
behind an `@import` they would cost the extra round trip that self-hosting was meant
to remove.
