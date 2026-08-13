# Performance and balance evidence

## Production bundle

| Build | JavaScript raw | JavaScript gzip | CSS raw | CSS gzip |
| --- | ---: | ---: | ---: | ---: |
| Baseline `c3ccd63` | 897,907 B | 244,015 B | 46,759 B | 9,569 B |
| Candidate | 944,294 B | 257,159 B | 54,467 B | 11,060 B |
| Delta | +46,387 B | +13,144 B | +7,708 B | +1,491 B |

Candidate hashes:

- JavaScript `0baec676b6faa3f728e0c50f2c2cf8742853201f1429dce1f91cb5966d58357d`
- CSS `37cc4a31b147591f5301a7e0a2f686f859d4459c7ef81680dc28b1dcfaa0a004`

The JavaScript chunk is above Vite's 500 kB advisory threshold. It remains 257,159 bytes gzip,
loads successfully across all 30 fixtures, and produces no browser errors. Code splitting is a
reasonable future optimization but is intentionally not mixed into this visual/layout candidate.

## Renderer/resource evidence

- The sustained renderer-resource suite passes all four tests, including high-water pooling,
  Cleanup Crew/Plasma lifecycle, full teardown, and repeated restart stability.
- A permanent final horde capture records a real 60 FPS / 16.7 ms sample with 43 geometries,
  10 textures, 16 programs, 96 draw calls, 3 effects, 2 attacks, and no rail-pool use in that frame.
- The automated headless comparison uses software WebGL and samples different live moments, so its
  FPS/draw counts are diagnostic rather than a controlled performance benchmark. It recorded
  baseline 27 FPS / 36.9 ms and candidate 33 FPS / 30.4 ms without console, page, or request errors.

## Seeded survival comparison

Both reports use the same 32 hero/seed pairs and the competent policy.

| Measure | Baseline `endless-2.8.0` | Candidate `endless-2.9.0-test-center` |
| --- | ---: | ---: |
| Runs | 32 | 32 |
| Censored | 0 | 0 |
| Mean | 643.40 s | 612.85 s |
| Median | 360.79 s | 533.07 s |
| Standard deviation | 444.63 s | 347.07 s |
| 95% CI for mean | 489.34–797.45 s | 492.59–733.10 s |
| P25–P75 | 266.02–1111.69 s | 318.76–972.94 s |

The mean changed -4.7%; confidence intervals overlap substantially. Paired seeds split 17 candidate
higher / 15 candidate lower, with a +10.04 s paired median delta. This does not justify an unrelated
balance adjustment during a graphics/layout pass. Human Test Center playtesting remains authoritative.

The first candidate benchmark is retained as
`candidate-survival__rejected-policy-world-envelope.json`. It was invalid because the automated
policy inherited the doubled world boundary as extra kiting space. The benchmark-only envelope was
fixed, regression-tested, and the accepted 32-run report regenerated.
