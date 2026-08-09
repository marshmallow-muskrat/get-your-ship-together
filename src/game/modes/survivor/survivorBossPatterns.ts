/**
 * Exhaustive boss pattern state machine.
 *
 * Every pattern owns simulation-side attack entities (see `survivorAttacks.ts`).
 * Each entity carries the one authoritative `AttackShape` that the renderer draws
 * and that collision tests — telegraphs are never hand-built alongside a separate
 * damage check, so what is shown and what hurts cannot drift apart.
 *
 * Every entity is stamped with `sourceBossId`, so cancellation, phase change and
 * death only ever clean up that boss's own attacks.
 */
import {
  ALL_BOSS_PATTERNS,
  SURVIVOR,
  SURVIVOR_BOSS,
  assertNever,
  bossDefForIndex,
  bossPhaseFromHealth,
  isMegaOnlyPattern,
  type BossPatternId,
} from './survivorContent';
import type {
  SurvivorBoss,
  SurvivorEnemy,
  SurvivorHazard,
  SurvivorProjectile,
  SurvivorState,
} from './survivorState';
import {
  circleAt,
  expandingRing,
  facingCone,
  facingLine,
  type AttackShape,
} from './survivorAttackShapes';
import {
  activateBossAttacks,
  attackHitsPlayer,
  bossAttacksOfPattern,
  clearBossAttacks,
  fadeBossAttacks,
  spawnAttack,
  type SurvivorAttack,
} from './survivorAttacks';

export type BossSimApi = {
  rng: (state: SurvivorState) => number;
  pushEffect: (
    state: SurvivorState,
    kind: SurvivorState['effects'][0]['kind'],
    x: number,
    z: number,
    life: number,
    color: string,
    scale?: number,
    extra?: Partial<SurvivorState['effects'][0]>,
  ) => void;
  damagePlayer: (state: SurvivorState, amount: number, source?: 'enemy' | 'boss' | 'hazard' | 'self') => void;
  spawnEnemy: (state: SurvivorState, defId: string, x: number, z: number) => SurvivorEnemy | null;
  acquireProjectile: (state: SurvivorState) => SurvivorProjectile | null;
  resetProj: (
    proj: SurvivorProjectile,
    state: SurvivorState,
    kind: SurvivorProjectile['kind'],
    weaponId: null,
    x: number,
    z: number,
    vx: number,
    vz: number,
    opts: Partial<SurvivorProjectile>,
  ) => void;
  spawnHazard: (
    state: SurvivorState,
    kind: SurvivorHazard['kind'],
    x: number,
    z: number,
    radius: number,
    life: number,
    damage: number,
    color: string,
    opts?: Partial<Pick<SurvivorHazard, 'owner' | 'armTimer' | 'tickCd' | 'sourceBossId'>>,
  ) => void;
  clampArena: (x: number, z: number, r: number) => { x: number; z: number };
  segmentHit: (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    px: number,
    pz: number,
    rad: number,
  ) => boolean;
};

/**
 * Hostile palette per pattern — every damaging boss warning reads red/magenta so
 * "this will hurt" is legible at a glance. Element identity (ice slow, corrosion,
 * charge dust) is carried by the impact effects, not by the danger footprint.
 */
const PATTERN_COLOR: Record<BossPatternId, string> = {
  pulse: '#ff5533',
  line: '#ff4455',
  fan: '#ff6688',
  summon: '#ff4466',
  'breach-orb': '#ff2244',
  contamination: '#cc44ff',
  'rupture-ring': '#ff2244',
  'cryo-lanes': '#ff5599',
  'ravage-charge': '#ff5566',
  'sweeping-beam': '#ff3366',
  'aerial-strafe': '#ff44aa',
  'spore-bloom': '#ff7755',
  'gravity-collapse': '#ff66aa',
  cataclysm: '#ff88cc',
};

/** Explicitly non-damaging indicator colour — never part of the hostile palette. */
const MARKER_COLOR = '#ffb066';

type PatternCfg = {
  windup: number;
  active: number;
  recovery: number;
  damage?: number;
  maxRadius?: number;
  length?: number;
  width?: number;
  count?: number;
  speed?: number;
  radius?: number;
  life?: number;
};

function pat(id: BossPatternId): PatternCfg {
  return SURVIVOR_BOSS.patterns[id] as PatternCfg;
}

/** Angular spread between adjacent fan projectiles. */
const FAN_SPREAD = 0.28;
/** Fan projectile collision radius (visual radius matches exactly). */
const FAN_PROJ_RADIUS = 0.42;
/** Breach orb collision radius (visual radius matches exactly). */
const ORB_RADIUS = 0.65;
/** Aerial strafe impact radius — telegraph, visual and damage all use this. */
const STRAFE_IMPACT_RADIUS = 1.35;
const STRAFE_DROPS = 6;
/** Extra clearance beyond the boss collider that a charge body actually sweeps. */
const CHARGE_BODY_PAD = 0.4;

function dmgScale(b: SurvivorBoss): number {
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  const mod = SURVIVOR_BOSS.phaseMods[phase];
  return b.damageMul * mod.damageMul * (1 + b.breachEmpower);
}

function recScale(b: SurvivorBoss): number {
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  return b.recoveryMul * SURVIVOR_BOSS.phaseMods[phase].recoveryMul;
}

/** Spawn one attack entity owned by this boss. */
function addAttack(
  state: SurvivorState,
  b: SurvivorBoss,
  pattern: BossPatternId,
  shape: AttackShape,
  duration: number,
  opts?: { slot?: number; style?: 'hostile' | 'marker'; color?: string },
): SurvivorAttack | null {
  return spawnAttack(state, {
    sourceBossId: b.id,
    patternId: pattern,
    shape,
    duration,
    slot: opts?.slot ?? 0,
    style: opts?.style ?? 'hostile',
    color:
      opts?.color ?? (opts?.style === 'marker' ? MARKER_COLOR : PATTERN_COLOR[pattern]),
  });
}

/** This boss's live entities for the pattern it is currently running. */
function currentAttacks(state: SurvivorState, b: SurvivorBoss): SurvivorAttack[] {
  return b.pattern ? bossAttacksOfPattern(state, b.id, b.pattern) : [];
}

function finishPattern(state: SurvivorState, b: SurvivorBoss, recovery: number): void {
  // Scoped to this boss only — simultaneous bosses never clean each other's attacks.
  fadeBossAttacks(state, b.id);
  b.state = 'recover';
  b.timer = recovery * recScale(b);
  b.previousPattern = b.pattern;
  b.pattern = null;
  b.telegraphR = 0;
  b.patternTriggered = false;
  b.patternElapsed = 0;
  b.patternHitCd = 0;
  b.patternParam = 0;
  b.attacksCompleted += 1;
  b.attacksSinceUnique += 1;
  b.attacksSinceMega += 1;
}

function beginRecover(state: SurvivorState, b: SurvivorBoss, id: BossPatternId): void {
  finishPattern(state, b, pat(id).recovery);
}

export function selectBossPattern(state: SurvivorState, b: SurvivorBoss, api: BossSimApi): BossPatternId {
  const def = bossDefForIndex(b.index);
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  const uniqueEvery = phase >= 3 ? 3 : phase >= 2 ? 4 : 5;
  const megaEvery = phase >= 3 ? 2 : 3;

  const pool: BossPatternId[] = [];

  // Mega-only cadence
  if (b.isMega && b.attacksSinceMega >= megaEvery - 1) {
    for (const m of ['gravity-collapse', 'cataclysm'] as BossPatternId[]) {
      if (m !== b.previousPattern) pool.push(m);
    }
    if (pool.length === 0) pool.push('gravity-collapse', 'cataclysm');
  } else if (b.isMega && b.attacksCompleted < 2 && b.attacksSinceMega === 0) {
    // Force mega-only within first two cycles
    pool.push(api.rng(state) < 0.5 ? 'gravity-collapse' : 'cataclysm');
  }

  // Unique cadence
  if (pool.length === 0) {
    const forceUnique =
      b.attacksCompleted === 0
        ? false
        : b.attacksSinceUnique >= uniqueEvery - 1 ||
          (b.attacksCompleted >= 2 && b.attacksSinceUnique >= 2);
    if (forceUnique || (b.attacksCompleted === 2 && b.attacksSinceUnique >= 2)) {
      if (def.uniquePattern !== b.previousPattern) {
        pool.push(def.uniquePattern);
        b.attacksSinceUnique = 0;
      }
    }
  }

  if (pool.length === 0) {
    for (const p of def.preferredPatterns) {
      if (isMegaOnlyPattern(p) && !b.isMega) continue;
      if (p === b.previousPattern && def.preferredPatterns.length > 1) continue;
      pool.push(p);
    }
    // Always allow unique sometimes
    if (def.uniquePattern !== b.previousPattern && api.rng(state) < 0.22) {
      pool.push(def.uniquePattern);
    }
    if (b.isMega && api.rng(state) < 0.28) {
      const m: BossPatternId = api.rng(state) < 0.5 ? 'gravity-collapse' : 'cataclysm';
      if (m !== b.previousPattern) pool.push(m);
    }
  }

  if (pool.length === 0) {
    pool.push(...def.preferredPatterns.filter((p) => !isMegaOnlyPattern(p) || b.isMega));
  }
  if (pool.length === 0) pool.push('pulse');

  const pick = pool[Math.floor(api.rng(state) * pool.length)]!;
  if (isMegaOnlyPattern(pick)) b.attacksSinceMega = 0;
  if (pick === def.uniquePattern) b.attacksSinceUnique = 0;
  return pick;
}

function lockFacing(b: SurvivorBoss): void {
  b.lockFx = b.facingX;
  b.lockFz = b.facingZ;
  b.chargeX = b.facingX;
  b.chargeZ = b.facingZ;
  b.lockX = b.x;
  b.lockZ = b.z;
}

function predictPlayer(state: SurvivorState, lead = 0.45): { x: number; z: number } {
  const p = state.player;
  return {
    x: p.x + p.facingX * lead * SURVIVOR.playerSpeed,
    z: p.z + p.facingZ * lead * SURVIVOR.playerSpeed,
  };
}

/**
 * Windup.
 *
 * Each entity is created with the exact footprint that is about to become dangerous,
 * and is explicitly non-damaging until `activateBossPattern` promotes it.
 */
function beginBossPattern(state: SurvivorState, b: SurvivorBoss, pattern: BossPatternId, api: BossSimApi): void {
  b.pattern = pattern;
  b.state = 'windup';
  b.patternTriggered = false;
  b.patternElapsed = 0;
  b.patternHitCd = 0;
  b.patternParam = 0;
  b.zones = [];
  b.telegraphR = 0;
  // A new pattern never inherits the previous one's entities.
  clearBossAttacks(state, b.id);
  const cfg = pat(pattern);
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  b.timer = cfg.windup * (phase === 3 ? 0.9 : 1);
  const warn = b.timer;

  const p = state.player;

  switch (pattern) {
    case 'pulse':
      // Footprint of the whole pulse; becomes the expanding band on activation.
      addAttack(state, b, pattern, circleAt(b.x, b.z, cfg.maxRadius ?? 8), warn);
      break;

    case 'line': {
      lockFacing(b);
      // Preview halfWidth is exactly the collision halfWidth.
      addAttack(
        state,
        b,
        pattern,
        facingLine(b.x, b.z, b.lockFx, b.lockFz, cfg.length ?? 20, (cfg.width ?? 1.25) * 0.5),
        warn,
      );
      break;
    }

    case 'fan': {
      lockFacing(b);
      // Lock the volley size now so the previewed wedge is the wedge that fires.
      const mod = SURVIVOR_BOSS.phaseMods[phase];
      const count = (cfg.count ?? 5) + mod.fanCountAdd + b.fanAdd;
      b.patternParam = count;
      const halfAngle = ((count - 1) / 2) * FAN_SPREAD + Math.atan2(FAN_PROJ_RADIUS, 4);
      const speed = cfg.speed ?? 10;
      addAttack(
        state,
        b,
        pattern,
        facingCone(b.x, b.z, b.lockFx, b.lockFz, Math.min(cfg.length ?? 14, speed * 1.4), halfAngle),
        warn,
      );
      break;
    }

    case 'summon':
      // Explicitly non-damaging spawn markers.
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        addAttack(
          state,
          b,
          pattern,
          circleAt(b.x + Math.cos(a) * 3.5, b.z + Math.sin(a) * 3.5, 1.2),
          warn,
          { slot: i, style: 'marker' },
        );
      }
      break;

    case 'breach-orb': {
      const pred = predictPlayer(state, 0.55);
      const len = Math.hypot(pred.x - b.x, pred.z - b.z) || 1;
      b.lockFx = (pred.x - b.x) / len;
      b.lockFz = (pred.z - b.z) / len;
      // Launch corridor is exactly as wide as the orb that will travel it.
      addAttack(
        state,
        b,
        pattern,
        facingLine(b.x, b.z, b.lockFx, b.lockFz, 14, ORB_RADIUS),
        warn,
      );
      break;
    }

    case 'contamination': {
      const pred = predictPlayer(state, 0.7);
      const c = api.clampArena(pred.x, pred.z, 1);
      b.lockX = c.x;
      b.lockZ = c.z;
      addAttack(state, b, pattern, circleAt(b.lockX, b.lockZ, cfg.radius ?? 3), warn);
      break;
    }

    case 'rupture-ring':
      addAttack(state, b, pattern, circleAt(b.x, b.z, cfg.maxRadius ?? 10), warn);
      break;

    case 'cryo-lanes': {
      lockFacing(b);
      const base = Math.atan2(b.lockFx, b.lockFz);
      b.patternParam = base;
      const len = cfg.length ?? 22;
      const half = (cfg.width ?? 1.1) * 0.5;
      for (let i = -1; i <= 1; i += 1) {
        const a = base + i * 0.55;
        addAttack(
          state,
          b,
          pattern,
          facingLine(b.x, b.z, Math.sin(a), Math.cos(a), len, half),
          warn,
          { slot: i + 1 },
        );
      }
      break;
    }

    case 'ravage-charge':
      lockFacing(b);
      // Corridor halfWidth is the body sweep the charge actually applies.
      addAttack(
        state,
        b,
        pattern,
        facingLine(
          b.x,
          b.z,
          b.lockFx,
          b.lockFz,
          cfg.length ?? 28,
          b.colliderRadius + CHARGE_BODY_PAD,
        ),
        warn,
      );
      break;

    case 'sweeping-beam': {
      lockFacing(b);
      const start = Math.atan2(b.lockFx, b.lockFz) - 0.7;
      b.patternParam = start; // start angle
      b.lockX = start + 1.4; // end angle
      addAttack(
        state,
        b,
        pattern,
        facingLine(
          b.x,
          b.z,
          Math.sin(start),
          Math.cos(start),
          cfg.length ?? 24,
          (cfg.width ?? 1) * 0.5,
        ),
        warn,
      );
      break;
    }

    case 'aerial-strafe': {
      const len = Math.hypot(p.x - b.x, p.z - b.z) || 1;
      b.lockFx = (p.x - b.x) / len;
      b.lockFz = (p.z - b.z) / len;
      b.lockX = b.x - b.lockFx * 14;
      b.lockZ = b.z - b.lockFz * 14;
      b.chargeX = b.x + b.lockFx * 14;
      b.chargeZ = b.z + b.lockFz * 14;
      // Corridor is exactly as wide as the impact circles that will drop along it.
      addAttack(
        state,
        b,
        pattern,
        {
          kind: 'line',
          x0: b.lockX,
          z0: b.lockZ,
          x1: b.chargeX,
          z1: b.chargeZ,
          halfWidth: STRAFE_IMPACT_RADIUS,
        },
        warn,
        { style: 'marker' },
      );
      break;
    }

    case 'spore-bloom': {
      const n = cfg.count ?? 5;
      const r = cfg.radius ?? 1.4;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + api.rng(state);
        const dist = 3.5 + api.rng(state) * 3;
        const c = api.clampArena(b.x + Math.cos(a) * dist, b.z + Math.sin(a) * dist, 0.5);
        b.zones.push({ x: c.x, z: c.z, r, detonated: false });
        addAttack(state, b, pattern, circleAt(c.x, c.z, r), warn, { slot: i });
      }
      break;
    }

    case 'gravity-collapse':
      b.lockX = b.x;
      b.lockZ = b.z;
      addAttack(state, b, pattern, circleAt(b.lockX, b.lockZ, cfg.maxRadius ?? 11), warn);
      break;

    case 'cataclysm': {
      const n = cfg.count ?? 4;
      const half = SURVIVOR.arenaHalf * 0.55;
      for (let i = 0; i < n; i += 1) {
        let x = (api.rng(state) * 2 - 1) * half;
        let z = (api.rng(state) * 2 - 1) * half;
        // Bias away from the player so a safe pocket always exists.
        if (Math.hypot(x - p.x, z - p.z) < 6) {
          x = -p.x * 0.6 + (api.rng(state) - 0.5) * 8;
          z = -p.z * 0.6 + (api.rng(state) - 0.5) * 8;
        }
        const c = api.clampArena(x, z, 2);
        const r = (cfg.radius ?? 3.2) * (0.9 + api.rng(state) * 0.2);
        b.zones.push({ x: c.x, z: c.z, r, detonated: false });
        // Each circle stays visible until its own detonation slot.
        const ownWindow = warn + (cfg.active / n) * (i + 1);
        addAttack(state, b, pattern, circleAt(c.x, c.z, r), ownWindow, { slot: i });
      }
      break;
    }

    default:
      assertNever(pattern);
  }
}

/**
 * Whether a pattern's windup entities become damaging the moment the active phase
 * starts. Patterns that hand off to projectiles/hazards, and patterns that arm their
 * zones on their own schedule, stay harmless until their own logic arms them.
 */
const DAMAGING_ON_ACTIVATE: Record<BossPatternId, boolean> = {
  pulse: true,
  line: true,
  fan: false, // projectiles carry the damage
  summon: false, // markers only
  'breach-orb': false, // projectile carries the damage
  contamination: false, // hazard carries the damage
  'rupture-ring': true,
  'cryo-lanes': true,
  'ravage-charge': true,
  'sweeping-beam': true,
  'aerial-strafe': false, // per-drop circles arm themselves
  'spore-bloom': false, // armed at detonation
  'gravity-collapse': false, // armed when the shockwave starts
  cataclysm: false, // each zone armed at its own slot
};

function activateBossPattern(state: SurvivorState, b: SurvivorBoss): void {
  if (!b.pattern) return;
  b.state = 'active';
  b.patternElapsed = 0;
  b.patternTriggered = false;
  b.patternHitCd = 0;
  const active = pat(b.pattern).active;
  b.timer = active;
  activateBossAttacks(state, b.id, active, { damaging: DAMAGING_ON_ACTIVATE[b.pattern] });
}

/** Move an existing line entity to a new segment without reallocating it. */
function setLine(
  a: SurvivorAttack,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  halfWidth: number,
): void {
  a.shape = { kind: 'line', x0, z0, x1, z1, halfWidth };
}

function updateActive(
  state: SurvivorState,
  b: SurvivorBoss,
  dt: number,
  api: BossSimApi,
): void {
  const pattern = b.pattern;
  if (!pattern) {
    b.state = 'recover';
    b.timer = 0.4;
    return;
  }
  const cfg = pat(pattern);
  const scale = dmgScale(b);
  const p = state.player;
  const attacks = currentAttacks(state, b);
  b.patternElapsed += dt;
  if (b.patternHitCd > 0) b.patternHitCd = Math.max(0, b.patternHitCd - dt);

  switch (pattern) {
    case 'pulse': {
      const maxR = cfg.maxRadius ?? 8;
      const t = Math.min(1, b.patternElapsed / cfg.active);
      b.telegraphR = maxR * t;
      const a = attacks[0];
      if (a) {
        // One authoritative expanding ring drives both the visual and the hit.
        a.shape = expandingRing(b.x, b.z, b.telegraphR, 0.85);
        if (b.patternHitCd <= 0 && attackHitsPlayer(state, a)) {
          api.damagePlayer(state, (cfg.damage ?? 12) * scale, 'boss');
          b.patternHitCd = 0.35;
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'line': {
      const a = attacks[0];
      if (a && b.patternHitCd <= 0 && attackHitsPlayer(state, a)) {
        api.damagePlayer(state, (cfg.damage ?? 12) * scale, 'boss');
        b.patternHitCd = 0.4;
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'fan': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        // The cone was the warning; the projectiles carry the damage.
        for (const a of attacks) {
          a.damaging = false;
          a.lifecycle = 'fade';
          a.remaining = Math.min(a.remaining, 0.14);
        }
        const count = Math.max(1, Math.round(b.patternParam) || (cfg.count ?? 5));
        const speed = cfg.speed ?? 10;
        const base = Math.atan2(b.lockFx, b.lockFz);
        for (let i = 0; i < count; i += 1) {
          const a = base + (i - (count - 1) / 2) * FAN_SPREAD;
          const proj = api.acquireProjectile(state);
          if (!proj) break;
          api.resetProj(proj, state, 'boss-fan', null, b.x, b.z, Math.sin(a) * speed, Math.cos(a) * speed, {
            damage: (cfg.damage ?? 12) * scale,
            radius: FAN_PROJ_RADIUS,
            // Visible size equals collision size.
            visualRadius: FAN_PROJ_RADIUS,
            life: 2.6,
            owner: 'enemy',
            color: '#ff4466',
            sourceBossId: b.id,
          });
        }
        api.pushEffect(state, 'muzzle', b.x, b.z, 0.2, '#ff6688', 1.5);
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'summon': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        const phase = bossPhaseFromHealth(b.health, b.maxHealth);
        const mod = SURVIVOR_BOSS.phaseMods[phase];
        const n = Math.min(mod.summonCount + b.summonAdd, phase >= 3 ? 8 : 5);
        for (let i = 0; i < n; i += 1) {
          const marker = attacks[i % Math.max(1, attacks.length)];
          const ang = api.rng(state) * Math.PI * 2;
          const sx = marker && marker.shape.kind === 'circle' ? marker.shape.x : b.x + Math.cos(ang) * 3.5;
          const sz = marker && marker.shape.kind === 'circle' ? marker.shape.z : b.z + Math.sin(ang) * 3.5;
          api.spawnEnemy(state, phase >= 3 ? 'elite' : phase >= 2 ? 'spiky' : 'basic', sx, sz);
          api.pushEffect(state, 'transform', sx, sz, 0.35, '#ff9944', 1.2);
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'breach-orb': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        for (const a of attacks) {
          a.damaging = false;
          a.lifecycle = 'fade';
          a.remaining = Math.min(a.remaining, 0.14);
        }
        const speed = cfg.speed ?? 7;
        const proj = api.acquireProjectile(state);
        if (proj) {
          api.resetProj(
            proj,
            state,
            'boss-orb',
            null,
            b.x + b.lockFx * 1.2,
            b.z + b.lockFz * 1.2,
            b.lockFx * speed,
            b.lockFz * speed,
            {
              damage: (cfg.damage ?? 18) * scale,
              radius: ORB_RADIUS,
              visualRadius: ORB_RADIUS,
              life: 4.5,
              owner: 'enemy',
              color: '#ff2244',
              sourceBossId: b.id,
              hitPlayer: false,
            },
          );
        }
        if (bossPhaseFromHealth(b.health, b.maxHealth) >= 3 || b.isMega) {
          const side = Math.atan2(b.lockFx, b.lockFz) + 0.35;
          const proj2 = api.acquireProjectile(state);
          if (proj2) {
            api.resetProj(
              proj2,
              state,
              'boss-orb',
              null,
              b.x,
              b.z,
              Math.sin(side) * speed,
              Math.cos(side) * speed,
              {
                damage: (cfg.damage ?? 18) * scale * 0.85,
                radius: ORB_RADIUS,
                visualRadius: ORB_RADIUS,
                life: 4.2,
                owner: 'enemy',
                color: '#ff4466',
                sourceBossId: b.id,
              },
            );
          }
        }
        api.pushEffect(state, 'muzzle', b.x, b.z, 0.25, '#ff3355', 1.8);
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'contamination': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        const a = attacks[0];
        const r = a && a.shape.kind === 'circle' ? a.shape.radius : (cfg.radius ?? 3);
        // The hazard inherits the telegraphed circle exactly.
        api.spawnHazard(
          state,
          'contamination',
          b.lockX,
          b.lockZ,
          r,
          cfg.life ?? 6,
          (cfg.damage ?? 10) * scale * 0.55,
          '#bb44ff',
          { owner: 'enemy', armTimer: 0.6, tickCd: 0, sourceBossId: b.id },
        );
        // The lingering hazard now owns the visual; the telegraph steps aside.
        for (const at of attacks) {
          at.damaging = false;
          at.lifecycle = 'fade';
          at.remaining = Math.min(at.remaining, 0.2);
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'rupture-ring': {
      const maxR = cfg.maxRadius ?? 10;
      const t = Math.min(1, b.patternElapsed / cfg.active);
      b.telegraphR = maxR * t;
      const a = attacks[0];
      if (a) {
        // Real annulus: the core inside `inner` stays safe.
        a.shape = expandingRing(b.x, b.z, b.telegraphR, 0.9);
        // `damaging` is the whole truth: no second hidden guard beside it.
        a.damaging = b.telegraphR > 1.6;
        if (b.patternHitCd <= 0 && attackHitsPlayer(state, a)) {
          api.damagePlayer(state, (cfg.damage ?? 18) * scale, 'boss');
          b.patternHitCd = 0.4;
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'cryo-lanes': {
      // Each lane damages once, tested against the very shape being rendered.
      for (const a of attacks) {
        if (a.hasHit) continue;
        if (!attackHitsPlayer(state, a)) continue;
        a.hasHit = true;
        api.damagePlayer(state, (cfg.damage ?? 14) * scale, 'boss');
        // Bounded slow — never below 72%
        p.slowMul = Math.max(0.72, 0.75);
        p.slowTimer = Math.max(p.slowTimer, 1.5);
        api.pushEffect(state, 'pulse', p.x, p.z, 0.35, '#88ccff', 1.2);
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'ravage-charge': {
      const len = cfg.length ?? 28;
      const spd = 22;
      b.x += b.lockFx * spd * dt;
      b.z += b.lockFz * spd * dt;
      const c = api.clampArena(b.x, b.z, b.colliderRadius);
      b.x = c.x;
      b.z = c.z;
      const a = attacks[0];
      if (a) {
        // Corridor is exactly the path the body has swept so far.
        setLine(a, b.lockX, b.lockZ, b.x, b.z, b.colliderRadius + CHARGE_BODY_PAD);
        if (!a.hasHit && attackHitsPlayer(state, a)) {
          a.hasHit = true;
          b.patternTriggered = true;
          api.damagePlayer(state, (cfg.damage ?? 22) * scale, 'boss');
        }
      }
      // Trail fissures at a fixed cadence rather than every frame.
      if (b.patternHitCd <= 0) {
        b.patternHitCd = 0.12;
        api.spawnHazard(state, 'fissure', b.x, b.z, 1.1, 2.2, (cfg.damage ?? 22) * scale * 0.25, '#66aa44', {
          owner: 'enemy',
          armTimer: 0.05,
          tickCd: 0,
          sourceBossId: b.id,
        });
      }
      const traveled = Math.hypot(b.x - b.lockX, b.z - b.lockZ);
      if (b.timer <= 0 || traveled > len * 0.85) beginRecover(state, b, pattern);
      break;
    }

    case 'sweeping-beam': {
      const start = b.patternParam;
      const end = b.lockX; // end angle
      const u = Math.min(1, b.patternElapsed / cfg.active);
      const ang = start + (end - start) * u;
      const fx = Math.sin(ang);
      const fz = Math.cos(ang);
      const len = cfg.length ?? 24;
      const half = (cfg.width ?? 1) * 0.5;
      const a = attacks[0];
      if (a) {
        // One moving line: the beam that is drawn is the beam that burns.
        setLine(a, b.x, b.z, b.x + fx * len, b.z + fz * len, half);
        if (b.patternHitCd <= 0 && attackHitsPlayer(state, a)) {
          api.damagePlayer(state, (cfg.damage ?? 16) * scale, 'boss');
          b.patternHitCd = 0.32;
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'aerial-strafe': {
      const u = Math.min(1, b.patternElapsed / cfg.active);
      b.x = b.lockX + (b.chargeX - b.lockX) * u;
      b.z = b.lockZ + (b.chargeZ - b.lockZ) * u;
      const dropIdx = Math.floor(u * STRAFE_DROPS);
      if (dropIdx > b.patternParam && dropIdx < STRAFE_DROPS) {
        b.patternParam = dropIdx;
        const ix = b.lockX + (b.chargeX - b.lockX) * (dropIdx / STRAFE_DROPS);
        const iz = b.lockZ + (b.chargeZ - b.lockZ) * (dropIdx / STRAFE_DROPS);
        // Each impact is its own circle entity whose radius is the damage radius.
        const hit = spawnAttack(state, {
          sourceBossId: b.id,
          patternId: pattern,
          slot: 10 + dropIdx,
          shape: circleAt(ix, iz, STRAFE_IMPACT_RADIUS),
          duration: 0.32,
          lifecycle: 'active',
          damaging: true,
          style: 'hostile',
          color: PATTERN_COLOR[pattern],
        });
        if (hit && attackHitsPlayer(state, hit)) {
          hit.hasHit = true;
          api.damagePlayer(state, (cfg.damage ?? 14) * scale, 'boss');
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern);
      break;
    }

    case 'spore-bloom': {
      // Arm at the halfway point; each mine then detonates within its own circle.
      if (!b.patternTriggered && b.patternElapsed >= cfg.active * 0.55) {
        b.patternTriggered = true;
        for (const a of attacks) {
          const zone = b.zones[a.slot];
          if (!zone || zone.detonated) continue;
          zone.detonated = true;
          a.damaging = true;
          api.pushEffect(state, 'impact', zone.x, zone.z, 0.3, PATTERN_COLOR[pattern], zone.r, {
            radius: zone.r,
          });
          // The lingering hazard matches the detonation circle exactly.
          api.spawnHazard(state, 'spore', zone.x, zone.z, zone.r, 2.5, (cfg.damage ?? 12) * scale * 0.3, '#ddaa44', {
            owner: 'enemy',
            armTimer: 0.1,
            sourceBossId: b.id,
          });
        }
      }
      for (const a of attacks) {
        if (!a.damaging || a.hasHit) continue;
        if (attackHitsPlayer(state, a)) {
          a.hasHit = true;
          api.damagePlayer(state, (cfg.damage ?? 12) * scale, 'boss');
        }
      }
      if (b.timer <= 0) {
        b.zones = [];
        beginRecover(state, b, pattern);
      }
      break;
    }

    case 'gravity-collapse': {
      const pullEnd = cfg.active * 0.55;
      const a = attacks[0];
      if (b.patternElapsed < pullEnd) {
        // Pull core: harmless marker centred exactly where the shockwave will start.
        if (a) {
          a.shape = circleAt(b.lockX, b.lockZ, 2.2);
          a.damaging = false;
          a.style = 'marker';
          a.color = MARKER_COLOR;
        }
        const dx = b.lockX - p.x;
        const dz = b.lockZ - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const pull = 3.8 * dt;
        p.x += (dx / d) * pull;
        p.z += (dz / d) * pull;
        const c = api.clampArena(p.x, p.z, SURVIVOR.playerRadius);
        p.x = c.x;
        p.z = c.z;
      } else {
        if (!b.patternTriggered) {
          b.patternTriggered = true;
          b.telegraphR = 0;
          if (a) {
            a.style = 'hostile';
            a.color = PATTERN_COLOR[pattern];
            a.damaging = true;
          }
        }
        const shockT = (b.patternElapsed - pullEnd) / (cfg.active - pullEnd);
        b.telegraphR = (cfg.maxRadius ?? 11) * Math.min(1, shockT);
        if (a) {
          // Same centre as the pull core — band and core stay coherent.
          a.shape = expandingRing(b.lockX, b.lockZ, b.telegraphR, 1.0);
          a.damaging = b.telegraphR > 2.2;
          if (b.patternHitCd <= 0 && attackHitsPlayer(state, a)) {
            api.damagePlayer(state, (cfg.damage ?? 22) * scale, 'boss');
            b.patternHitCd = 0.45;
          }
        }
      }
      if (b.timer <= 0) {
        b.telegraphR = 0;
        beginRecover(state, b, pattern);
      }
      break;
    }

    case 'cataclysm': {
      const n = b.zones.length || 1;
      const slot = cfg.active / n;
      const idx = Math.min(n - 1, Math.floor(b.patternElapsed / slot));
      for (const a of attacks) {
        const zone = b.zones[a.slot];
        if (a.slot > idx) {
          // Not its turn yet: the circle stays visible and definitively harmless.
          a.damaging = false;
          continue;
        }
        if (zone && !zone.detonated) {
          // Its own detonation arms this circle — and only this circle.
          zone.detonated = true;
          a.damaging = true;
          api.pushEffect(state, 'impact', zone.x, zone.z, 0.4, PATTERN_COLOR[pattern], zone.r, {
            radius: zone.r,
          });
        }
        if (a.damaging && !a.hasHit && attackHitsPlayer(state, a)) {
          a.hasHit = true;
          api.damagePlayer(state, (cfg.damage ?? 20) * scale, 'boss');
        }
      }
      if (b.timer <= 0) {
        b.zones = [];
        beginRecover(state, b, pattern);
      }
      break;
    }

    default:
      assertNever(pattern);
  }
}

/** Recovery movement when far and no locked telegraph. */
function updateRecoverMove(state: SurvivorState, b: SurvivorBoss, dt: number, api: BossSimApi): void {
  const p = state.player;
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const dist = Math.hypot(dx, dz) || 1;
  if (dist > 8) {
    const spd = SURVIVOR_BOSS.moveSpeed * b.moveMul * 0.45;
    b.x += (dx / dist) * spd * dt;
    b.z += (dz / dist) * spd * dt;
    const c = api.clampArena(b.x, b.z, b.colliderRadius);
    b.x = c.x;
    b.z = c.z;
  }
}

/**
 * Cancel this boss's combat — pattern interrupt, phase change or death.
 * Only entities stamped with this boss's id are touched.
 */
export function cancelBossPattern(state: SurvivorState, b: SurvivorBoss): void {
  b.pattern = null;
  b.state = b.health <= 0 ? 'dead' : 'idle';
  b.timer = 0.3;
  b.telegraphR = 0;
  b.patternTriggered = false;
  b.patternElapsed = 0;
  b.zones = [];
  // Pending warnings and live attack geometry vanish with the boss.
  clearBossAttacks(state, b.id);
  // Deactivate projectiles owned by this boss (leave other bosses' projectiles alone).
  for (const proj of state.projectiles) {
    if (proj.active && proj.sourceBossId === b.id) {
      if (proj.kind === 'boss-fan' || proj.kind === 'enemy' || proj.kind === 'boss-orb') {
        proj.active = false;
      }
    }
  }
  // Hazards: immediately harmless, short visual fade when owned by this boss.
  for (const h of state.hazards) {
    if (h.active && h.sourceBossId === b.id) {
      h.damage = 0;
      h.life = Math.min(h.life, 0.35);
    }
  }
}

export function updateOneBoss(state: SurvivorState, b: SurvivorBoss, dt: number, api: BossSimApi): void {
  if (!b.active && b.state === 'dead') {
    if (b.timer > 0) b.timer -= dt;
    return;
  }
  if (!b.active || b.state === 'dead') return;
  if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
  if (b.repulsorCd > 0) b.repulsorCd = Math.max(0, b.repulsorCd - dt);

  const p = state.player;
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const dist = Math.hypot(dx, dz) || 1;
  // Face player unless locked charge/strafe active
  const lockedMove =
    b.state === 'active' &&
    (b.pattern === 'ravage-charge' || b.pattern === 'aerial-strafe' || b.pattern === 'sweeping-beam');
  if (!lockedMove) {
    b.facingX = dx / dist;
    b.facingZ = dz / dist;
  }

  b.timer -= dt;
  if (!Number.isFinite(b.timer)) b.timer = 0;

  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  b.phase = phase;
  const mod = SURVIVOR_BOSS.phaseMods[phase];

  if (b.state === 'idle') {
    if (dist > 5) {
      const spd = SURVIVOR_BOSS.moveSpeed * b.moveMul * (1 + (phase - 1) * 0.08);
      b.x += b.facingX * spd * dt;
      b.z += b.facingZ * spd * dt;
      const c = api.clampArena(b.x, b.z, b.colliderRadius);
      b.x = c.x;
      b.z = c.z;
    }
    if (b.timer <= 0) {
      const pattern = selectBossPattern(state, b, api);
      beginBossPattern(state, b, pattern, api);
    }
    return;
  }

  if (b.state === 'windup') {
    b.patternElapsed += dt;
    // Do not retarget locked patterns
    if (b.timer <= 0 && b.pattern) {
      activateBossPattern(state, b);
    }
    // Safety: if pattern missing, recover
    if (b.timer <= 0 && !b.pattern) {
      b.state = 'recover';
      b.timer = 0.5;
      fadeBossAttacks(state, b.id);
    }
    return;
  }

  if (b.state === 'active') {
    // Safety: no pattern → recover
    if (!b.pattern) {
      b.state = 'recover';
      b.timer = 0.4;
      fadeBossAttacks(state, b.id);
      return;
    }
    updateActive(state, b, dt, api);
    // Absolute safety: if somehow still active with timer long expired
    if (b.state === 'active' && b.timer < -0.5) {
      beginRecover(state, b, b.pattern);
    }
    return;
  }

  if (b.state === 'recover') {
    updateRecoverMove(state, b, dt, api);
    if (b.timer <= 0) {
      b.state = 'idle';
      b.timer = mod.idleGap + api.rng(state) * 0.35;
      b.pattern = null;
      b.telegraphR = 0;
    }
  }
}

/** Force a pattern for tests/fixtures. */
export function forceBossPattern(
  state: SurvivorState,
  b: SurvivorBoss,
  pattern: BossPatternId,
  api: BossSimApi,
): void {
  b.state = 'idle';
  b.timer = 0;
  b.previousPattern = null;
  beginBossPattern(state, b, pattern, api);
}

/** Exhaustive compile-time + runtime check that all patterns are handled. */
export function allPatternsHandled(): boolean {
  for (const id of ALL_BOSS_PATTERNS) {
    if (!SURVIVOR_BOSS.patterns[id]) return false;
  }
  return ALL_BOSS_PATTERNS.length === 14;
}

/** Hostile colour contract for boss warnings (used by tests and the renderer). */
export function bossPatternColor(id: BossPatternId): string {
  return PATTERN_COLOR[id];
}

/** Colour used for explicitly harmless indicators. */
export function bossMarkerColor(): string {
  return MARKER_COLOR;
}
