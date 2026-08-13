# Defect log

Every visual, structural, logic, browser, or performance defect found during this pass is
recorded here with its disposition. The log is completed during browser review.

| ID | Area | Observation | Disposition |
| --- | --- | --- | --- |
| BASE-001 | Imported-asset remaster | Procedural additions obscured and weakened good source-pack models. | Rejected; no prior remaster output will be integrated. |
| POL-001 | Wayfinding / VFX | Central-pad overlay wrote depth and hid Plasma Wake and other ground effects. | Fixed with a dedicated depth-testing, non-depth-writing material; regression test added. |
| POL-002 | Wayfinding | Lowering the pad overlay made the authored pad disappear. | Rejected iteration archived; restored readable height and solved occlusion through material behavior. |
| POL-003 | Energy pickup | Fully additive layers washed the pickup into an indistinct glow. | Fixed with an opaque core, normal-blended shell, and narrow additive coil. |
| POL-004 | Repair pickup | Initial review framing did not clearly demonstrate the medical silhouette. | Fixture-only position corrected outside collection range; gameplay spawning unchanged. |
| POL-005 | Gunship | Enlarging the world stretched the flight path to the global edge and weakened timing/readability. | Fixed with a local combat reach clipped to world bounds. |
| POL-006 | Gunship | Candidate lane scoring used a wider boss corridor than strike collision. | Fixed by matching score and hit widths; regular and mega boss regressions pass. |
| POL-007 | Gunship test | First correction referenced an unavailable clamp helper. | Caught by focused tests and replaced with bounded `Math.min`/`Math.max`. |
| POL-008 | Plasma Wake | Actors and station overlays could visually flatten or cover the trail. | Fixed render ordering, depth behavior, and layered materials; permanent pad-contract capture added. |
| POL-009 | Metrics panel | Debug metrics overlapped help/control copy in the first candidate layout. | Moved into a dedicated bordered panel above help. |
| POL-010 | Orbital evidence | Fixed-delay capture skipped the short-lived beam and showed only dissipation. | Fixture capture now advances until a real `orbital-strike` effect exists; timeline regenerated. |
| POL-011 | Benchmark | Enlarged `arenaHalf` expanded the automated policy's correction envelope, invalidating the first A/B run. | First 32-run result archived as rejected; policy now uses the stable combat pocket; regression test added. |
| POL-012 | Browser audit | Fixed startup delay inspected nine fixtures before HUD/canvas readiness. | Replaced with explicit HUD-mounted and full-canvas-size readiness gates; rerun passed 30/30. |
| POL-013 | Review sheets | First animation strips contained excessive empty canvas below the frames. | Compositor viewport tightened; both permanent timelines regenerated and visually rechecked. |
| POL-014 | QA portability | Repository browser scripts assumed Playwright's bundled Chromium existed locally. | Added optional `CHROME_EXECUTABLE_PATH`; CI defaults remain unchanged and both release harnesses pass. |
| LIM-001 | Bundle | Main JavaScript remains above Vite's 500 kB advisory threshold. | Intentional limitation for this bounded pass; 257,159 bytes gzip and no runtime/load errors. Future code splitting is appropriate but out of visual-polish scope. |
| LIM-002 | Mobile | 390px hero-selection cards clip at UI scales 100–150%. | Intentional documented limitation: mobile/touch is explicitly unsupported; all desktop/laptop blocking matrices pass. |
