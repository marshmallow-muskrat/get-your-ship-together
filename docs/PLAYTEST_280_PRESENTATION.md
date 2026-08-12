# Human playtest checklist — endless-2.8.0 presentation pass

Test Center: <https://test-center-endless-2-8-0.get-your-ship-together.pages.dev>

Automated gates are green and every item below is covered by a test or a QA harness.
What none of them can tell us is whether the result *feels* right. That is what this is
for. Fixtures are listed where a thing is hard to reach in a normal run.

## 1. Plasma Wake — occlusion and brightness

`/?mode=survivor&fixture=survivor-plasma-l1&hero=bee`
`/?mode=survivor&fixture=survivor-plasma-ship&hero=bee` (widest, brightest case)

- [ ] Standing on your own trail: does the astronaut sit **in front of** it, not behind?
- [ ] Same for enemies and a boss walking through it.
- [ ] Is it dangerous residual plasma, or still a glowing ribbon?
- [ ] Can you still see where the trail is being laid down?
- [ ] Does an old segment read as spent rather than as something still throwing light?
- [ ] Does the visible edge match where enemies start taking damage?

## 2. Cosmic Boomerang — shape, colour, readability

Take Cosmic Boomerang; take it to L5 for Twin Orbit.

- [ ] Does it read as a boomerang rather than a disc or a halo?
- [ ] Can you see it spinning?
- [ ] Can you tell which way it is travelling, in a crowded fight?
- [ ] At Twin Orbit, can you follow **both** discs and both lanes separately?
- [ ] Do the gold and purple hold up against the arena, enemies, pickups, and the
      other weapon effects you happen to have — especially Orbital and Arc?

## 3. Upgrade cards — overlap

`/?mode=survivor&fixture=survivor-levelup&hero=red-panda`, and during real runs.

- [ ] At 75%, 100%, 125% and 150% UI scale: does the 1/2/3 shortcut ever touch the
      description, a stat line, or the tradeoff line?
- [ ] Turn **Upgrade Numbers** on (Pause -> Settings) — the longest cards are passives
      with a full stat block. Still clear?
- [ ] Anything look cramped or oddly tall at the extremes?

## 4. Level badges

- [ ] Does every upgrade card show a gold level badge?
- [ ] Weapon step reads `L1 → L2`, `L4 → L5`.
- [ ] An Overclock reads `L5 → L6` (not "Overclock" in place of the level).
- [ ] A new weapon or first passive reads `Acquire · L1`.
- [ ] A passive at its cap reads `L4 → L5 · MAX`.
- [ ] Does gold consistently mean "this advances something"?

## 5. Cooldowns and the ready flash

- [ ] Is the countdown readable at default UI scale, mid-fight, over the sweep?
- [ ] Does it stop jittering as it counts down through 10s?
- [ ] When Dodge / Repulsor / Afterburner / Mech comes back, do you **notice**?
- [ ] Is the green flash a single pulse, not a blink that keeps going?
- [ ] Does the slot go straight back to its class colour?
- [ ] Nothing flashes when a run first starts?

## 6. Containment Field and Weapon Overclock

Take Containment Field to L5. Then a run with Weapon Overclock at L5 instead.

- [ ] With Containment Field, does Pulsar Core's ring visibly get bigger — and does it
      match where enemies actually die?
- [ ] Boomerang: bigger disc, and does it throw further?
- [ ] Plasma Wake: wider trail. Does it last the same time (it should)?
- [ ] Orbital: bigger marker, bigger blast, bigger shockwave — all in proportion?
- [ ] With Weapon Overclock instead: everything fires faster and **nothing** gets bigger?

## 7. Upgrade names

- [ ] Take Rocket Barrage to L5. Is it still called Rocket Barrage the whole way, and do
      the cards tell you what each level actually does?
- [ ] Same for Microdrone Swarm.
- [ ] When a weapon **does** get renamed (Twin Pulse, Twin Globs, Twin Orbit, Twin Wake,
      Echo Pulsar, Virulent Cascade, Forked Conduction...), does the new name match a
      change you can actually see?
- [ ] Do the HUD build panel and the Run Report still identify the weapon you took?

## 8. Boss ground effects

`/?mode=survivor&fixture=survivor-boss&hero=frog`
`/?mode=survivor&fixture=survivor-miniboss&hero=frog`

- [ ] Boss pools (purple contamination, spore, charge fissures): does standing just
      **outside** the visible edge keep you safe?
- [ ] Does standing in one hurt at a rate that feels intentional, not per-frame?
- [ ] A pool that has just appeared but not armed looks dimmer — does that read?
- [ ] **Containment Warden Ground Slam**: walk out of the marked circle during the
      windup. Are you safe? (This was the bug — the Warden used to drag the impact.)
- [ ] Stand in it: do you take the hit?
- [ ] Do Dodge i-frames still get you out of all of the above?

## 9. Arc Conductor L5

`/?mode=survivor&fixture=survivor-arc&hero=bee`, and in a real run past 5:00.

- [ ] At L5, can you **see** it fork into two arcs?
- [ ] Does it feel like a transformation on the order of Twin Orbit and the doubled
      Pulsar Core — or like a fifth ordinary level?
- [ ] Does it still feel like a chain weapon?
- [ ] Against a boss with nothing else around, does L5 feel better than L4? (It should:
      the split is only priced when a second arm actually fires.)
- [ ] Does it feel too strong for what it costs?

## 10. Cleanup Crew propulsion

`/?mode=survivor&fixture=survivor-cleanup-combat&hero=bee`
`/?mode=survivor&fixture=survivor-cleanup-arrival&hero=bee`

- [ ] Do the allies look like they are flying under their own power?
- [ ] Idle burn while holding station, stronger jets while repositioning — visible?
- [ ] Is the lean subtle enough?
- [ ] Do the jets ever dominate the screen, or compete with your own weapons?
- [ ] Nothing burning while the transport is still flying them in?

## 11. Orbital Strike impact

`/?mode=survivor&fixture=survivor-orbital&hero=red-panda`

- [ ] Does it read as an **impact** now rather than a beam of light?
- [ ] Can you tell how much ground the strike covered?
- [ ] Both boundaries — the heavy core and the wider shockwave — legible?
- [ ] Is the beam brief enough to get out of the way?
- [ ] Any lingering white brightness of the kind being removed from Plasma Wake?

## 12. Fitzwilliam's first five minutes

**Play at least three full Fitzwilliam runs.** Nothing in this pass changed Rail Lance,
and the simulator work that pointed at him is parked deliberately — this is the question
we want answered by a human instead.

- [ ] Do the first five minutes feel **unfair**, as opposed to merely hard?
- [ ] Rail Lance covers one bearing at a time. When you are surrounded, do the upgrade
      choices you are actually offered give you a reasonable way to cover other
      directions?
- [ ] Do you feel like you are choosing a build, or repairing a deficit?
- [ ] Compare against one Boswell run for calibration. How different does the opening feel?
- [ ] Where do your early deaths come from — the front you were facing, or behind you?

## 13. Anything else

- [ ] Console clean (F12) across a full run?
- [ ] F3 overlay on the stress fixture: do geometries/materials settle rather than climb?
      `/?mode=survivor&fixture=survivor-stress&hero=bee`
- [ ] Frame rate where you expect it under late pressure?
- [ ] Anything that looks cheap, confusing, or wrong that this list did not ask about.
