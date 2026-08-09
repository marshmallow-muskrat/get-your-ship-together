/**
 * Exhaustive boss pattern state machine.
 * Every BossPatternId has windup → active → recover → idle lifecycle.
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
  expandingRing,
  facingLine,
  pointHitsShape,
  type AttackShape,
} from './survivorAttackShapes';

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

function hitsShape(state: SurvivorState, shape: AttackShape): boolean {
  return pointHitsShape(state.player.x, state.player.z, SURVIVOR.playerRadius, shape);
}

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

function dmgScale(b: SurvivorBoss): number {
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  const mod = SURVIVOR_BOSS.phaseMods[phase];
  return b.damageMul * mod.damageMul * (1 + b.breachEmpower);
}

function recScale(b: SurvivorBoss): number {
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  return b.recoveryMul * SURVIVOR_BOSS.phaseMods[phase].recoveryMul;
}

function finishPattern(state: SurvivorState, b: SurvivorBoss, recovery: number, api: BossSimApi): void {
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
  // clear gravity pull leftover
  if (state.player.slowMul < 0.99 && state.player.slowTimer <= 0) {
    /* leave cryo slow alone */
  }
}

function beginRecover(state: SurvivorState, b: SurvivorBoss, id: BossPatternId, api: BossSimApi): void {
  finishPattern(state, b, pat(id).recovery, api);
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

function beginBossPattern(state: SurvivorState, b: SurvivorBoss, pattern: BossPatternId, api: BossSimApi): void {
  b.pattern = pattern;
  b.state = 'windup';
  b.patternTriggered = false;
  b.patternElapsed = 0;
  b.patternHitCd = 0;
  b.patternParam = 0;
  b.zones = [];
  b.telegraphR = 0;
  const cfg = pat(pattern);
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  b.timer = cfg.windup * (phase === 3 ? 0.9 : 1);

  const p = state.player;
  const accent = '#ff4466';

  switch (pattern) {
    case 'pulse':
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ffaa33', cfg.maxRadius ?? 8, {
        radius: cfg.maxRadius ?? 8,
      });
      break;
    case 'line':
      lockFacing(b);
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ff4455', 1, {
        facingX: b.lockFx,
        facingZ: b.lockFz,
        length: cfg.length ?? 20,
        width: (cfg.width ?? 1.25) * 1.15,
      });
      break;
    case 'fan': {
      lockFacing(b);
      // Cone preview via 3 telegraph lanes
      const base = Math.atan2(b.lockFx, b.lockFz);
      for (let i = -2; i <= 2; i += 1) {
        const a = base + i * 0.22;
        api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ff6688', 1, {
          facingX: Math.sin(a),
          facingZ: Math.cos(a),
          length: 12,
          width: 0.85,
        });
      }
      break;
    }
    case 'summon':
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        api.pushEffect(state, 'telegraph', b.x + Math.cos(a) * 3.2, b.z + Math.sin(a) * 3.2, b.timer, '#ff9944', 1.4, {
          radius: 1.2,
        });
      }
      break;
    case 'breach-orb': {
      const pred = predictPlayer(state, 0.55);
      const len = Math.hypot(pred.x - b.x, pred.z - b.z) || 1;
      b.lockFx = (pred.x - b.x) / len;
      b.lockFz = (pred.z - b.z) / len;
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, accent, 1, {
        facingX: b.lockFx,
        facingZ: b.lockFz,
        length: 14,
        width: 1.4,
      });
      break;
    }
    case 'contamination': {
      const pred = predictPlayer(state, 0.7);
      const c = api.clampArena(pred.x, pred.z, 1);
      b.lockX = c.x;
      b.lockZ = c.z;
      api.pushEffect(state, 'telegraph', b.lockX, b.lockZ, b.timer, '#cc44ff', cfg.radius ?? 3, {
        radius: cfg.radius ?? 3,
      });
      break;
    }
    case 'rupture-ring':
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ff2244', cfg.maxRadius ?? 10, {
        radius: cfg.maxRadius ?? 10,
      });
      break;
    case 'cryo-lanes': {
      // Three fixed lane angles from boss
      lockFacing(b);
      const base = Math.atan2(b.lockFx, b.lockFz);
      for (let i = -1; i <= 1; i += 1) {
        const a = base + i * 0.55;
        api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#88ccff', 1, {
          facingX: Math.sin(a),
          facingZ: Math.cos(a),
          length: cfg.length ?? 22,
          width: (cfg.width ?? 1.1) * 1.2,
        });
      }
      // store base angle in patternParam
      b.patternParam = base;
      break;
    }
    case 'ravage-charge':
      lockFacing(b);
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#7dff9a', 1, {
        facingX: b.lockFx,
        facingZ: b.lockFz,
        length: cfg.length ?? 28,
        width: (cfg.width ?? 1.4) * 1.2,
      });
      break;
    case 'sweeping-beam': {
      lockFacing(b);
      const start = Math.atan2(b.lockFx, b.lockFz) - 0.7;
      b.patternParam = start; // start angle
      b.lockX = start + 1.4; // end angle stored in lockX as angle
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ff3366', 1, {
        facingX: Math.sin(start),
        facingZ: Math.cos(start),
        length: cfg.length ?? 24,
        width: (cfg.width ?? 1) * 1.25,
      });
      break;
    }
    case 'aerial-strafe': {
      // Lock lane through player
      const len = Math.hypot(p.x - b.x, p.z - b.z) || 1;
      b.lockFx = (p.x - b.x) / len;
      b.lockFz = (p.z - b.z) / len;
      b.lockX = b.x - b.lockFx * 14;
      b.lockZ = b.z - b.lockFz * 14;
      b.chargeX = b.x + b.lockFx * 14;
      b.chargeZ = b.z + b.lockFz * 14;
      api.pushEffect(state, 'telegraph', (b.lockX + b.chargeX) / 2, (b.lockZ + b.chargeZ) / 2, b.timer, '#c080ff', 1, {
        facingX: b.lockFx,
        facingZ: b.lockFz,
        length: 28,
        width: (cfg.width ?? 1.6) * 1.15,
      });
      break;
    }
    case 'spore-bloom':
      for (let i = 0; i < (cfg.count ?? 5); i += 1) {
        const a = (i / (cfg.count ?? 5)) * Math.PI * 2 + api.rng(state);
        const r = 3.5 + api.rng(state) * 3;
        const mx = b.x + Math.cos(a) * r;
        const mz = b.z + Math.sin(a) * r;
        const c = api.clampArena(mx, mz, 0.5);
        api.pushEffect(state, 'telegraph', c.x, c.z, b.timer, '#ffaa44', 1.2, { radius: 1.1 });
        b.zones.push({ x: c.x, z: c.z, r: cfg.radius ?? 1.4, detonated: false });
      }
      break;
    case 'gravity-collapse':
      b.lockX = b.x;
      b.lockZ = b.z;
      api.pushEffect(state, 'mega', b.x, b.z, b.timer, '#ff66aa', cfg.maxRadius ?? 11, {
        radius: cfg.maxRadius ?? 11,
      });
      api.pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ff88cc', cfg.maxRadius ?? 11, {
        radius: cfg.maxRadius ?? 11,
      });
      break;
    case 'cataclysm': {
      // 4 zones with guaranteed safe pocket near player opposite side
      const n = cfg.count ?? 4;
      const half = SURVIVOR.arenaHalf * 0.55;
      for (let i = 0; i < n; i += 1) {
        let x = (api.rng(state) * 2 - 1) * half;
        let z = (api.rng(state) * 2 - 1) * half;
        // Keep player start position relatively safer: bias away from player
        if (Math.hypot(x - p.x, z - p.z) < 6) {
          x = -p.x * 0.6 + (api.rng(state) - 0.5) * 8;
          z = -p.z * 0.6 + (api.rng(state) - 0.5) * 8;
        }
        const c = api.clampArena(x, z, 2);
        const r = (cfg.radius ?? 3.2) * (0.9 + api.rng(state) * 0.2);
        b.zones.push({ x: c.x, z: c.z, r, detonated: false });
        api.pushEffect(state, 'telegraph', c.x, c.z, b.timer + i * 0.35, '#ff66aa', r, { radius: r });
      }
      break;
    }
    default:
      assertNever(pattern);
  }
}

function activateBossPattern(state: SurvivorState, b: SurvivorBoss, api: BossSimApi): void {
  if (!b.pattern) return;
  b.state = 'active';
  b.patternElapsed = 0;
  b.patternTriggered = false;
  b.patternHitCd = 0;
  b.timer = pat(b.pattern).active;
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
  b.patternElapsed += dt;
  if (b.patternHitCd > 0) b.patternHitCd = Math.max(0, b.patternHitCd - dt);

  switch (pattern) {
    case 'pulse': {
      const maxR = cfg.maxRadius ?? 8;
      const t = Math.min(1, b.patternElapsed / cfg.active);
      b.telegraphR = maxR * t;
      // Shared expanding ring: same band as telegraph radius
      if (b.patternHitCd <= 0 && hitsShape(state, expandingRing(b.x, b.z, b.telegraphR, 0.85))) {
        api.damagePlayer(state, (cfg.damage ?? 12) * scale, 'boss');
        b.patternHitCd = 0.35;
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'line': {
      const len = cfg.length ?? 20;
      const width = cfg.width ?? 1.25;
      if (b.patternHitCd <= 0) {
        const shape = facingLine(b.lockX || b.x, b.lockZ || b.z, b.lockFx, b.lockFz, len, width * 0.45);
        if (hitsShape(state, shape)) {
          api.damagePlayer(state, (cfg.damage ?? 12) * scale, 'boss');
          b.patternHitCd = 0.4;
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'fan': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        const phase = bossPhaseFromHealth(b.health, b.maxHealth);
        const mod = SURVIVOR_BOSS.phaseMods[phase];
        const count = (cfg.count ?? 5) + mod.fanCountAdd + b.fanAdd;
        const speed = cfg.speed ?? 10;
        const base = Math.atan2(b.lockFx, b.lockFz);
        for (let i = 0; i < count; i += 1) {
          const a = base + (i - (count - 1) / 2) * 0.28;
          const proj = api.acquireProjectile(state);
          if (!proj) break;
          api.resetProj(proj, state, 'boss-fan', null, b.x, b.z, Math.sin(a) * speed, Math.cos(a) * speed, {
            damage: (cfg.damage ?? 12) * scale,
            radius: 0.38,
            visualRadius: 0.6,
            life: 2.6,
            owner: 'enemy',
            color: '#ff4466',
            sourceBossId: b.id,
          });
        }
        api.pushEffect(state, 'muzzle', b.x, b.z, 0.2, '#ff6688', 1.5);
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'summon': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        const phase = bossPhaseFromHealth(b.health, b.maxHealth);
        const mod = SURVIVOR_BOSS.phaseMods[phase];
        const n = Math.min(mod.summonCount + b.summonAdd, phase >= 3 ? 8 : 5);
        for (let i = 0; i < n; i += 1) {
          const ang = api.rng(state) * Math.PI * 2;
          const id = phase >= 3 && api.rng(state) < 0.35 ? 'elite' : phase >= 2 ? 'spiky' : 'basic';
          api.spawnEnemy(state, id, b.x + Math.cos(ang) * 3.5, b.z + Math.sin(ang) * 3.5);
          api.pushEffect(state, 'transform', b.x + Math.cos(ang) * 3.5, b.z + Math.sin(ang) * 3.5, 0.35, '#ff9944', 1.2);
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'breach-orb': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
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
              radius: 0.65,
              visualRadius: 1.05,
              life: 4.5,
              owner: 'enemy',
              color: '#ff2244',
              sourceBossId: b.id,
              hitPlayer: false,
            },
          );
        }
        // Phase 3 second orb offset
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
                radius: 0.6,
                visualRadius: 0.95,
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
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'contamination': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        // lob visual
        api.pushEffect(state, 'impact', b.lockX, b.lockZ, 0.35, '#cc44ff', 1.5);
        api.spawnHazard(
          state,
          'contamination',
          b.lockX,
          b.lockZ,
          cfg.radius ?? 3,
          cfg.life ?? 6,
          (cfg.damage ?? 10) * scale * 0.55,
          '#bb44ff',
          { owner: 'enemy', armTimer: 0.6, tickCd: 0, sourceBossId: b.id },
        );
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'rupture-ring': {
      const maxR = cfg.maxRadius ?? 10;
      const t = Math.min(1, b.patternElapsed / cfg.active);
      b.telegraphR = maxR * t;
      // Shared ring band — safe core inside (inner - playerRadius)
      if (
        b.patternHitCd <= 0 &&
        b.telegraphR > 1.6 &&
        hitsShape(state, expandingRing(b.x, b.z, b.telegraphR, 0.9))
      ) {
        api.damagePlayer(state, (cfg.damage ?? 18) * scale, 'boss');
        b.patternHitCd = 0.4;
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'cryo-lanes': {
      if (!b.patternTriggered) {
        b.patternTriggered = true;
        const base = b.patternParam;
        const len = cfg.length ?? 22;
        const width = cfg.width ?? 1.1;
        for (let i = -1; i <= 1; i += 1) {
          const a = base + i * 0.55;
          const fx = Math.sin(a);
          const fz = Math.cos(a);
          if (hitsShape(state, facingLine(b.x, b.z, fx, fz, len, width * 0.45))) {
            api.damagePlayer(state, (cfg.damage ?? 14) * scale, 'boss');
            // Bounded slow — never below 72%
            p.slowMul = Math.max(0.72, 0.75);
            p.slowTimer = Math.max(p.slowTimer, 1.5);
            api.pushEffect(state, 'pulse', p.x, p.z, 0.35, '#88ccff', 1.2);
          }
          api.pushEffect(state, 'beam', b.x, b.z, 0.45, '#88ccff', 1, {
            facingX: fx,
            facingZ: fz,
            length: len,
            width,
          });
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'ravage-charge': {
      const len = cfg.length ?? 28;
      const spd = 22;
      // Move along locked lane
      b.x += b.lockFx * spd * dt;
      b.z += b.lockFz * spd * dt;
      const c = api.clampArena(b.x, b.z, b.colliderRadius);
      b.x = c.x;
      b.z = c.z;
      // Trail fissure periodically
      if (!b.patternTriggered || b.patternElapsed % 0.12 < dt) {
        api.spawnHazard(state, 'fissure', b.x, b.z, 1.1, 2.2, (cfg.damage ?? 22) * scale * 0.25, '#66aa44', {
          owner: 'enemy',
          armTimer: 0.05,
          tickCd: 0,
          sourceBossId: b.id,
        });
      }
      if (!b.patternTriggered) {
        // contact damage once
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < b.colliderRadius + SURVIVOR.playerRadius + 0.4) {
          api.damagePlayer(state, (cfg.damage ?? 22) * scale, 'boss');
          b.patternTriggered = true;
        }
      }
      // End when traveled enough or timer
      const traveled = Math.hypot(b.x - b.lockX, b.z - b.lockZ);
      if (b.timer <= 0 || traveled > len * 0.85) beginRecover(state, b, pattern, api);
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
      const width = cfg.width ?? 1.0;
      api.pushEffect(state, 'beam', b.x, b.z, dt * 2.5, '#ff3366', 1, {
        facingX: fx,
        facingZ: fz,
        length: len,
        width: width * 1.2,
      });
      if (b.patternHitCd <= 0 && hitsShape(state, facingLine(b.x, b.z, fx, fz, len, width * 0.4))) {
        api.damagePlayer(state, (cfg.damage ?? 16) * scale, 'boss');
        b.patternHitCd = 0.32;
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'aerial-strafe': {
      const u = Math.min(1, b.patternElapsed / cfg.active);
      // Travel visual path
      b.x = b.lockX + (b.chargeX - b.lockX) * u;
      b.z = b.lockZ + (b.chargeZ - b.lockZ) * u;
      // Drop impacts along lane at intervals
      const drops = 6;
      const dropIdx = Math.floor(u * drops);
      if (dropIdx > b.patternParam && dropIdx < drops) {
        b.patternParam = dropIdx;
        const ix = b.lockX + (b.chargeX - b.lockX) * (dropIdx / drops);
        const iz = b.lockZ + (b.chargeZ - b.lockZ) * (dropIdx / drops);
        api.pushEffect(state, 'impact', ix, iz, 0.4, '#c080ff', 1.6, { radius: 1.4 });
        const d = Math.hypot(p.x - ix, p.z - iz);
        if (d < 1.35 + SURVIVOR.playerRadius) {
          api.damagePlayer(state, (cfg.damage ?? 14) * scale, 'boss');
        }
      }
      if (b.timer <= 0) beginRecover(state, b, pattern, api);
      break;
    }
    case 'spore-bloom': {
      // Arm during first half, detonate second half once
      if (!b.patternTriggered && b.patternElapsed >= cfg.active * 0.55) {
        b.patternTriggered = true;
        for (const z of b.zones) {
          if (z.detonated) continue;
          z.detonated = true;
          api.pushEffect(state, 'impact', z.x, z.z, 0.4, '#ffaa44', z.r * 1.3, { radius: z.r });
          const d = Math.hypot(p.x - z.x, p.z - z.z);
          if (d < z.r * 0.9 + SURVIVOR.playerRadius) {
            api.damagePlayer(state, (cfg.damage ?? 12) * scale, 'boss');
          }
          api.spawnHazard(state, 'spore', z.x, z.z, z.r * 0.7, 2.5, (cfg.damage ?? 12) * scale * 0.3, '#ddaa44', {
            owner: 'enemy',
            armTimer: 0.1,
            sourceBossId: b.id,
          });
        }
      }
      if (b.timer <= 0) {
        b.zones = [];
        beginRecover(state, b, pattern, api);
      }
      break;
    }
    case 'gravity-collapse': {
      // Pull phase then shockwave
      const pullEnd = cfg.active * 0.55;
      if (b.patternElapsed < pullEnd) {
        // Controllable pull — additive velocity toward core
        const dx = b.lockX - p.x;
        const dz = b.lockZ - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const pull = 3.8 * dt;
        p.x += (dx / d) * pull;
        p.z += (dz / d) * pull;
        const c = api.clampArena(p.x, p.z, SURVIVOR.playerRadius);
        p.x = c.x;
        p.z = c.z;
        api.pushEffect(state, 'pulse', b.lockX, b.lockZ, 0.1, '#ff66aa', 2);
      } else if (!b.patternTriggered) {
        b.patternTriggered = true;
        // Shockwave expand stored in telegraphR
        b.telegraphR = 0;
        api.pushEffect(state, 'mega', b.lockX, b.lockZ, 0.8, '#ff4488', cfg.maxRadius ?? 11, {
          radius: cfg.maxRadius ?? 11,
        });
      } else {
        const shockT = (b.patternElapsed - pullEnd) / (cfg.active - pullEnd);
        b.telegraphR = (cfg.maxRadius ?? 11) * Math.min(1, shockT);
        // Shared expanding ring with safe core (inner band starts ~2.2)
        if (
          b.patternHitCd <= 0 &&
          b.telegraphR > 2.2 &&
          hitsShape(state, expandingRing(b.lockX, b.lockZ, b.telegraphR, 1.0))
        ) {
          api.damagePlayer(state, (cfg.damage ?? 22) * scale, 'boss');
          b.patternHitCd = 0.45;
        }
      }
      if (b.timer <= 0) {
        b.telegraphR = 0;
        beginRecover(state, b, pattern, api);
      }
      break;
    }
    case 'cataclysm': {
      // Sequential detonation
      const n = b.zones.length || 1;
      const slot = cfg.active / n;
      const idx = Math.min(n - 1, Math.floor(b.patternElapsed / slot));
      for (let i = 0; i <= idx; i += 1) {
        const z = b.zones[i];
        if (!z || z.detonated) continue;
        z.detonated = true;
        api.pushEffect(state, 'impact', z.x, z.z, 0.5, '#ff66aa', z.r * 1.2, { radius: z.r });
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < z.r * 0.92 + SURVIVOR.playerRadius) {
          api.damagePlayer(state, (cfg.damage ?? 20) * scale, 'boss');
        }
      }
      if (b.timer <= 0) {
        b.zones = [];
        beginRecover(state, b, pattern, api);
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

export function cancelBossPattern(state: SurvivorState, b: SurvivorBoss): void {
  b.pattern = null;
  b.state = b.health <= 0 ? 'dead' : 'idle';
  b.timer = 0.3;
  b.telegraphR = 0;
  b.patternTriggered = false;
  b.patternElapsed = 0;
  b.zones = [];
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
  // Clear pending boss telegraphs near this boss (effects are global; lifetime-capped).
  for (const e of state.effects) {
    if (e.kind === 'telegraph' || e.kind === 'beam') {
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      if (d < 28) e.life = Math.min(e.life, 0.12);
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
      activateBossPattern(state, b, api);
    }
    // Safety: if pattern missing, recover
    if (b.timer <= 0 && !b.pattern) {
      b.state = 'recover';
      b.timer = 0.5;
    }
    return;
  }

  if (b.state === 'active') {
    // Safety: no pattern → recover
    if (!b.pattern) {
      b.state = 'recover';
      b.timer = 0.4;
      return;
    }
    updateActive(state, b, dt, api);
    // Absolute safety: if somehow still active with timer long expired
    if (b.state === 'active' && b.timer < -0.5) {
      beginRecover(state, b, b.pattern, api);
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
