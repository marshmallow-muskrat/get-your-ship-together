# Game Concept

Working title: **Get Your Ship Together**.

This is a browser-first, Vampire Survivors-inspired horde-survival game with long, vertically progressing maps.

The player chooses one of four heroes:

- Bee
- Flamingo
- Frog
- Red Panda

Each hero progresses through the same three forms:

1. Stranded astronaut — fight through the crash zone.
2. Mech — battle through industrial facilities toward extraction.
3. Spaceship — fight through increasingly dangerous galaxy sectors.

The maps use a long vertical “combat spine,” with wide arenas, checkpoints, upgrade areas, minibosses, and locked gates. They can be hundreds of segments long while only nearby sections are loaded in Three.js.

The existing assets provide the heroes, mechs, spaceships, buildings, enemies, vehicles, props, and pickups. We would create the connective terrain, paths, cliffs, floors, asteroids, particles, lighting, collision boundaries, and map layouts.

# Brief development plan

1. Build the Three.js/Vite/TypeScript foundation.
2. Create the static hero hangar.
3. Build a short playable Act 1 crash-site slice.
4. Add enemy waves, movement, pickups, upgrades, and progression gates.
5. Expand Act 1 into a long streamed linear map.
6. Add the mech transformation and Act 2 facility.
7. Add the spaceship transformation and Act 3 galaxy route.
8. Deploy the browser version through Cloudflare Pages.
9. Wrap the same build with Electron later.

# First deliverable: hero hangar

The hangar would contain four themed launch bays. Each bay would show:

- The astronaut at the front on the main floor.
- The mech behind them on a raised maintenance platform.
- The spaceship furthest back on a launch pad, suspended dock, or gantry.

The spatial hierarchy would make the progression obvious:

**Astronaut → Mech → Spaceship**

We could reinforce this with power cables, repair equipment, activation lights, ascending platforms, and a visual route from the astronaut toward the larger upgraded forms.

For the Three.js implementation, we would use the matching `.gltf` assets whenever available. The `.blend` files would remain source/reference files rather than being loaded directly. The first hangar version can be static, with only basic camera movement and hero-bay selection before any combat systems are built.
