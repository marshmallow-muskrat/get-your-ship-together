import { screenToWorldMove } from './screenBasis';
import { SpatialHash } from './spatialHash';
import {
  HORDE,
  MINIBOSS,
  PASSIVES,
  SURVIVOR,
  SURVIVOR_BOSS,
  TEMP_BUFFS,
  WEAPONS,
  bossDefForIndex,
  bossDifficultyFor,
  bossPhaseFromHealth,
  bossTimeForIndex,
  compositionAt,
  endlessDifficultyAt,
  formatOverclockLabel,
  hullPlatingGainAtLevel,
  isPassiveAvailable,
  isPrototypeWeapon,
  ordinaryWeaponIds,
  overclockLevel,
  playerPowerScale,
  PROTOCOLS,
  computeShieldPoints,
  regenPerSecondAtLevel,
  weaponDamagePreview,
  weaponStatsAtLevel,
  xpForLevel,
  isMegaBossIndex,
  type PassiveId,
  type ProtocolId,
  type TempBuffId,
  type WeaponId,
  SURVIVOR as SURVIVOR_TUNING,
} from './survivorContent';
import {
  livingBosses,
  nearestBoss,
  nearestEnemyOnly,
  selectWeaponTarget,
  targetPosition,
  bossFocusChance,
} from './survivorTargeting';
import {
  aliveBossCount,
  emptyBoss,
  emptyEnemy,
  nextEntityId,
  primaryBoss,
  syncPrimaryBossMirror,
  type DamageEvent,
  type SurvivorBoss,
  type SurvivorEnemy,
  type SurvivorHazard,
  type SurvivorPickup,
  type SurvivorProjectile,
  type SurvivorState,
  type SurvivorWeaponSlot,
  type UpgradeChoice,
} from './survivorState';

function wdef(weaponId: WeaponId, level: number) {
  return weaponStatsAtLevel(weaponId, level);
}

export interface SurvivorInput {
  moveX: number;
  moveY: number;
  mechPressed: boolean;
  shipPressed: boolean;
  repulsorPressed: boolean;
  dodgePressed: boolean;
  pausePressed: boolean;
  mutePressed: boolean;
  choiceIndex: number | null;
}

export const EMPTY_SURVIVOR_INPUT: SurvivorInput = {
  moveX: 0,
  moveY: 0,
  mechPressed: false,
  shipPressed: false,
  repulsorPressed: false,
  dodgePressed: false,
  pausePressed: false,
  mutePressed: false,
  choiceIndex: null,
};

const hash = new SpatialHash(2.4);
const queryBuf: number[] = [];

function rng(state: SurvivorState): number {
  let x = state.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x;
  return ((x >>> 0) % 10000) / 10000;
}

function pushEffect(
  state: SurvivorState,
  kind: SurvivorState['effects'][0]['kind'],
  x: number,
  z: number,
  life: number,
  color: string,
  scale = 1,
  extra?: Partial<SurvivorState['effects'][0]>,
): void {
  if (state.effects.length > 90) state.effects.splice(0, 30);
  state.effects.push({
    id: nextEntityId(state),
    kind,
    x,
    z,
    life,
    maxLife: life,
    color,
    scale,
    ...extra,
  });
}

function clampArena(x: number, z: number, r: number): { x: number; z: number } {
  const h = SURVIVOR.arenaHalf - r;
  return {
    x: Math.max(-h, Math.min(h, x)),
    z: Math.max(-h, Math.min(h, z)),
  };
}

function passiveLevel(state: SurvivorState, id: PassiveId): number {
  return state.passives[id] ?? 0;
}

function moveMul(state: SurvivorState): number {
  return 1 + passiveLevel(state, 'move-speed') * 0.08;
}

/** Energy/XP magnet radius. */
export function energyMagnetRadius(state: SurvivorState): number {
  const magnet = SURVIVOR.xpMagnetBase + passiveLevel(state, 'pickup-radius') * SURVIVOR.xpMagnetPerLevel;
  if (state.player.form === 'ship') {
    const ship = SURVIVOR.heroShips[state.heroId];
    return Math.max(ship.collectionRadius, magnet + (ship.collectionRadius - SURVIVOR.playerRadius) * 0.55);
  }
  if (state.player.form === 'mech') return magnet * 1.15;
  return magnet;
}

/** Health/repair magnet radius — Magnet Field benefits health more. */
export function healthMagnetRadius(state: SurvivorState): number {
  let r = SURVIVOR.healthMagnetBase + passiveLevel(state, 'pickup-radius') * SURVIVOR.healthMagnetPerLevel;
  if (state.player.form === 'ship') {
    r = Math.max(r, SURVIVOR.healthShipMagnet);
    const ship = SURVIVOR.heroShips[state.heroId];
    r = Math.max(r, ship.collectionRadius + 1.5);
  } else if (state.player.form === 'mech') {
    r *= SURVIVOR.healthMechMagnetMul;
  }
  return r;
}

/** @deprecated Prefer energyMagnetRadius. */
export function magnetRadius(state: SurvivorState): number {
  return energyMagnetRadius(state);
}

export function energyDirectRadius(state: SurvivorState): number {
  if (state.player.form === 'ship') return SURVIVOR.heroShips[state.heroId].pickupRadius;
  if (state.player.form === 'mech') return SURVIVOR.playerRadius * 1.35;
  return 0.55;
}

export function healthDirectRadius(state: SurvivorState): number {
  if (state.player.form === 'ship') return Math.max(SURVIVOR.heroShips[state.heroId].pickupRadius, 2.2);
  if (state.player.form === 'mech') return SURVIVOR.playerRadius * 1.6;
  return SURVIVOR.healthDirectRadius;
}

/** @deprecated Prefer energyDirectRadius. */
export function directPickupRadius(state: SurvivorState): number {
  return energyDirectRadius(state);
}

/** Permanent-build thruster/wake damage multiplier (capped via playerPowerScale). */
export function thrusterPower(state: SurvivorState): number {
  const base = playerPowerScale({ weapons: state.weapons, passives: state.passives });
  return base * (state.player.damageMul > 1 ? state.player.damageMul : 1);
}

export type DamageSourceKind = 'enemy' | 'boss' | 'hazard' | 'self';

/** Breach Shielding: up to 40% reduction on boss-tagged damage only. */
export function bossDamageReduction(state: SurvivorState): number {
  const lv = passiveLevel(state, 'breach-shielding');
  return Math.min(0.4, lv * 0.08);
}

function hasteMul(state: SurvivorState): number {
  const base = 1 + passiveLevel(state, 'weapon-haste') * 0.08;
  return state.player.form === 'mech' ? base * 1.35 : base;
}

function areaMul(state: SurvivorState): number {
  const base = 1 + passiveLevel(state, 'area') * 0.1;
  return state.player.form === 'mech' ? base * 1.25 : base;
}

function mechChargeMul(state: SurvivorState): number {
  return 1 + passiveLevel(state, 'mech-charge') * 0.15;
}

function mechDurationMul(state: SurvivorState): number {
  return 1 + passiveLevel(state, 'mech-duration') * 0.12;
}

/** Emit damage for presentation (aggregated). */
function emitDamage(
  state: SurvivorState,
  targetKey: string,
  x: number,
  z: number,
  amount: number,
  kind: DamageEvent['kind'],
  pop = 0.5,
): void {
  if (amount <= 0) return;
  const existing = state.damageAgg.get(targetKey);
  if (existing) {
    existing.amount += amount;
    existing.x = x;
    existing.z = z;
    // Prefer stronger presentation kinds when merging
    if (kind === 'ability' || kind === 'player' || kind === 'boss') existing.kind = kind;
    else if (existing.kind === 'enemy' && kind !== 'enemy') existing.kind = kind;
    existing.pop = Math.max(existing.pop, pop);
    existing.timer = SURVIVOR.damageNumbers.aggregateWindow;
  } else {
    state.damageAgg.set(targetKey, {
      amount,
      x,
      z,
      kind,
      timer: SURVIVOR.damageNumbers.aggregateWindow,
      pop,
    });
  }
}

function flushDamageAgg(state: SurvivorState, dt: number): void {
  for (const [key, agg] of state.damageAgg) {
    agg.timer -= dt;
    if (agg.timer > 0) continue;
    state.damageAgg.delete(key);
    let kind = agg.kind;
    if (kind === 'enemy' && agg.amount >= SURVIVOR.damageNumbers.heavyThreshold) kind = 'large';
    else if (kind === 'enemy' && agg.amount >= SURVIVOR.damageNumbers.largeThreshold) kind = 'large';
    const life =
      kind === 'large' || kind === 'ability' || kind === 'boss'
        ? SURVIVOR.damageNumbers.heavyLife
        : SURVIVOR.damageNumbers.life;
    if (state.damageEvents.length >= SURVIVOR.damageEventCap) {
      state.damageEvents.splice(0, 12);
    }
    state.damageEvents.push({
      id: nextEntityId(state),
      x: agg.x,
      z: agg.z,
      amount: Math.round(agg.amount),
      kind,
      life,
      maxLife: life,
      targetKey: key,
      pop: agg.pop,
    });
  }
  for (const ev of state.damageEvents) {
    ev.life -= dt;
  }
  state.damageEvents = state.damageEvents.filter((e) => e.life > 0);
}

function acquireEnemySlot(state: SurvivorState): SurvivorEnemy | null {
  for (let i = 0; i < state.enemies.length; i += 1) {
    if (!state.enemies[i]!.alive) return state.enemies[i]!;
  }
  if (state.enemies.length >= state.enemyCap) return null;
  const e = emptyEnemy();
  state.enemies.push(e);
  return e;
}

function spawnEnemy(state: SurvivorState, defId: string, x: number, z: number): SurvivorEnemy | null {
  const def = HORDE[defId];
  if (!def) return null;
  const slot = acquireEnemySlot(state);
  if (!slot) return null;
  const v = def.visual;
  const diff = endlessDifficultyAt(state.time);
  const isMb = !!def.isMiniboss;
  const healthMul = isMb ? MINIBOSS.healthMul : diff.healthMul * (def.isElite ? 2.2 : 1);
  const dmgMul = isMb ? MINIBOSS.damageMul : diff.damageMul;
  const spdMul = isMb ? MINIBOSS.speedMul : Math.min(1.1, diff.speedMul);

  slot.id = nextEntityId(state);
  slot.defId = defId;
  slot.x = x;
  slot.z = z;
  slot.vx = 0;
  slot.vz = 0;
  slot.kbX = 0;
  slot.kbZ = 0;
  slot.health = v.maxHealth * healthMul;
  slot.maxHealth = slot.health;
  // attack cooldown scaled by endless attack rate
  const atkMul = isMb ? 1 : diff.attackRateMul;
  slot.radius = v.colliderRadius * (isMb ? MINIBOSS.radiusMul : def.isElite ? 1.45 : 1.25);
  slot.role = def.role;
  slot.hitFlash = 0;
  slot.attackCd = (0.4 + rng(state) * 0.6) / Math.max(0.6, isMb ? 1 : endlessDifficultyAt(state.time).attackRateMul);
  slot.alive = true;
  slot.isElite = !!def.isElite || isMb;
  slot.isMiniboss = isMb;
  slot.xp = isMb ? MINIBOSS.xp : def.xp;
  slot.windup = 0;
  slot.facingX = -x;
  slot.facingZ = -z;
  slot.healthMul = healthMul;
  slot.damageMul = dmgMul;
  slot.speedMul = spdMul;
  slot.hazardHitCd = 0;
  slot.specialCd = isMb ? 2.5 : 0;
  slot.specialWindup = 0;
  pushEffect(state, 'impact', x, z, 0.25, isMb ? '#ffcc44' : '#ff6688', isMb ? 1.8 : 0.8);
  return slot;
}

function edgeSpawn(state: SurvivorState): { x: number; z: number } {
  const h = SURVIVOR.arenaHalf + 1.2;
  const side = Math.floor(rng(state) * 4);
  const t = (rng(state) * 2 - 1) * h;
  if (side === 0) return { x: t, z: -h };
  if (side === 1) return { x: t, z: h };
  if (side === 2) return { x: -h, z: t };
  return { x: h, z: t };
}

function pickComposition(state: SurvivorState): string {
  const comps = compositionAt(state.time);
  let total = 0;
  for (const c of comps) total += c.weight;
  let r = rng(state) * total;
  for (const c of comps) {
    r -= c.weight;
    if (r <= 0) return c.id;
  }
  return comps[0]!.id;
}

function killEnemy(state: SurvivorState, e: SurvivorEnemy): void {
  if (!e.alive) return;
  e.alive = false;
  state.kills += 1;
  pushEffect(state, 'death', e.x, e.z, 0.4, e.isMiniboss ? '#ffdd66' : '#ff8866', e.isMiniboss ? 2.4 : e.isElite ? 1.6 : 1);
  dropPickup(state, e.x, e.z, 'xp', e.xp);
  const chargeBase = e.isMiniboss
    ? SURVIVOR.mech.chargePerMiniboss
    : e.isElite
      ? SURVIVOR.mech.chargePerElite
      : SURVIVOR.mech.chargePerKill;
  if (state.player.form !== 'mech') {
    state.player.mechCharge = Math.min(1, state.player.mechCharge + chargeBase * mechChargeMul(state));
  }
  if (e.isElite && !e.isMiniboss) {
    dropPickup(state, e.x + 0.3, e.z, 'supply', 1);
  }
  if (e.isMiniboss) {
    state.miniboss.alive = false;
    state.miniboss.health = 0;
    dropPickup(state, e.x, e.z + 0.4, 'xp', 40);
    dropPickup(state, e.x - 0.4, e.z, 'repair', 45);
    dropPickup(state, e.x + 0.4, e.z, 'supply', 1);
  }
  if (rng(state) < SURVIVOR.repairDropChance) {
    dropPickup(state, e.x + 0.2, e.z - 0.2, 'repair', 18);
  }
}

function dropPickup(
  state: SurvivorState,
  x: number,
  z: number,
  kind: SurvivorPickup['kind'],
  value: number,
): void {
  let slot: SurvivorPickup | null = null;
  for (const p of state.pickups) {
    if (!p.active) {
      slot = p;
      break;
    }
  }
  if (!slot) {
    if (state.pickups.length >= SURVIVOR.pickupCap) {
      if (kind === 'xp') {
        let best: SurvivorPickup | null = null;
        let bestD = 4;
        for (const p of state.pickups) {
          if (!p.active || p.kind !== 'xp') continue;
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
        if (best) {
          best.value += value;
          return;
        }
      }
      return;
    }
    slot = {
      id: 0,
      kind: 'xp',
      x: 0,
      z: 0,
      value: 0,
      active: false,
      magnetized: false,
    };
    state.pickups.push(slot);
  }
  slot.id = nextEntityId(state);
  slot.kind = kind;
  slot.x = x;
  slot.z = z;
  slot.value = value;
  slot.active = true;
  slot.magnetized = false;
}

function damageEnemy(
  state: SurvivorState,
  e: SurvivorEnemy,
  dmg: number,
  opts?: { kind?: DamageEvent['kind']; pop?: number },
): void {
  if (!e.alive || dmg <= 0) return;
  e.health -= dmg;
  e.hitFlash = 0.1;
  const killed = e.health <= 0;
  let kind: DamageEvent['kind'] = opts?.kind ?? (e.isMiniboss ? 'boss' : 'enemy');
  if (killed && kind !== 'player') kind = 'kill';
  emitDamage(state, `e:${e.id}`, e.x, e.z + 0.5, dmg, kind, opts?.pop ?? (killed ? 0.9 : 0.5));
  if (e.isMiniboss) {
    state.miniboss.health = Math.max(0, e.health);
  }
  if (killed) killEnemy(state, e);
}

export function damagePlayer(
  state: SurvivorState,
  amount: number,
  source: DamageSourceKind = 'enemy',
): void {
  const p = state.player;
  if (!p.alive || p.invuln > 0 || p.dodgeActive > 0 || amount <= 0) return;
  let mul = 1;
  if (p.form === 'mech') mul = SURVIVOR.mech.damageTakenMul;
  else if (p.form === 'ship') mul = SURVIVOR.ship.damageTakenMul;
  if (source === 'boss') mul *= 1 - bossDamageReduction(state);
  let dealt = amount * mul;
  // Shield absorbs first
  if (p.shieldPoints > 0 && p.shieldTime > 0) {
    const absorbed = Math.min(p.shieldPoints, dealt);
    p.shieldPoints -= absorbed;
    dealt -= absorbed;
    p.hitFlash = 0.12;
    emitDamage(state, `shield:${p.x.toFixed(1)}`, p.x, p.z + 1.0, absorbed, 'absorb');
    pushEffect(state, 'shield', p.x, p.z, 0.25, '#88d4ff', 1.4);
    if (p.shieldPoints <= 0) {
      p.shieldPoints = 0;
      p.shieldTime = 0;
    }
    if (dealt <= 0) {
      p.invuln = Math.min(SURVIVOR.playerInvuln, 0.12);
      return;
    }
  }
  p.health = Math.max(0, p.health - dealt);
  p.hitFlash = 0.15;
  p.invuln = SURVIVOR.playerInvuln;
  emitDamage(state, 'player', p.x, p.z + 0.8, dealt, 'player');
  if (p.health <= 0) {
    p.alive = false;
    p.health = 0;
    if (p.form === 'ship') {
      p.form = 'astronaut';
      p.shipDuration = 0;
      clearShipHazards(state);
    }
    state.phase = 'defeat';
  }
}

export function applyAegisBarrier(state: SurvivorState, potency = 1): void {
  const pts = Math.round(computeShieldPoints(state.time, state.player.maxHealth) * potency);
  state.player.shieldMax = pts;
  state.player.shieldPoints = pts;
  state.player.shieldTime = SURVIVOR.shieldDuration * (potency > 1 ? 1.25 : 1);
  state.player.barrierHits = 0;
  pushEffect(state, 'shield', state.player.x, state.player.z, 0.55, '#a8e8ff', 2.2);
}

function acquireProjectile(state: SurvivorState): SurvivorProjectile | null {
  for (const p of state.projectiles) {
    if (!p.active) return p;
  }
  if (state.projectiles.length >= SURVIVOR.projectileCap) return null;
  const p: SurvivorProjectile = {
    id: 0,
    kind: 'bolt',
    weaponId: null,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    damage: 0,
    radius: 0.2,
    life: 0,
    pierce: 0,
    homing: false,
    owner: 'player',
    color: '#fff',
    armTimer: 0,
    explodeRadius: 0,
    splash: 0,
    puddleRadius: 0,
    puddleLife: 0,
    puddleDamage: 0,
    bounceLeft: 0,
    splitOnHit: 0,
    active: false,
  };
  state.projectiles.push(p);
  return p;
}

function acquireHazard(state: SurvivorState): SurvivorHazard | null {
  for (const h of state.hazards) {
    if (!h.active) return h;
  }
  if (state.hazards.length >= SURVIVOR.hazardCap) {
    // recycle oldest
    let oldest = state.hazards[0]!;
    for (const h of state.hazards) {
      if (h.life < oldest.life) oldest = h;
    }
    return oldest;
  }
  const h: SurvivorHazard = {
    id: 0,
    kind: 'wake',
    x: 0,
    z: 0,
    radius: 1,
    life: 0,
    maxLife: 1,
    damage: 0,
    color: '#fff',
    active: false,
    owner: 'player',
    tickCd: 0,
    armTimer: 0,
  };
  state.hazards.push(h);
  return h;
}

function spawnHazard(
  state: SurvivorState,
  kind: SurvivorHazard['kind'],
  x: number,
  z: number,
  radius: number,
  life: number,
  damage: number,
  color: string,
): void {
  const h = acquireHazard(state);
  if (!h) return;
  h.id = nextEntityId(state);
  h.kind = kind;
  h.x = x;
  h.z = z;
  h.radius = radius;
  h.life = life;
  h.maxLife = life;
  h.damage = damage;
  h.color = color;
  h.active = true;
  h.owner = 'player';
  h.tickCd = 0;
  h.armTimer = 0;
}

function nearestEnemy(state: SurvivorState, x: number, z: number, maxR: number): SurvivorEnemy | null {
  hash.query(x, z, maxR, queryBuf);
  let best: SurvivorEnemy | null = null;
  let bestD = maxR * maxR;
  for (let i = 0; i < queryBuf.length; i += 1) {
    const id = queryBuf[i]!;
    let e: SurvivorEnemy | null = null;
    for (let j = 0; j < state.enemies.length; j += 1) {
      const en = state.enemies[j]!;
      if (en.id === id && en.alive) {
        e = en;
        break;
      }
    }
    if (!e) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
  }
  return best;
}

function collectNearestEnemies(
  state: SurvivorState,
  x: number,
  z: number,
  maxR: number,
  count: number,
): SurvivorEnemy[] {
  const list: Array<{ e: SurvivorEnemy; d: number }> = [];
  const maxD = maxR * maxR;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d <= maxD) list.push({ e, d });
  }
  list.sort((a, b) => a.d - b.d);
  return list.slice(0, count).map((v) => v.e);
}

function densestPoint(state: SurvivorState, originX: number, originZ: number): { x: number; z: number } {
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = (e.x - originX) ** 2 + (e.z - originZ) ** 2;
    if (d < 100) {
      sx += e.x;
      sz += e.z;
      n += 1;
      if (n >= 12) break;
    }
  }
  if (n === 0) {
    const t = nearestEnemy(state, originX, originZ, 20);
    return t ? { x: t.x, z: t.z } : { x: originX + state.player.facingX * 4, z: originZ + state.player.facingZ * 4 };
  }
  return { x: sx / n, z: sz / n };
}

function segmentHit(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cx: number,
  cz: number,
  r: number,
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return (cx - x0) ** 2 + (cz - z0) ** 2 <= r * r;
  let t = ((cx - x0) * dx + (cz - z0) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + dx * t;
  const pz = z0 + dz * t;
  return (cx - px) ** 2 + (cz - pz) ** 2 <= r * r;
}

function applyKnockback(e: SurvivorEnemy, nx: number, nz: number, force: number): void {
  // Convert desired push distance into impulse velocity over knockback window
  const dur = SURVIVOR.repulsor.knockbackDuration;
  const speed = force / Math.max(0.05, dur);
  e.kbX += nx * speed;
  e.kbZ += nz * speed;
}

export function tryRepulsor(state: SurvivorState): boolean {
  const p = state.player;
  if (!p.alive || p.form === 'ship') return false;
  if (p.repulsorCd > 0) return false;
  const cfg = SURVIVOR.repulsor;
  const mech = p.form === 'mech';
  const radius = cfg.radius * (mech ? cfg.mechRadiusMul : 1);
  const dmg = cfg.damage * (mech ? cfg.mechDamageMul : 1);
  const push = cfg.push * (mech ? cfg.mechPushMul : 1);

  p.repulsorCd = cfg.cooldown;
  // Multi-layer shockwave visual matching true gameplay radius
  pushEffect(state, 'repulsor', p.x, p.z, cfg.effectLife, state.accent, radius, { radius });
  pushEffect(state, 'pulse', p.x, p.z, cfg.effectLife * 0.7, '#ffffff', radius * 0.45, {
    radius: radius * 0.45,
  });
  pushEffect(state, 'impact', p.x, p.z, 0.35, state.accent, Math.min(4, radius * 0.2));

  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > radius + e.radius || dist < 1e-4) continue;
    const nx = dx / dist;
    const nz = dz / dist;
    damageEnemy(state, e, dmg, { kind: 'ability', pop: 0.85 });
    if (!e.alive) continue;
    let force = push;
    if (e.isMiniboss) force *= cfg.minibossPushMul;
    else if (e.isElite) force *= cfg.elitePushMul;
    applyKnockback(e, nx, nz, force);
    // Immediate partial displacement for legibility, then impulse continues
    e.x += nx * force * 0.15;
    e.z += nz * force * 0.15;
    const c = clampArena(e.x, e.z, e.radius * 0.5);
    e.x = c.x;
    e.z = c.z;
  }

  // Bosses: stagger only, no throw
  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead' || b.repulsorCd > 0) continue;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= radius + SURVIVOR_BOSS.colliderRadius) {
      damageBoss(state, dmg * 0.55, { kind: 'ability', pop: 0.9, boss: b });
      b.repulsorCd = cfg.bossInternalCd;
      if (b.state === 'windup') {
        b.state = 'recover';
        b.timer = cfg.bossStagger;
        b.pattern = null;
        b.telegraphR = 0;
      } else if (b.state === 'idle' || b.state === 'recover') {
        b.state = 'recover';
        b.timer = Math.max(b.timer, cfg.bossStagger * 0.7);
      }
    }
  }
  return true;
}

export function tryShip(state: SurvivorState): boolean {
  const p = state.player;
  if (!p.alive) return false;
  if (p.form === 'mech' || p.form === 'ship') return false;
  if (p.shipCd > 0) return false;
  p.form = 'ship';
  p.shipDuration = SURVIVOR.ship.duration;
  p.wakeTimer = 0;
  p.formTimer = 0;
  pushEffect(state, 'transform', p.x, p.z, 0.5, state.accent, 1.8);
  return true;
}

export function tryMech(state: SurvivorState): boolean {
  const p = state.player;
  if (!p.alive) return false;
  if (p.form === 'ship' || p.form === 'mech') return false;
  if (p.mechCharge < 1) return false;
  p.form = 'mech';
  p.mechCharge = 0;
  p.mechDuration = SURVIVOR.mech.duration * mechDurationMul(state);
  p.invuln = Math.max(p.invuln, 0.4);
  pushEffect(state, 'transform', p.x, p.z, 0.65, state.accent, 2.2);
  return true;
}

function endShipForm(state: SurvivorState): void {
  const p = state.player;
  if (p.form !== 'ship') return;
  p.form = 'astronaut';
  p.shipDuration = 0;
  p.shipCd = SURVIVOR.ship.cooldown;
  clearShipHazards(state);
  pushEffect(state, 'transform', p.x, p.z, 0.4, '#88e0ff', 1.4);
}

/** Clear active thruster wakes (exhaust is presentation-only; wakes are hazards). */
export function clearShipHazards(state: SurvivorState): void {
  for (const h of state.hazards) {
    if (h.kind === 'wake') h.active = false;
  }
  state.player.exhaustTickCd = 0;
  state.player.wakeTimer = 0;
}

function fireWeapons(state: SurvivorState, dt: number): void {
  const p = state.player;
  if (p.form === 'ship') {
    // Weapons offline in ship form — still tick cooldowns lightly so they don't burst on exit
    for (const slot of state.weapons) {
      slot.cooldown = Math.max(0, slot.cooldown - dt * 0.35);
    }
    return;
  }

  const haste = hasteMul(state);
  const area = areaMul(state);
  const mech = p.form === 'mech';

  for (const slot of state.weapons) {
    slot.cooldown = Math.max(0, slot.cooldown - dt);
    if (slot.cooldown > 0) continue;
    const def = wdef(slot.weaponId, slot.level);
    const cadence = def.cadence / haste / (mech ? 1.2 : 1);
    slot.cooldown = cadence;
    const count = def.count + (mech && slot.weaponId !== 'bioplasma' ? 1 : 0);

    if (slot.weaponId === 'pulse') {
      const aim = selectWeaponTarget(state, slot, p.x, p.z, 14);
      const pos = targetPosition(aim);
      if (!pos) {
        slot.cooldown = 0.08;
        continue;
      }
      const ang0 = Math.atan2(pos.x - p.x, pos.z - p.z);
      for (let i = 0; i < count; i += 1) {
        const spread = (i - (count - 1) / 2) * 0.12;
        const a = ang0 + spread;
        const proj = acquireProjectile(state);
        if (!proj) break;
        const spd = def.speed ?? 26;
        resetProj(proj, state, 'bolt', 'pulse', p.x, p.z, Math.sin(a) * spd, Math.cos(a) * spd, {
          damage: def.damage * (mech ? 1.4 : 1),
          radius: (def.radius ?? 0.2) * area,
          life: def.life ?? 1,
          pierce: (def.pierce ?? 0) + (mech ? 1 : 0),
          color: state.accent,
        });
      }
      pushEffect(state, 'muzzle', p.x, p.z, 0.08, state.accent, 0.8);
    } else if (slot.weaponId === 'microdrone') {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + state.time;
        const proj = acquireProjectile(state);
        if (!proj) break;
        const spd = def.speed ?? 12;
        resetProj(
          proj,
          state,
          'drone',
          'microdrone',
          p.x + Math.cos(a) * 0.6,
          p.z + Math.sin(a) * 0.6,
          Math.cos(a) * spd,
          Math.sin(a) * spd,
          {
            damage: def.damage * (mech ? 1.35 : 1) * p.damageMul,
            radius: (def.radius ?? 0.18) * area,
            life: (def.life ?? 2.2) * (mech ? 1.2 : 1),
            homing: true,
            color: state.accent,
          },
        );
      }
    } else if (slot.weaponId === 'rail') {
      for (let i = 0; i < count; i += 1) {
        const aim = selectWeaponTarget(state, slot, p.x, p.z, 18);
        const pos = targetPosition(aim);
        let fx = p.facingX;
        let fz = p.facingZ;
        if (pos) {
          const len = Math.hypot(pos.x - p.x, pos.z - p.z) || 1;
          fx = (pos.x - p.x) / len;
          fz = (pos.z - p.z) / len;
        }
        const off = (i - (count - 1) / 2) * 0.35;
        const ox = -fz * off;
        const oz = fx * off;
        const length = (def.length ?? 14) * (mech ? 1.15 : 1);
        const width = (def.width ?? 0.5) * area * (mech ? 1.2 : 1);
        const x1 = p.x + ox + fx * length;
        const z1 = p.z + oz + fz * length;
        state.rails.push({
          x0: p.x + ox,
          z0: p.z + oz,
          x1,
          z1,
          life: 0.22,
          color: state.accent,
        });
        pushEffect(state, 'rail', p.x + ox, p.z + oz, 0.25, state.accent, length, {
          facingX: fx,
          facingZ: fz,
          length,
          width,
        });
        const dmg = def.damage * (mech ? 1.45 : 1) * p.damageMul;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (segmentHit(p.x + ox, p.z + oz, x1, z1, e.x, e.z, e.radius + width * 0.5)) {
            damageEnemy(state, e, dmg);
          }
        }
        for (const b of state.bosses) {
          if (!b.active || b.state === 'dead') continue;
          if (
            segmentHit(
              p.x + ox,
              p.z + oz,
              x1,
              z1,
              b.x,
              b.z,
              SURVIVOR_BOSS.colliderRadius + width * 0.5,
            )
          ) {
            damageBoss(state, dmg * 0.85, { boss: b });
          }
        }
      }
    } else if (slot.weaponId === 'gravity') {
      for (let i = 0; i < count; i += 1) {
        const radius = (def.radius ?? 3) * area * (mech ? 1.2 : 1);
        const aim = selectWeaponTarget(state, slot, p.x, p.z, 14);
        const pos = targetPosition(aim);
        const cx = pos ? pos.x : p.x + state.player.facingX * (2 + i * 0.8);
        const cz = pos ? pos.z : p.z + state.player.facingZ * (2 + i * 0.8);
        pushEffect(state, 'pulse', cx, cz, 0.4, state.accent, radius, { radius });
        const dmg = def.damage * (mech ? 1.4 : 1) * p.damageMul;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const dx = e.x - cx;
          const dz = e.z - cz;
          if (dx * dx + dz * dz <= (radius + e.radius) ** 2) {
            damageEnemy(state, e, dmg);
            const len = Math.hypot(dx, dz) || 1;
            applyKnockback(e, -dx / len, -dz / len, 0.8);
          }
        }
        for (const b of state.bosses) {
          if (!b.active || b.state === 'dead') continue;
          const dx = b.x - cx;
          const dz = b.z - cz;
          if (dx * dx + dz * dz <= (radius + SURVIVOR_BOSS.colliderRadius) ** 2) {
            damageBoss(state, dmg * 0.7, { boss: b });
          }
        }
      }
    } else if (slot.weaponId === 'rocket') {
      const aim = selectWeaponTarget(state, slot, p.x, p.z, 22);
      const bossPos = targetPosition(aim);
      const cluster = bossPos && aim?.kind === 'boss' ? bossPos : densestPoint(state, p.x, p.z);
      for (let i = 0; i < count; i += 1) {
        const ox = (i - (count - 1) / 2) * 0.9;
        const tx = cluster.x - state.player.facingZ * ox + (rng(state) - 0.5) * 0.6;
        const tz = cluster.z + state.player.facingX * ox + (rng(state) - 0.5) * 0.6;
        const proj = acquireProjectile(state);
        if (!proj) break;
        // Shorter arming delay keeps Rocket competitive early
        const arm = 0.22 + i * 0.05;
        resetProj(proj, state, 'rocket', 'rocket', tx, tz, 0, 0, {
          damage: def.damage * (mech ? 1.35 : 1) * p.damageMul,
          radius: 0.25,
          life: arm + 0.05,
          color: state.accent,
          armTimer: arm,
          explodeRadius: (def.radius ?? 1.4) * area * (mech ? 1.2 : 1),
        });
        pushEffect(state, 'telegraph', tx, tz, arm, state.accent, proj.explodeRadius, {
          radius: proj.explodeRadius,
        });
      }
    } else if (slot.weaponId === 'bioplasma') {
      const aim = selectWeaponTarget(state, slot, p.x, p.z, 16);
      const pos = targetPosition(aim);
      if (pos) {
        for (let i = 0; i < count; i += 1) {
          const a = Math.atan2(pos.x - p.x, pos.z - p.z) + (i - (count - 1) / 2) * 0.1;
          fireBioGlob(state, def, area, mech, a, p.x, p.z);
        }
      } else {
        const targets = collectNearestEnemies(state, p.x, p.z, 16, Math.max(1, count));
        if (targets.length === 0) {
          fireBioGlob(state, def, area, mech, Math.atan2(p.facingX, p.facingZ), p.x, p.z);
        } else {
          for (let i = 0; i < count; i += 1) {
            const t = targets[i % targets.length]!;
            fireBioGlob(state, def, area, mech, Math.atan2(t.x - p.x, t.z - p.z), p.x, p.z);
          }
        }
      }
      pushEffect(state, 'muzzle', p.x, p.z, 0.1, WEAPONS.bioplasma.color, 0.9);
    } else if (slot.weaponId === 'arc') {
      fireArcConductor(state, slot, def, area, mech);
    } else if (slot.weaponId === 'orbital') {
      fireOrbitalLance(state, slot, def, area, mech);
    }
  }
}

function fireArcConductor(
  state: SurvivorState,
  slot: SurvivorWeaponSlot,
  def: ReturnType<typeof wdef>,
  area: number,
  mech: boolean,
): void {
  const p = state.player;
  const aim = selectWeaponTarget(state, slot, p.x, p.z, 16);
  const pos = targetPosition(aim);
  if (!pos) {
    slot.cooldown = 0.15;
    return;
  }
  const chains = 1 + (def.pierce ?? 2);
  const dmg = def.damage * (mech ? 1.35 : 1) * p.damageMul;
  const hitIds = new Set<number>();
  let cx = pos.x;
  let cz = pos.z;
  let prevX = p.x;
  let prevZ = p.z;
  // Primary
  if (aim?.kind === 'boss') {
    damageBoss(state, dmg * 1.15, { kind: 'ability', pop: 0.8, boss: aim.boss });
    hitIds.add(aim.boss.id);
  } else if (aim?.kind === 'enemy') {
    damageEnemy(state, aim.enemy, dmg, { kind: 'ability', pop: 0.7 });
    hitIds.add(aim.enemy.id);
  }
  pushEffect(state, 'arc', prevX, prevZ, 0.18, WEAPONS.arc.color, 1, {
    facingX: cx - prevX,
    facingZ: cz - prevZ,
    length: Math.hypot(cx - prevX, cz - prevZ),
    width: 0.35,
  });
  prevX = cx;
  prevZ = cz;
  const range = (def.radius ?? 3.5) * area;
  for (let i = 0; i < chains; i += 1) {
    let bestE: SurvivorEnemy | null = null;
    let bestB: SurvivorBoss | null = null;
    let bestD = range * range;
    for (const e of state.enemies) {
      if (!e.alive || hitIds.has(e.id)) continue;
      const d = (e.x - cx) ** 2 + (e.z - cz) ** 2;
      if (d < bestD) {
        bestD = d;
        bestE = e;
        bestB = null;
      }
    }
    for (const b of state.bosses) {
      if (!b.active || b.state === 'dead' || hitIds.has(b.id)) continue;
      const d = (b.x - cx) ** 2 + (b.z - cz) ** 2;
      if (d < bestD) {
        bestD = d;
        bestB = b;
        bestE = null;
      }
    }
    if (!bestE && !bestB) break;
    const nx = bestE ? bestE.x : bestB!.x;
    const nz = bestE ? bestE.z : bestB!.z;
    pushEffect(state, 'arc', prevX, prevZ, 0.16, WEAPONS.arc.color, 0.9, {
      facingX: nx - prevX,
      facingZ: nz - prevZ,
      length: Math.hypot(nx - prevX, nz - prevZ),
      width: 0.28,
    });
    if (bestE) {
      damageEnemy(state, bestE, dmg * 0.75, { kind: 'ability', pop: 0.55 });
      hitIds.add(bestE.id);
    } else if (bestB) {
      damageBoss(state, dmg * 0.85, { kind: 'ability', pop: 0.7, boss: bestB });
      hitIds.add(bestB.id);
    }
    prevX = nx;
    prevZ = nz;
    cx = nx;
    cz = nz;
  }
  // L4+ small discharge
  if ((def.splash ?? 0) > 0 || slot.level >= 4) {
    pushEffect(state, 'pulse', cx, cz, 0.3, WEAPONS.arc.color, 1.6, { radius: 1.6 });
  }
}

function fireOrbitalLance(
  state: SurvivorState,
  slot: SurvivorWeaponSlot,
  def: ReturnType<typeof wdef>,
  _area: number,
  mech: boolean,
): void {
  const p = state.player;
  const aim = selectWeaponTarget(state, slot, p.x, p.z, 32, { forceBoss: true });
  let pos = targetPosition(aim);
  if (!pos) {
    const dense = densestPoint(state, p.x, p.z);
    pos = dense;
  }
  const strikes = def.count;
  const dmg = def.damage * (mech ? 1.25 : 1) * p.damageMul;
  for (let i = 0; i < strikes; i += 1) {
    const ox = (i - (strikes - 1) / 2) * 1.1;
    const tx = pos.x + ox;
    const tz = pos.z;
    const arm = (def.life ?? 0.8) + i * 0.12;
    pushEffect(state, 'orbital', tx, tz, arm, WEAPONS.orbital.color, 2.5, { radius: def.radius ?? 1.6 });
    pushEffect(state, 'telegraph', tx, tz, arm, '#ffd46a', 1, { radius: def.radius ?? 1.6 });
    // Delayed damage via armed rocket-like projectile
    const proj = acquireProjectile(state);
    if (!proj) continue;
    resetProj(proj, state, 'orbital-marker', 'orbital', tx, tz, 0, 0, {
      damage: dmg,
      radius: (def.radius ?? 1.6) * 0.85,
      life: arm + 0.05,
      armTimer: arm,
      color: WEAPONS.orbital.color,
      explodeRadius: def.radius ?? 1.6,
    });
  }
}

function resetProj(
  proj: SurvivorProjectile,
  state: SurvivorState,
  kind: SurvivorProjectile['kind'],
  weaponId: WeaponId | null,
  x: number,
  z: number,
  vx: number,
  vz: number,
  opts: Partial<SurvivorProjectile>,
): void {
  proj.id = nextEntityId(state);
  proj.kind = kind;
  proj.weaponId = weaponId;
  proj.x = x;
  proj.z = z;
  proj.vx = vx;
  proj.vz = vz;
  proj.damage = opts.damage ?? 0;
  proj.radius = opts.radius ?? 0.2;
  proj.life = opts.life ?? 1;
  proj.pierce = opts.pierce ?? 0;
  proj.homing = opts.homing ?? false;
  proj.owner = opts.owner ?? 'player';
  proj.color = opts.color ?? '#fff';
  proj.armTimer = opts.armTimer ?? 0;
  proj.explodeRadius = opts.explodeRadius ?? 0;
  proj.splash = opts.splash ?? 0;
  proj.puddleRadius = opts.puddleRadius ?? 0;
  proj.puddleLife = opts.puddleLife ?? 0;
  proj.puddleDamage = opts.puddleDamage ?? 0;
  proj.bounceLeft = opts.bounceLeft ?? 0;
  proj.splitOnHit = opts.splitOnHit ?? 0;
  proj.active = true;
}

function fireBioGlob(
  state: SurvivorState,
  def: ReturnType<typeof wdef>,
  area: number,
  mech: boolean,
  angle: number,
  x: number,
  z: number,
): void {
  const proj = acquireProjectile(state);
  if (!proj) return;
  const spd = def.speed ?? 16;
  resetProj(proj, state, 'bioplasma', 'bioplasma', x, z, Math.sin(angle) * spd, Math.cos(angle) * spd, {
    damage: def.damage * (mech ? 1.3 : 1) * state.player.damageMul,
    radius: (def.radius ?? 0.28) * area,
    life: def.life ?? 1.4,
    color: WEAPONS.bioplasma.color,
    splash: (def.splash ?? 1.3) * area,
    puddleRadius: (def.puddleRadius ?? 1.1) * area,
    puddleLife: def.puddleLife ?? 1.6,
    puddleDamage: (def.puddleDamage ?? 8) * (mech ? 1.2 : 1),
    bounceLeft: def.bounce ?? 0,
    splitOnHit: def.split ?? 0,
  });
}

function bioImpact(state: SurvivorState, proj: SurvivorProjectile, hitX: number, hitZ: number): void {
  pushEffect(state, 'impact', hitX, hitZ, 0.25, proj.color, proj.splash || 1);
  if (proj.splash > 0) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const dx = e.x - hitX;
      const dz = e.z - hitZ;
      if (dx * dx + dz * dz <= (proj.splash + e.radius) ** 2) {
        damageEnemy(state, e, proj.damage * 0.55);
      }
    }
    for (const b of state.bosses) {
      if (!b.active || b.state === 'dead') continue;
      const dx = b.x - hitX;
      const dz = b.z - hitZ;
      if (dx * dx + dz * dz <= (proj.splash + SURVIVOR_BOSS.colliderRadius) ** 2) {
        damageBoss(state, proj.damage * 0.45, { boss: b });
      }
    }
  }
  if (proj.puddleRadius > 0 && proj.puddleLife > 0) {
    spawnHazard(
      state,
      'puddle',
      hitX,
      hitZ,
      proj.puddleRadius,
      proj.puddleLife,
      proj.puddleDamage,
      WEAPONS.bioplasma.color,
    );
  }
  if (proj.splitOnHit > 0) {
    for (let i = 0; i < 2; i += 1) {
      const a = rng(state) * Math.PI * 2;
      const child = acquireProjectile(state);
      if (!child) break;
      const spd = 10;
      resetProj(child, state, 'bioplasma', 'bioplasma', hitX, hitZ, Math.sin(a) * spd, Math.cos(a) * spd, {
        damage: proj.damage * 0.55,
        radius: proj.radius * 0.85,
        life: 0.7,
        color: proj.color,
        splash: proj.splash * 0.7,
        puddleRadius: proj.puddleRadius * 0.75,
        puddleLife: proj.puddleLife * 0.6,
        puddleDamage: proj.puddleDamage * 0.7,
        bounceLeft: 0,
        splitOnHit: 0,
      });
    }
  }
}

function nearestAliveBoss(state: SurvivorState, x: number, z: number): SurvivorBoss | null {
  let best: SurvivorBoss | null = null;
  let bestD = Infinity;
  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead') continue;
    const d = (b.x - x) ** 2 + (b.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function damageBoss(
  state: SurvivorState,
  dmg: number,
  opts?: { kind?: DamageEvent['kind']; pop?: number; boss?: SurvivorBoss; x?: number; z?: number },
): void {
  if (dmg <= 0) return;
  let b = opts?.boss ?? null;
  if (!b) {
    const x = opts?.x ?? state.player.x;
    const z = opts?.z ?? state.player.z;
    b = nearestAliveBoss(state, x, z);
  }
  if (!b || !b.active || b.state === 'dead') return;
  b.health = Math.max(0, b.health - dmg);
  b.hitFlash = 0.1;
  emitDamage(state, `boss:${b.id}`, b.x, b.z + 1.2, dmg, opts?.kind ?? 'boss', opts?.pop ?? 0.75);
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  if (phase > b.phase) {
    b.phase = phase;
    b.phaseAnnounced = phase;
    pushEffect(state, 'transform', b.x, b.z, 0.9, phase === 3 ? '#ff2244' : '#ff8844', 3.2);
    b.state = 'recover';
    b.timer = 0.7;
    b.pattern = null;
  }
  if (b.health <= 0) {
    onBossDefeated(state, b);
  }
  syncPrimaryBossMirror(state);
}

function onBossDefeated(state: SurvivorState, b: SurvivorBoss): void {
  b.state = 'dead';
  b.timer = 1.2;
  b.active = false;
  state.bossesDefeated += 1;
  if (b.isMega) state.megasDefeated += 1;
  pushEffect(state, 'death', b.x, b.z, 1.2, b.isMega ? '#ff88cc' : '#66e0ff', b.isMega ? 5 : 3.5);
  // Large rewards — never victory
  dropPickup(state, b.x, b.z, 'xp', 80 + b.index * 25 + (b.isMega ? 120 : 0));
  dropPickup(state, b.x + 0.5, b.z, 'repair', 45 + (b.isMega ? 30 : 0));
  dropPickup(state, b.x - 0.5, b.z, 'supply', 1);
  if (b.isMega) {
    // Guaranteed enhanced cache at death location (does not expire soon)
    state.cache = {
      active: true,
      x: b.x,
      z: b.z,
      life: 999,
      maxLife: 999,
      mega: true,
      potency: 1.5,
    };
    pushEffect(state, 'cache', b.x, b.z, 1.4, '#ffd46a', 4);
  }
  if (state.player.form !== 'mech') {
    state.player.mechCharge = Math.min(1, state.player.mechCharge + SURVIVOR.mech.chargePerBoss);
  }
  // Drain one breach stack into a free spawn slot if pending
  if (state.breachStacks > 0 && aliveBossCount(state) < SURVIVOR.maxSimultaneousBosses) {
    state.breachStacks -= 1;
    spawnBossAtIndex(state, state.bossesSpawned + 1, true);
  }
  syncPrimaryBossMirror(state);
}

function rebuildHash(state: SurvivorState): void {
  hash.clear();
  for (const e of state.enemies) {
    if (e.alive) hash.insert(e.id, e.x, e.z);
  }
}

function updateProjectiles(state: SurvivorState, dt: number): void {
  for (const proj of state.projectiles) {
    if (!proj.active) continue;
    if (proj.kind === 'rocket' || proj.kind === 'orbital-marker') {
      proj.armTimer -= dt;
      proj.life -= dt;
      if (proj.armTimer > 0) continue;
      const er = proj.explodeRadius || proj.radius;
      pushEffect(state, proj.kind === 'orbital-marker' ? 'orbital' : 'impact', proj.x, proj.z, 0.4, proj.color, er * 1.4, {
        radius: er,
      });
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const dx = e.x - proj.x;
        const dz = e.z - proj.z;
        if (dx * dx + dz * dz <= (er + e.radius) ** 2) {
          damageEnemy(state, e, proj.damage);
        }
      }
      for (const b of state.bosses) {
        if (!b.active || b.state === 'dead') continue;
        const dx = b.x - proj.x;
        const dz = b.z - proj.z;
        if (dx * dx + dz * dz <= (er + b.colliderRadius) ** 2) {
          damageBoss(state, proj.damage * (proj.kind === 'orbital-marker' ? 1.1 : 1), { boss: b });
        }
      }
      proj.active = false;
      continue;
    }

    if (proj.homing) {
      // Prefer boss when late-run or close
      const bb = nearestBoss(state, proj.x, proj.z, 14);
      const t = nearestEnemy(state, proj.x, proj.z, 12);
      let tx = state.player.x;
      let tz = state.player.z;
      if (bb && (state.time > 600 || !t || (bb.x - proj.x) ** 2 + (bb.z - proj.z) ** 2 < (t.x - proj.x) ** 2 + (t.z - proj.z) ** 2)) {
        tx = bb.x;
        tz = bb.z;
      } else if (t) {
        tx = t.x;
        tz = t.z;
      } else if (bb) {
        tx = bb.x;
        tz = bb.z;
      }
      const spd = Math.hypot(proj.vx, proj.vz) || 12;
      const dx = tx - proj.x;
      const dz = tz - proj.z;
      const len = Math.hypot(dx, dz) || 1;
      const desiredX = (dx / len) * spd;
      const desiredZ = (dz / len) * spd;
      proj.vx += (desiredX - proj.vx) * Math.min(1, 10 * dt);
      proj.vz += (desiredZ - proj.vz) * Math.min(1, 10 * dt);
    }

    proj.x += proj.vx * dt;
    proj.z += proj.vz * dt;
    proj.life -= dt;
    if (proj.life <= 0) {
      proj.active = false;
      continue;
    }

    if (proj.owner === 'player') {
      let hitEnemy: SurvivorEnemy | null = null;
      hash.query(proj.x, proj.z, proj.radius + 1.2, queryBuf);
      for (let i = 0; i < queryBuf.length; i += 1) {
        const id = queryBuf[i]!;
        let e: SurvivorEnemy | null = null;
        for (let j = 0; j < state.enemies.length; j += 1) {
          const en = state.enemies[j]!;
          if (en.id === id && en.alive) {
            e = en;
            break;
          }
        }
        if (!e) continue;
        const dx = e.x - proj.x;
        const dz = e.z - proj.z;
        if (dx * dx + dz * dz <= (proj.radius + e.radius) ** 2) {
          hitEnemy = e;
          break;
        }
      }
      // fallback scan for bioplasma early
      if (!hitEnemy && proj.kind === 'bioplasma') {
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const dx = e.x - proj.x;
          const dz = e.z - proj.z;
          if (dx * dx + dz * dz <= (proj.radius + e.radius) ** 2) {
            hitEnemy = e;
            break;
          }
        }
      }

      if (hitEnemy) {
        damageEnemy(state, hitEnemy, proj.damage);
        if (proj.kind === 'bioplasma') {
          const hx = hitEnemy.x;
          const hz = hitEnemy.z;
          if (proj.bounceLeft > 0) {
            proj.bounceLeft -= 1;
            const next = nearestEnemy(state, hx, hz, 10);
            if (next && next.id !== hitEnemy.id) {
              const len = Math.hypot(next.x - hx, next.z - hz) || 1;
              const spd = Math.hypot(proj.vx, proj.vz) || 14;
              proj.x = hx;
              proj.z = hz;
              proj.vx = ((next.x - hx) / len) * spd;
              proj.vz = ((next.z - hz) / len) * spd;
              bioImpact(state, proj, hx, hz);
              // reduce splash on bounce trail
              proj.splash *= 0.7;
              continue;
            }
          }
          bioImpact(state, proj, hx, hz);
          proj.active = false;
          continue;
        }
        if (proj.pierce > 0) proj.pierce -= 1;
        else {
          proj.active = false;
          pushEffect(state, 'impact', proj.x, proj.z, 0.12, proj.color, 0.5);
        }
        continue;
      }

      {
        const bb = nearestAliveBoss(state, proj.x, proj.z);
        if (bb) {
          const dx = bb.x - proj.x;
          const dz = bb.z - proj.z;
          if (dx * dx + dz * dz <= (proj.radius + SURVIVOR_BOSS.colliderRadius) ** 2) {
            damageBoss(state, proj.damage, { boss: bb });
            if (proj.kind === 'bioplasma') {
              bioImpact(state, proj, bb.x, bb.z);
              proj.active = false;
            } else if (proj.pierce > 0) proj.pierce -= 1;
            else {
              proj.active = false;
              pushEffect(state, 'impact', proj.x, proj.z, 0.12, proj.color, 0.6);
            }
          }
        }
      }
    } else {
      const p = state.player;
      const dx = p.x - proj.x;
      const dz = p.z - proj.z;
      const pr = p.form === 'ship' ? SURVIVOR.ship.radius : SURVIVOR.playerRadius;
      if (dx * dx + dz * dz <= (proj.radius + pr) ** 2) {
        const src = (proj as { fromBoss?: boolean }).fromBoss ? 'boss' : 'enemy';
        damagePlayer(state, proj.damage, src as DamageSourceKind);
        proj.active = false;
        pushEffect(state, 'impact', proj.x, proj.z, 0.12, '#ff5566', 0.6);
      }
    }
  }
}

function updateHazards(state: SurvivorState, dt: number): void {
  for (const h of state.hazards) {
    if (!h.active) continue;
    h.life -= dt;
    if (h.life <= 0) {
      h.active = false;
      continue;
    }
    for (const e of state.enemies) {
      if (!e.alive || e.hazardHitCd > 0) continue;
      const dx = e.x - h.x;
      const dz = e.z - h.z;
      if (dx * dx + dz * dz <= (h.radius + e.radius) ** 2) {
        damageEnemy(state, e, h.damage);
        e.hazardHitCd = SURVIVOR.ship.wakeTickCd;
      }
    }
    if (h.kind === 'wake') {
      for (const b of state.bosses) {
        if (!b.active || b.state === 'dead' || b.hitFlash > 0.02) continue;
        const dx = b.x - h.x;
        const dz = b.z - h.z;
        if (dx * dx + dz * dz <= (h.radius + SURVIVOR_BOSS.colliderRadius) ** 2) {
          damageBoss(state, h.damage * 0.7, { boss: b });
        }
      }
    }
  }
}

function updateEnemies(state: SurvivorState, dt: number): void {
  const p = state.player;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.hazardHitCd > 0) e.hazardHitCd = Math.max(0, e.hazardHitCd - dt);
    e.attackCd = Math.max(0, e.attackCd - dt);

    // Knockback first — AI must not cancel same-frame
    const kbMag = Math.hypot(e.kbX, e.kbZ);
    if (kbMag > 0.05) {
      e.x += e.kbX * dt;
      e.z += e.kbZ * dt;
      const damp = Math.exp(-8 * dt);
      e.kbX *= damp;
      e.kbZ *= damp;
      // While strongly knocked, skip chase so push is legible
      if (kbMag > 2.5) {
        const c = clampArena(e.x, e.z, e.radius * 0.5);
        e.x = c.x;
        e.z = c.z;
        continue;
      }
    } else {
      e.kbX = 0;
      e.kbZ = 0;
    }

    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ndx = dx / dist;
    const ndz = dz / dist;
    e.facingX = ndx;
    e.facingZ = ndz;

    const visual = HORDE[e.defId]?.visual;
    const baseSpeed = (visual?.moveSpeed ?? 3) * (e.role === 'fast' ? 1.15 : 1);
    const speed = baseSpeed * e.speedMul;

    // Miniboss special slam
    if (e.isMiniboss) {
      e.specialCd = Math.max(0, e.specialCd - dt);
      if (e.specialWindup > 0) {
        e.specialWindup -= dt;
        if (e.specialWindup <= 0) {
          pushEffect(state, 'pulse', e.x, e.z, 0.4, '#ffcc44', MINIBOSS.specialRadius, {
            radius: MINIBOSS.specialRadius,
          });
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d <= MINIBOSS.specialRadius + SURVIVOR.playerRadius) {
            damagePlayer(state, MINIBOSS.specialDamage * e.damageMul);
          }
          e.specialCd = MINIBOSS.specialCd;
        }
      } else if (e.specialCd <= 0 && dist < 9) {
        e.specialWindup = MINIBOSS.specialWindup;
        pushEffect(state, 'telegraph', e.x, e.z, MINIBOSS.specialWindup, '#ffaa33', MINIBOSS.specialRadius, {
          radius: MINIBOSS.specialRadius,
        });
      }
      // slow advance while winding up
      if (e.specialWindup > 0) {
        e.x += ndx * speed * 0.25 * dt;
        e.z += ndz * speed * 0.25 * dt;
      } else {
        e.x += ndx * speed * dt;
        e.z += ndz * speed * dt;
      }
      if (dist < e.radius + SURVIVOR.playerRadius + 0.05 && e.attackCd <= 0) {
        e.attackCd = 1.0;
        damagePlayer(state, Math.max(6, (visual?.damage ?? 14) * 0.7 * e.damageMul));
      }
    } else if (e.role === 'ranged') {
      if (dist < 4.5) {
        e.x -= ndx * speed * dt;
        e.z -= ndz * speed * dt;
      } else if (dist > 8) {
        e.x += ndx * speed * dt;
        e.z += ndz * speed * dt;
      } else {
        e.x += -ndz * speed * 0.7 * dt;
        e.z += ndx * speed * 0.7 * dt;
      }
      if (e.attackCd <= 0 && dist < 10 && dist > 2.5) {
        e.attackCd = (visual?.attackCooldown ?? 1.8) / Math.max(0.75, 1.15 - e.speedMul * 0.1);
        const proj = acquireProjectile(state);
        if (proj) {
          const spd = visual?.projectileSpeed ?? 12;
          resetProj(proj, state, 'enemy', null, e.x, e.z, ndx * spd, ndz * spd, {
            damage: (visual?.damage ?? 7) * e.damageMul,
            radius: visual?.projectileRadius ?? 0.2,
            life: 2.2,
            owner: 'enemy',
            color: '#ff5566',
          });
        }
      }
    } else {
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      const pr = p.form === 'ship' ? SURVIVOR.ship.radius : SURVIVOR.playerRadius;
      if (dist < e.radius + pr + 0.05) {
        if (e.attackCd <= 0) {
          e.attackCd = 0.75;
          damagePlayer(state, Math.max(4, (visual?.damage ?? 8) * 0.65 * e.damageMul));
        }
      }
    }

    // Ship body impact
    if (p.form === 'ship' && p.bodyHitCd <= 0) {
      const bdx = e.x - p.x;
      const bdz = e.z - p.z;
      if (bdx * bdx + bdz * bdz <= (e.radius + SURVIVOR.ship.radius) ** 2) {
        damageEnemy(state, e, SURVIVOR.ship.bodyDamage * thrusterPower(state));
        if (e.alive && !e.isMiniboss) {
          const len = Math.hypot(bdx, bdz) || 1;
          applyKnockback(e, bdx / len, bdz / len, SURVIVOR.ship.bodyPush);
        }
        p.bodyHitCd = SURVIVOR.ship.bodyTickCd;
      }
    }

    // soft separation
    hash.query(e.x, e.z, e.radius * 3, queryBuf);
    let sepX = 0;
    let sepZ = 0;
    let n = 0;
    for (let i = 0; i < queryBuf.length; i += 1) {
      const id = queryBuf[i]!;
      if (id === e.id) continue;
      let o: SurvivorEnemy | null = null;
      for (let j = 0; j < state.enemies.length; j += 1) {
        const en = state.enemies[j]!;
        if (en.id === id && en.alive) {
          o = en;
          break;
        }
      }
      if (!o) continue;
      const sdx = e.x - o.x;
      const sdz = e.z - o.z;
      const sd = Math.hypot(sdx, sdz);
      const minD = (e.radius + o.radius) * 1.1;
      if (sd > 0.01 && sd < minD) {
        sepX += (sdx / sd) * (minD - sd);
        sepZ += (sdz / sd) * (minD - sd);
        n += 1;
      }
    }
    if (n > 0) {
      e.x += sepX * 0.4;
      e.z += sepZ * 0.4;
    }

    const c = clampArena(e.x, e.z, e.radius * 0.5);
    e.x = c.x;
    e.z = c.z;
  }
}

function updatePickups(state: SurvivorState, dt: number): void {
  const p = state.player;
  const eMag = energyMagnetRadius(state);
  const hMag = healthMagnetRadius(state);
  const eDirect = energyDirectRadius(state);
  const hDirect = healthDirectRadius(state);
  const injured = p.health < p.maxHealth - 0.01;
  for (const pk of state.pickups) {
    if (!pk.active) continue;
    let dx = p.x - pk.x;
    let dz = p.z - pk.z;
    let d2 = dx * dx + dz * dz;

    if (pk.kind === 'xp') {
      if (d2 < eMag * eMag) pk.magnetized = true;
      if (pk.magnetized) {
        const d = Math.sqrt(d2) || 1;
        const spd = SURVIVOR.xpMagnetSpeed;
        pk.x += (dx / d) * spd * dt;
        pk.z += (dz / d) * spd * dt;
        dx = p.x - pk.x;
        dz = p.z - pk.z;
        d2 = dx * dx + dz * dz;
      }
      if (d2 < eDirect * eDirect) {
        pk.active = false;
        pk.magnetized = false;
        gainXp(state, pk.value);
        pushEffect(state, 'pickup', pk.x, pk.z, 0.28, '#66ffcc', 0.85);
      }
      continue;
    }

    if (pk.kind === 'repair') {
      // Never magnetize or consume while full — leave available for later
      if (!injured) {
        pk.magnetized = false;
        continue;
      }
      if (d2 < hMag * hMag) pk.magnetized = true;
      if (pk.magnetized) {
        const d = Math.sqrt(d2) || 1;
        const spd = SURVIVOR.healthMagnetSpeed;
        pk.x += (dx / d) * spd * dt;
        pk.z += (dz / d) * spd * dt;
        dx = p.x - pk.x;
        dz = p.z - pk.z;
        d2 = dx * dx + dz * dz;
      }
      if (d2 < hDirect * hDirect) {
        const before = p.health;
        const need = p.maxHealth - p.health;
        if (need <= 0) {
          pk.magnetized = false;
          continue;
        }
        const restored = Math.min(pk.value, need);
        p.health = Math.min(p.maxHealth, p.health + restored);
        pk.active = false;
        pk.magnetized = false;
        emitDamage(state, `heal:${pk.id}`, p.x, p.z + 1.1, restored, 'heal');
        pushEffect(state, 'heal', p.x, p.z, 0.45, '#ff66cc', 1.8);
        pushEffect(state, 'pulse', p.x, p.z, 0.35, '#e8f4ff', 1.5);
      }
      continue;
    }

    if (pk.kind === 'supply') {
      if (d2 < eDirect * eDirect * 1.4) {
        pk.active = false;
        openSupply(state);
        pushEffect(state, 'levelup', p.x, p.z, 0.4, '#ffd46a', 1.6);
      }
    }
  }
}

function gainXp(state: SurvivorState, amount: number): void {
  if (state.phase !== 'playing') return;
  state.xp += amount;
  while (state.xp >= state.xpNext && state.phase === 'playing') {
    state.xp -= state.xpNext;
    state.level += 1;
    state.xpNext = xpForLevel(state.level);
    openLevelUp(state);
  }
}

function ownedWeaponLevel(state: SurvivorState, id: WeaponId): number {
  return state.weapons.find((w) => w.weaponId === id)?.level ?? 0;
}

function hullPlatingTotalFromState(state: SurvivorState): number {
  const lv = passiveLevel(state, 'max-health');
  let sum = 0;
  for (let i = 1; i <= lv; i += 1) sum += hullPlatingGainAtLevel(i);
  return sum;
}

export function generateChoices(state: SurvivorState): UpgradeChoice[] {
  const newWeapons: UpgradeChoice[] = [];
  const authored: UpgradeChoice[] = [];
  const overclocks: UpgradeChoice[] = [];
  const passives: UpgradeChoice[] = [];
  const prototypes: UpgradeChoice[] = [];

  // Guarantee unlock offers once
  if (state.unlocks.arc && !ownedWeaponLevel(state, 'arc') && !state.unlocks.arcOffered) {
    prototypes.push({
      kind: 'new-weapon',
      id: 'new-arc-forced',
      title: WEAPONS.arc.name,
      body: 'Prototype unlock · ' + WEAPONS.arc.description,
      weaponId: 'arc',
    });
  }
  if (state.unlocks.orbital && !ownedWeaponLevel(state, 'orbital') && !state.unlocks.orbitalOffered) {
    prototypes.push({
      kind: 'new-weapon',
      id: 'new-orbital-forced',
      title: WEAPONS.orbital.name,
      body: 'Prototype unlock · ' + WEAPONS.orbital.description,
      weaponId: 'orbital',
    });
  }

  const ordinaryCount = state.weapons.filter((w) => !w.prototype && !isPrototypeWeapon(w.weaponId)).length;
  if (ordinaryCount < SURVIVOR.maxWeaponSlots) {
    for (const id of ordinaryWeaponIds()) {
      if (ownedWeaponLevel(state, id) > 0) continue;
      if (isPrototypeWeapon(id)) continue;
      const fam = WEAPONS[id];
      newWeapons.push({
        kind: 'new-weapon',
        id: `new-${id}`,
        title: fam.name,
        body: fam.description,
        weaponId: id,
      });
    }
  }

  // Eligible unlocked prototypes not yet owned
  for (const id of ['arc', 'orbital'] as WeaponId[]) {
    if (ownedWeaponLevel(state, id) > 0) continue;
    const fam = WEAPONS[id];
    if (!fam.prototype) continue;
    const unlocked = id === 'arc' ? state.unlocks.arc : state.unlocks.orbital;
    if (!unlocked) continue;
    if (prototypes.some((c) => c.weaponId === id)) continue;
    prototypes.push({
      kind: 'new-weapon',
      id: `new-${id}`,
      title: fam.name,
      body: 'Prototype · ' + fam.description,
      weaponId: id,
    });
  }

  for (const w of state.weapons) {
    const fam = WEAPONS[w.weaponId];
    const nextLv = w.level + 1;
    const preview = weaponDamagePreview(w.weaponId, w.level, nextLv);
    if (w.level < fam.levels.length) {
      const next = fam.levels[w.level]!;
      authored.push({
        kind: 'weapon',
        id: `w-${w.weaponId}-${nextLv}`,
        title: next.label,
        body: preview,
        weaponId: w.weaponId,
      });
    } else {
      const oc = overclockLevel(nextLv);
      overclocks.push({
        kind: 'weapon',
        id: `w-${w.weaponId}-${nextLv}`,
        title: `${fam.name} L${nextLv}`,
        body: `${formatOverclockLabel(oc)}\n${preview}`,
        weaponId: w.weaponId,
      });
    }
  }

  for (const pas of PASSIVES) {
    const lv = passiveLevel(state, pas.id);
    if (!isPassiveAvailable(pas.id, lv)) continue;
    const next = lv + 1;
    let body = pas.description;
    if (pas.id === 'max-health') {
      const gain = hullPlatingGainAtLevel(next);
      const cur = SURVIVOR.playerMaxHealth + hullPlatingTotalFromState(state);
      body = `Integrity ${Math.round(cur)} → ${Math.round(cur + gain)}`;
    } else if (pas.id === 'regen') {
      body = `Regen ${regenPerSecondAtLevel(lv).toFixed(2)}/s → ${regenPerSecondAtLevel(next).toFixed(2)}/s`;
    }
    passives.push({
      kind: 'passive',
      id: `p-${pas.id}-${next}`,
      title: `${pas.name} L${next}`,
      body,
      passiveId: pas.id,
    });
  }

  const shuffle = <T,>(arr: T[]): T[] => {
    const bag = [...arr];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng(state) * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag;
  };

  // Forced prototype unlocks first, then permanent tiers only — never temps
  const tiers = [
    shuffle(prototypes.filter((c) => c.id.includes('forced'))),
    shuffle(prototypes.filter((c) => !c.id.includes('forced'))),
    shuffle(newWeapons),
    shuffle(authored),
    shuffle(overclocks),
    shuffle(passives),
  ];
  const choices: UpgradeChoice[] = [];
  const used = new Set<string>();
  const tryAdd = (c: UpgradeChoice): boolean => {
    const key =
      c.kind === 'passive'
        ? `p:${c.passiveId}`
        : c.kind === 'new-weapon'
          ? `n:${c.weaponId}`
          : `u:${c.weaponId}`;
    if (used.has(key)) return false;
    used.add(key);
    choices.push(c);
    return true;
  };
  for (const tier of tiers) {
    for (const c of tier) {
      if (choices.length >= 3) break;
      tryAdd(c);
    }
  }
  // Absolute permanent fallback: overclock first owned weapon / hull plating
  while (choices.length < 3) {
    if (state.weapons[0]) {
      const w = state.weapons[choices.length % state.weapons.length]!;
      const nextLv = w.level + 1;
      const fam = WEAPONS[w.weaponId];
      tryAdd({
        kind: 'weapon',
        id: `w-fill-${w.weaponId}-${nextLv}-${choices.length}`,
        title: `${fam.name} L${nextLv}`,
        body: weaponDamagePreview(w.weaponId, w.level, nextLv),
        weaponId: w.weaponId,
      });
    } else {
      tryAdd({
        kind: 'passive',
        id: `p-fill-max-health-${choices.length}`,
        title: 'Hull Plating L1',
        body: 'Integrity +20',
        passiveId: 'max-health',
      });
    }
    if (choices.length < 3 && choices.every((c) => c.id.startsWith('p-fill'))) break;
    // prevent infinite loop
    if (choices.length === 0) break;
    if (choices.length < 3 && tiers.flat().length === 0) {
      choices.push({
        kind: 'passive',
        id: `p-fill-regen-${choices.length}`,
        title: `Nanite Bleed L${(state.passives.regen ?? 0) + 1}`,
        body: 'Automatic repair',
        passiveId: 'regen',
      });
    }
    if (choices.length >= 3) break;
    // force push unique id
    const n = choices.length;
    choices.push({
      kind: 'passive',
      id: `p-hard-fill-${n}`,
      title: `Hull Plating L${(state.passives['max-health'] ?? 0) + 1 + n}`,
      body: 'Integrity',
      passiveId: 'max-health',
    });
    break;
  }
  while (choices.length < 3) {
    choices.push({
      kind: 'passive',
      id: `p-pad-${choices.length}`,
      title: `Hull Plating L${(state.passives['max-health'] ?? 0) + 1}`,
      body: 'Integrity',
      passiveId: 'max-health',
    });
  }
  return choices.slice(0, 3);
}

function openLevelUp(state: SurvivorState): void {
  state.phase = 'levelup';
  state.choices = generateChoices(state);
  pushEffect(state, 'levelup', state.player.x, state.player.z, 0.6, state.accent, 2);
}

function openSupply(state: SurvivorState): void {
  if (rng(state) < 0.45) {
    state.player.health = Math.min(state.player.maxHealth, state.player.health + 35);
    pushEffect(state, 'pulse', state.player.x, state.player.z, 0.5, '#4df0d0', 1.8);
  } else {
    // Any owned weapon can gain a free level (including Overclocks)
    if (state.weapons.length > 0) {
      const w = state.weapons[Math.floor(rng(state) * state.weapons.length)]!;
      w.level += 1;
      pushEffect(state, 'levelup', state.player.x, state.player.z, 0.45, state.accent, 1.5);
    } else {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 40);
    }
  }
}

export function applyChoice(state: SurvivorState, index: number): void {
  const choice = state.choices[index];
  if (!choice) return;
  if (choice.kind === 'weapon' && choice.weaponId) {
    const slot = state.weapons.find((w) => w.weaponId === choice.weaponId);
    if (slot) slot.level += 1;
  } else if (choice.kind === 'new-weapon' && choice.weaponId) {
    if (state.weapons.some((w) => w.weaponId === choice.weaponId)) {
      /* already owned */
    } else if (isPrototypeWeapon(choice.weaponId)) {
      const protoCount = state.weapons.filter((w) => w.prototype || isPrototypeWeapon(w.weaponId)).length;
      if (protoCount < SURVIVOR.maxPrototypeSlots) {
        state.weapons.push({
          weaponId: choice.weaponId,
          level: 1,
          cooldown: 0.5,
          focusDebt: 0,
          prototype: true,
        });
        if (choice.weaponId === 'arc') state.unlocks.arcOffered = true;
        if (choice.weaponId === 'orbital') state.unlocks.orbitalOffered = true;
      }
    } else {
      const ordinary = state.weapons.filter((w) => !w.prototype && !isPrototypeWeapon(w.weaponId)).length;
      if (ordinary < SURVIVOR.maxWeaponSlots) {
        state.weapons.push({
          weaponId: choice.weaponId,
          level: 1,
          cooldown: 0.5,
          focusDebt: 0,
          prototype: false,
        });
      }
    }
  } else if (choice.kind === 'passive' && choice.passiveId) {
    const id = choice.passiveId;
    if (!isPassiveAvailable(id, passiveLevel(state, id))) {
      state.choices = [];
      state.phase = 'playing';
      return;
    }
    const next = (state.passives[id] ?? 0) + 1;
    state.passives[id] = next;
    if (id === 'max-health') {
      const gain = hullPlatingGainAtLevel(next);
      state.player.maxHealth += gain;
      state.player.health += gain;
    }
  } else if (choice.kind === 'protocol' && choice.protocolId) {
    applyProtocol(state, choice.protocolId, state.cache.potency);
    state.protocolChoices = [];
    state.phase = 'playing';
    return;
  }
  state.choices = [];
  state.phase = 'playing';
}

export function applyProtocolChoice(state: SurvivorState, index: number): void {
  const choice = state.protocolChoices[index];
  if (!choice?.protocolId) return;
  applyProtocol(state, choice.protocolId, state.cache.potency);
  state.protocolChoices = [];
  state.phase = 'playing';
}

function applyProtocol(state: SurvivorState, id: ProtocolId, potency: number): void {
  if (id === 'aegis-barrier') {
    applyAegisBarrier(state, potency);
  } else if (id === 'rocket-barrage') {
    state.rocketProtocol.active = true;
    state.rocketProtocol.remaining = 15 * (potency > 1 ? 1.5 : 1);
    state.rocketProtocol.fireCd = 0.2;
    state.rocketProtocol.potency = potency;
    pushEffect(state, 'transform', state.player.x, state.player.z, 0.5, '#ff8a4a', 2);
  } else if (id === 'gunship-flyby') {
    startGunship(state, potency);
  }
}

function startGunship(state: SurvivorState, potency: number): void {
  const p = state.player;
  const ang = rng(state) * Math.PI * 2;
  const half = SURVIVOR.arenaHalf * 0.9;
  const x0 = Math.cos(ang) * half;
  const z0 = Math.sin(ang) * half;
  const x1 = -x0;
  const z1 = -z0;
  state.gunship = {
    active: true,
    t: 0,
    duration: 5.5 * (potency > 1 ? 1.35 : 1),
    x0,
    z0,
    x1,
    z1,
    fireCd: 0,
    potency,
  };
  pushEffect(state, 'gunship', x0, z0, 0.8, state.accent, 3);
  pushEffect(state, 'telegraph', (x0 + x1) / 2, (z0 + z1) / 2, 0.9, state.accent, half * 2, {
    length: half * 2,
    width: 2.2,
    facingX: x1 - x0,
    facingZ: z1 - z0,
  });
}


function applyTempBuff(state: SurvivorState, id: TempBuffId): void {
  const p = state.player;
  const cfg = SURVIVOR.tempBuff;
  if (id === 'emergency-repair') {
    p.health = Math.min(p.maxHealth, p.health + cfg.repairAmount);
    pushEffect(state, 'pulse', p.x, p.z, 0.45, '#4df0d0', 1.6);
  } else if (id === 'weapon-overcharge') {
    upsertTemp(state, 'weapon-overcharge', cfg.overchargeDuration, 1);
    p.damageMul = cfg.overchargeDamageMul;
  } else if (id === 'cooldown-flush') {
    p.dodgeCd = Math.max(0, p.dodgeCd * 0.25);
    p.repulsorCd = Math.max(0, p.repulsorCd * 0.25);
    p.shipCd = Math.max(0, p.shipCd * 0.25);
    pushEffect(state, 'levelup', p.x, p.z, 0.4, state.accent, 1.5);
  } else if (id === 'emergency-barrier') {
    p.barrierHits = Math.min(2, p.barrierHits + cfg.barrierHits);
    upsertTemp(state, 'emergency-barrier', 60, p.barrierHits);
  } else if (id === 'thruster-surge') {
    upsertTemp(state, 'thruster-surge', cfg.thrusterDuration, 1);
  }
}

function upsertTemp(
  state: SurvivorState,
  id: TempBuffId,
  duration: number,
  stacks: number,
): void {
  const existing = state.tempBuffs.find((t) => t.id === id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, duration);
    existing.stacks = Math.min(3, existing.stacks + stacks);
  } else {
    state.tempBuffs.push({ id, remaining: duration, stacks });
  }
}

function tickTempBuffs(state: SurvivorState, dt: number): void {
  const p = state.player;
  let overcharge = false;
  let thruster = false;
  for (const t of state.tempBuffs) {
    t.remaining -= dt;
    if (t.id === 'weapon-overcharge' && t.remaining > 0) overcharge = true;
    if (t.id === 'thruster-surge' && t.remaining > 0) thruster = true;
    if (t.id === 'emergency-barrier') t.stacks = p.barrierHits;
  }
  state.tempBuffs = state.tempBuffs.filter((t) => t.remaining > 0 && (t.id !== 'emergency-barrier' || p.barrierHits > 0));
  p.damageMul = overcharge ? SURVIVOR.tempBuff.overchargeDamageMul : 1;
  // thruster applied in moveMul path via flag
  (p as { _thruster?: boolean })._thruster = thruster;
}

export function tryDodge(state: SurvivorState, moveX: number, moveY: number): boolean {
  const p = state.player;
  if (!p.alive || p.form === 'ship') return false;
  if (p.dodgeCd > 0 || p.dodgeActive > 0) return false;
  const world = screenToWorldMove(moveX, moveY);
  let dx = world.x;
  let dz = world.z;
  let len = Math.hypot(dx, dz);
  if (len < 0.1) {
    dx = p.facingX;
    dz = p.facingZ;
    len = Math.hypot(dx, dz) || 1;
  }
  p.dodgeDirX = dx / len;
  p.dodgeDirZ = dz / len;
  p.dodgeActive = SURVIVOR.dodge.duration;
  p.dodgeCd = SURVIVOR.dodge.cooldown;
  p.invuln = Math.max(p.invuln, SURVIVOR.dodge.invuln);
  p.facingX = p.dodgeDirX;
  p.facingZ = p.dodgeDirZ;
  pushEffect(state, 'muzzle', p.x, p.z, 0.2, state.accent, 1.2);
  pushEffect(state, 'wake', p.x - p.dodgeDirX, p.z - p.dodgeDirZ, 0.25, state.accent, 0.8);
  return true;
}

function updatePlayer(state: SurvivorState, input: SurvivorInput, dt: number): void {
  const p = state.player;
  if (!p.alive) return;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
  if (p.repulsorCd > 0) p.repulsorCd = Math.max(0, p.repulsorCd - dt);
  if (p.shipCd > 0 && p.form !== 'ship') p.shipCd = Math.max(0, p.shipCd - dt);
  if (p.dodgeCd > 0) p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  if (p.bodyHitCd > 0) p.bodyHitCd = Math.max(0, p.bodyHitCd - dt);
  if (p.exhaustTickCd > 0) p.exhaustTickCd = Math.max(0, p.exhaustTickCd - dt);
  tickTempBuffs(state, dt);

  const regen = regenPerSecondAtLevel(passiveLevel(state, 'regen'));
  if (regen > 0 && p.health < p.maxHealth && p.form !== 'ship') {
    p.health = Math.min(p.maxHealth, p.health + regen * dt);
  }

  // Ability edges
  if (input.dodgePressed) tryDodge(state, input.moveX, input.moveY);
  if (input.repulsorPressed) tryRepulsor(state);
  if (input.shipPressed) tryShip(state);
  if (input.mechPressed) {
    if (tryMech(state)) p.mechReadyAnnounced = false;
  }

  // Form timers
  if (p.form === 'mech') {
    p.mechDuration -= dt;
    if (p.mechDuration <= 0) {
      p.form = 'astronaut';
      p.formTimer = 0;
      pushEffect(state, 'transform', p.x, p.z, 0.45, '#88e0ff', 1.5);
    }
  } else if (p.form === 'ship') {
    p.shipDuration -= dt;
    if (p.shipDuration <= 0) {
      endShipForm(state);
    }
  }

  // Dodge dash motion
  if (p.dodgeActive > 0) {
    const spd = SURVIVOR.dodge.distance / SURVIVOR.dodge.duration;
    p.x += p.dodgeDirX * spd * dt;
    p.z += p.dodgeDirZ * spd * dt;
    p.dodgeActive = Math.max(0, p.dodgeActive - dt);
    const pr = SURVIVOR.playerRadius;
    const c = clampArena(p.x, p.z, pr);
    p.x = c.x;
    p.z = c.z;
    return;
  }

  const world = screenToWorldMove(input.moveX, input.moveY);
  const len = Math.hypot(world.x, world.z);
  let speed = SURVIVOR.playerSpeed * moveMul(state);
  if ((p as { _thruster?: boolean })._thruster) speed *= SURVIVOR.tempBuff.thrusterSpeedMul;
  if (p.form === 'mech') speed *= 0.92;
  if (p.form === 'ship') speed *= SURVIVOR.ship.speedMul;
  if (p.slowTimer > 0) speed *= p.slowMul;

  let moved = false;
  if (len > 0.1) {
    const nx = world.x / len;
    const nz = world.z / len;
    p.x += nx * speed * dt;
    p.z += nz * speed * dt;
    p.facingX = nx;
    p.facingZ = nz;
    moved = true;
  }
  const pr = p.form === 'ship' ? SURVIVOR.ship.radius : SURVIVOR.playerRadius;
  const c = clampArena(p.x, p.z, pr);
  p.x = c.x;
  p.z = c.z;

  if (p.form === 'ship') {
    applyShipExhaust(state, dt);
    if (moved) {
      p.wakeTimer -= dt;
      if (p.wakeTimer <= 0) {
        p.wakeTimer = SURVIVOR.ship.wakeInterval;
        const bx = p.x - p.facingX * 0.9;
        const bz = p.z - p.facingZ * 0.9;
        spawnHazard(
          state,
          'wake',
          bx,
          bz,
          SURVIVOR.ship.wakeRadius,
          SURVIVOR.ship.wakeLife,
          SURVIVOR.ship.wakeDamage * thrusterPower(state),
          state.accent,
        );
        pushEffect(state, 'wake', bx, bz, 0.35, state.accent, SURVIVOR.ship.wakeRadius);
      }
    }
  }
}

/** Rear-facing continuous jet: damages only enemies behind the ship. */
export function applyShipExhaust(state: SurvivorState, _dt: number): void {
  const p = state.player;
  if (p.form !== 'ship' || !p.alive) return;
  if (p.exhaustTickCd > 0) return;
  p.exhaustTickCd = SURVIVOR.ship.exhaustTickCd;
  const len = SURVIVOR.ship.exhaustLength;
  const halfW = SURVIVOR.ship.exhaustWidth * 0.5;
  const fx = p.facingX;
  const fz = p.facingZ;
  // Side basis
  const sx = -fz;
  const sz = fx;

  for (const e of state.enemies) {
    if (!e.alive || e.hazardHitCd > 0) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    // Behind ship: projection onto -forward
    const back = -(dx * fx + dz * fz);
    if (back < 0.25 || back > len) continue;
    const side = Math.abs(dx * sx + dz * sz);
    // Taper width toward the tip
    const taper = halfW * (1.05 - (back / len) * 0.55);
    if (side > taper + e.radius) continue;
    let dmg = SURVIVOR.ship.exhaustDamage * thrusterPower(state);
    if (e.isMiniboss || e.isElite) dmg *= SURVIVOR.ship.exhaustEliteMul;
    damageEnemy(state, e, dmg, { kind: 'ability', pop: 0.7 });
    e.hazardHitCd = SURVIVOR.ship.wakeTickCd;
  }

  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead' || b.hitFlash > 0.02) continue;
    const dx = b.x - p.x;
    const dz = b.z - p.z;
    const back = -(dx * fx + dz * fz);
    const side = Math.abs(dx * sx + dz * sz);
    if (back >= 0.25 && back <= len && side <= halfW + SURVIVOR_BOSS.colliderRadius) {
      damageBoss(state, SURVIVOR.ship.exhaustDamage * thrusterPower(state) * SURVIVOR.ship.exhaustBossMul, {
        kind: 'ability',
        pop: 0.8,
        boss: b,
      });
    }
  }
}

function updateSpawns(state: SurvivorState, dt: number): void {
  const diff = endlessDifficultyAt(state.time);
  const alive = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const target = diff.targetActive;
  let rate = diff.spawnRate;
  if (alive < diff.populationMin) rate *= 1.75;
  else if (alive > target) rate *= 0.55;
  if (aliveBossCount(state) > 0) rate *= 0.7;

  state.spawnAcc += dt * rate;
  let spawnedThisFrame = 0;
  while (state.spawnAcc >= 1 && alive + spawnedThisFrame < state.enemyCap && spawnedThisFrame < 4) {
    state.spawnAcc -= 1;
    const pos = edgeSpawn(state);
    let defId = pickComposition(state);
    if (rng(state) < diff.eliteChance && state.time > 90) defId = 'elite';
    if (spawnEnemy(state, defId, pos.x, pos.z)) spawnedThisFrame += 1;
  }

  state.eliteTimer -= dt;
  if (state.eliteTimer <= 0 && state.time > 80) {
    state.eliteTimer = Math.max(8, 20 - state.time / 60) + rng(state) * 10;
    const pos = edgeSpawn(state);
    spawnEnemy(state, 'elite', pos.x, pos.z);
  }
}

function hasActiveMega(state: SurvivorState): boolean {
  return state.bosses.some((b) => b.active && b.state !== 'dead' && b.isMega);
}

function spawnBossAtIndex(state: SurvivorState, index: number, fromStack = false): SurvivorBoss | null {
  const mega = isMegaBossIndex(index);
  // Mega bypasses ordinary cap (one reserved slot); hold breach stacks while mega lives
  if (!mega && aliveBossCount(state) >= SURVIVOR.maxSimultaneousBosses) {
    if (!fromStack) state.breachStacks += 1;
    for (const b of state.bosses) {
      if (b.active && b.state !== 'dead') {
        b.breachEmpower += 0.12;
        b.damageMul *= 1.08;
      }
    }
    state.inboundBanner = 2.5;
    return null;
  }
  if (mega && hasActiveMega(state)) {
    if (!fromStack) state.breachStacks += 1;
    return null;
  }

  const diff = bossDifficultyFor(index);
  const px = state.player.x;
  const pz = state.player.z;
  const ang = (index * 1.7) % (Math.PI * 2);
  let bx = Math.sin(ang) * SURVIVOR.arenaHalf * 0.42;
  let bz = -Math.cos(ang) * SURVIVOR.arenaHalf * 0.42;
  if (Math.hypot(px - bx, pz - bz) < 12) {
    bx = -bx;
    bz = -bz;
  }
  const bdef = bossDefForIndex(index);
  const collR = bdef.colliderRadius * (mega ? SURVIVOR.megaColliderMul : 1);
  const c = clampArena(bx, bz, collR);
  bx = c.x;
  bz = c.z;

  const b = emptyBoss();
  b.id = nextEntityId(state);
  b.index = index;
  b.defId = bdef.id;
  b.displayName = mega ? `MEGA ${bdef.displayName}` : bdef.displayName;
  b.active = true;
  b.isMega = mega;
  b.spawnTime = state.time;
  b.x = bx;
  b.z = bz;
  b.maxHealth = SURVIVOR.firstBossBaseHealth * diff.healthMul;
  b.health = b.maxHealth;
  b.state = 'idle';
  b.timer = mega ? 2.2 : 1.5;
  b.pattern = null;
  b.phase = 1;
  b.phaseAnnounced = 1;
  b.repulsorCd = 0;
  b.healthMul = diff.healthMul;
  b.damageMul = diff.damageMul;
  b.recoveryMul = diff.recoveryMul;
  b.moveMul = diff.moveMul;
  b.fanAdd = diff.fanAdd;
  b.summonAdd = diff.summonAdd;
  b.breachEmpower = 0;
  b.colliderRadius = collR;
  b.visualScale = bdef.visualScale * (mega ? SURVIVOR.megaVisualMul : 1);
  b.uniquePattern = bdef.uniquePattern;
  state.bosses.push(b);
  if (!fromStack) {
    state.bossesSpawned = Math.max(state.bossesSpawned, index);
  } else {
    state.bossesSpawned += 1;
  }
  state.inboundBanner = mega ? 3.4 : 2.8;
  if (mega) state.megaBanner = 3.2;
  pushEffect(state, mega ? 'mega' : 'telegraph', bx, bz, 1.3, mega ? '#ff66aa' : '#ff4455', mega ? 5 : 3.5, {
    radius: mega ? 5 : 3.5,
  });
  pushEffect(state, 'transform', bx, bz, 1.15, mega ? '#ff88cc' : '#ff4455', mega ? 4.5 : 3.5);
  syncPrimaryBossMirror(state);
  return b;
}

/** Advance boss schedule from simulation time without skipping. */
function ensureBossSchedule(state: SurvivorState): void {
  while (state.time + 1e-6 >= state.nextBossTime) {
    const idx = state.nextBossIndex;
    spawnBossAtIndex(state, idx, false);
    state.nextBossIndex = idx + 1;
    state.nextBossTime = bossTimeForIndex(state.nextBossIndex);
  }
  // Do not release ordinary stacks while a Mega is alive
  if (hasActiveMega(state)) return;
  while (state.breachStacks > 0 && aliveBossCount(state) < SURVIVOR.maxSimultaneousBosses) {
    state.breachStacks -= 1;
    spawnBossAtIndex(state, state.bossesSpawned + 1, true);
  }
}

function ensureUnlocksAndCache(state: SurvivorState, dt: number): void {
  if (!state.unlocks.arc && state.time >= SURVIVOR.arcUnlockTime) {
    state.unlocks.arc = true;
    state.unlocks.arcBanner = 3.5;
  }
  if (!state.unlocks.orbital && state.time >= SURVIVOR.orbitalUnlockTime) {
    state.unlocks.orbital = true;
    state.unlocks.orbitalBanner = 3.5;
  }
  if (state.unlocks.arcBanner > 0) state.unlocks.arcBanner = Math.max(0, state.unlocks.arcBanner - dt);
  if (state.unlocks.orbitalBanner > 0) state.unlocks.orbitalBanner = Math.max(0, state.unlocks.orbitalBanner - dt);
  if (state.megaBanner > 0) state.megaBanner = Math.max(0, state.megaBanner - dt);

  if (state.player.shieldTime > 0) {
    state.player.shieldTime = Math.max(0, state.player.shieldTime - dt);
    if (state.player.shieldTime <= 0) {
      state.player.shieldPoints = 0;
      state.player.shieldMax = 0;
    }
  }
  if (state.player.slowTimer > 0) {
    state.player.slowTimer = Math.max(0, state.player.slowTimer - dt);
    if (state.player.slowTimer <= 0) state.player.slowMul = 1;
  }

  // Protocol Cache schedule
  if (!state.cache.active && state.time + 1e-6 >= state.nextCacheTime) {
    spawnProtocolCache(state, false);
    state.nextCacheTime += SURVIVOR.cacheInterval;
  }
  if (state.cache.active) {
    state.cache.life -= dt;
    const dx = state.player.x - state.cache.x;
    const dz = state.player.z - state.cache.z;
    if (dx * dx + dz * dz < 2.2 * 2.2 && state.phase === 'playing') {
      openProtocolCache(state);
    } else if (state.cache.life <= 0 && !state.cache.mega) {
      state.cache.active = false;
    }
  }

  // Rocket protocol battery
  if (state.rocketProtocol.active) {
    state.rocketProtocol.remaining -= dt;
    state.rocketProtocol.fireCd -= dt;
    if (state.rocketProtocol.fireCd <= 0) {
      state.rocketProtocol.fireCd = 0.55 / state.rocketProtocol.potency;
      fireProtocolRocket(state);
    }
    if (state.rocketProtocol.remaining <= 0) state.rocketProtocol.active = false;
  }
  // Gunship
  if (state.gunship.active) {
    state.gunship.t += dt;
    state.gunship.fireCd -= dt;
    const u = Math.min(1, state.gunship.t / state.gunship.duration);
    const gx = state.gunship.x0 + (state.gunship.x1 - state.gunship.x0) * u;
    const gz = state.gunship.z0 + (state.gunship.z1 - state.gunship.z0) * u;
    if (state.gunship.fireCd <= 0) {
      state.gunship.fireCd = 0.18;
      const tgt = nearestBoss(state, gx, gz, 28) || nearestEnemyOnly(state, gx, gz, 18);
      const tx = tgt ? ('x' in tgt ? tgt.x : 0) : gx;
      const tz = tgt ? ('z' in tgt ? tgt.z : 0) : gz;
      // damage nearest
      if (tgt && 'health' in tgt && 'alive' in tgt) {
        damageEnemy(state, tgt as import('./survivorState').SurvivorEnemy, 28 * state.gunship.potency, {
          kind: 'ability',
          pop: 0.7,
        });
      } else if (tgt && 'isMega' in tgt) {
        damageBoss(state, 45 * state.gunship.potency, {
          kind: 'ability',
          pop: 0.85,
          boss: tgt as import('./survivorState').SurvivorBoss,
        });
      }
      pushEffect(state, 'impact', tx, tz, 0.2, state.accent, 1.1);
    }
    if (state.gunship.t >= state.gunship.duration) state.gunship.active = false;
  }
}

function spawnProtocolCache(state: SurvivorState, mega: boolean): void {
  const corners = [
    { x: -SURVIVOR.arenaHalf * 0.78, z: -SURVIVOR.arenaHalf * 0.78 },
    { x: SURVIVOR.arenaHalf * 0.78, z: -SURVIVOR.arenaHalf * 0.78 },
    { x: -SURVIVOR.arenaHalf * 0.78, z: SURVIVOR.arenaHalf * 0.78 },
    { x: SURVIVOR.arenaHalf * 0.78, z: SURVIVOR.arenaHalf * 0.78 },
  ];
  corners.sort(
    (a, b) =>
      Math.hypot(b.x - state.player.x, b.z - state.player.z) -
      Math.hypot(a.x - state.player.x, a.z - state.player.z),
  );
  const pick = corners[rng(state) < 0.5 ? 0 : 1]!;
  state.cache = {
    active: true,
    x: pick.x,
    z: pick.z,
    life: mega ? 999 : SURVIVOR.cacheLifetime,
    maxLife: mega ? 999 : SURVIVOR.cacheLifetime,
    mega,
    potency: mega ? 1.5 : 1,
  };
  pushEffect(state, 'cache', pick.x, pick.z, 1.2, '#ffd46a', 3.5);
}

function openProtocolCache(state: SurvivorState): void {
  state.cache.active = false;
  state.phase = 'protocol';
  state.protocolChoices = PROTOCOLS.map((p) => ({
    kind: 'protocol' as const,
    id: `proto-${p.id}`,
    title: p.title,
    body: p.body + (state.cache.potency > 1 ? ' (Enhanced)' : ''),
    protocolId: p.id,
  }));
  pushEffect(state, 'levelup', state.player.x, state.player.z, 0.5, '#ffd46a', 2);
}

function fireProtocolRocket(state: SurvivorState): void {
  const p = state.player;
  const boss = nearestBoss(state, p.x, p.z, 30);
  const tx = boss ? boss.x : densestPoint(state, p.x, p.z).x;
  const tz = boss ? boss.z : densestPoint(state, p.x, p.z).z;
  const proj = acquireProjectile(state);
  if (!proj) return;
  const arm = 0.28;
  resetProj(proj, state, 'rocket', 'rocket', tx, tz, 0, 0, {
    damage: 55 * state.rocketProtocol.potency,
    radius: 0.3,
    life: arm + 0.05,
    color: '#ff8a4a',
    armTimer: arm,
    explodeRadius: 1.8 * state.rocketProtocol.potency,
  });
  pushEffect(state, 'telegraph', tx, tz, arm, '#ff8a4a', 1.8, { radius: 1.8 });
}

function updateBosses(state: SurvivorState, dt: number): void {
  if (state.inboundBanner > 0) state.inboundBanner = Math.max(0, state.inboundBanner - dt);
  for (const b of state.bosses) {
    updateOneBoss(state, b, dt);
  }
  // Prune long-dead bosses to keep list bounded
  if (state.bosses.length > 8) {
    state.bosses = state.bosses.filter((b) => b.active || b.state !== 'dead' || b.timer > 0);
  }
  syncPrimaryBossMirror(state);
}

function updateOneBoss(state: SurvivorState, b: SurvivorBoss, dt: number): void {
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
  b.facingX = dx / dist;
  b.facingZ = dz / dist;
  b.timer -= dt;

  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  b.phase = phase;
  const mod = SURVIVOR_BOSS.phaseMods[phase];
  const dmgScale = b.damageMul * mod.damageMul * (1 + b.breachEmpower);
  const recScale = b.recoveryMul * mod.recoveryMul;

  if (b.state === 'idle') {
    if (dist > 5) {
      const spd = SURVIVOR_BOSS.moveSpeed * b.moveMul * (1 + (phase - 1) * 0.08);
      b.x += b.facingX * spd * dt;
      b.z += b.facingZ * spd * dt;
      const c = clampArena(b.x, b.z, SURVIVOR_BOSS.colliderRadius);
      b.x = c.x;
      b.z = c.z;
    }
    if (b.timer <= 0) {
      const def = bossDefForIndex(b.index);
      const prefs = def.preferredPatterns;
      const roll = Math.floor(rng(state) * prefs.length);
      b.pattern = prefs[roll] ?? (rng(state) < 0.26 ? 'pulse' : roll < 0.52 ? 'line' : roll < 0.78 ? 'fan' : 'summon');
      b.state = 'windup';
      if (b.pattern === 'pulse') {
        const pulse = SURVIVOR_BOSS.patterns.pulse;
        b.timer = pulse.windup * (phase === 3 ? 0.85 : 1);
        pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ffaa33', pulse.maxRadius, {
          radius: pulse.maxRadius,
        });
      } else if (b.pattern === 'line') {
        const line = SURVIVOR_BOSS.patterns.line;
        b.timer = line.windup * (phase === 3 ? 0.85 : 1);
        b.chargeX = b.facingX;
        b.chargeZ = b.facingZ;
        pushEffect(state, 'telegraph', b.x, b.z, b.timer, '#ff4455', 1, {
          facingX: b.chargeX,
          facingZ: b.chargeZ,
          length: line.length,
          width: line.width,
        });
      } else if (b.pattern === 'fan') {
        b.timer = SURVIVOR_BOSS.patterns.fan.windup * (phase === 3 ? 0.8 : 1);
      } else {
        b.timer = SURVIVOR_BOSS.patterns.summon.windup;
      }
    }
    return;
  }

  if (b.state === 'windup') {
    if (b.timer <= 0 && b.pattern) {
      b.state = 'active';
      b.timer = SURVIVOR_BOSS.patterns[b.pattern].active;
    }
    return;
  }

  if (b.state === 'active' && b.pattern) {
    if (b.pattern === 'pulse') {
      const pulse = SURVIVOR_BOSS.patterns.pulse;
      const t = 1 - b.timer / pulse.active;
      b.telegraphR = pulse.maxRadius * t;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (Math.abs(d - b.telegraphR) < 1.1) damagePlayer(state, pulse.damage * dmgScale * dt * 2.5, 'boss');
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = pulse.recovery * recScale;
        b.pattern = null;
        b.telegraphR = 0;
      }
    } else if (b.pattern === 'line') {
      const line = SURVIVOR_BOSS.patterns.line;
      if (
        segmentHit(
          b.x,
          b.z,
          b.x + b.chargeX * line.length,
          b.z + b.chargeZ * line.length,
          p.x,
          p.z,
          SURVIVOR.playerRadius + line.width * 0.5,
        )
      ) {
        damagePlayer(state, line.damage * dmgScale, 'boss');
      }
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = line.recovery * recScale;
        b.pattern = null;
        b.telegraphR = 0;
      }
    } else if (b.pattern === 'fan') {
      const fan = SURVIVOR_BOSS.patterns.fan;
      const count = fan.count + mod.fanCountAdd + b.fanAdd;
      if (b.timer > fan.active * 0.7) {
        for (let i = 0; i < count; i += 1) {
          const a = Math.atan2(b.facingX, b.facingZ) + (i - (count - 1) / 2) * 0.26;
          const proj = acquireProjectile(state);
          if (!proj) break;
          resetProj(proj, state, 'enemy', null, b.x, b.z, Math.sin(a) * fan.speed, Math.cos(a) * fan.speed, {
            damage: fan.damage * dmgScale,
            radius: 0.28,
            life: 2.5,
            owner: 'enemy',
            color: phase >= 3 ? '#ff3366' : '#ff6688',
          });
          (proj as { fromBoss?: boolean }).fromBoss = true;
        }
      }
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = fan.recovery * recScale;
        b.pattern = null;
        b.telegraphR = 0;
      }
    } else if (b.pattern === 'summon') {
      const summon = SURVIVOR_BOSS.patterns.summon;
      if (b.timer > summon.active * 0.5) {
        const n = Math.min(mod.summonCount + b.summonAdd, phase >= 3 ? 8 : 5);
        for (let i = 0; i < n; i += 1) {
          const ang = rng(state) * Math.PI * 2;
          const id = phase >= 3 && rng(state) < 0.35 ? 'elite' : phase >= 2 ? 'spiky' : 'basic';
          spawnEnemy(state, id, b.x + Math.cos(ang) * 3.5, b.z + Math.sin(ang) * 3.5);
        }
      }
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = summon.recovery * recScale;
        b.pattern = null;
        b.telegraphR = 0;
      }
    }
    return;
  }

  if (b.state === 'recover' && b.timer <= 0) {
    b.state = 'idle';
    b.timer = mod.idleGap + rng(state) * 0.35;
  }
}

/** Prefill enemies for repulsor/damage fixtures. */
export function surroundPlayer(state: SurvivorState, count: number, radius = 3.2): void {
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    spawnEnemy(
      state,
      'basic',
      state.player.x + Math.cos(a) * radius,
      state.player.z + Math.sin(a) * radius,
    );
  }
}

export function stepSurvivor(state: SurvivorState, input: SurvivorInput, dt: number): void {
  if (input.mutePressed) state.muted = !state.muted;

  if (state.phase === 'levelup') {
    if (input.choiceIndex != null && input.choiceIndex >= 0 && input.choiceIndex < 3) {
      applyChoice(state, input.choiceIndex);
    }
    state.effects = state.effects
      .map((e) => ({ ...e, life: e.life - dt }))
      .filter((e) => e.life > 0);
    flushDamageAgg(state, dt);
    return;
  }

  if (state.phase === 'protocol') {
    if (input.choiceIndex != null && input.choiceIndex >= 0 && input.choiceIndex < 3) {
      applyProtocolChoice(state, input.choiceIndex);
    }
    state.effects = state.effects
      .map((e) => ({ ...e, life: e.life - dt }))
      .filter((e) => e.life > 0);
    flushDamageAgg(state, dt);
    return;
  }

  if (input.pausePressed && (state.phase === 'playing' || state.phase === 'paused')) {
    state.phase = state.phase === 'paused' ? 'playing' : 'paused';
  }
  if (state.phase === 'paused' || state.phase === 'victory' || state.phase === 'defeat') {
    state.effects = state.effects
      .map((e) => ({ ...e, life: e.life - dt }))
      .filter((e) => e.life > 0);
    flushDamageAgg(state, dt);
    return;
  }

  state.time += dt;
  if (state.xp >= state.xpNext && state.phase === 'playing') {
    state.xp -= state.xpNext;
    state.level += 1;
    state.xpNext = xpForLevel(state.level);
    openLevelUp(state);
    return;
  }

  ensureUnlocksAndCache(state, dt);
  ensureBossSchedule(state);
  updatePlayer(state, input, dt);
  rebuildHash(state);
  fireWeapons(state, dt);
  updateProjectiles(state, dt);
  updateHazards(state, dt);
  updateEnemies(state, dt);
  updateBosses(state, dt);
  updatePickups(state, dt);
  updateSpawns(state, dt);
  flushDamageAgg(state, dt);

  state.rails = state.rails
    .map((r) => ({ ...r, life: r.life - dt }))
    .filter((r) => r.life > 0);
  state.effects = state.effects
    .map((e) => ({ ...e, life: e.life - dt }))
    .filter((e) => e.life > 0);

  // Sync miniboss bar
  if (state.miniboss.alive) {
    const e = state.enemies.find((en) => en.id === state.miniboss.enemyId && en.alive);
    if (e) {
      state.miniboss.health = e.health;
    } else {
      state.miniboss.alive = false;
    }
  }

  state.metrics.enemies = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  state.metrics.projectiles = state.projectiles.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  state.metrics.pickups = state.pickups.reduce((n, p) => n + (p.active ? 1 : 0), 0);
}
