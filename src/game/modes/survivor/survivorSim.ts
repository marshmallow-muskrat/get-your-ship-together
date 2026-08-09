import { screenToWorldMove } from './screenBasis';
import { SpatialHash } from './spatialHash';
import {
  HORDE,
  MINIBOSS,
  PASSIVES,
  SURVIVOR,
  WEAPONS,
  bossDefForIndex,
  bossDifficultyFor,
  bossPhaseFromHealth,
  bossTimeForIndex,
  compositionAt,
  endlessDifficultyAt,
  isEnemyEligibleAt,
  isFodderEnemy,
  FIRST_MINUTE_SPECIALIST_WINDOW,
  FIRST_MINUTE_SPECIALIST_CAP,
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
  breachShieldingReduction,
  bossCategoryDamage,
  computeShieldDuration,
  type BossDamageCategory,
  type PassiveId,
  type ProtocolId,
  type TempBuffId,
  type WeaponId,
} from './survivorContent';
import {
  livingBosses,
  nearestBoss,
  leadTargetPosition,
  selectWeaponTarget,
  targetPosition,
} from './survivorTargeting';
import { updateAttacks } from './survivorAttacks';
import {
  updateOneBoss as updateOneBossPatterns,
  forceBossPattern,
  cancelBossPattern,
  type BossSimApi,
} from './survivorBossPatterns';
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
  return 1 + passiveLevel(state, 'move-speed') * 0.05;
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

/** Health/repair magnet radius — Magnet Field benefits health more than energy. */
export function healthMagnetRadius(state: SurvivorState): number {
  let r = SURVIVOR.healthMagnetBase + passiveLevel(state, 'pickup-radius') * SURVIVOR.healthMagnetPerLevel;
  if (state.player.form === 'ship') {
    const ship = SURVIVOR.heroShips[state.heroId];
    r = Math.max(r, SURVIVOR.healthShipMagnet, ship.collectionRadius + 3);
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
  if (state.player.form === 'ship') {
    const ship = SURVIVOR.heroShips[state.heroId];
    return Math.max(ship.pickupRadius + 1, SURVIVOR.healthShipDirectMin);
  }
  if (state.player.form === 'mech') {
    return Math.max(SURVIVOR.playerRadius * 1.6, SURVIVOR.healthMechDirectRadius);
  }
  return SURVIVOR.healthDirectRadius;
}

/** Project a kill-position reward into a safe interior of the arena. */
export function safePickupPosition(
  x: number,
  z: number,
  jitterX = 0,
  jitterZ = 0,
): { x: number; z: number } {
  const inset = SURVIVOR.pickupSafeInset;
  const limit = SURVIVOR.arenaHalf - inset;
  let px = x + jitterX;
  let pz = z + jitterZ;
  if (px > limit) px = limit;
  if (px < -limit) px = -limit;
  if (pz > limit) pz = limit;
  if (pz < -limit) pz = -limit;
  return { x: px, z: pz };
}

/** Closest distance from point to segment (for swept collection / gunship lane). */
function distPointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  if (ab2 < 1e-8) return Math.hypot(apx, apz);
  let t = (apx * abx + apz * abz) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** Inclusive circle / segment-vs-radius test for high-speed collection. */
function playerCollectsPickup(
  px: number,
  pz: number,
  prevX: number,
  prevZ: number,
  ox: number,
  oz: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  const dx = px - ox;
  const dz = pz - oz;
  if (dx * dx + dz * dz <= r2) return true;
  // Swept segment from previous player pos → current (dodge / ship tunneling).
  return distPointToSegment(ox, oz, prevX, prevZ, px, pz) <= radius;
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

export type DamageSourceKind =
  | 'enemy'
  | 'boss'
  | 'boss-body'
  | 'boss-charge'
  | 'boss-projectile'
  | 'boss-beam'
  | 'boss-puddle'
  | 'boss-radial'
  | 'hazard'
  | 'self';

/** Breach Shielding: hard-capped reduction on boss-tagged damage. */
export function bossDamageReduction(state: SurvivorState): number {
  return breachShieldingReduction(passiveLevel(state, 'breach-shielding'));
}

function hasteMul(state: SurvivorState): number {
  const base = 1 + passiveLevel(state, 'weapon-haste') * 0.055;
  return state.player.form === 'mech' ? base * 1.35 : base;
}

function areaMul(state: SurvivorState): number {
  const base = 1 + passiveLevel(state, 'area') * 0.055;
  return state.player.form === 'mech' ? base * 1.25 : base;
}

function mechChargeMul(state: SurvivorState): number {
  return 1 + passiveLevel(state, 'mech-charge') * 0.1;
}

function mechDurationMul(state: SurvivorState): number {
  return 1 + passiveLevel(state, 'mech-duration') * 0.09;
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
      kind === 'large' || kind === 'ability' || kind === 'boss' || kind === 'gunship'
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

/** Living non-fodder enemies — the quantity the first-minute cap bounds. */
function livingSpecialistCount(state: SurvivorState): number {
  let n = 0;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (!isFodderEnemy(e.defId)) n += 1;
  }
  return n;
}

/**
 * Central spawn eligibility: the time gate plus the first-minute specialist cap.
 * Every spawn path funnels through here — surges cannot bypass it.
 */
export function canSpawnEnemyNow(state: SurvivorState, defId: string): boolean {
  if (!HORDE[defId]) return false;
  if (!isEnemyEligibleAt(defId, state.time)) return false;
  if (isFodderEnemy(defId)) return true;
  if (state.time < FIRST_MINUTE_SPECIALIST_WINDOW) {
    return livingSpecialistCount(state) < FIRST_MINUTE_SPECIALIST_CAP;
  }
  // Past the first minute the time gates alone govern eligibility.
  return true;
}

/**
 * Resolve a requested definition to one that is valid right now.
 * A blocked specialist becomes time-valid fodder so early pressure is preserved
 * rather than silently dropped.
 */
function resolveEligibleDef(state: SurvivorState, defId: string): string {
  if (canSpawnEnemyNow(state, defId)) return defId;
  return rng(state) < 0.72 ? 'basic' : 'mush';
}

function spawnEnemy(state: SurvivorState, defId: string, x: number, z: number): SurvivorEnemy | null {
  if (!HORDE[defId]) return null;
  // Sole choke point for the opening ramp — includes boss summons and director variants.
  defId = resolveEligibleDef(state, defId);
  const def = HORDE[defId];
  if (!def) return null;
  const slot = acquireEnemySlot(state);
  if (!slot) return null;
  const v = def.visual;
  const diff = endlessDifficultyAt(state.time);
  const isMb = !!def.isMiniboss;
  const healthMul = isMb ? MINIBOSS.healthMul : diff.healthMul * (def.isElite ? 1.8 : 1);
  const dmgMul = isMb ? MINIBOSS.damageMul : diff.damageMul;

  slot.id = nextEntityId(state);
  slot.defId = defId;
  slot.x = x;
  slot.z = z;
  slot.vx = 0;
  slot.vz = 0;
  slot.kbX = 0;
  slot.kbZ = 0;
  const hScale = def.healthScale ?? 1;
  slot.health = v.maxHealth * healthMul * hScale;
  slot.maxHealth = slot.health;
  slot.radius = v.colliderRadius * (isMb ? MINIBOSS.radiusMul : def.isElite ? 1.45 : 1.25);
  slot.role = def.role;
  slot.hitFlash = 0;
  slot.attackCd = (0.4 + rng(state) * 0.6) / Math.max(0.6, isMb ? 1 : diff.attackRateMul);
  slot.alive = true;
  slot.isElite = !!def.isElite || isMb;
  slot.isMiniboss = isMb;
  slot.xp = isMb ? MINIBOSS.xp : def.xp;
  slot.windup = 0;
  slot.facingX = -x;
  slot.facingZ = -z;
  slot.healthMul = healthMul;
  slot.damageMul = dmgMul;
  // Role baseSpeed drives movement; speedMul is global difficulty layer.
  slot.speedMul = isMb ? MINIBOSS.speedMul : diff.speedMul;
  slot.contactDamage = def.contactDamage;
  slot.hazardHitCd = 0;
  slot.specialCd = isMb ? 2.5 : 0;
  slot.specialWindup = 0;
  slot.lungeCd = 1.5 + rng(state) * 1.5;
  slot.lungeTimer = 0;
  slot.lungeFx = 0;
  slot.lungeFz = 0;
  slot.interceptTimer = 0;
  slot.interceptX = x;
  slot.interceptZ = z;
  slot.huntMomentum = 0;
  pushEffect(state, 'impact', x, z, 0.25, isMb ? '#ffcc44' : '#ff6688', isMb ? 1.8 : 0.8);
  return slot;
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
  // Elites: larger energy reward (same pickup type, premium visual).
  if (e.isElite && !e.isMiniboss) {
    dropPickup(state, e.x + 0.3, e.z, 'xp', 22, { premium: true });
  }
  if (e.isMiniboss) {
    state.miniboss.alive = false;
    state.miniboss.health = 0;
    dropPickup(state, e.x, e.z + 0.4, 'xp', 55, { premium: true });
    dropPickup(state, e.x - 0.4, e.z, 'repair', 45);
  }
  if (rng(state) < SURVIVOR.repairDropChance) {
    dropPickup(state, e.x + 0.2, e.z - 0.2, 'repair', 18);
  }
}

function isImportantPickup(kind: SurvivorPickup['kind']): boolean {
  return kind === 'repair';
}

function reclaimPickupSlot(state: SurvivorState, preferKind: SurvivorPickup['kind']): SurvivorPickup | null {
  // Prefer inactive slots.
  for (const p of state.pickups) {
    if (!p.active) return p;
  }
  // Coalesce nearby XP when spawning XP.
  if (preferKind === 'xp') {
    return null;
  }
  // Important rewards: reclaim lowest-value XP (never discard repair/supply for XP pressure).
  let worstXp: SurvivorPickup | null = null;
  let worstVal = Infinity;
  for (const p of state.pickups) {
    if (!p.active || p.kind !== 'xp') continue;
    if (p.value < worstVal) {
      worstVal = p.value;
      worstXp = p;
    }
  }
  if (worstXp) {
    worstXp.active = false;
    worstXp.magnetized = false;
    return worstXp;
  }
  return null;
}

function dropPickup(
  state: SurvivorState,
  x: number,
  z: number,
  kind: SurvivorPickup['kind'],
  value: number,
  opts?: { premium?: boolean },
): void {
  const pos = safePickupPosition(x, z);
  // Light deterministic de-stack: nudge if another active pickup shares the exact cell.
  let px = pos.x;
  let pz = pos.z;
  for (const other of state.pickups) {
    if (!other.active) continue;
    if (Math.abs(other.x - px) < 0.05 && Math.abs(other.z - pz) < 0.05) {
      const n = (other.id % 7) + 1;
      px += ((n % 3) - 1) * 0.35;
      pz += (((n / 3) | 0) - 1) * 0.35;
      const re = safePickupPosition(px, pz);
      px = re.x;
      pz = re.z;
      break;
    }
  }

  // Nearby XP coalesce (reliable).
  if (kind === 'xp') {
    let best: SurvivorPickup | null = null;
    let bestD = 2.8 * 2.8;
    for (const p of state.pickups) {
      if (!p.active || p.kind !== 'xp') continue;
      const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
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

  let slot: SurvivorPickup | null = null;
  for (const p of state.pickups) {
    if (!p.active) {
      slot = p;
      break;
    }
  }

  if (!slot) {
    const activeCount = state.pickups.reduce((n, p) => n + (p.active ? 1 : 0), 0);
    const reserve = SURVIVOR.pickupReserveImportant;
    const atHardCap = state.pickups.length >= SURVIVOR.pickupCap;
    const atSoftCap = activeCount >= SURVIVOR.pickupCap - reserve && !isImportantPickup(kind);

    if (atHardCap || atSoftCap) {
      if (kind === 'xp') {
        // Already tried coalesce; reclaim lowest-value XP further away or drop silently.
        let worst: SurvivorPickup | null = null;
        let worstScore = -Infinity;
        for (const p of state.pickups) {
          if (!p.active || p.kind !== 'xp') continue;
          // Prefer reclaiming low value far from player.
          const dist = Math.hypot(p.x - state.player.x, p.z - state.player.z);
          const score = dist / (1 + p.value);
          if (score > worstScore) {
            worstScore = score;
            worst = p;
          }
        }
        if (worst) {
          worst.value += value;
          return;
        }
        return;
      }
      slot = reclaimPickupSlot(state, kind);
      if (!slot) return;
    } else {
      slot = {
        id: 0,
        kind: 'xp',
        x: 0,
        z: 0,
        value: 0,
        active: false,
        magnetized: false,
        life: Infinity,
      };
      state.pickups.push(slot);
    }
  }
  slot.id = nextEntityId(state);
  slot.kind = kind;
  slot.x = px;
  slot.z = pz;
  slot.value = value;
  slot.active = true;
  slot.magnetized = false;
  slot.life = kind === 'repair' ? SURVIVOR.repairPickupLife : Infinity;
  slot.premium = !!opts?.premium;
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
  // An explicit presentation style (e.g. Gunship gold) survives the kill upgrade.
  if (killed && kind !== 'player' && kind !== 'gunship') kind = 'kill';
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
  const isBossSrc =
    source === 'boss' ||
    source.startsWith('boss-');
  if (isBossSrc) mul *= 1 - bossDamageReduction(state);
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
      // Shatter feedback — renderer also collapses the persistent shell.
      pushEffect(state, 'pulse', p.x, p.z, 0.4, '#a8e8ff', 2.4);
      pushEffect(state, 'impact', p.x, p.z, 0.3, '#ffffff', 1.6);
    }
    if (dealt <= 0) {
      p.invuln = Math.min(SURVIVOR.playerInvuln, 0.12);
      return;
    }
  }
  p.health = Math.max(0, p.health - dealt);
  p.hitFlash = 0.15;
  p.invuln = SURVIVOR.playerInvuln;
  p.regenPause = SURVIVOR.regenDamagePause;
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
  const enhanced = potency > 1;
  const base = computeShieldPoints(state.time, state.player.maxHealth);
  const pts = Math.round(base * (enhanced ? SURVIVOR.shieldEnhancedMul : 1));
  // Replace/refresh — never stack shields.
  state.player.shieldMax = pts;
  state.player.shieldPoints = pts;
  state.player.shieldTime = computeShieldDuration(enhanced);
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
    visualRadius: 0.2,
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
    sourceBossId: 0,
    hitPlayer: false,
    splitDone: false,
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
    sourceBossId: 0,
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
  opts?: Partial<Pick<SurvivorHazard, 'owner' | 'armTimer' | 'tickCd' | 'sourceBossId'>>,
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
  h.owner = opts?.owner ?? 'player';
  h.tickCd = opts?.tickCd ?? 0;
  h.armTimer = opts?.armTimer ?? 0;
  h.sourceBossId = opts?.sourceBossId ?? 0;
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
  // Grid density search — average of sparse ring targets collapses to origin and wastes salvoes.
  const cell = 3.2;
  const scores = new Map<string, { weight: number; count: number; sx: number; sz: number }>();
  let bestKey = '';
  let bestW = 0;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const d = (e.x - originX) ** 2 + (e.z - originZ) ** 2;
    if (d > 22 * 22) continue;
    const gx = Math.round(e.x / cell);
    const gz = Math.round(e.z / cell);
    const key = `${gx},${gz}`;
    let s = scores.get(key);
    if (!s) {
      s = { weight: 0, count: 0, sx: 0, sz: 0 };
      scores.set(key, s);
    }
    s.weight += e.isElite || e.isMiniboss ? 3 : 1;
    s.count += 1;
    s.sx += e.x;
    s.sz += e.z;
    if (s.weight > bestW) {
      bestW = s.weight;
      bestKey = key;
    }
  }
  if (bestW <= 0 || !bestKey) {
    const t = nearestEnemy(state, originX, originZ, 22);
    return t
      ? { x: t.x, z: t.z }
      : { x: originX + state.player.facingX * 4, z: originZ + state.player.facingZ * 4 };
  }
  const s = scores.get(bestKey)!;
  return { x: s.sx / s.count, z: s.sz / s.count };
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
    if (dist <= radius + b.colliderRadius) {
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
              b.colliderRadius + width * 0.5,
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
          if (dx * dx + dz * dz <= (radius + b.colliderRadius) ** 2) {
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
        // Launch from player and travel visibly to impact (not materialize on target).
        const travel = 0.28 + i * 0.04;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        const spd = dist / travel;
        resetProj(proj, state, 'rocket', 'rocket', p.x, p.z, (dx / dist) * spd, (dz / dist) * spd, {
          damage: def.damage * (mech ? 1.35 : 1) * p.damageMul,
          radius: 0.25,
          life: travel + 0.08,
          color: state.accent,
          armTimer: travel,
          explodeRadius: (def.radius ?? 1.4) * area * (mech ? 1.2 : 1),
        });
        pushEffect(state, 'muzzle', p.x, p.z, 0.12, state.accent, 0.9);
        pushEffect(state, 'telegraph', tx, tz, travel, state.accent, proj.explodeRadius, {
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
  // Lead the aim by the strike delay so a walking target is still under the beam.
  let pos = leadTargetPosition(aim, def.life ?? 0.8);
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
  proj.visualRadius = opts.visualRadius ?? opts.radius ?? 0.2;
  proj.sourceBossId = opts.sourceBossId ?? 0;
  proj.hitPlayer = opts.hitPlayer ?? false;
  proj.splitDone = opts.splitDone ?? false;
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
      if (dx * dx + dz * dz <= (proj.splash + b.colliderRadius) ** 2) {
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
    // Phase interrupt ends the current attack cleanly (same counters as normal recovery).
    if (b.pattern || b.state === 'active' || b.state === 'windup') {
      b.attacksCompleted += 1;
      b.attacksSinceUnique += 1;
      b.attacksSinceMega += 1;
      b.previousPattern = b.pattern;
    }
    b.state = 'recover';
    b.timer = 0.7;
    b.pattern = null;
    b.telegraphR = 0;
    b.patternTriggered = false;
    b.patternElapsed = 0;
    b.zones = [];
  }
  if (b.health <= 0) {
    onBossDefeated(state, b);
  }
  syncPrimaryBossMirror(state);
}

function onBossDefeated(state: SurvivorState, b: SurvivorBoss): void {
  cancelBossPattern(state, b);
  b.state = 'dead';
  b.timer = 1.2;
  b.active = false;
  state.bossesDefeated += 1;
  if (b.isMega) state.megasDefeated += 1;
  pushEffect(state, 'death', b.x, b.z, 1.2, b.isMega ? '#ff88cc' : '#66e0ff', b.isMega ? 5 : 3.5);
  // Large rewards — never victory
  dropPickup(state, b.x, b.z, 'xp', 80 + b.index * 25 + (b.isMega ? 120 : 0));
  dropPickup(state, b.x + 0.5, b.z, 'repair', 45 + (b.isMega ? 30 : 0));
  dropPickup(state, b.x - 0.5, b.z, 'xp', 70, { premium: true });
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
  // Drain next queued boss index if capacity frees.
  drainPendingBosses(state);
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
    if (proj.kind === 'boss-orb' || proj.kind === 'boss-fan') {
      proj.life -= dt;
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;
      // Arena soft bounds
      if (Math.abs(proj.x) > SURVIVOR.arenaHalf + 2 || Math.abs(proj.z) > SURVIVOR.arenaHalf + 2) {
        proj.active = false;
        continue;
      }
      if (proj.life <= 0) {
        proj.active = false;
        continue;
      }
      const p = state.player;
      if (p.alive && !proj.hitPlayer && p.dodgeActive <= 0) {
        const dx = p.x - proj.x;
        const dz = p.z - proj.z;
        if (dx * dx + dz * dz <= (proj.radius + SURVIVOR.playerRadius) ** 2) {
          damagePlayer(state, proj.damage, 'boss');
          proj.hitPlayer = true;
          if (proj.kind === 'boss-orb') proj.active = false;
        }
      }
      continue;
    }

    if (proj.kind === 'rocket' || proj.kind === 'orbital-marker') {
      // Travel while arming; damage only on impact after armTimer elapses.
      proj.x += proj.vx * dt;
      proj.z += proj.vz * dt;
      proj.armTimer -= dt;
      proj.life -= dt;
      if (proj.kind === 'rocket' && proj.armTimer > 0) {
        if ((proj.id + Math.floor(state.time * 30)) % 3 === 0) {
          pushEffect(state, 'muzzle', proj.x, proj.z, 0.08, proj.color, 0.45);
        }
      }
      if (proj.armTimer > 0 && proj.life > 0) continue;
      const er = proj.explodeRadius || proj.radius;
      pushEffect(
        state,
        proj.kind === 'orbital-marker' ? 'orbital' : 'impact',
        proj.x,
        proj.z,
        0.4,
        proj.color,
        er * 1.4,
        { radius: er },
      );
      if (proj.kind === 'rocket') {
        pushEffect(state, 'pulse', proj.x, proj.z, 0.28, '#fff6d0', er * 0.9, { radius: er * 0.9 });
      }
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
          if (dx * dx + dz * dz <= (proj.radius + bb.colliderRadius) ** 2) {
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
        // Prefer explicit sourceBossId over legacy dynamic property checks.
        const src: DamageSourceKind = proj.sourceBossId > 0 ? 'boss' : 'enemy';
        damagePlayer(state, proj.damage, src);
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
    if (h.armTimer > 0) h.armTimer = Math.max(0, h.armTimer - dt);
    if (h.tickCd > 0) h.tickCd = Math.max(0, h.tickCd - dt);
    if (h.life <= 0) {
      h.active = false;
      continue;
    }
    // Armed delay: not damaging yet
    if (h.armTimer > 0) continue;

    if (h.owner === 'enemy') {
      const p = state.player;
      if (!p.alive || p.invuln > 0 || p.dodgeActive > 0) continue;
      if (h.tickCd > 0) continue;
      const dx = p.x - h.x;
      const dz = p.z - h.z;
      if (dx * dx + dz * dz <= (h.radius + SURVIVOR.playerRadius) ** 2) {
        damagePlayer(state, h.damage, 'boss');
        h.tickCd = 0.45;
      }
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
        if (dx * dx + dz * dz <= (h.radius + b.colliderRadius) ** 2) {
          damageBoss(state, h.damage * 0.7, { boss: b });
        }
      }
    }
  }
}

function contactDamageOf(e: SurvivorEnemy): number {
  return Math.max(4, e.contactDamage * e.damageMul);
}

function enemyBaseSpeed(e: SurvivorEnemy): number {
  const def = HORDE[e.defId];
  return (def?.baseSpeed ?? 4) * e.speedMul;
}

function updateEnemies(state: SurvivorState, dt: number): void {
  const p = state.player;
  const pr = p.form === 'ship' ? SURVIVOR.ship.radius : SURVIVOR.playerRadius;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.hazardHitCd > 0) e.hazardHitCd = Math.max(0, e.hazardHitCd - dt);
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.lungeCd = Math.max(0, e.lungeCd - dt);
    e.interceptTimer = Math.max(0, e.interceptTimer - dt);

    // Knockback first — AI must not cancel same-frame
    const kbMag = Math.hypot(e.kbX, e.kbZ);
    if (kbMag > 0.05) {
      e.x += e.kbX * dt;
      e.z += e.kbZ * dt;
      const damp = Math.exp(-8 * dt);
      e.kbX *= damp;
      e.kbZ *= damp;
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
    let ndx = dx / dist;
    let ndz = dz / dist;
    e.facingX = ndx;
    e.facingZ = ndz;
    const role = e.role;
    const speed = enemyBaseSpeed(e);

    // Elite/hunter: windup (no move) → locked dash → recovery
    if ((role === 'elite' || role === 'hunter') && e.windup > 0) {
      e.windup -= dt;
      // Stand still during windup — telegraph already placed at start.
      if (e.windup <= 0) {
        // Lock direction at windup end; start short dash.
        e.lungeFx = ndx;
        e.lungeFz = ndz;
        e.facingX = ndx;
        e.facingZ = ndz;
        e.lungeTimer = role === 'elite' ? 0.22 : 0.14; // ~3u / ~2u at speeds below
      }
      const c = clampArena(e.x, e.z, e.radius * 0.5);
      e.x = c.x;
      e.z = c.z;
      continue;
    }
    if ((role === 'elite' || role === 'hunter') && e.lungeTimer > 0) {
      e.lungeTimer -= dt;
      const dashSpd = role === 'elite' ? 14 : 12;
      e.x += e.lungeFx * dashSpd * dt;
      e.z += e.lungeFz * dashSpd * dt;
      if (dist < e.radius + pr + 0.2 && e.attackCd <= 0) {
        e.attackCd = 0.9;
        damagePlayer(state, contactDamageOf(e) * (role === 'elite' ? 1.35 : 1.15));
        e.lungeTimer = 0;
        e.lungeCd = role === 'elite' ? 2.6 : 2.2;
      } else if (e.lungeTimer <= 0) {
        e.lungeCd = role === 'elite' ? 2.4 : 2.0; // miss recovery
      }
      const c = clampArena(e.x, e.z, e.radius * 0.5);
      e.x = c.x;
      e.z = c.z;
      continue;
    }

    // Miniboss telegraphed AOE slam (melee only)
    if (e.isMiniboss) {
      e.specialCd = Math.max(0, e.specialCd - dt);
      if (e.specialWindup > 0) {
        e.specialWindup -= dt;
        if (e.specialWindup <= 0) {
          pushEffect(state, 'pulse', e.x, e.z, 0.4, '#ffcc44', MINIBOSS.specialRadius, {
            radius: MINIBOSS.specialRadius,
          });
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (d <= MINIBOSS.specialRadius + pr) {
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
      const adv = e.specialWindup > 0 ? 0.25 : 1;
      e.x += ndx * speed * adv * dt;
      e.z += ndz * speed * adv * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = 1.0;
        damagePlayer(state, contactDamageOf(e));
      }
    } else if (role === 'flanker') {
      // Predict intercept toward player facing direction, recompute periodically.
      if (e.interceptTimer <= 0) {
        const lead = 1.4 + rng(state) * 0.8;
        const side = rng(state) < 0.5 ? 1 : -1;
        e.interceptX = p.x + p.facingX * lead * 2.2 + -p.facingZ * side * (2.5 + rng(state) * 2);
        e.interceptZ = p.z + p.facingZ * lead * 2.2 + p.facingX * side * (2.5 + rng(state) * 2);
        e.interceptTimer = 0.55 + rng(state) * 0.35;
      }
      const ix = e.interceptX - e.x;
      const iz = e.interceptZ - e.z;
      const il = Math.hypot(ix, iz) || 1;
      ndx = ix / il;
      ndz = iz / il;
      e.facingX = ndx;
      e.facingZ = ndz;
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = 0.7;
        damagePlayer(state, contactDamageOf(e));
      }
    } else if (role === 'hunter') {
      e.huntMomentum = Math.min(1, e.huntMomentum + dt * 0.28);
      if (e.lungeCd <= 0 && dist < 5.2 && dist > 1.4) {
        // Windup only — no movement/damage until windup ends.
        e.windup = 0.32;
        e.lungeCd = 99;
        pushEffect(state, 'telegraph', e.x + ndx * 1.1, e.z + ndz * 1.1, 0.32, '#ff6688', 1.0, {
          radius: 0.85,
        });
      }
      const spd = speed * (0.8 + e.huntMomentum * 0.35);
      e.x += ndx * spd * dt;
      e.z += ndz * spd * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = 0.65;
        damagePlayer(state, contactDamageOf(e));
        e.huntMomentum = 0;
      }
    } else if (role === 'elite') {
      if (e.lungeCd <= 0 && dist < 6.5 && dist > 1.6) {
        e.windup = 0.4;
        e.lungeCd = 99;
        pushEffect(state, 'telegraph', e.x + ndx * 1.6, e.z + ndz * 1.6, 0.4, '#ff4466', 1.5, {
          length: 3.2,
          width: 1.0,
          facingX: ndx,
          facingZ: ndz,
        });
      }
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = 0.8;
        damagePlayer(state, contactDamageOf(e));
      }
    } else {
      // fodder / sprinter / bruiser: direct chase
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = role === 'bruiser' ? 0.9 : 0.7;
        damagePlayer(state, contactDamageOf(e));
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
  // Previous position for swept collection (set each frame by movement systems).
  const prevX = (p as { _prevX?: number })._prevX ?? p.x;
  const prevZ = (p as { _prevZ?: number })._prevZ ?? p.z;

  for (const pk of state.pickups) {
    if (!pk.active) continue;

    // Expire ordinary repair orbs (with brief warn window via short remaining life).
    if (pk.kind === 'repair' && Number.isFinite(pk.life)) {
      pk.life -= dt;
      if (pk.life <= 0) {
        pk.active = false;
        pk.magnetized = false;
        pushEffect(state, 'pulse', pk.x, pk.z, 0.25, '#ff88aa', 0.7);
        continue;
      }
    }

    const dx = p.x - pk.x;
    const dz = p.z - pk.z;
    const d2 = dx * dx + dz * dz;

    if (pk.kind === 'xp') {
      if (d2 <= eMag * eMag) pk.magnetized = true;
      if (pk.magnetized) {
        const d = Math.sqrt(d2) || 1;
        const spd = SURVIVOR.xpMagnetSpeed;
        pk.x += (dx / d) * spd * dt;
        pk.z += (dz / d) * spd * dt;
      }
      if (playerCollectsPickup(p.x, p.z, prevX, prevZ, pk.x, pk.z, eDirect)) {
        pk.active = false;
        pk.magnetized = false;
        gainXp(state, pk.value);
        pushEffect(state, 'pickup', pk.x, pk.z, 0.28, '#66ffcc', 0.85);
      }
      continue;
    }

    if (pk.kind === 'repair') {
      // Evaluate current health each pickup — never use a stale frame-level injured flag.
      const missing = p.maxHealth - p.health;
      const canHeal = missing > 0.01;
      if (!canHeal) {
        // Full health: leave orb available; cancel magnetization so it doesn't stick to player.
        pk.magnetized = false;
        continue;
      }
      if (d2 <= hMag * hMag) pk.magnetized = true;
      if (pk.magnetized) {
        const d = Math.sqrt(d2) || 1;
        const spd = SURVIVOR.healthMagnetSpeed;
        pk.x += (dx / d) * spd * dt;
        pk.z += (dz / d) * spd * dt;
      }
      // Re-check after magnet travel — regen may have filled health mid-flight.
      const needNow = p.maxHealth - p.health;
      if (needNow <= 0.01) {
        pk.magnetized = false;
        continue;
      }
      if (playerCollectsPickup(p.x, p.z, prevX, prevZ, pk.x, pk.z, hDirect)) {
        const restored = Math.min(pk.value, needNow);
        if (restored <= 0) {
          pk.magnetized = false;
          continue;
        }
        p.health = Math.min(p.maxHealth, p.health + restored);
        pk.active = false;
        pk.magnetized = false;
        emitDamage(state, `heal:${pk.id}`, p.x, p.z + 1.1, restored, 'heal');
        pushEffect(state, 'heal', p.x, p.z, 0.45, '#ff66cc', 1.8);
        pushEffect(state, 'pulse', p.x, p.z, 0.35, '#e8f4ff', 1.5);
      }
      continue;
    }

  }

}

/**
 * Convert accumulated XP at/over threshold into levels and pending level-up modals.
 *
 * Deliberately phase-independent: a level-up modal opened earlier in the same frame must
 * never cause later collections to be discarded. Only `openPendingLevelUp` reads `phase`.
 */
function settleXpLevels(state: SurvivorState): void {
  // Bounded so a corrupt xpNext can never spin the frame.
  for (let guard = 0; guard < 512; guard += 1) {
    if (!(state.xpNext > 0)) break;
    if (state.xp < state.xpNext) break;
    state.xp -= state.xpNext;
    state.level += 1;
    state.xpNext = xpForLevel(state.level);
    state.pendingLevelUps += 1;
  }
}

/**
 * Sole XP entry point. Always banks the full amount — a collection can never be rejected.
 * Opening the choice modal is a separate concern (`openPendingLevelUp`).
 */
function gainXp(state: SurvivorState, amount: number): void {
  if (!(amount > 0)) return;
  state.xp += amount;
  settleXpLevels(state);
}

/**
 * Open at most one owed level-up when it is safe to do so.
 * Returns true when a modal was opened (caller should yield the rest of the step).
 */
function openPendingLevelUp(state: SurvivorState): boolean {
  if (state.pendingLevelUps <= 0) return false;
  if (state.phase !== 'playing') return false;
  // Let Gravitic Recall finish its visible pull before freezing the sim on a modal.
  if (state.recall.active) return false;
  state.pendingLevelUps -= 1;
  openLevelUp(state);
  return true;
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
  const forcedPrototypes: UpgradeChoice[] = [];
  const freePrototypes: UpgradeChoice[] = [];

  // Guarantee unlock offers once (occupy at most one card later)
  if (state.unlocks.arc && !ownedWeaponLevel(state, 'arc') && !state.unlocks.arcOffered) {
    forcedPrototypes.push({
      kind: 'new-weapon',
      id: 'new-arc-forced',
      title: WEAPONS.arc.name,
      body: 'Prototype unlock · ' + WEAPONS.arc.description,
      weaponId: 'arc',
    });
  }
  if (state.unlocks.orbital && !ownedWeaponLevel(state, 'orbital') && !state.unlocks.orbitalOffered) {
    forcedPrototypes.push({
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
    if (forcedPrototypes.some((c) => c.weaponId === id)) continue;
    freePrototypes.push({
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

  // Mixed-category offers so endless Overclocks never starve passives.
  // Card 1: offensive (new weapon / authored upgrade / overclock / free prototype)
  // Card 2: passive/defensive whenever eligible
  // Card 3: wildcard from remaining
  // Forced prototype may occupy one card but never all three.
  const offensivePool = shuffle([
    ...shuffle(newWeapons),
    ...shuffle(authored),
    ...shuffle(overclocks),
    ...shuffle(freePrototypes),
  ]);
  const passivePool = shuffle(passives);
  const forcedPool = shuffle(forcedPrototypes);

  const choices: UpgradeChoice[] = [];
  const used = new Set<string>();
  const tryAdd = (c: UpgradeChoice | undefined): boolean => {
    if (!c) return false;
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

  const takeFrom = (pool: UpgradeChoice[]): boolean => {
    while (pool.length > 0) {
      if (tryAdd(pool.shift())) return true;
    }
    return false;
  };

  // Optional forced prototype occupies one card (prefer card 1).
  const forced = forcedPool[0];
  if (forced) tryAdd(forced);

  // Card 1: offensive (if forced already filled, skip)
  if (choices.length < 1) takeFrom(offensivePool);

  // Card 2: passive whenever eligible
  if (choices.length < 2) {
    if (!takeFrom(passivePool)) takeFrom(offensivePool);
  }

  // Card 3: wildcard from remaining eligible (mix pools so late game still diversifies)
  if (choices.length < 3) {
    const wild = shuffle([...offensivePool, ...passivePool, ...forcedPool.slice(1)]);
    takeFrom(wild);
  }

  // Deterministic fill: remaining offensive → passives → hard hull plating
  while (choices.length < 3) {
    if (takeFrom(offensivePool)) continue;
    if (takeFrom(passivePool)) continue;
    if (state.weapons[0]) {
      const w = state.weapons[choices.length % state.weapons.length]!;
      const nextLv = w.level + 1;
      const fam = WEAPONS[w.weaponId];
      if (
        tryAdd({
          kind: 'weapon',
          id: `w-fill-${w.weaponId}-${nextLv}-${choices.length}`,
          title: `${fam.name} L${nextLv}`,
          body: weaponDamagePreview(w.weaponId, w.level, nextLv),
          weaponId: w.weaponId,
        })
      ) {
        continue;
      }
    }
    const n = choices.length;
    tryAdd({
      kind: 'passive',
      id: `p-hard-fill-${n}`,
      title: `Hull Plating L${(state.passives['max-health'] ?? 0) + 1}`,
      body: 'Integrity',
      passiveId: 'max-health',
    });
    if (choices.length === n) break;
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

/** Snapshot of permanent Build for regression assertions. */
export function buildFingerprint(state: SurvivorState): string {
  const weps = state.weapons.map((w) => `${w.weaponId}:${w.level}`).sort().join(',');
  const pas = Object.entries(state.passives)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(',');
  return `${weps}|${pas}`;
}

/**
 * Sole production path that permanently raises an owned weapon's level.
 * Only callable while resolving a validated level-up choice card.
 */
function grantWeaponLevelFromChoice(state: SurvivorState, weaponId: WeaponId): boolean {
  if (state.phase !== 'levelup') return false;
  const slot = state.weapons.find((w) => w.weaponId === weaponId);
  if (!slot) return false;
  const offered = state.choices.some(
    (c) => (c.kind === 'weapon' || c.kind === 'new-weapon') && c.weaponId === weaponId,
  );
  if (!offered) return false;
  slot.level += 1;
  return true;
}

/**
 * Sole production path that permanently raises a passive level.
 * Only callable while resolving a validated level-up choice card.
 */
function grantPassiveLevelFromChoice(state: SurvivorState, passiveId: PassiveId): boolean {
  if (state.phase !== 'levelup') return false;
  if (!isPassiveAvailable(passiveId, passiveLevel(state, passiveId))) return false;
  const offered = state.choices.some((c) => c.kind === 'passive' && c.passiveId === passiveId);
  if (!offered) return false;
  const next = (state.passives[passiveId] ?? 0) + 1;
  state.passives[passiveId] = next;
  if (passiveId === 'max-health') {
    const gain = hullPlatingGainAtLevel(next);
    state.player.maxHealth += gain;
    state.player.health += gain;
  }
  return true;
}

/**
 * Sole production path that adds a new weapon slot from a level-up card.
 */
function grantNewWeaponFromChoice(state: SurvivorState, weaponId: WeaponId): boolean {
  if (state.phase !== 'levelup') return false;
  if (state.weapons.some((w) => w.weaponId === weaponId)) return false;
  const offered = state.choices.some((c) => c.kind === 'new-weapon' && c.weaponId === weaponId);
  if (!offered) return false;
  if (isPrototypeWeapon(weaponId)) {
    const protoCount = state.weapons.filter((w) => w.prototype || isPrototypeWeapon(w.weaponId)).length;
    if (protoCount >= SURVIVOR.maxPrototypeSlots) return false;
    state.weapons.push({
      weaponId,
      level: 1,
      cooldown: 0.5,
      focusDebt: 0,
      prototype: true,
    });
    if (weaponId === 'arc') state.unlocks.arcOffered = true;
    if (weaponId === 'orbital') state.unlocks.orbitalOffered = true;
    return true;
  }
  const ordinary = state.weapons.filter((w) => !w.prototype && !isPrototypeWeapon(w.weaponId)).length;
  if (ordinary >= SURVIVOR.maxWeaponSlots) return false;
  state.weapons.push({
    weaponId,
    level: 1,
    cooldown: 0.5,
    focusDebt: 0,
    prototype: false,
  });
  return true;
}

export function applyChoice(state: SurvivorState, index: number): void {
  // Consume the choice set immediately so high-refresh double-input cannot apply twice.
  const choice = state.choices[index];
  const choices = state.choices;
  state.choices = [];
  if (!choice || state.phase !== 'levelup') {
    state.phase = 'playing';
    return;
  }
  // Re-validate index against the captured set only.
  if (choices[index] !== choice) {
    state.phase = 'playing';
    return;
  }

  if (choice.kind === 'weapon' && choice.weaponId) {
    // Temporarily restore choices for grant validators, then clear.
    state.choices = choices;
    grantWeaponLevelFromChoice(state, choice.weaponId);
    state.choices = [];
  } else if (choice.kind === 'new-weapon' && choice.weaponId) {
    state.choices = choices;
    if (state.weapons.some((w) => w.weaponId === choice.weaponId)) {
      grantWeaponLevelFromChoice(state, choice.weaponId);
    } else {
      grantNewWeaponFromChoice(state, choice.weaponId);
    }
    state.choices = [];
  } else if (choice.kind === 'passive' && choice.passiveId) {
    state.choices = choices;
    grantPassiveLevelFromChoice(state, choice.passiveId);
    state.choices = [];
  } else if (choice.kind === 'protocol' && choice.protocolId) {
    applyProtocol(state, choice.protocolId, state.cache.potency);
    state.protocolChoices = [];
    state.phase = 'playing';
    return;
  }
  state.phase = 'playing';
}

export function applyProtocolChoice(state: SurvivorState, index: number): void {
  // Consume once — high-refresh cannot re-select the same protocol frame.
  if (state.phase !== 'protocol') return;
  const choice = state.protocolChoices[index];
  state.protocolChoices = [];
  state.phase = 'playing';
  if (!choice?.protocolId) return;
  applyProtocol(state, choice.protocolId, state.cache.potency);
}

function trackProtocol(state: SurvivorState, id: ProtocolId, remaining: number, potency: number): void {
  const existing = state.protocolActive.find((p) => p.id === id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, remaining);
    existing.potency = Math.max(existing.potency, potency);
  } else {
    state.protocolActive.push({ id, remaining, potency });
  }
}

function applyProtocol(state: SurvivorState, id: ProtocolId, potency: number): void {
  pushEffect(state, 'cache', state.player.x, state.player.z, 0.45, '#ffd46a', 2.4);
  if (id === 'aegis-barrier') {
    applyAegisBarrier(state, potency);
    trackProtocol(state, id, state.player.shieldTime, potency);
  } else if (id === 'gunship-flyby') {
    startGunship(state, potency);
    trackProtocol(state, id, state.gunship.duration, potency);
    pushEffect(state, 'gunship', state.player.x, state.player.z, 0.5, state.accent, 2.2);
  } else if (id === 'gravitic-recall') {
    startGraviticRecall(state);
    trackProtocol(state, id, state.recall.duration, potency);
  }
}

function startGraviticRecall(state: SurvivorState): void {
  // Snapshot only energy orbs alive right now — health orbs and later spawns are never pulled.
  const ids: number[] = [];
  let total = 0;
  for (const pk of state.pickups) {
    if (!pk.active || pk.kind !== 'xp') continue;
    ids.push(pk.id);
    total += pk.value;
    pk.magnetized = true;
  }
  if (state.recall.active) {
    // Re-trigger mid-pull: merge so in-flight orbs still reach the player exactly once.
    for (const id of ids) {
      if (!state.recall.orbIds.includes(id)) state.recall.orbIds.push(id);
    }
    state.recall.t = 0;
    state.recall.totalXp = total;
    return;
  }
  state.recall = {
    active: true,
    t: 0,
    duration: SURVIVOR.recallDuration,
    orbIds: ids,
    totalXp: total,
  };
  pushEffect(state, 'pulse', state.player.x, state.player.z, 0.7, '#aaffee', 18, { radius: 18 });
  pushEffect(state, 'levelup', state.player.x, state.player.z, 0.45, '#66ffcc', 2.5);
}

function updateGraviticRecall(state: SurvivorState, dt: number): void {
  const r = state.recall;
  if (!r.active) return;
  r.t += dt;
  const p = state.player;
  const u = Math.min(1, r.t / r.duration);
  // Ease orbs toward player; collect via normal path when close.
  for (const id of r.orbIds) {
    const pk = state.pickups.find((x) => x.id === id && x.active && x.kind === 'xp');
    if (!pk) continue;
    const dx = p.x - pk.x;
    const dz = p.z - pk.z;
    const d = Math.hypot(dx, dz) || 1;
    // Stream faster as recall progresses (far-map complete within duration).
    const spd = 18 + u * 42;
    pk.x += (dx / d) * spd * dt;
    pk.z += (dz / d) * spd * dt;
    pk.magnetized = true;
  }
  if (r.t >= r.duration) {
    // Final snap-collect remaining recall orbs through gainXp once each.
    for (const id of r.orbIds) {
      const pk = state.pickups.find((x) => x.id === id && x.active && x.kind === 'xp');
      if (!pk) continue;
      pk.active = false;
      pk.magnetized = false;
      gainXp(state, pk.value);
      pushEffect(state, 'pickup', p.x, p.z, 0.2, '#66ffcc', 0.7);
    }
    r.active = false;
    r.orbIds = [];
  }
}

/** Fixture/test helper — activates a Protocol without mutating permanent Build. */
export function forceStartProtocol(state: SurvivorState, id: ProtocolId, potency = 1): void {
  applyProtocol(state, id, potency);
}

/**
 * Gunship originates at the player/cache collection point (on-camera), then flies
 * toward the primary boss or densest cluster and exits at the far arena edge.
 */
function pickGunshipLane(state: SurvivorState): { x0: number; z0: number; x1: number; z1: number } {
  const half = SURVIVOR.arenaHalf * 0.95;
  const ox = state.player.x;
  const oz = state.player.z;
  let tx = ox + state.player.facingX * 12;
  let tz = oz + state.player.facingZ * 12;
  const boss = primaryBoss(state);
  if (boss && boss.active && boss.state !== 'dead') {
    tx = boss.x;
    tz = boss.z;
  } else {
    let bestN = 0;
    let bestX = tx;
    let bestZ = tz;
    for (let gx = -3; gx <= 3; gx += 1) {
      for (let gz = -3; gz <= 3; gz += 1) {
        const sx = gx * (half / 3.5);
        const sz = gz * (half / 3.5);
        let n = 0;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const d2 = (e.x - sx) ** 2 + (e.z - sz) ** 2;
          if (d2 < 64) n += e.isElite || e.isMiniboss ? 3 : 1;
        }
        if (n > bestN) {
          bestN = n;
          bestX = sx;
          bestZ = sz;
        }
      }
    }
    if (bestN > 0) {
      tx = bestX;
      tz = bestZ;
    }
  }
  let dx = tx - ox;
  let dz = tz - oz;
  let len = Math.hypot(dx, dz);
  if (len < 2) {
    dx = state.player.facingX;
    dz = state.player.facingZ;
    len = Math.hypot(dx, dz) || 1;
  }
  dx /= len;
  dz /= len;
  // Exit beyond the target at the arena rim in the fly direction.
  let exitX = ox + dx * half * 2.2;
  let exitZ = oz + dz * half * 2.2;
  const m = Math.max(Math.abs(exitX), Math.abs(exitZ), 1e-6);
  if (m > half) {
    const s = half / m;
    exitX *= s;
    exitZ *= s;
  }
  // Start slightly behind the player so thrusters read on launch.
  const x0 = ox - dx * 1.2;
  const z0 = oz - dz * 1.2;
  return { x0, z0, x1: exitX, z1: exitZ };
}

function startGunship(state: SurvivorState, potency: number): void {
  const lane = pickGunshipLane(state);
  const g = SURVIVOR.gunship;
  // Short engine-ignite hold on camera, then accelerate away.
  const warn = Math.min(g.warnDuration, 0.55);
  const strafe = g.strafeDuration * (potency > 1 ? 1.25 : 1);
  const fx = lane.x1 - lane.x0;
  const fz = lane.z1 - lane.z0;
  const fl = Math.hypot(fx, fz) || 1;
  state.gunship = {
    active: true,
    t: 0,
    duration: warn + strafe,
    warnDuration: warn,
    x0: lane.x0,
    z0: lane.z0,
    x1: lane.x1,
    z1: lane.z1,
    fireCd: 0,
    potency,
    x: lane.x0,
    z: lane.z0,
    facingX: fx / fl,
    facingZ: fz / fl,
    firing: false,
    hitIds: [],
    spawnSuppress: 0,
  };
  const midX = (lane.x0 + lane.x1) / 2;
  const midZ = (lane.z0 + lane.z1) / 2;
  const len = Math.hypot(lane.x1 - lane.x0, lane.z1 - lane.z0);
  // Warning lane only — no damage during warn.
  pushEffect(state, 'telegraph', midX, midZ, warn, state.accent, len, {
    length: len,
    width: g.laneHalfWidth * 2,
    facingX: fx / fl,
    facingZ: fz / fl,
  });
  pushEffect(state, 'gunship', lane.x0, lane.z0, warn + 0.2, state.accent, 2.5);
}


/** Legacy temp-buff applicator retained for fixtures / future cache variants. */
export function applyTempBuff(state: SurvivorState, id: TempBuffId): void {
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
  // Capture pre-move position for swept pickup collection (dodge/ship tunneling).
  (p as { _prevX?: number })._prevX = p.x;
  (p as { _prevZ?: number })._prevZ = p.z;
  if (!p.alive) return;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
  if (p.repulsorCd > 0) p.repulsorCd = Math.max(0, p.repulsorCd - dt);
  if (p.shipCd > 0 && p.form !== 'ship') p.shipCd = Math.max(0, p.shipCd - dt);
  if (p.dodgeCd > 0) p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  if (p.bodyHitCd > 0) p.bodyHitCd = Math.max(0, p.bodyHitCd - dt);
  if (p.exhaustTickCd > 0) p.exhaustTickCd = Math.max(0, p.exhaustTickCd - dt);
  tickTempBuffs(state, dt);

  if (p.regenPause > 0) p.regenPause = Math.max(0, p.regenPause - dt);
  if (p.bossContactCd > 0) p.bossContactCd = Math.max(0, p.bossContactCd - dt);
  const regen = regenPerSecondAtLevel(passiveLevel(state, 'regen'));
  if (regen > 0 && p.regenPause <= 0 && p.health < p.maxHealth && p.form !== 'ship') {
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
  // Deterministic animation flag — dead zone ~0.05, independent of wall clamping.
  p.isMoving = len > 0.05 || p.dodgeActive > 0;
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
    if (back >= 0.25 && back <= len && side <= halfW + b.colliderRadius) {
      damageBoss(state, SURVIVOR.ship.exhaustDamage * thrusterPower(state) * SURVIVOR.ship.exhaustBossMul, {
        kind: 'ability',
        pop: 0.8,
        boss: b,
      });
    }
  }
}

function updatePressureDirector(state: SurvivorState): void {
  if (state.phase !== 'playing') return;
  const s = state.surge;
  const t = state.time;
  if (s.phase === 'normal') {
    if (t >= s.nextSurgeAt) {
      const kinds = ['sprinters', 'pincer', 'bruiser', 'encircle', 'elite', 'flood'];
      let kind = kinds[Math.floor(rng(state) * kinds.length)]!;
      // A surge whose whole identity is gated would just be a fodder wave with a
      // misleading name — roll it forward to an honest early-pressure flood instead.
      const kindLead: Record<string, string> = {
        sprinters: 'fast',
        bruiser: 'bruiser',
        elite: 'elite',
        pincer: 'flyer',
        encircle: 'flyer',
      };
      const lead = kindLead[kind];
      if (lead && !isEnemyEligibleAt(lead, t)) kind = 'flood';
      // Specialist-heavy surges wait out the opening minute entirely.
      if (t < FIRST_MINUTE_SPECIALIST_WINDOW && kind !== 'flood') kind = 'flood';
      s.kind = kind;
      s.phase = 'telegraph';
      s.phaseEndsAt = t + SURVIVOR.surgeTelegraph;
      s.edgeA = Math.floor(rng(state) * 4);
      // Edges are indexed -Z, +Z, -X, +X, so the facing edge is the sibling in the
      // pair: XOR 1. The previous +2 wrap produced a perpendicular edge, not a pincer.
      s.edgeB = s.edgeA ^ 1;
      s.edgeCursor = 0;
      // Perimeter warning
      for (let i = 0; i < 4; i += 1) {
        const pos = edgeSpawnWeighted(state, s.kind);
        pushEffect(state, 'telegraph', pos.x * 0.9, pos.z * 0.9, SURVIVOR.surgeTelegraph, '#ff8866', 2.0, {
          radius: 1.6,
        });
      }
    }
  } else if (s.phase === 'telegraph') {
    if (t >= s.phaseEndsAt) {
      s.phase = 'surge';
      s.phaseEndsAt = t + SURVIVOR.surgeDuration;
    }
  } else if (s.phase === 'surge') {
    if (t >= s.phaseEndsAt) {
      s.phase = 'recovery';
      s.phaseEndsAt = t + SURVIVOR.surgeRecovery;
    }
  } else if (s.phase === 'recovery') {
    if (t >= s.phaseEndsAt) {
      s.phase = 'normal';
      s.kind = '';
      s.nextSurgeAt = t + SURVIVOR.surgeInterval + rng(state) * 8;
    }
  }
}

/** Spawn edge weighted by surge type. */
function edgeSpawnWeighted(state: SurvivorState, kind: string): { x: number; z: number } {
  const h = SURVIVOR.arenaHalf + 1.2;
  let side = Math.floor(rng(state) * 4);
  if (kind === 'pincer') {
    // Alternate per spawn, not per within-frame index, so both jaws actually fill.
    side = state.surge.edgeCursor % 2 === 0 ? state.surge.edgeA : state.surge.edgeB;
    state.surge.edgeCursor += 1;
  } else if (kind === 'encircle') {
    // Step around the perimeter per spawn, not per within-frame index — otherwise a
    // surge that only spawns one enemy per frame always picks the same edge.
    side = state.surge.edgeCursor % 4;
    state.surge.edgeCursor = (state.surge.edgeCursor + 1) % 4;
  } else if (kind !== 'flood') {
    // Prefer ahead of player + flanks (35% ahead, 25% flanks, 40% perimeter)
    const r = rng(state);
    const facingSide =
      Math.abs(state.player.facingX) > Math.abs(state.player.facingZ)
        ? state.player.facingX > 0
          ? 3
          : 2
        : state.player.facingZ > 0
          ? 1
          : 0;
    if (r < 0.35) side = facingSide;
    else if (r < 0.6) side = (facingSide + (rng(state) < 0.5 ? 1 : 3)) % 4;
  }
  const t = (rng(state) * 2 - 1) * h;
  if (side === 0) return { x: t, z: -h };
  if (side === 1) return { x: t, z: h };
  if (side === 2) return { x: -h, z: t };
  return { x: h, z: t };
}

function surgeCompositionBias(state: SurvivorState, baseId: string): string {
  const k = state.surge.kind;
  if (state.surge.phase !== 'surge') return baseId;
  // Every substitution is filtered by eligibility — a surge cannot outrun the gates.
  const bias = (id: string): string | null => (canSpawnEnemyNow(state, id) ? id : null);
  if (k === 'sprinters' && rng(state) < 0.55) {
    return bias(rng(state) < 0.5 ? 'fast' : 'spiky') ?? baseId;
  }
  if (k === 'bruiser' && rng(state) < 0.5) return bias('bruiser') ?? baseId;
  if (k === 'elite' && rng(state) < 0.45) return bias('elite') ?? baseId;
  if (k === 'flood' && rng(state) < 0.65) return rng(state) < 0.5 ? 'basic' : 'mush';
  if (k === 'pincer' || k === 'encircle') {
    // Slightly favor flankers during geometry surges
    if (rng(state) < 0.25) return bias(rng(state) < 0.5 ? 'flyer' : 'bee') ?? baseId;
  }
  return baseId;
}

function updateSpawns(state: SurvivorState, dt: number): void {
  updatePressureDirector(state);
  const diff = endlessDifficultyAt(state.time);
  const alive = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const target = diff.targetActive;
  let rate = diff.spawnRate;
  if (alive < diff.populationMin) rate *= 1.75;
  else if (alive > target) rate *= 0.55;
  if (hasActiveMega(state)) rate *= 0.65;
  else if (aliveBossCount(state) > 0) {
    rate *= state.time >= 40 * 60 ? 1 : 0.85;
  }
  if (state.gunship.spawnSuppress > 0) {
    state.gunship.spawnSuppress = Math.max(0, state.gunship.spawnSuppress - dt);
    rate *= 0.15;
  }
  // Director phase multipliers
  if (state.surge.phase === 'surge') {
    if (state.surge.kind === 'flood') rate *= 1.55;
    else if (state.surge.kind === 'bruiser') rate *= 0.85;
    else rate *= 1.35;
  } else if (state.surge.phase === 'recovery') {
    rate *= 0.6;
  } else if (state.surge.phase === 'telegraph') {
    rate *= 0.9;
  }

  state.spawnAcc += dt * rate;
  let spawnedThisFrame = 0;
  while (state.spawnAcc >= 1 && alive + spawnedThisFrame < state.enemyCap && spawnedThisFrame < 4) {
    state.spawnAcc -= 1;
    const pos = edgeSpawnWeighted(state, state.surge.phase === 'surge' ? state.surge.kind : '');
    let defId = surgeCompositionBias(state, pickComposition(state));
    // Forced elites route through the same eligibility check as everything else.
    if (
      state.surge.phase !== 'recovery' &&
      rng(state) < diff.eliteChance &&
      canSpawnEnemyNow(state, 'elite')
    ) {
      defId = 'elite';
    }
    if (spawnEnemy(state, defId, pos.x, pos.z)) spawnedThisFrame += 1;
  }

  state.eliteTimer -= dt;
  if (
    state.eliteTimer <= 0 &&
    canSpawnEnemyNow(state, 'elite') &&
    state.surge.phase !== 'recovery'
  ) {
    state.eliteTimer = Math.max(8, 20 - state.time / 60) + rng(state) * 10;
    const pos = edgeSpawnWeighted(state, state.surge.kind || '');
    spawnEnemy(state, 'elite', pos.x, pos.z);
  }
}

function hasActiveMega(state: SurvivorState): boolean {
  return state.bosses.some((b) => b.active && b.state !== 'dead' && b.isMega);
}

function enqueueBossIndex(state: SurvivorState, index: number): void {
  if (state.pendingBossIndices.includes(index)) return;
  state.pendingBossIndices.push(index);
  for (const b of state.bosses) {
    if (b.active && b.state !== 'dead') {
      b.breachEmpower += 0.12;
      b.damageMul *= 1.08;
    }
  }
  state.inboundBanner = 2.5;
}

/** Test/fixture helper — queue a boss index through the production FIFO path. */
export function forceEnqueueBossIndex(state: SurvivorState, index: number): void {
  enqueueBossIndex(state, index);
}

function drainPendingBosses(state: SurvivorState): void {
  while (state.pendingBossIndices.length > 0) {
    const next = state.pendingBossIndices[0]!;
    const mega = isMegaBossIndex(next);
    if (mega && hasActiveMega(state)) break;
    if (!mega && aliveBossCount(state) >= SURVIVOR.maxSimultaneousBosses) break;
    state.pendingBossIndices.shift();
    const spawned = spawnBossAtIndex(state, next, true);
    if (!spawned) {
      // Re-queue at front if spawn unexpectedly failed.
      state.pendingBossIndices.unshift(next);
      break;
    }
  }
}

function spawnBossAtIndex(state: SurvivorState, index: number, fromStack = false): SurvivorBoss | null {
  const mega = isMegaBossIndex(index);
  // Mega bypasses ordinary cap (one reserved slot); queue exact index when deferred.
  if (!mega && aliveBossCount(state) >= SURVIVOR.maxSimultaneousBosses) {
    if (!fromStack) enqueueBossIndex(state, index);
    return null;
  }
  if (mega && hasActiveMega(state)) {
    if (!fromStack) enqueueBossIndex(state, index);
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
    // If backlog already exists, append schedule order rather than bypassing older bosses.
    if (state.pendingBossIndices.length > 0) {
      enqueueBossIndex(state, idx);
    } else {
      const spawned = spawnBossAtIndex(state, idx, false);
      if (!spawned) {
        // spawnBossAtIndex already enqueued exact index when deferred
      }
    }
    state.nextBossIndex = idx + 1;
    state.nextBossTime = bossTimeForIndex(state.nextBossIndex);
  }
  // Drain FIFO queue when capacity allows (Mega front blocks ordinary drain).
  drainPendingBosses(state);
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
    const r = SURVIVOR.cacheCollectRadius;
    if (dx * dx + dz * dz <= r * r && state.phase === 'playing') {
      openProtocolCache(state);
    } else if (state.cache.life <= 0 && !state.cache.mega) {
      state.cache.active = false;
    }
  }

  // Protocol active timers (HUD build panel)
  for (const pa of state.protocolActive) pa.remaining -= dt;
  state.protocolActive = state.protocolActive.filter((pa) => pa.remaining > 0);

  updateGraviticRecall(state, dt);

  // Gunship: once-per-target strike when footprint crosses the enemy.
  if (state.gunship.active) {
    const g = state.gunship;
    const cfg = SURVIVOR.gunship;
    g.t += dt;
    const warn = g.warnDuration;
    const strafeT = Math.max(0, g.t - warn);
    const strafeDur = Math.max(0.01, g.duration - warn);
    const u = g.t < warn ? 0 : Math.min(1, strafeT / strafeDur);
    g.x = g.x0 + (g.x1 - g.x0) * u;
    g.z = g.z0 + (g.z1 - g.z0) * u;
    const fxl = g.x1 - g.x0;
    const fzl = g.z1 - g.z0;
    const fl = Math.hypot(fxl, fzl) || 1;
    g.facingX = fxl / fl;
    g.facingZ = fzl / fl;
    g.firing = g.t >= warn && g.t < g.duration;

    if (g.firing) {
      const halfW = cfg.laneHalfWidth * (g.potency > 1 ? 1.15 : 1);
      const pot = g.potency;
      for (const e of state.enemies) {
        if (!e.alive || g.hitIds.includes(e.id)) continue;
        const d = distPointToSegment(e.x, e.z, g.x0, g.z0, g.x1, g.z1);
        const along = Math.hypot(e.x - g.x, e.z - g.z);
        if (d <= halfW + e.radius && along <= cfg.impactRadius + 1.4) {
          g.hitIds.push(e.id);
          // Once-per-target: delete ordinary; fraction miniboss/boss max HP.
          let dmg = e.maxHealth * 1.05;
          if (e.isMiniboss) dmg = e.maxHealth * 0.8 * pot;
          // Single authoritative damage-number path — normal death/reward processing included.
          damageEnemy(state, e, dmg, { kind: 'gunship', pop: 1 });
          pushEffect(state, 'impact', e.x, e.z, 0.28, '#ffd46a', 1.6);
        }
      }
      for (const b of livingBosses(state)) {
        if (!b.active || b.state === 'dead' || g.hitIds.includes(b.id)) continue;
        const d = distPointToSegment(b.x, b.z, g.x0, g.z0, g.x1, g.z1);
        const along = Math.hypot(b.x - g.x, b.z - g.z);
        const br = b.colliderRadius;
        if (d <= halfW + br * 0.5 && along <= cfg.impactRadius + br) {
          g.hitIds.push(b.id);
          const frac = b.isMega ? 0.035 * pot : 0.07 * pot;
          const dmg = b.maxHealth * frac;
          damageBoss(state, dmg, { kind: 'gunship', pop: 1, boss: b, x: b.x, z: b.z });
          pushEffect(state, 'impact', b.x, b.z, 0.35, '#ffd46a', 2.2);
        }
      }
      if (g.hitIds.length > 0 && g.spawnSuppress <= 0) {
        g.spawnSuppress = 1.2;
      }
    }
    if (g.t >= g.duration) {
      g.active = false;
      g.firing = false;
      g.spawnSuppress = Math.max(g.spawnSuppress, 1.0);
    }
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
  // Brief spawn flash — persistent cache actor is owned by the renderer for full lifetime.
  pushEffect(state, 'cache', pick.x, pick.z, 0.55, '#ffd46a', 2.2);
}

function openProtocolCache(state: SurvivorState): void {
  state.cache.active = false;
  state.phase = 'protocol';
  const enhanced = state.cache.potency > 1;
  const shieldPts = Math.round(
    computeShieldPoints(state.time, state.player.maxHealth) *
      (enhanced ? SURVIVOR.shieldEnhancedMul : 1),
  );
  const shieldDur = computeShieldDuration(enhanced);
  let energyOrbs = 0;
  let energyXp = 0;
  for (const pk of state.pickups) {
    if (pk.active && pk.kind === 'xp') {
      energyOrbs += 1;
      energyXp += pk.value;
    }
  }
  state.protocolChoices = PROTOCOLS.map((p) => {
    let body = p.body;
    if (p.id === 'aegis-barrier') {
      body = `Absorb ~${shieldPts} damage for ${Math.round(shieldDur)}s before integrity.${enhanced ? ' Enhanced.' : ''}`;
    } else if (p.id === 'gunship-flyby') {
      body = `Once-per-target corridor strike. Deletes ordinary enemies; dents bosses.${enhanced ? ' Enhanced lane.' : ''}`;
    } else if (p.id === 'gravitic-recall') {
      body =
        energyOrbs > 0
          ? `Recall ${energyXp} energy from ${energyOrbs} orbs.`
          : 'No energy currently on the field.';
    }
    return {
      kind: 'protocol' as const,
      id: `proto-${p.id}`,
      title: p.title,
      body,
      protocolId: p.id,
    };
  });
  pushEffect(state, 'levelup', state.player.x, state.player.z, 0.5, '#ffd46a', 2);
}

function makeBossApi(): BossSimApi {
  return {
    rng,
    pushEffect,
    damagePlayer,
    spawnEnemy,
    acquireProjectile,
    resetProj: (proj, state, kind, weaponId, x, z, vx, vz, opts) =>
      resetProj(proj, state, kind, weaponId, x, z, vx, vz, opts),
    spawnHazard,
    clampArena,
    segmentHit,
  };
}

const bossApi = makeBossApi();

function applyBossBodyContact(state: SurvivorState): void {
  const p = state.player;
  if (!p.alive || p.invuln > 0 || p.dodgeActive > 0 || p.bossContactCd > 0) return;
  const pr = p.form === 'ship' ? SURVIVOR.ship.radius : SURVIVOR.playerRadius;
  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead') continue;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const dist = Math.hypot(dx, dz);
    // Charge pattern uses higher physical tier; avoid double body+charge same frame.
    const charging = b.pattern === 'ravage-charge' && b.state === 'active';
    const hitR = b.colliderRadius + pr + (charging ? 0.35 : 0.05);
    if (dist > hitR) continue;
    const cat: BossDamageCategory = charging ? 'charge' : 'body';
    const dmg = bossCategoryDamage(cat, b.index, b.isMega, b.phase) * b.damageMul;
    damagePlayer(state, dmg, charging ? 'boss-charge' : 'boss-body');
    p.bossContactCd = 0.45;
    // Separation so player is not stuck inside the model.
    const n = dist > 1e-4 ? dist : 1;
    const push = 1.8 + b.colliderRadius * 0.15;
    p.x += (dx / n) * push;
    p.z += (dz / n) * push;
    const c = clampArena(p.x, p.z, pr);
    p.x = c.x;
    p.z = c.z;
    break;
  }
}

function updateBosses(state: SurvivorState, dt: number): void {
  if (state.inboundBanner > 0) state.inboundBanner = Math.max(0, state.inboundBanner - dt);
  for (const b of state.bosses) {
    updateOneBossPatterns(state, b, dt, bossApi);
  }
  applyBossBodyContact(state);
  // Prune long-dead bosses to keep list bounded
  if (state.bosses.length > 8) {
    state.bosses = state.bosses.filter((b) => b.active || b.state !== 'dead' || b.timer > 0);
  }
  syncPrimaryBossMirror(state);
}

/** Test/fixture helper: force a boss into a specific pattern lifecycle. */
export function forceBossIntoPattern(state: SurvivorState, boss: SurvivorBoss, pattern: import('./survivorContent').BossPatternId): void {
  forceBossPattern(state, boss, pattern, bossApi);
}

export function cancelBossCombat(state: SurvivorState, boss: SurvivorBoss): void {
  cancelBossPattern(state, boss);
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
  // Absorb externally-seeded XP (fixtures/tests) then present one owed choice at a time.
  settleXpLevels(state);
  if (openPendingLevelUp(state)) return;

  ensureUnlocksAndCache(state, dt);
  ensureBossSchedule(state);
  updatePlayer(state, input, dt);
  rebuildHash(state);
  fireWeapons(state, dt);
  updateProjectiles(state, dt);
  updateHazards(state, dt);
  updateEnemies(state, dt);
  updateBosses(state, dt);
  updateAttacks(state, dt);
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
