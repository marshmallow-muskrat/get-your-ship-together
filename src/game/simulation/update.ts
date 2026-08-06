import { HEROES } from '../content/heroes';
import {
  BOSS_DEMON,
  ENEMY_BY_ID,
  MELEE_BLOB,
  MELEE_SPIKY,
  RANGED_GOLELING,
  type EnemyDef,
} from '../content/enemies';
import { TUNING } from '../content/combatTuning';
import {
  circleCircleHit,
  clampToWalkable,
  coneContains,
  length2,
  normalize2,
  resolveCircleObstacles,
  segmentCircleHit,
} from './collision';
import { LEVEL } from './levelLayout';
import { spawnWave } from './createState';
import type { BossPatternId } from '../content/enemies';
import type {
  EffectEvent,
  EnemyState,
  GameState,
  InputFrame,
  ProjectileState,
} from './types';

const ENEMY_DEFS: Record<string, EnemyDef> = ENEMY_BY_ID;

function tickCooldown(cd: { remaining: number }, dt: number): void {
  if (cd.remaining > 0) cd.remaining = Math.max(0, cd.remaining - dt);
}

function nextId(state: GameState): number {
  const id = state.nextEntityId;
  state.nextEntityId += 1;
  return id;
}

function pushEffect(
  state: GameState,
  partial: Omit<EffectEvent, 'id' | 'maxLife'> & { maxLife?: number },
): void {
  const life = partial.life;
  state.effects.push({
    ...partial,
    id: nextId(state),
    maxLife: partial.maxLife ?? life,
  });
  // Cap transient effects.
  if (state.effects.length > 80) {
    state.effects.splice(0, state.effects.length - 80);
  }
}

function formProfile(state: GameState) {
  const hero = HEROES[state.player.heroId];
  return state.player.form === 'mech' ? hero.mech : hero.astronaut;
}

function spawnEnemy(state: GameState, def: EnemyDef, x: number, z: number): void {
  state.enemies.push({
    id: nextId(state),
    defId: def.id,
    role: def.role,
    x,
    z,
    facingX: 0,
    facingZ: -1,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    state: 'spawn',
    stateTimer: 0.35,
    attackCd: 1.1 + Math.random() * 0.5,
    hitFlash: 0,
    slowTimer: 0,
    slowMul: 1,
    spawnTimer: 0.35,
    radius: def.colliderRadius,
  });
  pushEffect(state, { kind: 'spawn', x, z, life: 0.45, color: '#ff6b6b', scale: 1.2 });
}

function damagePlayer(state: GameState, amount: number, sourceX: number, sourceZ: number): void {
  const p = state.player;
  if (!p.alive || p.invulnTimer > 0 || p.dodgeActive > 0) return;
  if (p.formState === 'entering' || p.formState === 'exiting') return;
  const profile = formProfile(state);
  const dmg = amount * profile.damageTakenMul;
  p.health = Math.max(0, p.health - dmg);
  p.hitFlash = 0.18;
  p.invulnTimer = 0.35;
  pushEffect(state, {
    kind: 'damage_number',
    x: p.x,
    z: p.z,
    y: 1.4,
    text: String(Math.round(dmg)),
    color: '#ff6b8a',
    life: 0.7,
  });
  pushEffect(state, { kind: 'impact', x: p.x, z: p.z, life: 0.2, color: '#ff4466', scale: 0.8 });
  state.hitstop = Math.max(state.hitstop, TUNING.hitstop.medium);
  // Knock lightly away from source.
  const away = normalize2(p.x - sourceX, p.z - sourceZ);
  p.x += away.x * 0.25;
  p.z += away.z * 0.25;
  if (p.health <= 0) {
    p.alive = false;
    p.health = 0;
    state.phase = 'dead';
    state.objective = 'Crew down. Restart encounter.';
  }
}

function damageEnemy(
  state: GameState,
  enemy: EnemyState,
  amount: number,
  opts?: { slow?: number; slowMul?: number },
): void {
  if (enemy.state === 'dead') return;
  enemy.health -= amount;
  enemy.hitFlash = 0.15;
  pushEffect(state, {
    kind: 'damage_number',
    x: enemy.x,
    z: enemy.z,
    y: 1.1,
    text: String(Math.round(amount)),
    color: '#ffe08a',
    life: 0.55,
  });
  pushEffect(state, { kind: 'impact', x: enemy.x, z: enemy.z, life: 0.18, color: state.accent, scale: 0.7 });
  if (opts?.slow) {
    enemy.slowTimer = Math.max(enemy.slowTimer, opts.slow);
    enemy.slowMul = opts.slowMul ?? 0.4;
  }
  if (enemy.health <= 0) {
    enemy.health = 0;
    enemy.state = 'dead';
    enemy.stateTimer = 0.9;
    state.killCount += 1;
    pushEffect(state, { kind: 'death', x: enemy.x, z: enemy.z, life: 0.6, color: '#ff8866', scale: 1.4 });
    state.hitstop = Math.max(state.hitstop, TUNING.hitstop.light);
  } else if (enemy.state !== 'windup' && enemy.state !== 'active') {
    enemy.state = 'hit';
    enemy.stateTimer = 0.2;
  }
}

function damageBoss(state: GameState, amount: number): void {
  const b = state.boss;
  if (!b.active || b.state === 'dead') return;
  b.health = Math.max(0, b.health - amount);
  b.hitFlash = 0.12;
  pushEffect(state, {
    kind: 'damage_number',
    x: b.x,
    z: b.z,
    y: 2.4,
    text: String(Math.round(amount)),
    color: '#ffe08a',
    life: 0.6,
  });
  pushEffect(state, { kind: 'impact', x: b.x, z: b.z, life: 0.22, color: state.accent, scale: 1.2 });
  state.hitstop = Math.max(state.hitstop, TUNING.hitstop.medium);

  if (b.phase === 1 && b.health / b.maxHealth <= BOSS_DEMON.phase2Threshold) {
    b.phase = 2;
    b.state = 'phase_shift';
    b.stateTimer = 1.2;
    b.pattern = null;
    pushEffect(state, { kind: 'pulse', x: b.x, z: b.z, life: 0.8, color: '#ff3344', scale: 4 });
  }

  if (b.health <= 0) {
    b.health = 0;
    b.state = 'dead';
    b.stateTimer = 1.6;
    b.pattern = null;
    pushEffect(state, { kind: 'death', x: b.x, z: b.z, life: 1.4, color: '#66e0ff', scale: 3.5 });
    state.hitstop = Math.max(state.hitstop, TUNING.hitstop.heavy);
    pushEffect(state, { kind: 'shake', x: 0, z: 0, life: 0.45, scale: 0.55 });
  }
}

function firePrimary(state: GameState): void {
  const p = state.player;
  if (!p.alive || p.fireCooldown > 0) return;
  if (p.formState === 'entering' || p.formState === 'exiting') return;
  if (p.dodgeActive > 0) return;
  const profile = formProfile(state);
  const weapon = profile.primary;
  p.fireCooldown = weapon.cadence;

  const aim = normalize2(p.facingX, p.facingZ);
  const muzzleX = p.x + aim.x * profile.muzzleOffset.z + -aim.z * profile.muzzleOffset.x;
  const muzzleZ = p.z + aim.z * profile.muzzleOffset.z + aim.x * profile.muzzleOffset.x;

  for (let i = 0; i < weapon.bolts; i += 1) {
    const spread = (i - (weapon.bolts - 1) / 2) * weapon.spread;
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const dirX = aim.x * cos - aim.z * sin;
    const dirZ = aim.x * sin + aim.z * cos;
    const dir = normalize2(dirX, dirZ);
    state.projectiles.push({
      id: nextId(state),
      kind: 'player',
      x: muzzleX,
      z: muzzleZ,
      y: profile.muzzleOffset.y,
      vx: dir.x * weapon.projectileSpeed,
      vz: dir.z * weapon.projectileSpeed,
      damage: weapon.damage,
      radius: weapon.radius,
      life: weapon.lifetime,
      maxLife: weapon.lifetime,
      owner: 'player',
      pierce: state.player.form === 'mech' ? 1 : 0,
      homing: false,
      color: state.accent,
      armTimer: 0,
      explodeRadius: 0,
    });
  }
  pushEffect(state, {
    kind: 'muzzle',
    x: muzzleX,
    z: muzzleZ,
    y: profile.muzzleOffset.y,
    life: 0.08,
    color: state.accent,
    scale: state.player.form === 'mech' ? 1.3 : 1,
  });
}

function useDodge(state: GameState, input: InputFrame): void {
  const p = state.player;
  if (!p.alive || p.dodge.remaining > 0 || p.dodgeActive > 0) return;
  if (p.formState === 'entering' || p.formState === 'exiting') return;
  let dir = normalize2(input.moveX, input.moveZ);
  if (length2(input.moveX, input.moveZ) < 0.1) {
    dir = normalize2(p.facingX, p.facingZ);
  }
  p.dodge.remaining = TUNING.dodge.cooldown;
  p.dodgeActive = TUNING.dodge.duration;
  p.invulnTimer = Math.max(p.invulnTimer, TUNING.dodge.invuln);
  p.vx = dir.x * TUNING.dodge.speed;
  p.vz = dir.z * TUNING.dodge.speed;
  pushEffect(state, { kind: 'impact', x: p.x, z: p.z, life: 0.25, color: '#a8f0ff', scale: 1.1 });
}

function useRepair(state: GameState): void {
  const p = state.player;
  if (!p.alive || p.repair.remaining > 0) return;
  if (p.health >= p.maxHealth) return;
  const heal = p.maxHealth * TUNING.repair.fraction;
  p.health = Math.min(p.maxHealth, p.health + heal);
  p.repair.remaining = TUNING.repair.cooldown;
  pushEffect(state, { kind: 'repair', x: p.x, z: p.z, life: 0.7, color: '#4df0d0', scale: 1.6 });
}

function useMech(state: GameState): void {
  const p = state.player;
  if (!p.alive) return;
  if (p.formState === 'entering' || p.formState === 'exiting') return;
  if (p.form === 'mech') return;
  if (p.mech.remaining > 0) return;
  p.formState = 'entering';
  p.formTimer = TUNING.mech.enterDuration;
  p.invulnTimer = Math.max(p.invulnTimer, TUNING.mech.enterDuration);
  pushEffect(state, { kind: 'transform', x: p.x, z: p.z, life: 0.7, color: state.accent, scale: 2.2 });
  pushEffect(state, { kind: 'shake', x: 0, z: 0, life: 0.25, scale: 0.3 });
}

function useAbility(state: GameState): void {
  const p = state.player;
  if (!p.alive || p.ability.remaining > 0) return;
  if (p.formState === 'entering' || p.formState === 'exiting') return;
  if (p.dodgeActive > 0) return;
  const profile = formProfile(state);
  const mul = profile.abilityDamageMul;
  p.ability.remaining = HEROES[p.heroId].abilityCooldown;
  const aim = normalize2(p.facingX, p.facingZ);

  switch (state.abilityId) {
    case 'microdrone': {
      const base = TUNING.ability.microdrone;
      const count = state.player.form === 'mech' ? base.count + 2 : base.count;
      pushEffect(state, {
        kind: 'pulse',
        x: p.x,
        z: p.z,
        life: 0.35,
        color: state.accent,
        scale: 1.4,
        radius: 1.4,
      });
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + state.time;
        state.projectiles.push({
          id: nextId(state),
          kind: 'drone',
          x: p.x + Math.cos(a) * 0.85,
          z: p.z + Math.sin(a) * 0.85,
          y: 1.25,
          vx: Math.cos(a) * base.speed,
          vz: Math.sin(a) * base.speed,
          damage: base.damage * mul,
          radius: base.radius,
          life: base.life,
          maxLife: base.life,
          owner: 'player',
          pierce: 0,
          homing: true,
          color: state.accent,
          armTimer: 0,
          explodeRadius: 0,
        });
      }
      break;
    }
    case 'rail-lance': {
      const rail = TUNING.ability.railLance;
      const length = state.player.form === 'mech' ? rail.length * 1.15 : rail.length;
      const width = state.player.form === 'mech' ? rail.width * 1.35 : rail.width;
      const x1 = p.x + aim.x * length;
      const z1 = p.z + aim.z * length;
      state.railSegments.push({
        x0: p.x,
        z0: p.z,
        x1,
        z1,
        life: rail.life,
        color: state.accent,
      });
      // Layered beam presentation: core + glow + muzzle flare.
      pushEffect(state, {
        kind: 'rail',
        x: p.x,
        z: p.z,
        life: 0.32,
        color: state.accent,
        scale: length,
        facingX: aim.x,
        facingZ: aim.z,
        length,
        width,
      });
      pushEffect(state, {
        kind: 'muzzle',
        x: p.x + aim.x * 0.6,
        z: p.z + aim.z * 0.6,
        y: 1.15,
        life: 0.18,
        color: '#ffffff',
        scale: 1.8,
      });
      pushEffect(state, {
        kind: 'impact',
        x: x1,
        z: z1,
        life: 0.28,
        color: state.accent,
        scale: 1.6,
      });
      for (const e of state.enemies) {
        if (e.state === 'dead') continue;
        if (segmentCircleHit(p.x, p.z, x1, z1, e.x, e.z, e.radius + width * 0.5)) {
          damageEnemy(state, e, rail.damage * mul);
        }
      }
      if (state.boss.active && state.boss.state !== 'dead') {
        if (
          segmentCircleHit(
            p.x,
            p.z,
            x1,
            z1,
            state.boss.x,
            state.boss.z,
            BOSS_DEMON.colliderRadius + width * 0.5,
          )
        ) {
          damageBoss(state, rail.damage * mul);
        }
      }
      state.hitstop = Math.max(state.hitstop, TUNING.hitstop.medium);
      pushEffect(state, { kind: 'shake', x: 0, z: 0, life: 0.12, scale: 0.22 });
      break;
    }
    case 'gravity-pulse': {
      const pulse = TUNING.ability.gravityPulse;
      const radius = state.player.form === 'mech' ? pulse.radius * 1.25 : pulse.radius;
      pushEffect(state, {
        kind: 'pulse',
        x: p.x,
        z: p.z,
        life: 0.55,
        color: state.accent,
        scale: radius,
        radius,
      });
      pushEffect(state, {
        kind: 'transform',
        x: p.x,
        z: p.z,
        life: 0.4,
        color: state.accent,
        scale: radius * 0.55,
      });
      for (const e of state.enemies) {
        if (e.state === 'dead') continue;
        if (circleCircleHit(p.x, p.z, radius, e.x, e.z, e.radius)) {
          damageEnemy(state, e, pulse.damage * mul, {
            slow: pulse.slowDuration,
            slowMul: pulse.slowMul,
          });
          const pull = normalize2(p.x - e.x, p.z - e.z);
          e.x += pull.x * 0.55;
          e.z += pull.z * 0.55;
        }
      }
      if (state.boss.active && state.boss.state !== 'dead') {
        if (circleCircleHit(p.x, p.z, radius, state.boss.x, state.boss.z, BOSS_DEMON.colliderRadius)) {
          damageBoss(state, pulse.damage * mul * 0.75);
        }
      }
      break;
    }
    case 'rocket-barrage': {
      const rockets = TUNING.ability.rocketBarrage;
      const count = state.player.form === 'mech' ? rockets.count + 2 : rockets.count;
      const targetX = p.x + aim.x * 7.5;
      const targetZ = p.z + aim.z * 7.5;
      pushEffect(state, {
        kind: 'muzzle',
        x: p.x + aim.x * 0.5,
        z: p.z + aim.z * 0.5,
        y: 1.3,
        life: 0.2,
        color: state.accent,
        scale: 1.4,
      });
      for (let i = 0; i < count; i += 1) {
        const ox = (i - (count - 1) / 2) * 1.05;
        const tx = targetX - aim.z * ox + Math.sin(i * 1.7) * 0.35;
        const tz = targetZ + aim.x * ox + Math.cos(i * 1.3) * 0.35;
        const arm = rockets.delay + i * 0.1;
        state.projectiles.push({
          id: nextId(state),
          kind: 'rocket',
          x: tx,
          z: tz,
          y: 2.8,
          vx: 0,
          vz: 0,
          damage: rockets.damage * mul,
          radius: 0.28,
          life: arm + rockets.fuse,
          maxLife: arm + rockets.fuse,
          owner: 'player',
          pierce: 0,
          homing: false,
          color: state.accent,
          armTimer: arm,
          explodeRadius: state.player.form === 'mech' ? rockets.radius * 1.2 : rockets.radius,
        });
        pushEffect(state, {
          kind: 'rocket',
          x: tx,
          z: tz,
          life: arm + 0.05,
          color: state.accent,
          scale: rockets.radius,
          radius: rockets.radius,
        });
      }
      break;
    }
  }
}

function updatePlayer(state: GameState, input: InputFrame, dt: number): void {
  const p = state.player;
  if (!p.alive) return;

  tickCooldown(p.dodge, dt);
  tickCooldown(p.repair, dt);
  tickCooldown(p.ability, dt);
  tickCooldown(p.mech, dt);
  if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
  if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);

  // Form transitions.
  if (p.formState === 'entering') {
    p.formTimer -= dt;
    if (p.formTimer <= 0) {
      p.form = 'mech';
      p.formState = 'mech';
      p.mechDuration = TUNING.mech.duration;
    }
  } else if (p.formState === 'exiting') {
    p.formTimer -= dt;
    if (p.formTimer <= 0) {
      p.form = 'astronaut';
      p.formState = 'astronaut';
      p.mech.remaining = TUNING.mech.cooldown;
      p.mechDuration = 0;
    }
  } else if (p.form === 'mech') {
    p.mechDuration -= dt;
    if (p.mechDuration <= 0) {
      p.formState = 'exiting';
      p.formTimer = TUNING.mech.exitDuration;
      p.invulnTimer = Math.max(p.invulnTimer, TUNING.mech.exitDuration);
      pushEffect(state, { kind: 'transform', x: p.x, z: p.z, life: 0.5, color: '#88e0ff', scale: 1.6 });
    }
  }

  if (input.dodgePressed) useDodge(state, input);
  if (input.repairPressed) useRepair(state);
  if (input.abilityPressed) useAbility(state);
  if (input.mechPressed) useMech(state);

  const profile = formProfile(state);
  const radius = profile.colliderRadius;

  if (p.dodgeActive > 0) {
    p.dodgeActive = Math.max(0, p.dodgeActive - dt);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
  } else if (p.formState !== 'entering' && p.formState !== 'exiting') {
    const move = normalize2(input.moveX, input.moveZ);
    const speed = profile.moveSpeed * (length2(input.moveX, input.moveZ) > 0.1 ? 1 : 0);
    p.vx = move.x * speed;
    p.vz = move.z * speed;
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    const aimLen = length2(input.aimX - p.x, input.aimZ - p.z);
    if (aimLen > 0.15) {
      const aim = normalize2(input.aimX - p.x, input.aimZ - p.z);
      p.facingX = aim.x;
      p.facingZ = aim.z;
    } else if (speed > 0.1) {
      p.facingX = move.x;
      p.facingZ = move.z;
    }

    if (input.fireHeld || input.firePressed) firePrimary(state);
  }

  let pos = resolveCircleObstacles(p.x, p.z, radius, state.obstacles);
  pos = clampToWalkable(pos.x, pos.z, radius, state.walkable);
  // Gate lock until open (progress is +X).
  if (!state.bossGateOpen && pos.x > LEVEL.bossGateX - 0.5) {
    pos.x = LEVEL.bossGateX - 0.5;
  }
  p.x = pos.x;
  p.z = pos.z;

  // Ship part collect.
  if (state.shipPart.active && !state.shipPart.collected) {
    if (circleCircleHit(p.x, p.z, radius, state.shipPart.x, state.shipPart.z, state.shipPart.radius)) {
      state.shipPart.collected = true;
      state.phase = 'complete';
      state.objective = 'Prototype ship part recovered.';
      pushEffect(state, {
        kind: 'pickup',
        x: state.shipPart.x,
        z: state.shipPart.z,
        life: 1,
        color: '#66f0ff',
        scale: 2,
      });
    }
  }
}

function updateProjectiles(state: GameState, dt: number): void {
  const next: ProjectileState[] = [];
  for (const proj of state.projectiles) {
    if (proj.kind === 'rocket') {
      proj.life -= dt;
      proj.armTimer -= dt;
      if (proj.armTimer > 0) {
        next.push(proj);
        continue;
      }
      // Explode
      pushEffect(state, {
        kind: 'impact',
        x: proj.x,
        z: proj.z,
        life: 0.35,
        color: proj.color,
        scale: proj.explodeRadius * 1.4,
      });
      for (const e of state.enemies) {
        if (e.state === 'dead') continue;
        if (circleCircleHit(proj.x, proj.z, proj.explodeRadius, e.x, e.z, e.radius)) {
          damageEnemy(state, e, proj.damage);
        }
      }
      if (state.boss.active && state.boss.state !== 'dead') {
        if (
          circleCircleHit(
            proj.x,
            proj.z,
            proj.explodeRadius,
            state.boss.x,
            state.boss.z,
            BOSS_DEMON.colliderRadius,
          )
        ) {
          damageBoss(state, proj.damage);
        }
      }
      continue;
    }

    if (proj.homing) {
      let tx = state.player.x;
      let tz = state.player.z;
      let best = Infinity;
      for (const e of state.enemies) {
        if (e.state === 'dead') continue;
        const d = (e.x - proj.x) ** 2 + (e.z - proj.z) ** 2;
        if (d < best) {
          best = d;
          tx = e.x;
          tz = e.z;
        }
      }
      if (state.boss.active && state.boss.state !== 'dead') {
        const d = (state.boss.x - proj.x) ** 2 + (state.boss.z - proj.z) ** 2;
        if (d < best) {
          tx = state.boss.x;
          tz = state.boss.z;
        }
      }
      const desired = normalize2(tx - proj.x, tz - proj.z);
      const speed = length2(proj.vx, proj.vz) || TUNING.ability.microdrone.speed;
      const cur = normalize2(proj.vx, proj.vz);
      const turn = TUNING.ability.microdrone.turnRate * dt;
      const nx = cur.x + (desired.x - cur.x) * Math.min(1, turn);
      const nz = cur.z + (desired.z - cur.z) * Math.min(1, turn);
      const n = normalize2(nx, nz);
      proj.vx = n.x * speed;
      proj.vz = n.z * speed;
    }

    proj.x += proj.vx * dt;
    proj.z += proj.vz * dt;
    proj.life -= dt;
    if (proj.life <= 0) continue;

    // Obstacle hit (simple)
    let blocked = false;
    for (const obs of state.obstacles) {
      if (
        proj.x > obs.x - obs.halfW - proj.radius &&
        proj.x < obs.x + obs.halfW + proj.radius &&
        proj.z > obs.z - obs.halfD - proj.radius &&
        proj.z < obs.z + obs.halfD + proj.radius
      ) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      pushEffect(state, { kind: 'impact', x: proj.x, z: proj.z, life: 0.12, color: proj.color, scale: 0.5 });
      continue;
    }

    if (proj.owner === 'player') {
      let consumed = false;
      for (const e of state.enemies) {
        if (e.state === 'dead') continue;
        if (circleCircleHit(proj.x, proj.z, proj.radius, e.x, e.z, e.radius)) {
          damageEnemy(state, e, proj.damage);
          if (proj.pierce > 0) {
            proj.pierce -= 1;
          } else {
            consumed = true;
            break;
          }
        }
      }
      if (
        !consumed &&
        state.boss.active &&
        state.boss.state !== 'dead' &&
        circleCircleHit(
          proj.x,
          proj.z,
          proj.radius,
          state.boss.x,
          state.boss.z,
          BOSS_DEMON.colliderRadius,
        )
      ) {
        damageBoss(state, proj.damage);
        if (proj.pierce > 0) proj.pierce -= 1;
        else consumed = true;
      }
      if (consumed) {
        pushEffect(state, { kind: 'impact', x: proj.x, z: proj.z, life: 0.15, color: proj.color, scale: 0.6 });
        continue;
      }
    } else {
      const p = state.player;
      const radius = formProfile(state).colliderRadius;
      if (circleCircleHit(proj.x, proj.z, proj.radius, p.x, p.z, radius)) {
        damagePlayer(state, proj.damage, proj.x, proj.z);
        pushEffect(state, { kind: 'impact', x: proj.x, z: proj.z, life: 0.15, color: '#ff5566', scale: 0.7 });
        continue;
      }
    }

    next.push(proj);
  }
  state.projectiles = next;
  if (state.projectiles.length > 120) {
    state.projectiles = state.projectiles.slice(-120);
  }

  state.railSegments = state.railSegments
    .map((r) => ({ ...r, life: r.life - dt }))
    .filter((r) => r.life > 0);
}

function updateEnemies(state: GameState, dt: number): void {
  const p = state.player;
  for (const e of state.enemies) {
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.slowTimer > 0) {
      e.slowTimer = Math.max(0, e.slowTimer - dt);
      if (e.slowTimer <= 0) e.slowMul = 1;
    }
    if (e.state === 'dead') {
      e.stateTimer -= dt;
      continue;
    }

    const def = ENEMY_DEFS[e.defId];
    if (!def) continue;

    // Separation
    let sepX = 0;
    let sepZ = 0;
    for (const other of state.enemies) {
      if (other.id === e.id || other.state === 'dead') continue;
      const dx = e.x - other.x;
      const dz = e.z - other.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < def.separation) {
        sepX += (dx / d) * (def.separation - d);
        sepZ += (dz / d) * (def.separation - d);
      }
    }

    e.stateTimer -= dt;
    e.attackCd = Math.max(0, e.attackCd - dt);

    const toPlayer = normalize2(p.x - e.x, p.z - e.z);
    const dist = Math.hypot(p.x - e.x, p.z - e.z);

    if (e.state === 'spawn') {
      if (e.stateTimer <= 0) e.state = 'chase';
      continue;
    }
    if (e.state === 'hit') {
      if (e.stateTimer <= 0) e.state = 'chase';
      continue;
    }

    if (e.state === 'chase' || e.state === 'idle') {
      e.facingX = toPlayer.x;
      e.facingZ = toPlayer.z;
      let mx = 0;
      let mz = 0;
      if (def.role === 'melee') {
        if (dist > def.attackRange * 0.9) {
          mx = toPlayer.x;
          mz = toPlayer.z;
        }
      } else {
        if (dist < 4) {
          mx = -toPlayer.x;
          mz = -toPlayer.z;
        } else if (dist > 7.5) {
          mx = toPlayer.x;
          mz = toPlayer.z;
        } else {
          mx = -toPlayer.z;
          mz = toPlayer.x;
        }
      }
      const speed = def.moveSpeed * e.slowMul;
      e.x += (mx * speed + sepX * 2.5) * dt;
      e.z += (mz * speed + sepZ * 2.5) * dt;
      let pos = resolveCircleObstacles(e.x, e.z, e.radius, state.obstacles);
      pos = clampToWalkable(pos.x, pos.z, e.radius, state.walkable);
      e.x = pos.x;
      e.z = pos.z;

      if (e.attackCd <= 0 && dist <= def.attackRange * 1.05) {
        e.state = 'windup';
        e.stateTimer = def.windup;
        pushEffect(state, {
          kind: 'telegraph',
          x: e.x,
          z: e.z,
          life: def.windup,
          color: '#ff4455',
          shape: def.role === 'melee' ? 'circle' : 'line',
          radius: def.role === 'melee' ? def.attackRange : 0.35,
          length: def.role === 'ranged' ? dist : undefined,
          facingX: toPlayer.x,
          facingZ: toPlayer.z,
        });
      }
    } else if (e.state === 'windup') {
      e.facingX = toPlayer.x;
      e.facingZ = toPlayer.z;
      if (e.stateTimer <= 0) {
        e.state = 'active';
        e.stateTimer = def.active;
        if (def.role === 'ranged') {
          const dir = normalize2(p.x - e.x, p.z - e.z);
          const spd = def.projectileSpeed ?? 12;
          state.projectiles.push({
            id: nextId(state),
            kind: 'enemy',
            x: e.x + dir.x * 0.5,
            z: e.z + dir.z * 0.5,
            y: 1,
            vx: dir.x * spd,
            vz: dir.z * spd,
            damage: def.damage,
            radius: def.projectileRadius ?? 0.2,
            life: 2.2,
            maxLife: 2.2,
            owner: 'enemy',
            pierce: 0,
            homing: false,
            color: '#ff5566',
            armTimer: 0,
            explodeRadius: 0,
          });
        }
      }
    } else if (e.state === 'active') {
      if (def.role === 'melee' && e.stateTimer > def.active * 0.3) {
        if (circleCircleHit(e.x, e.z, def.attackRange, p.x, p.z, formProfile(state).colliderRadius)) {
          damagePlayer(state, def.damage, e.x, e.z);
        }
      }
      if (e.stateTimer <= 0) {
        e.state = 'recover';
        e.stateTimer = def.recovery;
        e.attackCd = def.attackCooldown;
      }
    } else if (e.state === 'recover') {
      if (e.stateTimer <= 0) e.state = 'chase';
    }
  }

  // Cleanup dead enemies after death presentation.
  state.enemies = state.enemies.filter((e) => !(e.state === 'dead' && e.stateTimer <= 0));
}

function pickBossPattern(state: GameState): BossPatternId {
  const patterns: BossPatternId[] = ['slam', 'pulse', 'charge'];
  if (state.boss.phase === 2) {
    // Slight preference for charge/pulse in phase 2.
    patterns.push('charge', 'pulse');
  }
  const idx = Math.floor((state.tick * 17 + state.seed * 3) % patterns.length);
  return patterns[idx]!;
}

function updateBoss(state: GameState, dt: number): void {
  const b = state.boss;
  if (!b.active) return;
  if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);

  if (b.state === 'dead') {
    b.stateTimer -= dt;
    if (b.stateTimer <= 0 && !state.shipPart.active) {
      state.shipPart.active = true;
      state.shipPart.x = b.x;
      state.shipPart.z = b.z;
      state.phase = 'reward';
      state.objective = 'Recover the prototype ship part.';
      pushEffect(state, {
        kind: 'pickup',
        x: b.x,
        z: b.z,
        life: 1.2,
        color: '#66f0ff',
        scale: 1.5,
      });
    }
    return;
  }

  const p = state.player;
  const toPlayer = normalize2(p.x - b.x, p.z - b.z);
  b.stateTimer -= dt;
  b.patternTimer -= dt;

  if (b.state === 'intro') {
    if (b.stateTimer <= 0) {
      b.state = 'idle';
      b.stateTimer = 0.6;
    }
    return;
  }

  if (b.state === 'phase_shift') {
    if (b.stateTimer <= 0) {
      b.state = 'idle';
      b.stateTimer = 0.4;
      // Phase-2 adds — mixed pack, not spam.
      spawnEnemy(state, MELEE_SPIKY, b.x - 3.5, b.z + 1.5);
      spawnEnemy(state, MELEE_BLOB, b.x + 3.5, b.z - 1.5);
      spawnEnemy(state, RANGED_GOLELING, b.x + 2, b.z + 3.5);
    }
    return;
  }

  if (b.state === 'idle') {
    b.facingX = toPlayer.x;
    b.facingZ = toPlayer.z;
    // Slow approach
    const dist = Math.hypot(p.x - b.x, p.z - b.z);
    if (dist > 4) {
      b.x += toPlayer.x * BOSS_DEMON.moveSpeed * dt;
      b.z += toPlayer.z * BOSS_DEMON.moveSpeed * dt;
    }
    let pos = resolveCircleObstacles(b.x, b.z, BOSS_DEMON.colliderRadius, state.obstacles);
    pos = clampToWalkable(pos.x, pos.z, BOSS_DEMON.colliderRadius, state.walkable);
    b.x = pos.x;
    b.z = pos.z;

    if (b.stateTimer <= 0) {
      const pattern = pickBossPattern(state);
      b.pattern = pattern;
      b.state = 'windup';
      b.facingX = toPlayer.x;
      b.facingZ = toPlayer.z;
      if (pattern === 'charge') {
        b.chargeDirX = toPlayer.x;
        b.chargeDirZ = toPlayer.z;
      }

      if (pattern === 'slam') {
        const slam = BOSS_DEMON.patterns.slam;
        b.stateTimer = slam.windup;
        pushEffect(state, {
          kind: 'telegraph',
          x: b.x,
          z: b.z,
          life: slam.windup,
          color: '#ff3344',
          shape: 'cone',
          radius: slam.range,
          angle: slam.angle,
          facingX: b.facingX,
          facingZ: b.facingZ,
        });
      } else if (pattern === 'pulse') {
        const pulse = BOSS_DEMON.patterns.pulse;
        b.stateTimer = pulse.windup;
        b.telegraphRadius = 0.5;
        pushEffect(state, {
          kind: 'telegraph',
          x: b.x,
          z: b.z,
          life: pulse.windup + pulse.active,
          color: '#ffaa33',
          shape: 'circle',
          radius: pulse.maxRadius,
        });
      } else {
        const charge = BOSS_DEMON.patterns.charge;
        b.stateTimer = charge.windup;
        pushEffect(state, {
          kind: 'telegraph',
          x: b.x,
          z: b.z,
          life: charge.windup,
          color: '#ff4455',
          shape: 'line',
          length: 12,
          width: charge.width,
          facingX: b.chargeDirX,
          facingZ: b.chargeDirZ,
        });
      }
    }
    return;
  }

  if (b.state === 'windup') {
    if (b.pattern !== 'charge') {
      b.facingX = toPlayer.x;
      b.facingZ = toPlayer.z;
    }
    if (b.stateTimer <= 0 && b.pattern) {
      b.state = 'active';
      b.stateTimer = BOSS_DEMON.patterns[b.pattern].active;
    }
    return;
  }

  if (b.state === 'active' && b.pattern) {
    if (b.pattern === 'slam') {
      const slam = BOSS_DEMON.patterns.slam;
      if (
        coneContains(
          b.x,
          b.z,
          b.facingX,
          b.facingZ,
          slam.angle / 2,
          slam.range,
          p.x,
          p.z,
          formProfile(state).colliderRadius,
        )
      ) {
        damagePlayer(state, slam.damage, b.x, b.z);
      }
      pushEffect(state, { kind: 'shake', x: 0, z: 0, life: 0.15, scale: 0.35 });
      if (b.stateTimer <= 0) {
        b.state = 'recover';
        b.stateTimer = slam.recovery * (b.phase === 2 ? 0.7 : 1);
        b.pattern = null;
        b.telegraphRadius = 0;
      }
    } else if (b.pattern === 'pulse') {
      const pulse = BOSS_DEMON.patterns.pulse;
      const t = 1 - b.stateTimer / pulse.active;
      b.telegraphRadius = pulse.maxRadius * t;
      if (
        circleCircleHit(
          b.x,
          b.z,
          b.telegraphRadius,
          p.x,
          p.z,
          formProfile(state).colliderRadius,
        ) &&
        Math.hypot(p.x - b.x, p.z - b.z) > b.telegraphRadius - 1.1
      ) {
        damagePlayer(state, pulse.damage * dt * 3, b.x, b.z);
      }
      if (b.stateTimer <= 0) {
        b.state = 'recover';
        b.stateTimer = pulse.recovery * (b.phase === 2 ? 0.7 : 1);
        b.pattern = null;
        b.telegraphRadius = 0;
      }
    } else if (b.pattern === 'charge') {
      const charge = BOSS_DEMON.patterns.charge;
      b.x += b.chargeDirX * charge.speed * dt;
      b.z += b.chargeDirZ * charge.speed * dt;
      let pos = resolveCircleObstacles(b.x, b.z, BOSS_DEMON.colliderRadius, state.obstacles);
      pos = clampToWalkable(pos.x, pos.z, BOSS_DEMON.colliderRadius, [
        { minX: 46, maxX: 70, minZ: -13, maxZ: 13 },
      ]);
      b.x = pos.x;
      b.z = pos.z;
      if (
        segmentCircleHit(
          b.x - b.chargeDirX * 0.5,
          b.z - b.chargeDirZ * 0.5,
          b.x + b.chargeDirX * 1.2,
          b.z + b.chargeDirZ * 1.2,
          p.x,
          p.z,
          formProfile(state).colliderRadius + charge.width * 0.5,
        )
      ) {
        damagePlayer(state, charge.damage, b.x, b.z);
      }
      if (b.stateTimer <= 0) {
        b.state = 'recover';
        b.stateTimer = charge.recovery * (b.phase === 2 ? 0.7 : 1);
        b.pattern = null;
        b.telegraphRadius = 0;
      }
    }
    return;
  }

  if (b.state === 'recover') {
    if (b.stateTimer <= 0) {
      b.state = 'idle';
      b.stateTimer = b.phase === 2 ? 0.35 : 0.55;
    }
  }
}

function updateEncounter(state: GameState, dt: number): void {
  state.phaseTimer += dt;
  const p = state.player;

  switch (state.phase) {
    case 'intro':
      state.objective = 'Move, aim, and fire. Learn your kit.';
      if (state.phaseTimer > 2.5) {
        state.phase = 'explore';
        state.phaseTimer = 0;
      }
      break;
    case 'explore':
      state.objective = 'Advance into the facility atrium.';
      if (p.x > 20 || state.phaseTimer > 16) {
        state.phase = 'wave';
        spawnWave(state, 0);
      }
      break;
    case 'wave': {
      if (state.enemies.length === 0 && state.phaseTimer > 1.15) {
        if (state.waveIndex < LEVEL.waves.length) {
          spawnWave(state, state.waveIndex);
        } else {
          state.phase = 'boss_gate';
          state.phaseTimer = 0;
          state.bossGateOpen = true;
          state.checkpoint = 'pre_boss';
          state.objective = 'Threshold open — enter the warden chamber.';
        }
      }
      break;
    }
    case 'boss_gate':
      if (p.x > LEVEL.bossGateX + 1.5) {
        state.phase = 'boss_intro';
        state.phaseTimer = 0;
        state.boss.active = true;
        state.boss.state = 'intro';
        state.boss.stateTimer = 1.8;
        state.objective = 'Facility warden engaged.';
        pushEffect(state, {
          kind: 'spawn',
          x: state.boss.x,
          z: state.boss.z,
          life: 1,
          color: '#ff4466',
          scale: 3,
        });
        pushEffect(state, { kind: 'shake', x: 0, z: 0, life: 0.4, scale: 0.45 });
      }
      break;
    case 'boss_intro':
      if (state.phaseTimer > 1.8) {
        state.phase = 'boss';
        state.phaseTimer = 0;
        state.objective = 'Defeat the facility warden.';
      }
      break;
    case 'boss':
      // Boss logic owns death → reward
      break;
    default:
      break;
  }
}

function updateEffects(state: GameState, dt: number): void {
  state.effects = state.effects
    .map((e) => ({ ...e, life: e.life - dt }))
    .filter((e) => e.life > 0);
}

export function stepSimulation(state: GameState, input: InputFrame, dt: number): void {
  if (state.paused) return;
  if (state.phase === 'complete') {
    // Freeze combat after completion but allow light effect decay.
    updateEffects(state, dt);
    return;
  }
  if (state.hitstop > 0) {
    state.hitstop = Math.max(0, state.hitstop - dt);
    return;
  }

  state.time += dt;
  state.tick += 1;

  if (state.phase !== 'dead') {
    updatePlayer(state, input, dt);
    updateProjectiles(state, dt);
    updateEnemies(state, dt);
    updateBoss(state, dt);
    updateEncounter(state, dt);
  }
  updateEffects(state, dt);
}

export function buildHudSnapshot(state: GameState): import('./types').HudSnapshot {
  const hero = HEROES[state.player.heroId];
  const p = state.player;
  return {
    heroName: hero.fullName,
    accent: hero.accent,
    health: p.health,
    maxHealth: p.maxHealth,
    form: p.form,
    formState: p.formState,
    dodgeReady: p.dodge.duration <= 0 ? 1 : 1 - p.dodge.remaining / p.dodge.duration,
    abilityReady: p.ability.duration <= 0 ? 1 : 1 - p.ability.remaining / p.ability.duration,
    repairReady: p.repair.duration <= 0 ? 1 : 1 - p.repair.remaining / p.repair.duration,
    mechReady:
      p.form === 'mech' || p.formState === 'entering' || p.formState === 'exiting'
        ? 0
        : p.mech.duration <= 0
          ? 1
          : 1 - p.mech.remaining / p.mech.duration,
    mechDuration: Math.max(0, p.mechDuration),
    mechMaxDuration: TUNING.mech.duration,
    objective: state.objective,
    phase: state.phase,
    bossActive: state.boss.active && state.boss.state !== 'dead' && state.phase !== 'reward' && state.phase !== 'complete',
    bossHealth: state.boss.health,
    bossMaxHealth: state.boss.maxHealth,
    bossPhase: state.boss.phase,
    paused: state.paused,
    dead: state.phase === 'dead',
    complete: state.phase === 'complete',
    muted: state.muted,
  };
}
