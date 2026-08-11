import { screenToWorldMove } from './screenBasis';
import { SpatialHash } from './spatialHash';
import { HEROES, type HeroId } from '../../content/heroes';
import {
  HORDE,
  MINIBOSS,
  PASSIVES,
  SURVIVOR,
  WEAPONS,
  heroStarterWeapon,
  bossDefForIndex,
  bossDifficultyFor,
  bossPhaseFromHealth,
  bossTimeForIndex,
  compositionAt,
  elitePopulationBudgetAt,
  eliteSpawnIntervalAt,
  endlessDifficultyAt,
  isEnemyEligibleAt,
  mechCooldownAtLevel,
  mechDurationAtLevel,
  mechSpeedBonusAtLevel,
  moveSpeedBonus,
  repairOrbBonusAtLevel,
  isFodderEnemy,
  FIRST_MINUTE_SPECIALIST_WINDOW,
  FIRST_MINUTE_SPECIALIST_CAP,
  hullPlatingGainAtLevel,
  isPassiveAvailable,
  isPrototypeWeapon,
  sharedWeaponIds,
  playerPowerScale,
  PROTOCOLS,
  MEGA_PROTOCOLS,
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
  setPhaseTransitionHandler,
  type BossSimApi,
} from './survivorBossPatterns';
import {
  PLASMA_TRAIL_SAMPLES,
  aliveBossCount,
  emptyBoss,
  emptyEnemy,
  nextEntityId,
  syncPrimaryBossMirror,
  type DamageEvent,
  type SurvivorAlly,
  type SurvivorBoss,
  type SurvivorEnemy,
  type SurvivorHazard,
  type SurvivorPickup,
  type SurvivorProjectile,
  type SurvivorState,
  type SurvivorWeaponSlot,
  type UpgradeChoice,
} from './survivorState';
import {
  makeBossSource,
  makeHordeSource,
  recordCacheChoice,
  recordFormTime,
  recordIncoming,
  recordOutgoing,
  totalOutgoing,
  type DamageSource,
} from './survivorTelemetry';
import {
  cardToChoiceText,
  newWeaponCard,
  passiveCard,
  weaponUpgradeCard,
} from './survivorUpgradeCards';

/** Resolve a boss by entity id for damage attribution. */
function bossById(state: SurvivorState, id: number): SurvivorBoss | null {
  if (!(id > 0)) return null;
  for (const b of state.bosses) {
    if (b.id === id) return b;
  }
  return null;
}

/** Player-facing name for a hazard kind. */
function hazardAttackName(kind: SurvivorHazard['kind']): string {
  switch (kind) {
    case 'contamination':
      return 'Contamination Pool';
    case 'spore':
      return 'Spore Mine';
    case 'fissure':
      return 'Fissure';
    case 'puddle':
      return 'Corrosive Puddle';
    default:
      return 'Hazard';
  }
}

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
  return 1 + moveSpeedBonus(passiveLevel(state, 'move-speed'));
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
  return 1 + passiveLevel(state, 'weapon-haste') * 0.055;
}

function areaMul(state: SurvivorState): number {
  const base = 1 + passiveLevel(state, 'area') * 0.055;
  const mech = state.player.form === 'mech' ? SURVIVOR.mech.weaponAreaMul : 1;
  const titan = state.megaProtocol.titanActive ? SURVIVOR.megaProtocol.titanAreaMul : 1;
  return base * mech * titan;
}

/**
 * Mech cooldown for the current build.
 *
 * Nothing in the run shortens this except Overdrive Systems, whose authored table is
 * hard-capped at L5 (28.0s). Kills, elites, minibosses and bosses deliberately have no
 * effect — that model is what produced near-permanent Mech uptime and it is gone.
 */
export function mechCooldownFor(state: SurvivorState): number {
  return mechCooldownAtLevel(passiveLevel(state, 'overdrive-systems'));
}

/** Mech duration for the current build (Overdrive Systems, hard-capped at 7.0s). */
export function mechDurationFor(state: SurvivorState): number {
  return mechDurationAtLevel(passiveLevel(state, 'overdrive-systems'));
}

/**
 * Mech-only movement multiplier from Overdrive Systems.
 *
 * Multiplicative *after* Thruster Boost, so max/max is `1.30 × 1.15 = 1.495`.
 */
function mechSpeedMul(state: SurvivorState): number {
  return 1 + mechSpeedBonusAtLevel(passiveLevel(state, 'overdrive-systems'));
}

/** Mech readiness 0–1 for the HUD meter. 1 means ready now. */
export function mechReadiness(state: SurvivorState): number {
  const max = state.player.mechCdMax;
  if (max <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - state.player.mechCd / max));
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
  // Elite durability lives entirely in `healthScale` (see `eliteHealthRatio`), so the
  // published 8–12× fodder ratio is readable from the content table rather than being
  // the product of a table value and a hidden multiplier applied here.
  const healthMul = isMb ? MINIBOSS.healthMul : diff.healthMul;
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
  if (def.isElite && !def.isMiniboss) {
    // One authoritative arrival gate. Boss and surge elites also reset it, preventing
    // an ordinary replacement from stacking onto the same instant.
    state.eliteTimer = eliteSpawnIntervalAt(state.time);
  }
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
  slot.slowTimer = 0;
  slot.slowMul = 1;
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
  // Elites: larger energy reward (same pickup type, premium visual).
  if (e.isElite && !e.isMiniboss) {
    state.telemetry.eliteKills += 1;
    dropPickup(state, e.x + 0.3, e.z, 'xp', 22, { premium: true });
  }
  if (e.isMiniboss) {
    state.telemetry.minibossKills += 1;
    state.miniboss.alive = false;
    state.miniboss.health = 0;
    dropPickup(state, e.x, e.z + 0.4, 'xp', 55, { premium: true });
    // Miniboss repair is guaranteed and larger; it never touches the ordinary budget.
    dropPickup(state, e.x - 0.4, e.z, 'repair', SURVIVOR.repair.minibossValue, { premium: true });
    state.repairStats.premiumSpawned += 1;
  }
  // Every enemy death is a tick of the kill-driven budget, whether or not it drops.
  state.repairStats.killsSinceDrop += 1;
  tryOrdinaryRepairDrop(state, e.x + 0.2, e.z - 0.2, threatWeight(e));
}

/**
 * Kill-driven ordinary repair supply (endless-2.8.0).
 *
 * Supply is earned by killing. It is not gated on being hurt, not paced by the
 * wall clock, and not capped at a handful of orbs: a player at full integrity
 * still earns orbs and may leave them on the floor to route back to later.
 *
 * The endless-2.2.1 model was a flat 4% roll per kill, whose flow rate was
 * simply the kill rate, so late-game density turned it into a faucet. Both
 * models here price an orb in *threat-weighted credit* instead, so a trash mob
 * and an elite are not worth the same, and the tap width stays roughly constant
 * as kill rate climbs.
 *
 * Two models are implemented so they can be compared on identical seeds rather
 * than argued about; `SURVIVOR.repair.killDriven.model` selects the live one.
 */
function threatWeight(e: SurvivorEnemy): number {
  const k = SURVIVOR.repair.killDriven;
  if (e.isMiniboss) return k.weightMiniboss;
  if (e.isElite) return k.weightElite;
  return k.weightOrdinary;
}

function tryOrdinaryRepairDrop(state: SurvivorState, x: number, z: number, weight: number): boolean {
  const k = SURVIVOR.repair.killDriven;
  const eco = state.repairEconomy;
  eco.credit += weight;

  if (k.model === 'accumulator') {
    // Credit banks toward a threshold that is re-rolled with seeded variance on
    // every drop, so the cadence is readable without being metronomic.
    if (eco.credit < eco.nextThreshold) return false;
    emitRepairOrb(state, x, z);
    return true;
  }

  // Probability model: a per-kill roll whose odds climb once the drought passes
  // `escalateAfter`, with a hard guarantee so no streak is unbounded.
  let chance = k.baseChancePerWeight * weight;
  if (eco.credit > k.escalateAfter) {
    chance += (eco.credit - k.escalateAfter) * k.escalatePerCredit;
  }
  if (eco.credit >= k.guaranteeAt || rng(state) < chance) {
    emitRepairOrb(state, x, z);
    return true;
  }
  return false;
}

/** Place one ordinary repair orb and reset the economy timers. */
function emitRepairOrb(state: SurvivorState, x: number, z: number): void {
  dropPickup(state, x, z, 'repair', SURVIVOR.repair.value);
  const rs = state.repairStats;
  // Close out the drought that this orb ends, before the counters reset.
  rs.longestTimeDryStreak = Math.max(rs.longestTimeDryStreak, state.repairEconomy.sinceDrop);
  rs.longestKillDryStreak = Math.max(rs.longestKillDryStreak, rs.killsSinceDrop);
  rs.killsSinceDrop = 0;
  rs.ordinarySpawned += 1;
  const eco = state.repairEconomy;
  eco.sinceDrop = 0;
  eco.injuredFor = 0;
  eco.drops += 1;
  eco.credit = 0;
  // Seeded variance keeps the next orb from landing on an exact metronome while
  // remaining fully deterministic for a given seed.
  const k = SURVIVOR.repair.killDriven;
  eco.nextThreshold = k.threshold * (1 + (rng(state) * 2 - 1) * k.thresholdVariance);
}

/**
 * Per-tick repair-economy sampling.
 *
 * Accumulates sums and counts rather than time series, so cost and memory stay
 * constant no matter how long a run lasts.
 */
function sampleRepairStats(state: SurvivorState, dt: number): void {
  const rs = state.repairStats;
  const p = state.player;
  const frac = p.maxHealth > 0 ? p.health / p.maxHealth : 1;
  if (frac < 0.75) rs.timeBelow75 += dt;
  if (frac < 0.5) rs.timeBelow50 += dt;
  if (frac < 0.25) rs.timeBelow25 += dt;

  let active = 0;
  let nearest = Infinity;
  for (const pk of state.pickups) {
    if (!pk.active || pk.kind !== 'repair' || pk.premium) continue;
    active += 1;
    const dx = pk.x - p.x;
    const dz = pk.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < nearest) nearest = d2;
  }
  rs.activeSamples += 1;
  rs.activeSum += active;
  if (active > rs.activePeak) rs.activePeak = active;
  if (active > 0) {
    rs.nearestSamples += 1;
    rs.nearestSum += Math.sqrt(nearest);
  }
}

/**
 * Repair-economy clock.
 *
 * endless-2.8.0 removes the two rules that made ordinary supply feel arbitrary:
 * the injured-only pity timer, which required the player to stay hurt to be
 * eligible, and the late-game time-spawned schedule with its four-orb active
 * cap, which capped supply exactly when kill rate peaked.
 *
 * Nothing here places orbs any more. No kills means no ordinary repair drops,
 * by design; bounded droughts are the kill-driven models' responsibility.
 * `sinceDrop` survives purely as drought telemetry.
 */
function updateRepairEconomy(state: SurvivorState, dt: number): void {
  state.repairEconomy.sinceDrop += dt;
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
  // One world lifetime for every ordinary orb: long enough to be banked and
  // routed back to, short enough that the floor does not accumulate forever.
  slot.life = kind === 'repair'
    ? SURVIVOR.repairPickupLife
    : Infinity;
  slot.premium = !!opts?.premium;
}

/** Telemetry bucket id for a weapon. */
function weaponSrc(id: WeaponId): string {
  return `weapon:${id}`;
}

/** Telemetry bucket id for a player projectile. */
function projSrc(proj: SurvivorProjectile): string {
  if (proj.srcOverride) return proj.srcOverride;
  return proj.weaponId ? weaponSrc(proj.weaponId) : 'weapon:unknown';
}

/** Telemetry bucket id for a player-owned hazard. */
function hazardSrc(h: SurvivorHazard): string {
  if (h.kind === 'wake') return 'ship-wake';
  if (h.kind === 'plasma-wake') return weaponSrc('plasma-wake');
  if (h.kind === 'puddle') return weaponSrc('bioplasma');
  return 'hazard';
}

/**
 * Apply player damage to an ordinary enemy.
 *
 * `opts.src` names the telemetry bucket. Recorded damage is clamped to the health the
 * target actually had, so a 900-damage hit on a 3 HP enemy contributes 3 to the run
 * report — the report measures work done, not numbers printed.
 */
function damageEnemy(
  state: SurvivorState,
  e: SurvivorEnemy,
  dmg: number,
  opts?: { kind?: DamageEvent['kind']; pop?: number; src?: string },
): void {
  if (!e.alive || dmg <= 0) return;
  const before = e.health;
  e.health -= dmg;
  e.hitFlash = 0.1;
  const killed = e.health <= 0;
  let kind: DamageEvent['kind'] = opts?.kind ?? (e.isMiniboss ? 'boss' : 'enemy');
  // An explicit presentation style (e.g. Gunship gold) survives the kill upgrade.
  if (killed && kind !== 'player' && kind !== 'gunship') kind = 'kill';
  emitDamage(state, `e:${e.id}`, e.x, e.z + 0.5, dmg, kind, opts?.pop ?? (killed ? 0.9 : 0.5));
  if (opts?.src) {
    recordOutgoing(state.telemetry, {
      sourceId: opts.src,
      form: state.player.form,
      applied: Math.max(0, Math.min(dmg, before)),
      isBoss: false,
      killed,
    });
  }
  if (e.isMiniboss) {
    state.miniboss.health = Math.max(0, e.health);
  }
  if (killed) killEnemy(state, e);
}

/**
 * Apply hostile damage to the player.
 *
 * Every caller must name its source. That is what makes the death log exact: there is
 * no default and no fallback bucket, so a mechanic cannot kill the player anonymously.
 */
export function damagePlayer(state: SurvivorState, amount: number, source: DamageSource): void {
  const p = state.player;
  if (!p.alive || p.invuln > 0 || p.dodgeActive > 0 || amount <= 0) return;
  let mul = 1;
  if (p.form === 'mech') mul = SURVIVOR.mech.damageTakenMul;
  else if (p.form === 'ship') mul = SURVIVOR.ship.damageTakenMul;
  if (state.megaProtocol.titanActive) mul *= SURVIVOR.megaProtocol.titanDamageTakenMul;
  const isBossSrc = source.kind.startsWith('boss-');
  if (isBossSrc) mul *= 1 - bossDamageReduction(state);
  const mitigated = amount * mul;
  let dealt = mitigated;
  let absorbedTotal = 0;
  // Shield absorbs first
  if (p.shieldPoints > 0 && p.shieldTime > 0) {
    const absorbed = Math.min(p.shieldPoints, dealt);
    p.shieldPoints -= absorbed;
    dealt -= absorbed;
    absorbedTotal = absorbed;
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
      recordIncoming(state.telemetry, {
        time: state.time,
        source,
        raw: amount,
        mitigated,
        shieldAbsorbed: absorbedTotal,
        applied: 0,
        remaining: p.health,
      });
      return;
    }
  }
  p.health = Math.max(0, p.health - dealt);
  p.hitFlash = 0.15;
  p.invuln = SURVIVOR.playerInvuln;
  p.regenPause = SURVIVOR.regenDamagePause;
  // Hit feedback intensity scales with the bite the hit actually took out of the hull,
  // so a fodder tap and an elite lunge do not read identically.
  const severity = Math.min(1, dealt / Math.max(1, p.maxHealth * 0.22));
  p.hitSeverity = Math.max(p.hitSeverity, severity);
  p.hitVignette = Math.max(p.hitVignette, 0.28 + severity * 0.3);
  if (isBossSrc || source.kind === 'elite-lunge' || source.kind === 'miniboss-slam') {
    p.hitShake = Math.max(p.hitShake, 0.18 + severity * 0.35);
  }
  emitDamage(state, 'player', p.x, p.z + 0.8, dealt, 'player');
  const record = recordIncoming(state.telemetry, {
    time: state.time,
    source,
    raw: amount,
    mitigated,
    shieldAbsorbed: absorbedTotal,
    applied: dealt,
    remaining: p.health,
  });
  if (p.health <= 0) {
    p.alive = false;
    p.health = 0;
    state.telemetry.killingBlow = record;
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
  // Aegis is an emergency choice: it buys immediate breathing room in addition to
  // future absorption, while intentionally dealing only token damage.
  state.player.invuln = Math.max(state.player.invuln, SURVIVOR.aegis.invulnOnSelect);
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - state.player.x;
    const dz = e.z - state.player.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist > SURVIVOR.aegis.pulseRadius + e.radius) continue;
    const resistance = e.isMiniboss
      ? SURVIVOR.aegis.pulseMinibossPushMul
      : e.isElite
        ? SURVIVOR.aegis.pulseElitePushMul
        : 1;
    applyKnockback(e, dx / dist, dz / dist, SURVIVOR.aegis.pulsePush * resistance);
    damageEnemy(state, e, SURVIVOR.aegis.pulseDamage, {
      kind: 'ability',
      pop: 0.55,
      src: 'aegis-pulse',
    });
  }
  pushEffect(state, 'repulsor', state.player.x, state.player.z, 0.75, '#9eeeff', SURVIVOR.aegis.pulseRadius, {
    radius: SURVIVOR.aegis.pulseRadius,
  });
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
    fuseDelay: 0,
    srcOverride: null,
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
    x1: 0,
    z1: 0,
    capsule: false,
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
    scaleX: 1,
    scaleZ: 1,
    facingX: 0,
    facingZ: 1,
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
  opts?: Partial<
    Pick<
      SurvivorHazard,
      'owner' | 'armTimer' | 'tickCd' | 'sourceBossId' | 'scaleX' | 'scaleZ' | 'facingX' | 'facingZ' | 'x1' | 'z1' | 'capsule'
    >
  >,
): SurvivorHazard | null {
  const h = acquireHazard(state);
  if (!h) return null;
  h.id = nextEntityId(state);
  h.kind = kind;
  h.x = x;
  h.z = z;
  // Point hazards degenerate to a zero-length capsule at their own position.
  h.capsule = opts?.capsule ?? false;
  h.x1 = opts?.x1 ?? x;
  h.z1 = opts?.z1 ?? z;
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
  h.scaleX = opts?.scaleX ?? 1;
  h.scaleZ = opts?.scaleZ ?? 1;
  h.facingX = opts?.facingX ?? 0;
  h.facingZ = opts?.facingZ ?? 1;
  return h;
}

function nearestEnemy(state: SurvivorState, x: number, z: number, maxR: number): SurvivorEnemy | null {
  hash.query(x, z, maxR, queryBuf);
  let best: SurvivorEnemy | null = null;
  let bestD = maxR * maxR;
  for (let i = 0; i < queryBuf.length; i += 1) {
    const e = enemyAt(state, queryBuf[i]!);
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

/** Ranked, motion-led clusters so a rocket salvo covers threats instead of overkilling one cell. */
function rocketClusterTargets(
  state: SurvivorState,
  originX: number,
  originZ: number,
  count: number,
  lead: number,
): Array<{ x: number; z: number }> {
  const cells = new Map<string, { x: number; z: number; weight: number; count: number }>();
  const cellSize = 4.2;
  for (const e of state.enemies) {
    if (!e.alive || (e.x - originX) ** 2 + (e.z - originZ) ** 2 > 24 ** 2) continue;
    const speed = enemyBaseSpeed(e);
    const fl = Math.hypot(e.facingX, e.facingZ) || 1;
    const x = e.x + (e.facingX / fl) * speed * lead;
    const z = e.z + (e.facingZ / fl) * speed * lead;
    const key = `${Math.round(x / cellSize)},${Math.round(z / cellSize)}`;
    const cell = cells.get(key) ?? { x: 0, z: 0, weight: 0, count: 0 };
    const weight = e.isMiniboss ? 5 : e.isElite ? 3 : 1;
    cell.x += x * weight;
    cell.z += z * weight;
    cell.weight += weight;
    cell.count += 1;
    cells.set(key, cell);
  }
  const ranked = [...cells.values()]
    .sort((a, b) => b.weight - a.weight)
    .map((c) => ({ x: c.x / c.weight, z: c.z / c.weight }));
  if (ranked.length === 0) ranked.push(densestPoint(state, originX, originZ));
  return ranked.slice(0, Math.max(1, count));
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

/**
 * Fitzwilliam aims through the most valuable current line, rather than at one body.
 * Candidate count is bounded so this remains cheap at the 160-enemy cap.
 */
function bestRailDirection(
  state: SurvivorState,
  slot: SurvivorWeaponSlot,
  x: number,
  z: number,
  length: number,
  width: number,
): { fx: number; fz: number } {
  const preferred = selectWeaponTarget(state, slot, x, z, length + 2);
  if (preferred?.kind === 'boss') {
    const d = Math.hypot(preferred.boss.x - x, preferred.boss.z - z) || 1;
    return { fx: (preferred.boss.x - x) / d, fz: (preferred.boss.z - z) / d };
  }
  const candidates = state.enemies
    .filter((e) => e.alive && (e.x - x) ** 2 + (e.z - z) ** 2 <= (length + 2) ** 2)
    .sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2))
    .slice(0, 24);
  if (preferred?.kind === 'enemy' && !candidates.some((e) => e.id === preferred.enemy.id)) {
    candidates.unshift(preferred.enemy);
  }
  let best = { fx: state.player.facingX, fz: state.player.facingZ };
  let bestScore = -1;
  for (const candidate of candidates) {
    const d = Math.hypot(candidate.x - x, candidate.z - z) || 1;
    const fx = (candidate.x - x) / d;
    const fz = (candidate.z - z) / d;
    const x1 = x + fx * length;
    const z1 = z + fz * length;
    let score = 0;
    for (const e of state.enemies) {
      if (!e.alive || !segmentHit(x, z, x1, z1, e.x, e.z, e.radius + width * 0.5)) continue;
      score += e.isMiniboss ? 6 : e.isElite ? 3 : 1;
    }
    for (const b of livingBosses(state)) {
      if (segmentHit(x, z, x1, z1, b.x, b.z, b.colliderRadius + width * 0.5)) score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { fx, fz };
    }
  }
  return best;
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
  const progressionMul = Math.min(
    cfg.maxDamageMul,
    1 + Math.max(0, state.level - 1) * cfg.damagePerPlayerLevel,
  );
  const dmg = cfg.damage * progressionMul * (mech ? cfg.mechDamageMul : 1);
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
    damageEnemy(state, e, dmg, { kind: 'ability', pop: 0.85, src: 'repulsor' });
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
      damageBoss(state, dmg * 0.55, { kind: 'ability', pop: 0.9, boss: b, src: 'repulsor' });
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
  if (p.mechCd > 0) return false;
  const cd = mechCooldownFor(state);
  p.form = 'mech';
  // Set on activation and ticked even while Mech is active: the cycle is
  // activation-to-activation, so 14s of Mech costs ~31s of astronaut/ship time.
  p.mechCd = cd;
  p.mechCdMax = cd;
  p.mechDuration = mechDurationFor(state);
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
  const haste = hasteMul(state);
  const area = areaMul(state);
  if (p.form === 'ship') {
    /*
     * Plasma Wake remains the one authored ship synergy, but it is no longer fired from
     * this loop at all: `updatePlasmaTrails` owns its emission every frame so the trail
     * stays continuous at ship speed. Everything else stays offline.
     */
    for (const slot of state.weapons) {
      if (slot.weaponId === 'plasma-wake') continue;
      slot.cooldown = Math.max(0, slot.cooldown - dt * 0.35);
    }
    return;
  }

  const mech = p.form === 'mech';

  for (const slot of state.weapons) {
    // Trail emission is distance-driven and handled by `updatePlasmaTrails`.
    if (slot.weaponId === 'plasma-wake') continue;
    slot.cooldown = Math.max(0, slot.cooldown - dt);
    if (slot.cooldown > 0) continue;
    const def = wdef(slot.weaponId, slot.level);
    const cadence = def.cadence / haste / (mech ? SURVIVOR.mech.weaponCadenceMul : 1);
    slot.cooldown = cadence;
    const count = def.count;

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
          damage: def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul,
          radius: (def.radius ?? 0.2) * area,
          life: def.life ?? 1,
          pierce: (def.pierce ?? 0) + (mech ? 1 : 0),
          color: state.accent,
        });
      }
      pushEffect(state, 'muzzle', p.x, p.z, 0.08, state.accent, 0.8);
    } else if (slot.weaponId === 'microdrone') {
      const aim = selectWeaponTarget(state, slot, p.x, p.z, 20);
      const pos = targetPosition(aim);
      if (!pos) {
        slot.cooldown = 0.1;
        continue;
      }
      const dx0 = pos.x - p.x;
      const dz0 = pos.z - p.z;
      const dl = Math.hypot(dx0, dz0) || 1;
      const fx = dx0 / dl;
      const fz = dz0 / dl;
      const px = -fz;
      const pz = fx;
      for (let i = 0; i < count; i += 1) {
        const proj = acquireProjectile(state);
        if (!proj) break;
        const spd = def.speed ?? 20;
        const offset = (i - (count - 1) / 2) * (def.width ?? 0.75);
        resetProj(
          proj,
          state,
          'drone',
          'microdrone',
          p.x + px * offset,
          p.z + pz * offset,
          fx * spd,
          fz * spd,
          {
            damage: def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul,
            radius: (def.radius ?? 0.18) * area,
            life: (def.life ?? 1.4) * (mech ? 1.15 : 1),
            homing: false,
            color: state.accent,
          },
        );
      }
    } else if (slot.weaponId === 'rail') {
      for (let i = 0; i < count; i += 1) {
        const length = (def.length ?? 14) * (mech ? 1.15 : 1);
        const width = (def.width ?? 0.5) * area;
        const { fx, fz } = bestRailDirection(state, slot, p.x, p.z, length, width);
        const off = (i - (count - 1) / 2) * 0.35;
        const ox = -fz * off;
        const oz = fx * off;
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
        const dmg = def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (segmentHit(p.x + ox, p.z + oz, x1, z1, e.x, e.z, e.radius + width * 0.5)) {
            damageEnemy(state, e, dmg, { src: weaponSrc('rail') });
            if (e.alive) {
              const push = e.isMiniboss ? 0.8 : e.isElite ? 2.2 : 5.5;
              applyKnockback(e, fx, fz, push);
            }
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
            damageBoss(state, dmg * 0.85, { boss: b, src: weaponSrc('rail') });
          }
        }
      }
    } else if (slot.weaponId === 'gravity') {
      for (let i = 0; i < count; i += 1) {
        const radius = (def.radius ?? 3) * area;
        const aim = selectWeaponTarget(state, slot, p.x, p.z, 14);
        const pos = targetPosition(aim);
        const cx = pos ? pos.x : p.x + state.player.facingX * (2 + i * 0.8);
        const cz = pos ? pos.z : p.z + state.player.facingZ * (2 + i * 0.8);
        pushEffect(state, 'pulse', cx, cz, 0.4, state.accent, radius, { radius });
        const dmg = def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const dx = e.x - cx;
          const dz = e.z - cz;
          if (dx * dx + dz * dz <= (radius + e.radius) ** 2) {
            damageEnemy(state, e, dmg, { src: weaponSrc('gravity') });
            const len = Math.hypot(dx, dz) || 1;
            applyKnockback(e, -dx / len, -dz / len, 0.8);
          }
        }
        for (const b of state.bosses) {
          if (!b.active || b.state === 'dead') continue;
          const dx = b.x - cx;
          const dz = b.z - cz;
          if (dx * dx + dz * dz <= (radius + b.colliderRadius) ** 2) {
            damageBoss(state, dmg * 0.7, { boss: b, src: weaponSrc('gravity') });
          }
        }
      }
    } else if (slot.weaponId === 'rocket') {
      const aim = selectWeaponTarget(state, slot, p.x, p.z, 22);
      const bossPos = targetPosition(aim);
      const travelBase = 0.32;
      const clusters = bossPos && aim?.kind === 'boss'
        ? [bossPos]
        : rocketClusterTargets(state, p.x, p.z, count, travelBase);
      for (let i = 0; i < count; i += 1) {
        const cluster = clusters[i % clusters.length]!;
        const ox = (i - (count - 1) / 2) * 0.9;
        const tx = cluster.x - state.player.facingZ * ox * 0.35 + (rng(state) - 0.5) * 0.3;
        const tz = cluster.z + state.player.facingX * ox * 0.35 + (rng(state) - 0.5) * 0.3;
        const proj = acquireProjectile(state);
        if (!proj) break;
        // Launch from player and travel visibly to impact (not materialize on target).
        const travel = travelBase + i * 0.035;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const dist = Math.hypot(dx, dz) || 1;
        const spd = dist / travel;
        resetProj(proj, state, 'rocket', 'rocket', p.x, p.z, (dx / dist) * spd, (dz / dist) * spd, {
          damage: def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul,
          radius: 0.25,
          life: travel + 0.08,
          color: state.accent,
          armTimer: travel,
          fuseDelay: 0.11,
          explodeRadius: (def.radius ?? 1.4) * area,
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
    } else if (slot.weaponId === 'rotary') {
      const aim = selectWeaponTarget(state, slot, p.x, p.z, 20, { forceBoss: state.time >= 600 });
      const pos = targetPosition(aim);
      if (!pos) {
        slot.cooldown = 0.06;
        continue;
      }
      const a = Math.atan2(pos.x - p.x, pos.z - p.z);
      for (let i = 0; i < count; i += 1) {
        const spread = (i - (count - 1) / 2) * 0.055;
        const proj = acquireProjectile(state);
        if (!proj) break;
        const spd = def.speed ?? 35;
        const barrel = state.nextId % 2 === 0 ? -0.22 : 0.22;
        const sx = p.x - Math.cos(a) * barrel;
        const sz = p.z + Math.sin(a) * barrel;
        resetProj(proj, state, 'rotary-round', 'rotary', sx, sz, Math.sin(a + spread) * spd, Math.cos(a + spread) * spd, {
          damage: def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul,
          radius: (def.radius ?? 0.17) * area,
          life: def.life ?? 1.1,
          pierce: def.pierce ?? 0,
          color: WEAPONS.rotary.color,
        });
        pushEffect(state, 'muzzle', sx, sz, 0.1, '#fff0a8', 0.9);
      }
    } else if (slot.weaponId === 'pulsar') {
      const radius = (def.radius ?? 4) * area;
      for (let pulse = 0; pulse < count; pulse += 1) {
        const pulseDamage = def.damage * (pulse === 0 ? 1 : 0.45) * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul;
        const pulseRadius = radius * (pulse === 0 ? 1 : 0.82);
        pushEffect(state, 'pulse', p.x, p.z, 0.55 + pulse * 0.12, WEAPONS.pulsar.color, pulseRadius, { radius: pulseRadius });
        for (const e of state.enemies) {
          if (!e.alive || (e.x - p.x) ** 2 + (e.z - p.z) ** 2 > (pulseRadius + e.radius) ** 2) continue;
          damageEnemy(state, e, pulseDamage, { src: weaponSrc('pulsar') });
        }
        for (const b of livingBosses(state)) {
          if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 <= (pulseRadius + b.colliderRadius) ** 2) {
            damageBoss(state, pulseDamage * 0.65, { boss: b, src: weaponSrc('pulsar') });
          }
        }
      }
    } else if (slot.weaponId === 'arc') {
      fireArcConductor(state, slot, def, area, mech);
    } else if (slot.weaponId === 'orbital') {
      fireOrbitalLance(state, slot, def, area, mech);
    }
  }
}

/**
 * Ember falloff for a hazard, as a fraction of its authored damage.
 *
 * Only trail capsules burn down; every other hazard is flat. A segment holds full
 * strength for the first `emberStart` of its life and then decays linearly to
 * `emberFloor`, which is simultaneously the visible dissipating tail and the mechanism
 * that keeps a 3.6–4.5s lifetime from multiplying late-game output.
 */
function hazardPotency(h: SurvivorHazard): number {
  if (h.kind !== 'plasma-wake' || h.maxLife <= 0) return 1;
  const cfg = SURVIVOR.plasmaTrail;
  const age = 1 - Math.max(0, Math.min(1, h.life / h.maxLife));
  if (age <= cfg.emberStart) return 1;
  const k = (age - cfg.emberStart) / Math.max(1e-6, 1 - cfg.emberStart);
  return 1 + k * (cfg.emberFloor - 1);
}

/** Per-level integrated-damage normalization for the trail. */
function plasmaDamageNorm(level: number): number {
  const table = SURVIVOR.plasmaTrail.damageNorm;
  const i = Math.max(0, Math.min(table.length - 1, Math.floor(level) - 1));
  return table[i] ?? 1;
}

/** Record where the player is now, for the delayed trail origin. */
function pushTrailSample(state: SurvivorState): void {
  const tr = state.plasmaTrail;
  tr.head = (tr.head + 1) % PLASMA_TRAIL_SAMPLES;
  tr.sx[tr.head] = state.player.x;
  tr.sz[tr.head] = state.player.z;
  tr.st[tr.head] = state.time;
  if (tr.count < PLASMA_TRAIL_SAMPLES) tr.count += 1;
}

/**
 * Where the player was `delay` seconds ago, linearly interpolated between samples.
 *
 * Returns the oldest known position when the ring has not filled yet, so a trail that
 * starts at run begin simply begins at the hero rather than snapping in later.
 */
function delayedTrailPoint(state: SurvivorState, delay: number): { x: number; z: number } {
  const tr = state.plasmaTrail;
  const want = state.time - delay;
  let newer = -1;
  for (let i = 0; i < tr.count; i += 1) {
    const idx = (tr.head - i + PLASMA_TRAIL_SAMPLES * 2) % PLASMA_TRAIL_SAMPLES;
    if (tr.st[idx]! <= want) {
      const older = idx;
      if (newer < 0) return { x: tr.sx[older]!, z: tr.sz[older]! };
      const t0 = tr.st[older]!;
      const t1 = tr.st[newer]!;
      const f = t1 > t0 ? (want - t0) / (t1 - t0) : 0;
      return {
        x: tr.sx[older]! + (tr.sx[newer]! - tr.sx[older]!) * f,
        z: tr.sz[older]! + (tr.sz[newer]! - tr.sz[older]!) * f,
      };
    }
    newer = idx;
  }
  const oldest = (tr.head - Math.max(0, tr.count - 1) + PLASMA_TRAIL_SAMPLES * 2) % PLASMA_TRAIL_SAMPLES;
  return { x: tr.sx[oldest] ?? state.player.x, z: tr.sz[oldest] ?? state.player.z };
}

/** Reset trail anchors so a later emission cannot bridge a discontinuity. */
function resetPlasmaAnchors(state: SurvivorState): void {
  const tr = state.plasmaTrail;
  tr.anchorSet[0] = false;
  tr.anchorSet[1] = false;
  tr.pathAcc[0] = 0;
  tr.pathAcc[1] = 0;
  tr.prevSet = false;
}

/**
 * Lay down the Plasma Wake trail.
 *
 * Runs every frame instead of on the weapon cooldown, because emission is driven by
 * *distance travelled along the delayed path*, not by a timer. Each segment starts
 * exactly where the previous one ended, so the trail is continuous by construction at
 * astronaut, Mech and ship speeds alike — the ship simply produces longer segments
 * rather than gaps.
 */
export function updatePlasmaTrails(state: SurvivorState, dt: number): void {
  const p = state.player;
  const tr = state.plasmaTrail;
  pushTrailSample(state);

  const slot = state.weapons.find((w) => w.weaponId === 'plasma-wake');
  if (!slot || !p.alive) {
    resetPlasmaAnchors(state);
    return;
  }

  const cfg = SURVIVOR.plasmaTrail;
  const def = wdef('plasma-wake', slot.level);
  const ship = p.form === 'ship';
  const mech = p.form === 'mech';

  // Emitter throttle: a floor on how often a piece may be added, independent of frame rate.
  slot.cooldown = Math.max(0, slot.cooldown - dt);

  const head = delayedTrailPoint(state, cfg.delay);
  if (!tr.prevSet) {
    tr.prevX = head.x;
    tr.prevZ = head.z;
    tr.prevSet = true;
  }
  const stepLen = Math.hypot(head.x - tr.prevX, head.z - tr.prevZ);
  tr.prevX = head.x;
  tr.prevZ = head.z;

  // Trail only forms while actually travelling — the 2.6.1 identity is preserved.
  if (!p.isMoving) return;

  const area = areaMul(state);
  const ribbonCount = Math.max(1, def.count);
  const halfWidth =
    (def.radius ?? 1.2) *
    cfg.widthMul *
    area *
    (ship ? cfg.shipWidthMul : 1) *
    (ribbonCount > 1 ? cfg.twinWidthMul : 1);
  const life = def.life ?? 3.6;
  const damage =
    def.damage *
    plasmaDamageNorm(slot.level) *
    (mech ? SURVIVOR.mech.weaponDamageMul : 1) *
    p.damageMul;
  const spacing = Math.max(cfg.minSegmentLength, ship ? cfg.shipSegmentLength : cfg.segmentLength);
  const ribbons = ribbonCount;

  for (let i = 0; i < ribbons; i += 1) {
    tr.pathAcc[i] = (tr.pathAcc[i] ?? 0) + stepLen;
    // Lateral offset for Twin Wake, perpendicular to current heading.
    const off = ribbons > 1 ? (i - (ribbons - 1) / 2) * halfWidth * cfg.twinOffsetMul : 0;
    const ex = head.x - p.facingZ * off;
    const ez = head.z + p.facingX * off;

    if (!tr.anchorSet[i]) {
      tr.anchorX[i] = ex;
      tr.anchorZ[i] = ez;
      tr.anchorSet[i] = true;
      tr.pathAcc[i] = 0;
      continue;
    }
    if (tr.pathAcc[i]! < spacing) continue;
    if (slot.cooldown > 0) continue;

    const ax = tr.anchorX[i]!;
    const az = tr.anchorZ[i]!;
    const seg = spawnHazard(state, 'plasma-wake', ax, az, halfWidth, life, damage, WEAPONS['plasma-wake'].color, {
      capsule: true,
      x1: ex,
      z1: ez,
      facingX: ex - ax,
      facingZ: ez - az,
    });
    // Continuity is structural: the next segment begins where this one ended, whether
    // or not the pool could satisfy this request.
    tr.anchorX[i] = ex;
    tr.anchorZ[i] = ez;
    tr.pathAcc[i] = 0;
    if (seg && i === ribbons - 1) {
      slot.cooldown = Math.max(cfg.minInterval, 0);
      // Sparks at the burning head of the trail.
      pushEffect(state, 'plasma-flare', ex, ez, 0.34, '#ffb34a', halfWidth, {
        radius: halfWidth,
        facingX: ex - ax,
        facingZ: ez - az,
      });
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
  const dmg = def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul;
  const hitIds = new Set<number>();
  let cx = pos.x;
  let cz = pos.z;
  let prevX = p.x;
  let prevZ = p.z;
  // Primary
  if (aim?.kind === 'boss') {
    damageBoss(state, dmg * 1.15, { kind: 'ability', pop: 0.8, boss: aim.boss, src: weaponSrc('arc') });
    hitIds.add(aim.boss.id);
  } else if (aim?.kind === 'enemy') {
    damageEnemy(state, aim.enemy, dmg, { kind: 'ability', pop: 0.7, src: weaponSrc('arc') });
    hitIds.add(aim.enemy.id);
  }
  pushEffect(state, 'arc', prevX, prevZ, 0.34, WEAPONS.arc.color, 1, {
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
    pushEffect(state, 'arc', prevX, prevZ, 0.3, WEAPONS.arc.color, 0.9, {
      facingX: nx - prevX,
      facingZ: nz - prevZ,
      length: Math.hypot(nx - prevX, nz - prevZ),
      width: 0.28,
    });
    if (bestE) {
      damageEnemy(state, bestE, dmg * 0.75, { kind: 'ability', pop: 0.55, src: weaponSrc('arc') });
      hitIds.add(bestE.id);
    } else if (bestB) {
      damageBoss(state, dmg * 0.85, { kind: 'ability', pop: 0.7, boss: bestB, src: weaponSrc('arc') });
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
  area: number,
  mech: boolean,
): void {
  const p = state.player;
  const strikes = def.count;
  const dmg = def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * p.damageMul;
  for (let i = 0; i < strikes; i += 1) {
    // Each lance acquires independently. Judgment Array no longer wastes its second
    // strike on a fixed global-X offset unrelated to the encounter geometry.
    const aim = selectWeaponTarget(state, slot, p.x, p.z, 32, { forceBoss: true });
    let pos = leadTargetPosition(aim, (def.life ?? 0.8) + i * 0.12);
    if (!pos) pos = densestPoint(state, p.x, p.z);
    const tx = pos.x;
    const tz = pos.z;
    const arm = (def.life ?? 0.8) + i * 0.12;
    const radius = (def.radius ?? 2.1) * area;
    pushEffect(state, 'orbital', tx, tz, arm, WEAPONS.orbital.color, radius, { radius });
    pushEffect(state, 'telegraph', tx, tz, arm, '#ffd46a', radius, { radius });
    // Delayed damage via armed rocket-like projectile
    const proj = acquireProjectile(state);
    if (!proj) continue;
    resetProj(proj, state, 'orbital-marker', 'orbital', tx, tz, 0, 0, {
      damage: dmg,
      radius: radius * 0.85,
      life: arm + 0.05,
      armTimer: arm,
      color: WEAPONS.orbital.color,
      explodeRadius: radius,
      // `splash` carries the outer shockwave radius for the two-zone detonation.
      // Reusing the existing pooled field keeps the projectile struct fixed-size.
      splash: radius * SURVIVOR.orbital.shockwaveRadiusMul,
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
  proj.fuseDelay = opts.fuseDelay ?? 0;
  proj.srcOverride = opts.srcOverride ?? null;
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
    damage: def.damage * (mech ? SURVIVOR.mech.weaponDamageMul : 1) * state.player.damageMul,
    radius: (def.radius ?? 0.28) * area,
    life: def.life ?? 1.4,
    color: WEAPONS.bioplasma.color,
    splash: (def.splash ?? 1.3) * area,
    puddleRadius: (def.puddleRadius ?? 1.1) * area,
    puddleLife: def.puddleLife ?? 1.6,
    puddleDamage: (def.puddleDamage ?? 8) * (mech ? SURVIVOR.mech.weaponDamageMul : 1),
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
        damageEnemy(state, e, proj.damage * 0.8, { src: weaponSrc('bioplasma') });
      }
    }
    for (const b of state.bosses) {
      if (!b.active || b.state === 'dead') continue;
      const dx = b.x - hitX;
      const dz = b.z - hitZ;
      if (dx * dx + dz * dz <= (proj.splash + b.colliderRadius) ** 2) {
        damageBoss(state, proj.damage * 0.45, { boss: b, src: weaponSrc('bioplasma') });
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

/** Fortunato converts a direct kill into a readable secondary toxic detonation. */
function toxicKillBurst(state: SurvivorState, proj: SurvivorProjectile, x: number, z: number): void {
  const radius = Math.max(2.15, proj.splash * 1.35);
  const damage = proj.damage * 0.6;
  pushEffect(state, 'toxic-burst', x, z, 0.46, '#76ff68', radius, { radius });
  for (const e of state.enemies) {
    if (!e.alive || (e.x - x) ** 2 + (e.z - z) ** 2 > (radius + e.radius) ** 2) continue;
    damageEnemy(state, e, damage, { kind: 'ability', pop: 0.7, src: weaponSrc('bioplasma') });
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
  opts?: {
    kind?: DamageEvent['kind'];
    pop?: number;
    boss?: SurvivorBoss;
    x?: number;
    z?: number;
    src?: string;
  },
): void {
  if (dmg <= 0) return;
  let b = opts?.boss ?? null;
  if (!b) {
    const x = opts?.x ?? state.player.x;
    const z = opts?.z ?? state.player.z;
    b = nearestAliveBoss(state, x, z);
  }
  if (!b || !b.active || b.state === 'dead') return;
  const before = b.health;
  b.health = Math.max(0, b.health - dmg);
  b.hitFlash = 0.1;
  emitDamage(state, `boss:${b.id}`, b.x, b.z + 1.2, dmg, opts?.kind ?? 'boss', opts?.pop ?? 0.75);
  if (opts?.src) {
    recordOutgoing(state.telemetry, {
      sourceId: opts.src,
      form: state.player.form,
      applied: Math.max(0, Math.min(dmg, before)),
      isBoss: true,
      killed: b.health <= 0,
    });
  }
  const phase = bossPhaseFromHealth(b.health, b.maxHealth);
  if (phase > b.phase) {
    b.phase = phase;
    b.phaseAnnounced = phase;
    pushEffect(state, 'transform', b.x, b.z, 0.9, phase === 3 ? '#ff2244' : '#ff8844', 3.2);
    /*
     * Phase transitions must never make the boss *safer*.
     *
     * endless-2.2.1 dropped the boss straight into `recover` the instant it crossed a
     * threshold. High single-hit damage therefore cancelled live attacks, and enough
     * DPS could cross both thresholds during two separate windups and stun-lock the
     * boss out of ever landing a mechanic — being strong made the fight less dangerous.
     *
     * The current attack now always runs to completion. The transition is deferred and
     * consumed by the pattern state machine when the attack ends, where it plays as a
     * telegraphed, dangerous transition instead of a free safety window.
     */
    b.pendingPhaseTransition = true;
    if (b.state === 'idle' || b.state === 'recover') {
      // Not mid-attack: resolve immediately as a short, visible transition beat.
      resolveBossPhaseTransition(state, b);
    }
  }
  if (b.health <= 0) {
    onBossDefeated(state, b);
  }
  syncPrimaryBossMirror(state);
}

/**
 * Play the deferred phase transition.
 *
 * This is a committed, telegraphed action rather than a recovery gap: the boss emits a
 * damaging shockwave the player must move out of, then returns to its normal cycle
 * with a shortened idle so the next attack arrives promptly.
 */
export function resolveBossPhaseTransition(state: SurvivorState, b: SurvivorBoss): void {
  if (!b.pendingPhaseTransition) return;
  b.pendingPhaseTransition = false;
  if (!b.active || b.state === 'dead') return;
  const radius = 6.5 + b.colliderRadius * 1.5;
  pushEffect(state, 'pulse', b.x, b.z, 0.45, b.phase === 3 ? '#ff2244' : '#ff8844', radius, { radius });
  const p = state.player;
  const d = Math.hypot(p.x - b.x, p.z - b.z);
  if (d <= radius + SURVIVOR.playerRadius) {
    const dmg = bossCategoryDamage('radial', b.index, b.isMega, b.phase) * b.damageMul * 0.85;
    damagePlayer(state, dmg, makeBossSource(b, 'boss-radial', 'Phase Surge'));
  }
  b.state = 'recover';
  // Short — the boss must be attacking again quickly, not standing safe.
  b.timer = 0.45;
  b.pattern = null;
  b.telegraphR = 0;
  b.patternTriggered = false;
  b.patternElapsed = 0;
  b.zones = [];
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
  // Boss repair is guaranteed and larger than any ordinary drop; independent of the budget.
  dropPickup(
    state,
    b.x + 0.5,
    b.z,
    'repair',
    SURVIVOR.repair.bossValue + (b.isMega ? SURVIVOR.repair.megaBonus : 0),
    { premium: true },
  );
  state.repairStats.premiumSpawned += 1;
  dropPickup(state, b.x - 0.5, b.z, 'xp', 70, { premium: true });
  state.telemetry.bossKills.push({
    index: b.index,
    displayName: b.displayName,
    isMega: b.isMega,
    timeToKill: Math.max(0, state.time - b.spawnTime),
    buildDps: totalOutgoing(state.telemetry) / Math.max(0.001, state.telemetry.elapsed),
    heroId: state.heroId,
    form: state.player.form,
  });
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
  // Boss kills deliberately do not refund Mech cooldown in endless-2.3.0.
  // Drain next queued boss index if capacity frees.
  drainPendingBosses(state);
  syncPrimaryBossMirror(state);
}

/**
 * Rebuild the broad-phase.
 *
 * The hash stores **array indices**, not entity ids. endless-2.2.1 stored ids and then
 * resolved each neighbour with a linear scan over `state.enemies`, which made every
 * "bounded" neighbourhood query O(neighbours × enemyCount) — at the 160 cap that is the
 * accidental quadratic inner search. Indices make resolution O(1).
 */
function rebuildHash(state: SurvivorState): void {
  hash.clear();
  for (let i = 0; i < state.enemies.length; i += 1) {
    const e = state.enemies[i]!;
    if (e.alive) hash.insert(i, e.x, e.z);
  }
}

/** Resolve a broad-phase hit to a living enemy, or null. */
function enemyAt(state: SurvivorState, index: number): SurvivorEnemy | null {
  const e = state.enemies[index];
  return e && e.alive ? e : null;
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
          const owner = bossById(state, proj.sourceBossId);
          damagePlayer(
            state,
            proj.damage,
            owner
              ? makeBossSource(owner, 'boss-projectile', proj.kind === 'boss-fan' ? 'Fan Volley' : 'Breach Orb')
              : { kind: 'boss-projectile', displayName: 'Containment Breach', attackName: 'Projectile' },
          );
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
      proj.fuseDelay = Math.max(0, proj.fuseDelay - dt);
      proj.life -= dt;
      if (proj.kind === 'rocket' && proj.armTimer > 0) {
        if ((proj.id + Math.floor(state.time * 30)) % 3 === 0) {
          pushEffect(state, 'muzzle', proj.x, proj.z, 0.08, proj.color, 0.45);
        }
      }
      if (proj.kind === 'rocket' && proj.armTimer > 0 && proj.fuseDelay <= 0) {
        const fuseRadius = Math.max(0.7, proj.explodeRadius * 0.58);
        const nearEnemy = state.enemies.some(
          (e) => e.alive && (e.x - proj.x) ** 2 + (e.z - proj.z) ** 2 <= (fuseRadius + e.radius) ** 2,
        );
        const nearBoss = livingBosses(state).some(
          (b) => (b.x - proj.x) ** 2 + (b.z - proj.z) ** 2 <= (fuseRadius + b.colliderRadius) ** 2,
        );
        if (nearEnemy || nearBoss) proj.armTimer = 0;
      }
      if (proj.armTimer > 0 && proj.life > 0) continue;
      const er = proj.explodeRadius || proj.radius;
      /*
       * Orbital Lance detonates in two concentric zones: the heavy core (`er`) and a
       * wider shockwave (`sr`) at a fraction of the damage. Each target resolves
       * against the core first and is damaged exactly once, so nothing is
       * double-counted and a single boss standing in the core is unaffected by the
       * ring — which is what keeps the single-boss progression benchmark honest.
       */
      const sr = proj.kind === 'orbital-marker' ? proj.splash : 0;
      const shockMul = SURVIVOR.orbital.shockwaveDamageMul;
      pushEffect(
        state,
        proj.kind === 'orbital-marker' ? 'orbital-strike' : 'impact',
        proj.x,
        proj.z,
        0.4,
        proj.color,
        er * 1.4,
        { radius: er },
      );
      if (proj.kind === 'rocket') {
        pushEffect(state, 'pulse', proj.x, proj.z, 0.28, '#fff6d0', er * 0.9, { radius: er * 0.9 });
      } else if (proj.kind === 'orbital-marker') {
        // Core flash, then the expanding shockwave ring at its true damage radius, then
        // a short-lived floor scorch. All three are pooled effects — no new geometry.
        pushEffect(state, 'pulse', proj.x, proj.z, 0.42, '#fff4c8', er * 1.15, { radius: er * 1.15 });
        pushEffect(state, 'orbital-shock', proj.x, proj.z, 0.62, '#ffd46a', sr, { radius: sr });
        pushEffect(state, 'orbital-scorch', proj.x, proj.z, 1.35, '#ff9a3c', er, { radius: er });
      }
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const dx = e.x - proj.x;
        const dz = e.z - proj.z;
        const d2 = dx * dx + dz * dz;
        let dealt = 0;
        if (d2 <= (er + e.radius) ** 2) dealt = proj.damage;
        else if (sr > 0 && d2 <= (sr + e.radius) ** 2) dealt = proj.damage * shockMul;
        if (dealt <= 0) continue;
        damageEnemy(state, e, dealt, { src: projSrc(proj) });
        if (proj.kind === 'rocket' && e.alive) {
          const len = Math.hypot(dx, dz) || 1;
          const push = e.isMiniboss ? 0.35 : e.isElite ? 0.75 : 1.8;
          applyKnockback(e, dx / len, dz / len, push);
        }
      }
      for (const b of state.bosses) {
        if (!b.active || b.state === 'dead') continue;
        const dx = b.x - proj.x;
        const dz = b.z - proj.z;
        const d2 = dx * dx + dz * dz;
        const bossMul = proj.kind === 'orbital-marker' ? 1.1 : 1;
        let dealt = 0;
        if (d2 <= (er + b.colliderRadius) ** 2) dealt = proj.damage * bossMul;
        else if (sr > 0 && d2 <= (sr + b.colliderRadius) ** 2) dealt = proj.damage * bossMul * shockMul;
        if (dealt > 0) damageBoss(state, dealt, { boss: b, src: projSrc(proj) });
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
        const e = enemyAt(state, queryBuf[i]!);
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
        damageEnemy(state, hitEnemy, proj.damage, { src: projSrc(proj) });
        if (proj.kind === 'bioplasma') {
          const hx = hitEnemy.x;
          const hz = hitEnemy.z;
          if (!hitEnemy.alive) toxicKillBurst(state, proj, hx, hz);
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
            damageBoss(state, proj.damage, { boss: bb, src: projSrc(proj) });
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
        const owner = proj.sourceBossId > 0 ? bossById(state, proj.sourceBossId) : null;
        damagePlayer(
          state,
          proj.damage,
          owner
            ? makeBossSource(owner, 'boss-projectile', 'Projectile')
            : { kind: 'hazard', displayName: 'Containment Hazard', attackName: 'Projectile' },
        );
        proj.active = false;
        pushEffect(state, 'impact', proj.x, proj.z, 0.12, '#ff5566', 0.6);
      }
    }
  }
}

/**
 * Squared distance from a point to the segment `(ax,az)-(bx,bz)`.
 *
 * Shared by the capsule collision test and, through `hazardCapsuleFrame`, by the
 * renderer's ribbon geometry — one definition of where a trail segment is.
 */
function pointSegmentDist2(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((px - ax) * vx + (pz - az) * vz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return dx * dx + dz * dz;
}

function hazardHitsPoint(h: SurvivorHazard, x: number, z: number, pointRadius = 0): boolean {
  /*
   * Capsule hazards (Plasma Wake trail segments) are swept segments: the damaging
   * region is everything within `radius` of the segment. This is the same geometry the
   * renderer draws, which is the whole point of the 2.7.0 rebuild — the old ellipse
   * footprint could not represent a connected trail at all.
   */
  if (h.capsule) {
    const r = h.radius + pointRadius;
    return pointSegmentDist2(x, z, h.x, h.z, h.x1, h.z1) <= r * r;
  }
  const fl = Math.hypot(h.facingX, h.facingZ) || 1;
  const fx = h.facingX / fl;
  const fz = h.facingZ / fl;
  const sx = -fz;
  const sz = fx;
  const dx = x - h.x;
  const dz = z - h.z;
  const localSide = dx * sx + dz * sz;
  const localForward = dx * fx + dz * fz;
  const rx = Math.max(0.01, h.radius * h.scaleX + pointRadius);
  const rz = Math.max(0.01, h.radius * h.scaleZ + pointRadius);
  return (localSide * localSide) / (rx * rx) + (localForward * localForward) / (rz * rz) <= 1;
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
        const owner = bossById(state, h.sourceBossId);
        damagePlayer(
          state,
          h.damage,
          owner
            ? makeBossSource(owner, 'boss-puddle', hazardAttackName(h.kind))
            : { kind: 'hazard', displayName: 'Containment Hazard', attackName: hazardAttackName(h.kind) },
        );
        h.tickCd = 0.45;
      }
      continue;
    }

    const potency = hazardPotency(h);
    for (const e of state.enemies) {
      if (!e.alive || e.hazardHitCd > 0) continue;
      if (hazardHitsPoint(h, e.x, e.z, e.radius)) {
        damageEnemy(state, e, h.damage * potency, { src: hazardSrc(h) });
        if (h.kind === 'puddle') {
          e.slowTimer = Math.max(e.slowTimer, 0.7);
          e.slowMul = Math.min(e.slowMul, 0.72);
        }
        e.hazardHitCd = SURVIVOR.ship.wakeTickCd;
      }
    }
    if (h.kind === 'wake' || h.kind === 'plasma-wake') {
      for (const b of state.bosses) {
        if (!b.active || b.state === 'dead' || b.hitFlash > 0.02) continue;
        if (hazardHitsPoint(h, b.x, b.z, b.colliderRadius)) {
          const bossMul = h.kind === 'plasma-wake' ? 0.65 : 0.7;
          damageBoss(state, h.damage * bossMul * potency, { boss: b, src: hazardSrc(h) });
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

/**
 * Crowd analysis scratch.
 *
 * Reused across every enemy and every frame. Allocating a result object per enemy per
 * frame would mean ~9,600 short-lived objects a second at the enemy cap, which is
 * exactly the kind of steady garbage that turns into visible hitching.
 */
const crowd = {
  sepX: 0,
  sepZ: 0,
  /** Neighbours wedged between this enemy and the player. */
  blockers: 0,
  /** Tangential steering to route around the congested front rank. */
  steerX: 0,
  steerZ: 0,
};

/**
 * Analyse one enemy's neighbourhood: separation, front congestion and a lateral
 * bypass direction.
 *
 * Uses the spatial hash with a radius bounded by the enemy's own size, so cost stays
 * proportional to local density rather than to the total population.
 */
function analyseCrowd(state: SurvivorState, e: SurvivorEnemy, toPx: number, toPz: number): void {
  crowd.sepX = 0;
  crowd.sepZ = 0;
  crowd.blockers = 0;
  crowd.steerX = 0;
  crowd.steerZ = 0;
  const reach = e.radius * 3.2;
  hash.query(e.x, e.z, reach, queryBuf);
  for (let i = 0; i < queryBuf.length; i += 1) {
    const o = enemyAt(state, queryBuf[i]!);
    if (!o || o.id === e.id) continue;
    let sdx = e.x - o.x;
    let sdz = e.z - o.z;
    let sd = Math.hypot(sdx, sdz);
    /*
     * Exact or near-exact overlap.
     *
     * Two enemies at the same point have no separation direction, and `sdx/sd` would
     * be NaN. Deriving the direction from the pair's ids gives a stable, deterministic
     * answer that is the same every frame and identical across replays of a seed —
     * random jitter here would make the horde shimmer and break determinism.
     */
    if (sd < 1e-3) {
      const a = ((e.id * 2654435761) ^ (o.id * 40503)) % 6283;
      sdx = Math.cos(a / 1000);
      sdz = Math.sin(a / 1000);
      sd = 1;
    }
    // Enemies occupy space: full radii plus margin, not a token nudge.
    const minD = (e.radius + o.radius) * 1.35;
    if (sd < minD) {
      const push = (minD - sd) / minD;
      crowd.sepX += (sdx / sd) * push;
      crowd.sepZ += (sdz / sd) * push;
    }
    // Is this neighbour in front of us, on the way to the player?
    const ndot = (-sdx * toPx + -sdz * toPz) / Math.max(0.001, sd);
    if (ndot > 0.45 && sd < minD * 1.9) {
      crowd.blockers += 1;
      // Perpendicular bypass, consistently chosen by which side the blocker sits on.
      const side = -sdx * -toPz + -sdz * toPx >= 0 ? 1 : -1;
      crowd.steerX += -toPz * side;
      crowd.steerZ += toPx * side;
    }
  }
}

function updateEnemies(state: SurvivorState, dt: number): void {
  const p = state.player;
  const pr = p.form === 'ship' ? SURVIVOR.ship.radius : SURVIVOR.playerRadius;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    // Older fixtures and in-memory records predate temporary enemy slows. Keep
    // absent values from poisoning movement with `undefined * speed` / NaN.
    if (!Number.isFinite(e.slowTimer)) e.slowTimer = 0;
    if (!Number.isFinite(e.slowMul) || e.slowMul <= 0) e.slowMul = 1;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.hazardHitCd > 0) e.hazardHitCd = Math.max(0, e.hazardHitCd - dt);
    if (e.slowTimer > 0) {
      e.slowTimer = Math.max(0, e.slowTimer - dt);
      if (e.slowTimer <= 0) e.slowMul = 1;
    }
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

    /*
     * Crowd steering.
     *
     * Without this every enemy drives at the same point, the front rank compresses onto
     * the player and movement stops mattering. Enemies behind a congested front now
     * slow down and slide around it, which keeps the horde threatening while leaving
     * readable gaps a skilled player can thread. Minibosses and lunging specialists are
     * excluded so their committed, telegraphed movement stays honest.
     */
    analyseCrowd(state, e, ndx, ndz);
    let advance = 1;
    if (crowd.blockers > 0) {
      // Blocked enemies give up forward drive rather than pushing through each other.
      advance = Math.max(0.3, 1 / (1 + 0.5 * crowd.blockers));
      const sl = Math.hypot(crowd.steerX, crowd.steerZ);
      if (sl > 1e-4) {
        const weight = Math.min(0.85, 0.3 * crowd.blockers);
        const mx = ndx + (crowd.steerX / sl) * weight;
        const mz = ndz + (crowd.steerZ / sl) * weight;
        const ml = Math.hypot(mx, mz) || 1;
        ndx = mx / ml;
        ndz = mz / ml;
      }
    }
    const speed = enemyBaseSpeed(e) * advance * e.slowMul;

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
        e.lungeTimer = role === 'elite' ? SURVIVOR.elite.lungeDash : 0.14;
      }
      const c = clampArena(e.x, e.z, e.radius * 0.5);
      e.x = c.x;
      e.z = c.z;
      continue;
    }
    if ((role === 'elite' || role === 'hunter') && e.lungeTimer > 0) {
      e.lungeTimer -= dt;
      const dashSpd = role === 'elite' ? SURVIVOR.elite.lungeSpeed : 12;
      e.x += e.lungeFx * dashSpd * dt;
      e.z += e.lungeFz * dashSpd * dt;
      if (dist < e.radius + pr + 0.2 && e.attackCd <= 0) {
        e.attackCd = 0.9;
        damagePlayer(
          state,
          contactDamageOf(e) * (role === 'elite' ? SURVIVOR.elite.lungeDamageMul : 1.15),
          makeHordeSource(e, 'Lunge'),
        );
        e.lungeTimer = 0;
        e.lungeCd = role === 'elite' ? SURVIVOR.elite.lungeCooldown : 2.2;
      } else if (e.lungeTimer <= 0) {
        e.lungeCd = role === 'elite' ? SURVIVOR.elite.lungeCooldown * 0.8 : 2.0; // miss recovery
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
            damagePlayer(state, MINIBOSS.specialDamage * e.damageMul, makeHordeSource(e, 'Ground Slam'));
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
        damagePlayer(state, contactDamageOf(e), makeHordeSource(e, 'Contact'));
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
        damagePlayer(state, contactDamageOf(e), makeHordeSource(e, 'Contact'));
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
        damagePlayer(state, contactDamageOf(e), makeHordeSource(e, 'Contact'));
        e.huntMomentum = 0;
      }
    } else if (role === 'elite') {
      /*
       * Elite lunge.
       *
       * The windup is deliberately long enough to see, read and step out of: an elite
       * that has time to commit a mechanic is what makes it feel elite, and a
       * telegraph the player can actually answer is what keeps that fair.
       */
      if (e.lungeCd <= 0 && dist < SURVIVOR.elite.lungeRange && dist > 1.6) {
        e.windup = SURVIVOR.elite.lungeWindup;
        e.lungeCd = 99;
        const reach = SURVIVOR.elite.lungeSpeed * SURVIVOR.elite.lungeDash;
        pushEffect(state, 'telegraph', e.x + ndx * reach * 0.5, e.z + ndz * reach * 0.5, SURVIVOR.elite.lungeWindup, '#ff4466', 1.8, {
          length: reach,
          width: 1.5,
          facingX: ndx,
          facingZ: ndz,
        });
        // Charging shell so the elite reads as winding up even in a dense crowd.
        pushEffect(state, 'shield', e.x, e.z, SURVIVOR.elite.lungeWindup, '#ff6688', 1.6);
      }
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = 0.8;
        damagePlayer(state, contactDamageOf(e), makeHordeSource(e, 'Contact'));
      }
    } else {
      // fodder / sprinter / bruiser: direct chase
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      if (dist < e.radius + pr + 0.05 && e.attackCd <= 0) {
        e.attackCd = role === 'bruiser' ? 0.9 : 0.7;
        damagePlayer(state, contactDamageOf(e), makeHordeSource(e, 'Contact'));
      }
    }

    // Ship body impact
    if (p.form === 'ship' && p.bodyHitCd <= 0) {
      const bdx = e.x - p.x;
      const bdz = e.z - p.z;
      if (bdx * bdx + bdz * bdz <= (e.radius + SURVIVOR.ship.radius) ** 2) {
        damageEnemy(state, e, SURVIVOR.ship.bodyDamage * thrusterPower(state), { src: 'ship-body' });
        if (e.alive && !e.isMiniboss) {
          const len = Math.hypot(bdx, bdz) || 1;
          applyKnockback(e, bdx / len, bdz / len, SURVIVOR.ship.bodyPush);
        }
        p.bodyHitCd = SURVIVOR.ship.bodyTickCd;
      }
    }

    /*
     * Apply the separation computed by `analyseCrowd` above.
     *
     * The displacement is capped per frame so a deep pile-up resolves over several
     * frames instead of teleporting enemies apart, which would read as jitter and
     * could push an enemy through the player.
     */
    if (crowd.sepX !== 0 || crowd.sepZ !== 0) {
      const sl = Math.hypot(crowd.sepX, crowd.sepZ);
      if (sl > 1e-5) {
        const step = Math.min(sl * 0.22, e.radius * 0.45) * (dt * 60);
        if (Number.isFinite(step)) {
          e.x += (crowd.sepX / sl) * step;
          e.z += (crowd.sepZ / sl) * step;
        }
      }
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
        state.repairStats.expired += 1;
        // An orb timing out on a full bar is a designed outcome, not a miss:
        // the player was meant to be able to bank it and chose not to.
        if (p.health >= p.maxHealth - 0.01) state.repairStats.expiredAtFullHealth += 1;
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
        // Nanite Bleed makes every repair orb worth more, so the passive stays
        // attractive even for a player who is rarely alive long enough to regenerate.
        const potency = pk.value * (1 + repairOrbBonusAtLevel(passiveLevel(state, 'regen')));
        const restored = Math.min(potency, needNow);
        if (restored <= 0) {
          pk.magnetized = false;
          continue;
        }
        p.health = Math.min(p.maxHealth, p.health + restored);
        pk.active = false;
        pk.magnetized = false;
        state.telemetry.healedByOrbs += restored;
        // Delivered and overheal are tracked separately so a faucet cannot hide
        // behind face value: `delivered + overheal` always equals orb potency.
        const rs = state.repairStats;
        rs.collected += 1;
        rs.healingDelivered += restored;
        rs.overheal += Math.max(0, potency - restored);
        // Fixed seven-element band array; index 6 absorbs everything past 30min,
        // so elapsed time can never introduce an unbounded key.
        rs.healingByBand[Math.min(6, Math.floor(state.time / 300))] += restored;
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
  // Singularity is itself a short, cinematic Energy recall. Do not cover its anomaly
  // with an upgrade modal mid-collapse; owed choices open immediately after it ends.
  state.pendingLevelUps -= 1;
  openLevelUp(state);
  return true;
}

function ownedWeaponLevel(state: SurvivorState, id: WeaponId): number {
  return state.weapons.find((w) => w.weaponId === id)?.level ?? 0;
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
    const card = newWeaponCard('arc');
    forcedPrototypes.push({
      kind: 'new-weapon',
      id: 'new-arc-forced',
      title: card.name,
      body: cardToChoiceText(card).body,
      card,
      weaponId: 'arc',
    });
  }
  if (state.unlocks.orbital && !ownedWeaponLevel(state, 'orbital') && !state.unlocks.orbitalOffered) {
    const card = newWeaponCard('orbital');
    forcedPrototypes.push({
      kind: 'new-weapon',
      id: 'new-orbital-forced',
      title: card.name,
      body: cardToChoiceText(card).body,
      card,
      weaponId: 'orbital',
    });
  }

  // The signature is exclusive, not a free extra slot. Counting it keeps the established
  // five-weapon build ceiling and prevents a wider shared pool from starving upgrades.
  const ordinaryCount = state.weapons.filter(
    (w) => !w.prototype && !isPrototypeWeapon(w.weaponId),
  ).length;
  if (ordinaryCount < SURVIVOR.maxWeaponSlots) {
    for (const id of sharedWeaponIds()) {
      if (ownedWeaponLevel(state, id) > 0) continue;
      if (isPrototypeWeapon(id)) continue;
      const card = newWeaponCard(id);
      const text = cardToChoiceText(card);
      newWeapons.push({
        kind: 'new-weapon',
        id: `new-${id}`,
        title: text.title,
        body: text.body,
        card,
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
    const card = newWeaponCard(id);
    freePrototypes.push({
      kind: 'new-weapon',
      id: `new-${id}`,
      title: card.name,
      body: cardToChoiceText(card).body,
      card,
      weaponId: id,
    });
  }

  for (const w of state.weapons) {
    const fam = WEAPONS[w.weaponId];
    const nextLv = w.level + 1;
    const card = weaponUpgradeCard(w.weaponId, w.level);
    const text = cardToChoiceText(card);
    const choice: UpgradeChoice = {
      kind: 'weapon',
      id: `w-${w.weaponId}-${nextLv}`,
      title: text.title,
      body: text.body,
      card,
      weaponId: w.weaponId,
    };
    if (w.level < fam.levels.length) authored.push(choice);
    else overclocks.push(choice);
  }

  for (const pas of PASSIVES) {
    const lv = passiveLevel(state, pas.id);
    if (!isPassiveAvailable(pas.id, lv)) continue;
    const next = lv + 1;
    const card = passiveCard(pas.id, lv, state.player.maxHealth);
    passives.push({
      kind: 'passive',
      id: `p-${pas.id}-${next}`,
      title: `${pas.name} L${next}`,
      body: cardToChoiceText(card).body,
      card,
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
  // Selection rates are tracked so Cache balance is driven by what players actually
  // pick rather than by an assumption about which option looks strongest on paper.
  recordCacheChoice(state.telemetry, id, potency > 1);
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
  } else if (id === 'cleanup-crew') {
    startCleanupCrew(state);
    trackProtocol(state, id, SURVIVOR.megaProtocol.titanDuration, potency);
  } else if (id === 'carrier-wing') {
    startCarrierWing(state);
    trackProtocol(state, id, SURVIVOR.megaProtocol.titanDuration, potency);
  } else if (id === 'singularity-engine') {
    startSingularityEngine(state);
    trackProtocol(state, id, SURVIVOR.megaProtocol.titanDuration, potency);
  }
}

function resetMegaProtocol(state: SurvivorState): void {
  if (state.megaProtocol.titanActive && state.player.form === 'mech') {
    state.player.form = 'astronaut';
    state.player.mechDuration = 0;
  }
  state.megaProtocol.id = null;
  state.megaProtocol.remaining = 0;
  state.megaProtocol.elapsed = 0;
  state.megaProtocol.titanActive = false;
  state.megaProtocol.fleetNextPass = 0;
  state.megaProtocol.fleetTelegraphed = 0;
  state.megaProtocol.fleetNextAt = 0;
  state.megaProtocol.fleetDamageDue = [];
  state.megaProtocol.orbIds = [];
  state.megaProtocol.hitIds = [];
  // Replacing or restarting a Titan removes any allied squad immediately.
  state.allies = [];
}

// --------------------------------------------------------------- Cleanup Crew
//
// The third Mega Protocol. Summons the three heroes the player is *not* piloting; they
// arrive in their own ships, deploy as allied Mechs, fight with only their exclusive
// signature weapon for five minutes, then transform back and fly out.
//
// Architecture note: there are no duplicate player states here. An ally is a small
// bounded actor (position, facing, formation slot, one weapon slot, a phase timer). It
// has no health, form, passives, Build, pickups or cooldown bank, it is invulnerable and
// non-colliding, and nothing in the horde or boss code ever reads it — so allies cannot
// block, displace, or divert aggro from anything.

/** The three heroes summoned for a given player hero, in stable order. */
export function cleanupCrewFor(heroId: HeroId): HeroId[] {
  const all: HeroId[] = ['bee', 'flamingo', 'frog', 'red-panda'];
  return all.filter((h) => h !== heroId);
}

/** Telemetry bucket for one ally. */
function allySrc(heroId: HeroId): string {
  return `titan-cleanup:${heroId}`;
}

function startCleanupCrew(state: SurvivorState): void {
  resetMegaProtocol(state);
  const m = state.megaProtocol;
  m.id = 'cleanup-crew';
  m.remaining = SURVIVOR.megaProtocol.titanDuration;

  const cfg = SURVIVOR.megaProtocol.cleanup;
  const crew = cleanupCrewFor(state.heroId);
  state.allies = crew.map((heroId, i) => {
    const slotAngle = (i / crew.length) * Math.PI * 2 + Math.PI / 6;
    // Ships enter from off-arena, each on its own bearing, so arrivals read as three
    // distinct transports rather than one blob.
    const shipX = state.player.x + Math.cos(slotAngle) * cfg.shipEntryDistance;
    const shipZ = state.player.z + Math.sin(slotAngle) * cfg.shipEntryDistance;
    const ally: SurvivorAlly = {
      id: nextEntityId(state),
      heroId,
      phase: 'arriving',
      phaseTimer: cfg.arriveDuration,
      delay: i * cfg.arriveStagger,
      x: shipX,
      z: shipZ,
      facingX: -Math.cos(slotAngle),
      facingZ: -Math.sin(slotAngle),
      slotAngle,
      slot: {
        weaponId: heroStarterWeapon(heroId),
        level: cfg.weaponLevel,
        cooldown: cfg.arriveDuration + i * cfg.arriveStagger,
        focusDebt: 0,
        prototype: false,
      },
      shipX,
      shipZ,
      active: true,
    };
    return ally;
  });

  pushEffect(state, 'titan-deploy', state.player.x, state.player.z, 1.8, '#9ef0ff', 7.5, { radius: 7.5 });
}

/** Formation slot for an ally: a loose ring around the player, not a rigid lattice. */
function allyFormationPoint(state: SurvivorState, a: SurvivorAlly): { x: number; z: number } {
  const cfg = SURVIVOR.megaProtocol.cleanup;
  // Slow deterministic drift keeps the squad alive-looking without random jitter.
  const drift = Math.sin(state.time * 0.6 + a.slotAngle * 2) * 0.35;
  const ang = a.slotAngle + drift;
  return {
    x: state.player.x + Math.cos(ang) * cfg.formationRadius,
    z: state.player.z + Math.sin(ang) * cfg.formationRadius,
  };
}

/** Tear the squad down completely. Safe to call repeatedly. */
function clearCleanupCrew(state: SurvivorState): void {
  state.allies = [];
}

/** Begin the visible departure sequence for every ally. */
function departCleanupCrew(state: SurvivorState): void {
  const cfg = SURVIVOR.megaProtocol.cleanup;
  for (const a of state.allies) {
    if (!a.active || a.phase === 'departing') continue;
    a.phase = 'departing';
    a.phaseTimer = cfg.departDuration;
    a.delay = 0;
    // Exit along the bearing it arrived on.
    a.shipX = state.player.x + Math.cos(a.slotAngle) * cfg.shipEntryDistance;
    a.shipZ = state.player.z + Math.sin(a.slotAngle) * cfg.shipEntryDistance;
    pushEffect(state, 'titan-deploy', a.x, a.z, 0.75, '#9ef0ff', 3.4, { radius: 3.4 });
  }
}

function updateCleanupCrew(state: SurvivorState, dt: number): void {
  const cfg = SURVIVOR.megaProtocol.cleanup;
  const m = state.megaProtocol;
  if (m.remaining <= 0) departCleanupCrew(state);

  for (const a of state.allies) {
    if (!a.active) continue;
    if (a.delay > 0) {
      a.delay = Math.max(0, a.delay - dt);
      continue;
    }
    a.phaseTimer = Math.max(0, a.phaseTimer - dt);

    if (a.phase === 'arriving') {
      // Transport run: fly the ship in and set the Mech down at the formation slot.
      const target = allyFormationPoint(state, a);
      const u = 1 - a.phaseTimer / cfg.arriveDuration;
      a.x = a.shipX + (target.x - a.shipX) * u;
      a.z = a.shipZ + (target.z - a.shipZ) * u;
      const dx = target.x - a.x;
      const dz = target.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      a.facingX = dx / len;
      a.facingZ = dz / len;
      if (a.phaseTimer <= 0) {
        a.phase = 'active';
        // Deployment flash: the ship transforms into the Mech.
        pushEffect(state, 'transform', a.x, a.z, 0.75, '#9ef0ff', 3.0);
        pushEffect(state, 'pulse', a.x, a.z, 0.55, '#d8f6ff', 4.2, { radius: 4.2 });
        pushEffect(state, 'impact', a.x, a.z, 0.3, '#ffffff', 2.0);
      }
      continue;
    }

    if (a.phase === 'departing') {
      const u = 1 - a.phaseTimer / cfg.departDuration;
      const fromX = a.x;
      const fromZ = a.z;
      void fromX;
      void fromZ;
      a.x += (a.shipX - a.x) * Math.min(1, dt * 3.2 + u * 0.02);
      a.z += (a.shipZ - a.z) * Math.min(1, dt * 3.2 + u * 0.02);
      const dx = a.shipX - a.x;
      const dz = a.shipZ - a.z;
      const len = Math.hypot(dx, dz) || 1;
      a.facingX = dx / len;
      a.facingZ = dz / len;
      if (a.phaseTimer <= 0) a.active = false;
      continue;
    }

    // Active: hold a readable loose formation and fire the signature weapon.
    const target = allyFormationPoint(state, a);
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const step = Math.min(d, cfg.followSpeed * dt);
      a.x += (dx / d) * step;
      a.z += (dz / d) * step;
    }
    const clamped = clampArena(a.x, a.z, 1.2);
    a.x = clamped.x;
    a.z = clamped.z;

    a.slot.cooldown = Math.max(0, a.slot.cooldown - dt);
    if (a.slot.cooldown <= 0) fireAllySignature(state, a);
  }

  if (state.allies.length > 0 && state.allies.every((a) => !a.active)) clearCleanupCrew(state);
}

/**
 * Fire one ally's exclusive signature weapon.
 *
 * Mechanics and presentation are the authored L5 behaviour of that hero's signature —
 * Boswell's directional drones, Fitzwilliam's optimised piercing rail lines, Fortunato's
 * bursting toxic globs, Rutherford's cluster-led proximity rockets — but damage and
 * cadence are re-based by the Titan coefficients so three allies are a squad, not three
 * extra maxed players.
 */
function fireAllySignature(state: SurvivorState, a: SurvivorAlly): void {
  const cfg = SURVIVOR.megaProtocol.cleanup;
  const def = wdef(a.slot.weaponId, a.slot.level);
  const power = playerPowerScale({ weapons: state.weapons, passives: state.passives });
  const dmg = def.damage * cfg.damageMul * power;
  const src = allySrc(a.heroId);
  const accent = HEROES[a.heroId].accent;
  a.slot.cooldown = def.cadence * cfg.cadenceMul;

  const aim = selectWeaponTarget(state, a.slot, a.x, a.z, 20);
  const pos = targetPosition(aim);
  if (pos) {
    const fdx = pos.x - a.x;
    const fdz = pos.z - a.z;
    const flen = Math.hypot(fdx, fdz) || 1;
    a.facingX = fdx / flen;
    a.facingZ = fdz / flen;
  }

  if (a.slot.weaponId === 'microdrone') {
    // Boswell: directional drone formation, homing.
    if (!pos) {
      a.slot.cooldown = 0.2;
      return;
    }
    const base = Math.atan2(pos.x - a.x, pos.z - a.z);
    for (let i = 0; i < def.count; i += 1) {
      const proj = acquireProjectile(state);
      if (!proj) break;
      const ang = base + (i - (def.count - 1) / 2) * 0.16;
      const spd = def.speed ?? 17;
      resetProj(proj, state, 'drone', 'microdrone', a.x, a.z, Math.sin(ang) * spd, Math.cos(ang) * spd, {
        damage: dmg,
        radius: (def.radius ?? 0.18) * 1.1,
        life: def.life ?? 1.4,
        homing: true,
        color: accent,
        srcOverride: src,
      });
      proj.owner = 'player';
    }
    pushEffect(state, 'muzzle', a.x, a.z, 0.12, accent, 1.0);
    return;
  }

  if (a.slot.weaponId === 'rail') {
    // Fitzwilliam: optimised piercing lines through the most valuable lane.
    const length = def.length ?? 14;
    const width = (def.width ?? 0.5) * 1.1;
    const { fx, fz } = bestRailDirection(state, a.slot, a.x, a.z, length, width);
    for (let i = 0; i < def.count; i += 1) {
      const off = (i - (def.count - 1) / 2) * 0.4;
      const ox = -fz * off;
      const oz = fx * off;
      const x1 = a.x + ox + fx * length;
      const z1 = a.z + oz + fz * length;
      state.rails.push({ x0: a.x + ox, z0: a.z + oz, x1, z1, life: 0.22, color: accent });
      pushEffect(state, 'rail', a.x + ox, a.z + oz, 0.25, accent, length, {
        facingX: fx,
        facingZ: fz,
        length,
        width,
      });
      for (const e of state.enemies) {
        if (!e.alive) continue;
        if (segmentHit(a.x + ox, a.z + oz, x1, z1, e.x, e.z, e.radius + width * 0.5)) {
          damageEnemy(state, e, dmg, { src });
          if (e.alive) applyKnockback(e, fx, fz, e.isMiniboss ? 0.8 : e.isElite ? 2.2 : 5.5);
        }
      }
      for (const b of livingBosses(state)) {
        if (segmentHit(a.x + ox, a.z + oz, x1, z1, b.x, b.z, b.colliderRadius + width * 0.5)) {
          damageBoss(state, dmg * cfg.bossMul, { boss: b, src });
        }
      }
    }
    return;
  }

  if (a.slot.weaponId === 'bioplasma') {
    // Fortunato: toxic globs that splash and leave corrosive residue.
    if (!pos) {
      a.slot.cooldown = 0.2;
      return;
    }
    for (let i = 0; i < def.count; i += 1) {
      const ang = Math.atan2(pos.x - a.x, pos.z - a.z) + (i - (def.count - 1) / 2) * 0.1;
      const proj = acquireProjectile(state);
      if (!proj) break;
      const spd = def.speed ?? 16;
      resetProj(proj, state, 'bioplasma', 'bioplasma', a.x, a.z, Math.sin(ang) * spd, Math.cos(ang) * spd, {
        damage: dmg,
        radius: def.radius ?? 0.28,
        life: def.life ?? 1.4,
        color: WEAPONS.bioplasma.color,
        splash: def.splash ?? 1.3,
        puddleRadius: def.puddleRadius ?? 1.1,
        puddleLife: def.puddleLife ?? 1.6,
        puddleDamage: (def.puddleDamage ?? 6) * cfg.damageMul * power,
        bounceLeft: def.bounce ?? 0,
        splitOnHit: def.split ?? 0,
        srcOverride: src,
      });
    }
    pushEffect(state, 'muzzle', a.x, a.z, 0.12, WEAPONS.bioplasma.color, 1.0);
    return;
  }

  // Rutherford: distributed cluster-leading proximity-fused mini-rockets.
  const travelBase = 0.32;
  const clusters = aim?.kind === 'boss' && pos ? [pos] : rocketClusterTargets(state, a.x, a.z, def.count, travelBase);
  for (let i = 0; i < def.count; i += 1) {
    const cluster = clusters[i % clusters.length]!;
    const ox = (i - (def.count - 1) / 2) * 0.9;
    const tx = cluster.x - a.facingZ * ox * 0.35;
    const tz = cluster.z + a.facingX * ox * 0.35;
    const proj = acquireProjectile(state);
    if (!proj) break;
    const travel = travelBase + i * 0.035;
    const ddx = tx - a.x;
    const ddz = tz - a.z;
    const dist = Math.hypot(ddx, ddz) || 1;
    const spd = dist / travel;
    resetProj(proj, state, 'rocket', 'rocket', a.x, a.z, (ddx / dist) * spd, (ddz / dist) * spd, {
      damage: dmg,
      radius: 0.25,
      life: travel + 0.08,
      color: accent,
      armTimer: travel,
      fuseDelay: 0.11,
      explodeRadius: def.radius ?? 1.4,
      srcOverride: src,
    });
    pushEffect(state, 'muzzle', a.x, a.z, 0.12, accent, 0.9);
    pushEffect(state, 'telegraph', tx, tz, travel, accent, proj.explodeRadius, {
      radius: proj.explodeRadius,
    });
  }
}

function fleetLane(state: SurvivorState, pass: number): { x0: number; z0: number; x1: number; z1: number } {
  const h = SURVIVOR.arenaHalf * 0.96;
  const cx = state.player.x * 0.35;
  const cz = state.player.z * 0.35;
  if (pass === 0) return { x0: -h, z0: cz - 5, x1: h, z1: cz + 5 };
  if (pass === 1) return { x0: cx - 5, z0: -h, x1: cx + 5, z1: h };
  return { x0: -h, z0: h, x1: h, z1: -h };
}

function telegraphFleetPass(state: SurvivorState, pass: number): void {
  const lane = fleetLane(state, pass);
  const dx = lane.x1 - lane.x0;
  const dz = lane.z1 - lane.z0;
  const len = Math.hypot(dx, dz) || 1;
  pushEffect(state, 'telegraph', (lane.x0 + lane.x1) / 2, (lane.z0 + lane.z1) / 2,
    SURVIVOR.megaProtocol.fleetWarn, '#ffd46a', len, {
      length: len,
      width: SURVIVOR.megaProtocol.fleetLaneHalfWidth * 2,
      facingX: dx / len,
      facingZ: dz / len,
    });
}

function startCarrierWing(state: SurvivorState): void {
  resetMegaProtocol(state);
  const m = state.megaProtocol;
  m.id = 'carrier-wing';
  m.remaining = SURVIVOR.megaProtocol.titanDuration;
  m.fleetNextAt = SURVIVOR.megaProtocol.fleetWarn;
  telegraphFleetPass(state, 0);
  m.fleetTelegraphed = 1;
  pushEffect(state, 'mega', state.player.x, state.player.z, 0.9, '#ffd46a', 4.5, { radius: 4.5 });
}

function launchFleetPass(state: SurvivorState, pass: number): void {
  const lane = fleetLane(state, pass);
  const dx = lane.x1 - lane.x0;
  const dz = lane.z1 - lane.z0;
  const len = Math.hypot(dx, dz) || 1;
  const half = SURVIVOR.megaProtocol.fleetLaneHalfWidth;
  const shipColors = ['#66eaff', '#ffd46a', '#ff8ed8'] as const;
  pushEffect(state, 'fleet-ship', lane.x0, lane.z0, SURVIVOR.megaProtocol.fleetTravel, shipColors[pass] ?? '#ffd46a', 3.1, {
    facingX: dx / len,
    facingZ: dz / len,
    length: len,
    width: half * 2,
  });
  state.megaProtocol.fleetDamageDue.push({
    pass,
    at: state.megaProtocol.elapsed + SURVIVOR.megaProtocol.fleetTravel * 0.5,
  });
}

function damageFleetLane(state: SurvivorState, pass: number): void {
  const lane = fleetLane(state, pass);
  const half = SURVIVOR.megaProtocol.fleetLaneHalfWidth;
  for (const e of state.enemies) {
    if (!e.alive || distPointToSegment(e.x, e.z, lane.x0, lane.z0, lane.x1, lane.z1) > half + e.radius) continue;
    const dmg = e.isMiniboss ? e.maxHealth * SURVIVOR.megaProtocol.fleetMinibossFraction : e.maxHealth * 1.1;
    damageEnemy(state, e, dmg, { kind: 'gunship', pop: 1, src: 'titan-carrier' });
    pushEffect(state, 'impact', e.x, e.z, 0.36, '#fff0a0', 2.1);
  }
  for (const b of livingBosses(state)) {
    if (distPointToSegment(b.x, b.z, lane.x0, lane.z0, lane.x1, lane.z1) > half + b.colliderRadius) continue;
    const frac = b.isMega ? SURVIVOR.megaProtocol.fleetMegaFraction : SURVIVOR.megaProtocol.fleetBossFraction;
    damageBoss(state, b.maxHealth * frac, { kind: 'gunship', pop: 1, boss: b, src: 'titan-carrier' });
  }
}

function startSingularityEngine(state: SurvivorState): void {
  resetMegaProtocol(state);
  const m = state.megaProtocol;
  m.id = 'singularity-engine';
  m.remaining = SURVIVOR.megaProtocol.titanDuration;
  m.x = state.player.x;
  m.z = state.player.z;
  m.tickCd = 0;
  pushEffect(state, 'singularity', m.x, m.z, 1.8, '#9a7bff', SURVIVOR.megaProtocol.singularityRadius, {
    radius: SURVIVOR.megaProtocol.singularityRadius,
  });
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

function updateMegaProtocol(state: SurvivorState, dt: number): void {
  const m = state.megaProtocol;
  if (!m.id) return;
  m.elapsed += dt;
  m.remaining = Math.max(0, m.remaining - dt);

  if (m.id === 'carrier-wing') {
    const cfg = SURVIVOR.megaProtocol;
    if (m.fleetTelegraphed <= m.fleetNextPass && m.elapsed + 1e-6 >= m.fleetNextAt - cfg.fleetWarn) {
      telegraphFleetPass(state, m.fleetNextPass % cfg.fleetPasses);
      m.fleetTelegraphed = m.fleetNextPass + 1;
    }
    if (m.elapsed + 1e-6 >= m.fleetNextAt) {
      launchFleetPass(state, m.fleetNextPass % cfg.fleetPasses);
      m.fleetNextPass += 1;
      m.fleetNextAt += 4.0;
    }
    for (const due of [...m.fleetDamageDue]) {
      if (m.elapsed + 1e-6 < due.at) continue;
      damageFleetLane(state, due.pass);
      m.fleetDamageDue.splice(m.fleetDamageDue.indexOf(due), 1);
    }
    if (m.remaining <= 0 && m.fleetDamageDue.length === 0) {
      pushEffect(state, 'mega', state.player.x, state.player.z, 0.8, '#fff2a8', 5.5, { radius: 5.5 });
      resetMegaProtocol(state);
    }
    return;
  }

  if (m.id === 'cleanup-crew') {
    updateCleanupCrew(state, dt);
    /*
     * Hold the protocol open until the departure choreography finishes. Expiring the
     * armament the instant its timer hits zero would delete three actors mid-frame,
     * which is exactly the "actors simply disappearing" the brief rules out.
     */
    if (m.remaining <= 0 && state.allies.length === 0) {
      pushEffect(state, 'mega', state.player.x, state.player.z, 1.1, '#fff2a8', 6.5, { radius: 6.5 });
      resetMegaProtocol(state);
    }
    return;
  }

  if (m.id === 'singularity-engine') {
    const cfg = SURVIVOR.megaProtocol;
    m.tickCd -= dt;
    if (m.tickCd <= 0) {
      m.tickCd += 5.5;
      const dense = densestPoint(state, state.player.x, state.player.z);
      m.x = dense.x;
      m.z = dense.z;
      const pullRadius = cfg.singularityRadius * 0.72;
      pushEffect(state, 'singularity', m.x, m.z, 1.65, '#b18cff', pullRadius, { radius: pullRadius });
      for (const e of state.enemies) {
        if (!e.alive || (e.x - m.x) ** 2 + (e.z - m.z) ** 2 > pullRadius ** 2) continue;
        const dx = m.x - e.x;
        const dz = m.z - e.z;
        const d = Math.hypot(dx, dz) || 1;
        const resistance = e.isMiniboss ? 0.2 : e.isElite ? 0.45 : 1;
        e.x += (dx / d) * 4.5 * resistance;
        e.z += (dz / d) * 4.5 * resistance;
        damageEnemy(state, e, cfg.singularityDamage * playerPowerScale(state), {
          kind: 'ability', pop: 0.75, src: 'titan-singularity',
        });
      }
      for (const b of livingBosses(state)) {
        if ((b.x - m.x) ** 2 + (b.z - m.z) ** 2 <= (pullRadius + b.colliderRadius) ** 2) {
          damageBoss(state, b.maxHealth * 0.018, { kind: 'ability', pop: 0.9, boss: b, src: 'titan-singularity' });
        }
      }
    }
    if (m.remaining <= 0) {
      pushEffect(state, 'mega', m.x, m.z, 1.1, '#d8c0ff', cfg.singularityRadius, { radius: cfg.singularityRadius });
      resetMegaProtocol(state);
    }
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
  const directions: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    directions.push({ x: Math.cos(angle), z: Math.sin(angle) });
  }
  // Exact boss bearings participate, but do not override a dramatically better
  // horde corridor. A Flyover is first a screen-clearing Cache reward.
  for (const boss of livingBosses(state)) {
    const dx = boss.x - ox;
    const dz = boss.z - oz;
    const len = Math.hypot(dx, dz);
    if (len > 0.1) directions.push({ x: dx / len, z: dz / len });
  }

  const exitAlong = (dx: number, dz: number): { x: number; z: number } => {
    let t = Infinity;
    if (dx > 1e-6) t = Math.min(t, (half - ox) / dx);
    else if (dx < -1e-6) t = Math.min(t, (-half - ox) / dx);
    if (dz > 1e-6) t = Math.min(t, (half - oz) / dz);
    else if (dz < -1e-6) t = Math.min(t, (-half - oz) / dz);
    if (!Number.isFinite(t) || t < 1) t = half * 2;
    return { x: ox + dx * t, z: oz + dz * t };
  };

  const facingLen = Math.hypot(state.player.facingX, state.player.facingZ) || 1;
  let best = {
    x: state.player.facingX / facingLen,
    z: state.player.facingZ / facingLen,
  };
  let bestScore = -Infinity;
  for (const dir of directions) {
    const exit = exitAlong(dir.x, dir.z);
    let score = 0;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (distPointToSegment(e.x, e.z, ox, oz, exit.x, exit.z) > SURVIVOR.gunship.laneHalfWidth + e.radius) continue;
      score += e.isMiniboss ? 5 : e.isElite ? 2.5 : 1;
    }
    for (const boss of livingBosses(state)) {
      if (distPointToSegment(boss.x, boss.z, ox, oz, exit.x, exit.z) <= SURVIVOR.gunship.laneHalfWidth + boss.colliderRadius) {
        score += boss.isMega ? 5 : 6;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  const exit = exitAlong(best.x, best.z);
  // Start slightly behind the player so thrusters read on launch.
  const x0 = ox - best.x * 1.2;
  const z0 = oz - best.z * 1.2;
  return { x0, z0, x1: exit.x, z1: exit.z };
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
  p.damageMul = (overcharge ? SURVIVOR.tempBuff.overchargeDamageMul : 1) *
    (state.megaProtocol.titanActive ? SURVIVOR.megaProtocol.titanDamageMul : 1);
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

  // Mech cooldown is wall-clock and runs during Mech itself.
  if (p.mechCd > 0) p.mechCd = Math.max(0, p.mechCd - dt);

  if (p.regenPause > 0) p.regenPause = Math.max(0, p.regenPause - dt);
  if (p.bossContactCd > 0) p.bossContactCd = Math.max(0, p.bossContactCd - dt);
  // Nanite Bleed scales with the hull it is repairing, so plating keeps it relevant.
  const regen = regenPerSecondAtLevel(passiveLevel(state, 'regen'), p.maxHealth);
  if (regen > 0 && p.regenPause <= 0 && p.health < p.maxHealth && p.form !== 'ship') {
    const before = p.health;
    p.health = Math.min(p.maxHealth, p.health + regen * dt);
    state.telemetry.healedByRegen += p.health - before;
  }
  updateRepairEconomy(state, dt);
  sampleRepairStats(state, dt);

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
  /*
   * Mech movement.
   *
   * 2.6.1 applied a flat 0.92 drag here. 2.7.0 replaces it with the Overdrive Systems
   * table, whose level 0 row is defined as +0% — an uninvested Mech now moves at plain
   * astronaut speed rather than being quietly slower than the form it replaces, and a
   * fully invested one reaches 1.30 × 1.15 = 1.495 against unupgraded astronaut speed.
   */
  if (p.form === 'mech') speed *= mechSpeedMul(state);
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
    damageEnemy(state, e, dmg, { kind: 'ability', pop: 0.7, src: 'ship-exhaust' });
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
        src: 'ship-exhaust',
      });
    }
  }
}

/** Every surge kind the director can author. */
export const SURGE_KINDS = ['sprinters', 'pincer', 'bruiser', 'encircle', 'elite', 'flood'] as const;
export type SurgeKind = (typeof SURGE_KINDS)[number];

/** The specialist each surge kind is built around; a gated lead downgrades to flood. */
const SURGE_LEAD: Record<string, string> = {
  sprinters: 'fast',
  bruiser: 'bruiser',
  elite: 'elite',
  pincer: 'flyer',
  encircle: 'flyer',
};

/** Player-facing surge names for the incoming banner. */
export const SURGE_LABEL: Record<string, string> = {
  sprinters: 'SPRINTER SURGE',
  pincer: 'PINCER SURGE',
  bruiser: 'BRUISER SURGE',
  encircle: 'ENCIRCLEMENT',
  elite: 'ELITE SURGE',
  flood: 'FLOOD SURGE',
};

/** Edges a surge kind draws from. 0=-Z, 1=+Z, 2=-X, 3=+X. */
export function surgeEdgesFor(kind: string, edgeA: number, edgeB: number): number[] {
  if (kind === 'encircle') return [0, 1, 2, 3];
  if (kind === 'pincer') return [edgeA, edgeB];
  return [edgeA];
}

/** True while an ordinary director surge is telegraphing or active. */
export function surgeIsRunning(state: SurvivorState): boolean {
  return state.surge.phase === 'telegraph' || state.surge.phase === 'surge';
}

/**
 * Move a running surge into recovery immediately.
 *
 * Called when a boss arrives. A boss is already the pressure spike the encounter is
 * built around; layering an ordinary surge on top of it makes both illegible, and it
 * is how Mega-Bosses used to inherit a director surge they were never authored for.
 * The boss schedule is never delayed by this — only the surge yields.
 */
function endSurgeIntoRecovery(state: SurvivorState): void {
  const s = state.surge;
  if (s.phase === 'normal' || s.phase === 'recovery') return;
  s.phase = 'recovery';
  s.phaseEndsAt = state.time + SURVIVOR.surgeRecovery;
  s.banner = 0;
  s.recoveryTarget = recoveryPopulationTarget(state);
}

/** Population the recovery window drains toward before replacements resume. */
function recoveryPopulationTarget(state: SurvivorState): number {
  const diff = endlessDifficultyAt(state.time);
  return Math.max(8, Math.floor(diff.targetActive * SURVIVOR.surgeRecoveryPopulationFactor));
}

function updatePressureDirector(state: SurvivorState, dt: number): void {
  if (state.phase !== 'playing') return;
  const s = state.surge;
  const t = state.time;
  if (s.banner > 0) s.banner = Math.max(0, s.banner - dt);

  // A boss owns the arena's pressure while it lives.
  if (aliveBossCount(state) > 0 && surgeIsRunning(state)) {
    endSurgeIntoRecovery(state);
    return;
  }

  if (s.phase === 'normal') {
    // Never begin an ordinary surge while a boss is alive, and never stack one.
    if (t < s.nextSurgeAt || aliveBossCount(state) > 0) return;
    let kind: string = SURGE_KINDS[Math.floor(rng(state) * SURGE_KINDS.length)]!;
    // A surge whose whole identity is gated would just be a fodder wave with a
    // misleading name — roll it forward to an honest early-pressure flood instead.
    const lead = SURGE_LEAD[kind];
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
    s.eliteBonusSpawned = 0;
    s.activeEdges = surgeEdgesFor(kind, s.edgeA, s.edgeB);
    s.banner = SURVIVOR.surgeTelegraph;
    // Illuminate the exact edges the wave will arrive from, for the full telegraph.
    for (const edge of s.activeEdges) {
      const mid = edgeMidpoint(edge);
      pushEffect(state, 'telegraph', mid.x * 0.94, mid.z * 0.94, SURVIVOR.surgeTelegraph, '#ff8866', 2.4, {
        radius: 2.2,
        facingX: -mid.x,
        facingZ: -mid.z,
      });
    }
    return;
  }
  if (s.phase === 'telegraph') {
    if (t >= s.phaseEndsAt) {
      s.phase = 'surge';
      s.phaseEndsAt = t + SURVIVOR.surgeDuration;
    }
    return;
  }
  if (s.phase === 'surge') {
    if (t >= s.phaseEndsAt) {
      s.phase = 'recovery';
      s.phaseEndsAt = t + SURVIVOR.surgeRecovery;
      s.recoveryTarget = recoveryPopulationTarget(state);
    }
    return;
  }
  // recovery
  if (t >= s.phaseEndsAt) {
    s.phase = 'normal';
    s.kind = '';
    s.activeEdges = [];
    s.recoveryTarget = 0;
    const span = SURVIVOR.surgeIntervalMax - SURVIVOR.surgeIntervalMin;
    s.nextSurgeAt = t + SURVIVOR.surgeIntervalMin + rng(state) * span;
  }
}

/** Centre of one arena edge. 0=-Z, 1=+Z, 2=-X, 3=+X. */
function edgeMidpoint(edge: number): { x: number; z: number } {
  const h = SURVIVOR.arenaHalf + 1.2;
  if (edge === 0) return { x: 0, z: -h };
  if (edge === 1) return { x: 0, z: h };
  if (edge === 2) return { x: -h, z: 0 };
  return { x: h, z: 0 };
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
  } else if (kind && kind !== 'flood') {
    // Single-edge surges commit to their announced edge so the arrows do not lie.
    side = state.surge.edgeA;
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

/**
 * Surge composition.
 *
 * Each kind reads as a materially different wave, not a differently-named fodder
 * stream: sprinters arrive fast and fragile, bruisers slow and heavy, elite surges
 * carry real elites, geometry surges lean on flankers, and floods are sheer numbers.
 * Every substitution is filtered by eligibility, so a surge can never outrun the
 * opening specialist gates.
 */
function surgeCompositionBias(state: SurvivorState, baseId: string): string {
  const k = state.surge.kind;
  if (state.surge.phase !== 'surge') return baseId;
  const bias = (id: string): string | null => (canSpawnEnemyNow(state, id) ? id : null);
  if (k === 'sprinters') {
    if (rng(state) < 0.8) return bias(rng(state) < 0.55 ? 'fast' : 'spiky') ?? baseId;
    return baseId;
  }
  if (k === 'bruiser') {
    if (rng(state) < 0.7) return bias('bruiser') ?? baseId;
    return baseId;
  }
  if (k === 'elite') {
    if (rng(state) < 0.4) return bias('bruiser') ?? baseId;
    return baseId;
  }
  if (k === 'flood') {
    if (rng(state) < 0.85) return rng(state) < 0.5 ? 'basic' : 'mush';
    return baseId;
  }
  if (k === 'pincer' || k === 'encircle') {
    if (rng(state) < 0.55) return bias(rng(state) < 0.5 ? 'flyer' : 'bee') ?? baseId;
    if (rng(state) < 0.3) return bias('ghost') ?? baseId;
  }
  return baseId;
}

function updateSpawns(state: SurvivorState, dt: number): void {
  updatePressureDirector(state, dt);
  const diff = endlessDifficultyAt(state.time);
  const alive = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const target = diff.targetActive;
  const s = state.surge;
  let rate = diff.spawnRate;
  if (alive < diff.populationMin) rate *= 1.75;
  else if (alive > target) rate *= 0.55;
  if (hasActiveMega(state)) rate *= 0.65;
  else if (aliveBossCount(state) > 0) {
    rate *= state.time >= 40 * 60 ? 1 : 0.85;
  }
  if (state.gunship.spawnSuppress > 0) {
    state.gunship.spawnSuppress = Math.max(0, state.gunship.spawnSuppress - dt);
    rate *= SURVIVOR.gunship.spawnSuppressRateMul;
  }
  // Director phase multipliers
  if (s.phase === 'surge') {
    if (s.kind === 'flood') rate *= 1.7;
    else if (s.kind === 'bruiser') rate *= 0.9;
    else rate *= 1.45;
  } else if (s.phase === 'recovery') {
    /*
     * Recovery is a real breathing window, not a slightly slower stream.
     *
     * Replacements are held almost entirely until the population has actually drained
     * to `recoveryTarget`; only then does a trickle resume so the arena does not feel
     * abandoned. Living enemies are never despawned to manufacture the lull — the
     * player earns it by clearing what the surge delivered.
     */
    rate *= alive > s.recoveryTarget ? 0.06 : 0.45;
  } else if (s.phase === 'telegraph') {
    // The arena quiets slightly while the warning is up, which makes the surge land harder.
    rate *= 0.75;
  }

  state.spawnAcc += dt * rate;
  let spawnedThisFrame = 0;
  let livingElites = state.enemies.reduce(
    (n, e) => n + (e.alive && e.isElite && !e.isMiniboss ? 1 : 0),
    0,
  );
  const ordinaryEliteBudget = elitePopulationBudgetAt(state.time);
  const surgeEliteBudget = s.phase === 'surge' && s.kind === 'elite'
    ? Math.min(SURVIVOR.elite.surgeBonusCap, Math.max(2, Math.ceil(ordinaryEliteBudget * 0.6)))
    : 0;
  const surging = s.phase === 'surge';
  while (state.spawnAcc >= 1 && alive + spawnedThisFrame < state.enemyCap && spawnedThisFrame < 4) {
    state.spawnAcc -= 1;
    const pos = edgeSpawnWeighted(state, surging ? s.kind : '');
    let defId = surgeCompositionBias(state, pickComposition(state));
    let surgeElite = false;
    if (
      s.phase === 'surge' &&
      s.kind === 'elite' &&
      s.eliteBonusSpawned < surgeEliteBudget &&
      rng(state) < 0.38 &&
      canSpawnEnemyNow(state, 'elite')
    ) {
      defId = 'elite';
      surgeElite = true;
    } else if (
      s.phase !== 'recovery' &&
      state.eliteTimer <= 0 &&
      livingElites < ordinaryEliteBudget &&
      rng(state) < diff.eliteChance &&
      canSpawnEnemyNow(state, 'elite')
    ) {
      // The published chance and living budget are now the sole ordinary source.
      defId = 'elite';
    }
    const spawned = spawnEnemy(state, defId, pos.x, pos.z);
    if (spawned) {
      spawnedThisFrame += 1;
      if (spawned.isElite && !spawned.isMiniboss) {
        livingElites += 1;
        if (surgeElite) s.eliteBonusSpawned += 1;
      }
      /*
       * A surge wave hits harder than the standing horde, but the bonus rides on the
       * individual enemies the surge produced. It is deliberately not a global speed
       * modifier: the horde must never inherit a permanent speed increase from an
       * event that has already ended.
       */
      if (surging) spawned.speedMul *= 1 + SURVIVOR.surgeWaveSpeedBonus;
    }
  }

  state.eliteTimer -= dt;
  if (
    state.eliteTimer <= -SURVIVOR.elite.droughtGrace &&
    livingElites < ordinaryEliteBudget &&
    canSpawnEnemyNow(state, 'elite') &&
    s.phase !== 'recovery'
  ) {
    // Drought protection only fills a missing ordinary-budget slot. It is never an
    // additive timer spawn and therefore cannot push the population over budget.
    const pos = edgeSpawnWeighted(state, s.kind || '');
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
  // A boss arriving ends any ordinary surge cleanly. Mega-Bosses in particular must
  // never inherit a director surge on top of their authored reinforcements.
  endSurgeIntoRecovery(state);
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
  updateMegaProtocol(state, dt);

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
          damageEnemy(state, e, dmg, { kind: 'gunship', pop: 1, src: 'gunship' });
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
          const frac = b.isMega
            ? cfg.megaHealthFraction * pot
            : cfg.bossHealthFraction * pot;
          const dmg = b.maxHealth * frac;
          damageBoss(state, dmg, { kind: 'gunship', pop: 1, boss: b, x: b.x, z: b.z, src: 'gunship' });
          pushEffect(state, 'impact', b.x, b.z, 0.35, '#ffd46a', 2.2);
        }
      }
      if (g.hitIds.length > 0) {
        g.spawnSuppress = Math.max(
          g.spawnSuppress,
          cfg.spawnSuppressDuration + Math.max(0, g.duration - g.t),
        );
      }
    }
    if (g.t >= g.duration) {
      g.active = false;
      g.firing = false;
      g.spawnSuppress = Math.max(g.spawnSuppress, cfg.spawnSuppressDuration);
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
  const megaCache = state.cache.mega;
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
  const offered = megaCache ? MEGA_PROTOCOLS : PROTOCOLS;
  state.protocolChoices = offered.map((p) => {
    let body = p.body;
    if (p.id === 'aegis-barrier') {
      body = `<mark class="sv-protocol-highlight">3 SECONDS INVULNERABLE</mark> Repel the nearby horde, then absorb ~${shieldPts} damage for ${Math.round(shieldDur)}s.${enhanced ? ' Enhanced.' : ''}`;
    } else if (p.id === 'gunship-flyby') {
      body = `Wide corridor strike. Deletes ordinary enemies, dents bosses, then suppresses reinforcements for ${Math.round(SURVIVOR.gunship.spawnSuppressDuration)}s.${enhanced ? ' Enhanced lane.' : ''}`;
    } else if (p.id === 'gravitic-recall') {
      body =
        energyOrbs > 0
          ? `Recall ${energyXp} energy from ${energyOrbs} orbs.`
          : 'No energy currently on the field.';
    } else if (p.id === 'carrier-wing') {
      body = 'For 5:00, a fighter squadron repeatedly strafes distributed threats. Dedicated Titan slot; cannot be upgraded.';
    } else if (p.id === 'cleanup-crew') {
      body =
        'For 5:00, the rest of the crew arrive in their ships and fight beside you as allied Mechs, each using only their own signature weapon. Dedicated Titan slot; cannot be upgraded.';
    } else if (p.id === 'singularity-engine') {
      body = 'For 5:00, repeated anomalies pull and detonate the horde. Dedicated Titan slot; cannot be upgraded.';
    }
    return {
      kind: 'protocol' as const,
      id: `proto-${p.id}`,
      title: p.title,
      body,
      protocolId: p.id,
    };
  });
  pushEffect(state, megaCache ? 'mega' : 'levelup', state.player.x, state.player.z, 0.65, '#ffd46a', megaCache ? 4 : 2);
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

// The pattern machine owns attack lifecycles; the simulation owns what a phase
// transition actually does. This wiring keeps that split without an import cycle.
setPhaseTransitionHandler(resolveBossPhaseTransition);

export function applyBossBodyContact(state: SurvivorState): void {
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
    damagePlayer(
      state,
      dmg,
      makeBossSource(b, charging ? 'boss-charge' : 'boss-body', charging ? 'Ravage Charge' : 'Body Slam'),
    );
    p.bossContactCd = 0.45;
    // Boss bodies are damage volumes, not solid walls. The player must remain
    // free to pass through them in every form instead of being shoved, pinned,
    // or trapped against the arena boundary.
    break;
  }
}

/**
 * Ship boss ram (2.7.0).
 *
 * Flying the ship through a boss is the most committal thing the form can do, and in
 * 2.6.1 it was worth exactly nothing: the `ship-body` bucket recorded 4,994 damage and
 * **zero** boss damage across the reference 21:18 run, because the body-impact pass only
 * ever iterated `state.enemies`.
 *
 * This is a deliberately separate pass from {@link applyBossBodyContact}:
 *
 * - That function applies *incoming* damage and is gated by the player's shared
 *   `bossContactCd` and i-frames. Outgoing ram damage must not be suppressed merely
 *   because the player is mid-invulnerability, and must not consume that throttle.
 * - It `break`s after one boss. A ram should credit every boss actually overlapped, so
 *   this loop does not break — but each boss carries its own `shipRamCd`, so overlapping
 *   two bosses yields one bounded impact each rather than an uncontrolled stream.
 *
 * Boss pass-through is preserved exactly: no knockback, no displacement and no
 * positional correction is applied to either the boss or the player.
 */
export function applyShipBossRam(state: SurvivorState): void {
  const p = state.player;
  if (!p.alive || p.form !== 'ship') return;
  const power = thrusterPower(state);
  const reach = SURVIVOR.ship.radius;
  for (const b of state.bosses) {
    if (!b.active || b.state === 'dead') continue;
    if (b.shipRamCd > 0) continue;
    const dx = p.x - b.x;
    const dz = p.z - b.z;
    if (dx * dx + dz * dz > (b.colliderRadius + reach) ** 2) continue;

    // One bounded impact per boss per interval, regardless of overlap duration.
    b.shipRamCd = SURVIVOR.ship.ramInternalCd;
    damageBoss(state, SURVIVOR.ship.ramBossDamage * power, {
      // 'large' gives the ram its own heavy damage-number presentation rather than
      // blending into ordinary boss chip damage.
      kind: 'large',
      pop: 1,
      boss: b,
      src: 'ship-ram',
    });

    // Impact feedback on the hull surface facing the ship, not at the boss centre.
    const len = Math.hypot(dx, dz) || 1;
    const cx = b.x + (dx / len) * b.colliderRadius;
    const cz = b.z + (dz / len) * b.colliderRadius;
    pushEffect(state, 'impact', cx, cz, 0.34, '#fff2c0', 3.0);
    pushEffect(state, 'pulse', cx, cz, 0.42, '#ffb347', 3.6, { radius: 3.6 });
    pushEffect(state, 'muzzle', cx, cz, 0.16, '#ffffff', 2.2);
    p.hitShake = Math.max(p.hitShake, 0.16);
  }
}

function updateBosses(state: SurvivorState, dt: number): void {
  if (state.inboundBanner > 0) state.inboundBanner = Math.max(0, state.inboundBanner - dt);
  for (const b of state.bosses) {
    if (b.shipRamCd > 0) b.shipRamCd = Math.max(0, b.shipRamCd - dt);
    updateOneBossPatterns(state, b, dt, bossApi);
  }
  applyBossBodyContact(state);
  applyShipBossRam(state);
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
  // Form uptime is the denominator for every "by form" figure in the run report.
  recordFormTime(state.telemetry, state.player.form, dt);
  // Hit feedback decays fast: strong but brief, never leaving the screen unreadable.
  const pf = state.player;
  if (pf.hitVignette > 0) pf.hitVignette = Math.max(0, pf.hitVignette - dt * 2.2);
  if (pf.hitShake > 0) pf.hitShake = Math.max(0, pf.hitShake - dt * 3.2);
  if (pf.hitVignette <= 0) pf.hitSeverity = 0;
  // Absorb externally-seeded XP (fixtures/tests) then present one owed choice at a time.
  settleXpLevels(state);
  if (openPendingLevelUp(state)) return;

  ensureUnlocksAndCache(state, dt);
  ensureBossSchedule(state);
  updatePlayer(state, input, dt);
  rebuildHash(state);
  updatePlasmaTrails(state, dt);
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
