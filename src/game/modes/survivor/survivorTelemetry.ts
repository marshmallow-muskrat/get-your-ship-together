/**
 * Run telemetry: the typed damage-source model behind the death log and the
 * Recount-style run report.
 *
 * Two rules make the numbers trustworthy:
 *
 * 1. **Every** damage path names its source through {@link DamageSource}. There is no
 *    "unknown" bucket that quietly absorbs mis-attributed hits, and no path may report
 *    damage without saying who dealt it.
 * 2. Outgoing damage is recorded as *health actually removed*, clamped to the target's
 *    remaining health. Overkill on a 3 HP enemy from a 900 damage hit counts as 3, so a
 *    weapon cannot inflate its share of the report by hitting things that were already
 *    dead. That is the only honest way to compare an execution weapon against a
 *    sustained-damage weapon.
 *
 * Everything here is bounded: the recent-hit ring buffer has a fixed cap and the
 * per-source accumulators are a small fixed map, so a sixty-minute run costs the same
 * as a sixty-second one.
 */
import type { SurvivorForm } from './survivorContent';

/** Player-facing damage attribution. Every hostile damage path resolves to one of these. */
export type PlayerDamageSourceKind =
  | 'horde-contact'
  | 'elite-lunge'
  | 'miniboss-slam'
  | 'boss-body'
  | 'boss-charge'
  | 'boss-projectile'
  | 'boss-beam'
  | 'boss-puddle'
  | 'boss-radial'
  | 'boss-pattern'
  | 'hazard';

/**
 * A fully-identified hostile damage source.
 *
 * `displayName` is what the player is told killed them ("Breach Demon", "Bruiser"),
 * `attackName` is the mechanic ("Ravage Charge", "Body Slam", "Contact").
 */
export interface DamageSource {
  kind: PlayerDamageSourceKind;
  /** Enemy/boss display name. */
  displayName: string;
  /** Attack or mechanic name. */
  attackName: string;
  /** Horde role or boss def id, when relevant. */
  role?: string;
  /** Boss schedule index (1-based) when a boss dealt the damage. */
  bossIndex?: number;
  isMega?: boolean;
  isElite?: boolean;
}

/** One recorded hit against the player. */
export interface PlayerDamageRecord {
  /** Survival time when the hit landed. */
  time: number;
  source: DamageSource;
  /** Damage before mitigation and shield. */
  raw: number;
  /** Damage after form/Breach Shielding mitigation, before shield absorption. */
  mitigated: number;
  /** Portion absorbed by the Aegis shield. */
  shieldAbsorbed: number;
  /** Portion that actually removed integrity. */
  applied: number;
  /** Integrity remaining immediately after the hit. */
  remaining: number;
}

/** Identify a hostile boss damage source. */
export function makeBossSource(
  boss: { displayName: string; index: number; isMega: boolean; defId?: string },
  kind: PlayerDamageSourceKind,
  attackName: string,
): DamageSource {
  return {
    kind,
    displayName: boss.displayName,
    attackName,
    role: boss.defId,
    bossIndex: boss.index,
    isMega: boss.isMega,
  };
}

/** Identify an ordinary/elite/miniboss horde damage source. */
export function makeHordeSource(
  enemy: { defId: string; role: string; isElite: boolean; isMiniboss: boolean },
  attackName: string,
): DamageSource {
  const kind: PlayerDamageSourceKind = enemy.isMiniboss
    ? 'miniboss-slam'
    : enemy.isElite && attackName === 'Lunge'
      ? 'elite-lunge'
      : 'horde-contact';
  return {
    kind,
    displayName: hordeDisplayName(enemy.defId),
    attackName,
    role: enemy.role,
    isElite: enemy.isElite,
  };
}

/** Player-facing names for horde definition ids. */
export function hordeDisplayName(defId: string): string {
  switch (defId) {
    case 'basic':
      return 'Blob';
    case 'mush':
      return 'Mushnub';
    case 'fast':
      return 'Sprinter';
    case 'spiky':
      return 'Spiker';
    case 'surge-flier':
      return 'Surge Flier';
    case 'ghost':
      return 'Wraith';
    case 'bee':
      return 'Armabee';
    case 'bruiser':
      return 'Bruiser';
    case 'elite':
      return 'Elite Squidle';
    case 'miniboss':
      return 'Containment Warden';
    default:
      return defId;
  }
}

/** Bounded recent-hit history. Enough to reconstruct the last ~10 seconds of a death. */
export const DAMAGE_LOG_CAP = 32;
/** Death log shows contributing hits within this window before death. */
export const DEATH_LOG_WINDOW = 12;

/** Outgoing damage attribution: one bucket per damaging source the player controls. */
export type DamageSourceId =
  | `weapon:${string}`
  | 'repulsor'
  | 'ship-body'
  /** Ship physically ramming through a boss. Deliberately separate from `ship-body`. */
  | 'ship-ram'
  | 'ship-exhaust'
  | 'ship-wake'
  | 'gunship'
  | 'mega-titan'
  | 'mega-fleet'
  | 'mega-singularity'
  | 'titan-carrier'
  /** One bucket per Cleanup Crew ally, so individual contribution is preserved. */
  | `titan-cleanup:${string}`
  /** One bucket per hero's automatic Mech armament. */
  | `mech-special:${string}`
  | 'titan-singularity'
  | 'aegis-pulse'
  | 'containment-field';

export interface SourceStats {
  id: string;
  /** Health actually removed (overkill excluded). */
  damage: number;
  /** Of that, damage removed from bosses. */
  bossDamage: number;
  hits: number;
  kills: number;
  /** Largest single recorded application. */
  maxHit: number;
}

export interface FormStats {
  damage: number;
  /** Seconds spent in this form while playing. */
  time: number;
}

/**
 * One cell of the source × form cross-tab.
 *
 * The separate By Source and By Form views cannot answer "how much of Plasma Wake's
 * output happened during ship form?" — the exact question 2.7.0 needs to evaluate ship
 * synergy and Titan attribution. This adds the joint distribution.
 *
 * It is not a third independent accumulator: both marginals are produced by the same
 * {@link recordOutgoing} call that fills this cell, so the cross-tab reconciles with
 * both views exactly rather than approximately.
 */
export interface SourceFormStats {
  sourceId: string;
  form: SurvivorForm;
  damage: number;
  bossDamage: number;
  hits: number;
  kills: number;
  maxHit: number;
}

/** Cross-tab key. Sources are a small fixed set, so the map is bounded at |sources| x 3. */
function sourceFormKey(sourceId: string, form: SurvivorForm): string {
  return `${sourceId}\0${form}`;
}

export interface BossKillRecord {
  index: number;
  displayName: string;
  isMega: boolean;
  /** Seconds from arrival to death. */
  timeToKill: number;
  /** Player's total recorded DPS over the fight window. */
  buildDps: number;
  heroId: string;
  /** Form the player was in when the boss died. */
  form: SurvivorForm;
}

export interface RunTelemetry {
  /** Outgoing damage by source id. */
  bySource: Map<string, SourceStats>;
  /** Outgoing damage and time by player form. Separate view — never summed with bySource. */
  byForm: Record<SurvivorForm, FormStats>;
  /** Joint source × form distribution. Reconciles exactly with both marginals. */
  bySourceForm: Map<string, SourceFormStats>;
  /** Incoming damage by source kind. */
  damageTaken: Map<string, number>;
  /** Bounded ring of recent hits against the player. */
  recentHits: PlayerDamageRecord[];
  /** The hit that reduced integrity to zero. */
  killingBlow: PlayerDamageRecord | null;
  healedByOrbs: number;
  healedByRegen: number;
  shieldAbsorbed: number;
  eliteKills: number;
  minibossKills: number;
  /** Ordinary Cache selections by protocol id. */
  cacheChoices: Map<string, number>;
  /** Mega Cache selections by protocol id. */
  megaChoices: Map<string, number>;
  bossKills: BossKillRecord[];
  /** Total elapsed playing time used for DPS denominators. */
  elapsed: number;
}

export function createTelemetry(): RunTelemetry {
  return {
    bySource: new Map(),
    byForm: {
      astronaut: { damage: 0, time: 0 },
      ship: { damage: 0, time: 0 },
      mech: { damage: 0, time: 0 },
    },
    bySourceForm: new Map(),
    damageTaken: new Map(),
    recentHits: [],
    killingBlow: null,
    healedByOrbs: 0,
    healedByRegen: 0,
    shieldAbsorbed: 0,
    eliteKills: 0,
    minibossKills: 0,
    cacheChoices: new Map(),
    megaChoices: new Map(),
    bossKills: [],
    elapsed: 0,
  };
}

function sourceBucket(t: RunTelemetry, id: string): SourceStats {
  let s = t.bySource.get(id);
  if (!s) {
    s = { id, damage: 0, bossDamage: 0, hits: 0, kills: 0, maxHit: 0 };
    t.bySource.set(id, s);
  }
  return s;
}

function sourceFormBucket(t: RunTelemetry, id: string, form: SurvivorForm): SourceFormStats {
  const key = sourceFormKey(id, form);
  let s = t.bySourceForm.get(key);
  if (!s) {
    s = { sourceId: id, form, damage: 0, bossDamage: 0, hits: 0, kills: 0, maxHit: 0 };
    t.bySourceForm.set(key, s);
  }
  return s;
}

/**
 * Record outgoing damage.
 *
 * `applied` must already be clamped to the target's remaining health by the caller —
 * the simulation knows the target's health, this module does not, and clamping in one
 * place keeps "actual damage" a single well-defined quantity.
 */
export function recordOutgoing(
  t: RunTelemetry,
  opts: {
    sourceId: string;
    form: SurvivorForm;
    applied: number;
    isBoss: boolean;
    killed: boolean;
  },
): void {
  /*
   * Every branch below updates the source marginal, the form marginal and the joint
   * cell together. Keeping them in one function is what makes the cross-tab reconcile
   * exactly with both views — there is no second path that can record one without the
   * others.
   */
  if (!(opts.applied > 0)) {
    // A kill can land with zero remaining health (already-lethal overkill chain).
    if (opts.killed) {
      sourceBucket(t, opts.sourceId).kills += 1;
      sourceFormBucket(t, opts.sourceId, opts.form).kills += 1;
    }
    return;
  }
  const s = sourceBucket(t, opts.sourceId);
  const sf = sourceFormBucket(t, opts.sourceId, opts.form);
  s.damage += opts.applied;
  sf.damage += opts.applied;
  s.hits += 1;
  sf.hits += 1;
  if (opts.isBoss) {
    s.bossDamage += opts.applied;
    sf.bossDamage += opts.applied;
  }
  if (opts.applied > s.maxHit) s.maxHit = opts.applied;
  if (opts.applied > sf.maxHit) sf.maxHit = opts.applied;
  if (opts.killed) {
    s.kills += 1;
    sf.kills += 1;
  }
  t.byForm[opts.form].damage += opts.applied;
}

/** Accumulate form uptime. Called once per simulated step while playing. */
export function recordFormTime(t: RunTelemetry, form: SurvivorForm, dt: number): void {
  t.byForm[form].time += dt;
  t.elapsed += dt;
}

/** Record one hostile hit against the player and return the stored record. */
export function recordIncoming(t: RunTelemetry, record: PlayerDamageRecord): PlayerDamageRecord {
  t.recentHits.push(record);
  if (t.recentHits.length > DAMAGE_LOG_CAP) {
    t.recentHits.splice(0, t.recentHits.length - DAMAGE_LOG_CAP);
  }
  const key = record.source.kind;
  t.damageTaken.set(key, (t.damageTaken.get(key) ?? 0) + record.applied);
  t.shieldAbsorbed += record.shieldAbsorbed;
  return record;
}

export function recordCacheChoice(t: RunTelemetry, protocolId: string, mega: boolean): void {
  const map = mega ? t.megaChoices : t.cacheChoices;
  map.set(protocolId, (map.get(protocolId) ?? 0) + 1);
}

/** Hits inside the death window, oldest first. */
export function deathLogEntries(t: RunTelemetry, deathTime: number): PlayerDamageRecord[] {
  const cutoff = deathTime - DEATH_LOG_WINDOW;
  return t.recentHits.filter((r) => r.time >= cutoff);
}

export interface SourceReportRow extends SourceStats {
  /** Share of total recorded outgoing damage. */
  share: number;
  dps: number;
}

/** Ranked outgoing-damage rows with shares and DPS. */
export function sourceReport(t: RunTelemetry): SourceReportRow[] {
  let total = 0;
  for (const s of t.bySource.values()) total += s.damage;
  const secs = Math.max(0.001, t.elapsed);
  const rows: SourceReportRow[] = [];
  for (const s of t.bySource.values()) {
    rows.push({ ...s, share: total > 0 ? s.damage / total : 0, dps: s.damage / secs });
  }
  rows.sort((a, b) => b.damage - a.damage);
  return rows;
}

export interface FormReportRow {
  form: SurvivorForm;
  damage: number;
  time: number;
  share: number;
  uptime: number;
  dps: number;
}

/**
 * Damage and uptime by form.
 *
 * Deliberately a separate view from {@link sourceReport}: a Mech-form Rail Lance hit is
 * one damage event that belongs to both "Rail Lance" and "Mech". Presenting them as two
 * views rather than one nested tree is what stops the totals from double-counting.
 */
export function formReport(t: RunTelemetry): FormReportRow[] {
  let total = 0;
  for (const f of Object.values(t.byForm)) total += f.damage;
  const secs = Math.max(0.001, t.elapsed);
  return (['astronaut', 'ship', 'mech'] as SurvivorForm[]).map((form) => {
    const f = t.byForm[form];
    return {
      form,
      damage: f.damage,
      time: f.time,
      share: total > 0 ? f.damage / total : 0,
      uptime: f.time / secs,
      dps: f.time > 0 ? f.damage / f.time : 0,
    };
  });
}

export interface SourceFormReportRow extends SourceFormStats {
  /** Share of *this source's* total damage that happened in this form. */
  shareOfSource: number;
}

/**
 * Per-form breakdown for one source, ordered by damage.
 *
 * Only forms that actually contributed are returned, so a weapon that never fired
 * during ship form does not pad the report with a zero row.
 */
export function sourceFormRows(t: RunTelemetry, sourceId: string): SourceFormReportRow[] {
  const total = t.bySource.get(sourceId)?.damage ?? 0;
  const rows: SourceFormReportRow[] = [];
  for (const form of ['astronaut', 'mech', 'ship'] as SurvivorForm[]) {
    const cell = t.bySourceForm.get(sourceFormKey(sourceId, form));
    if (!cell || (cell.damage <= 0 && cell.kills <= 0)) continue;
    rows.push({ ...cell, shareOfSource: total > 0 ? cell.damage / total : 0 });
  }
  rows.sort((a, b) => b.damage - a.damage);
  return rows;
}

/** Every populated cross-tab cell, ranked by damage. */
export function sourceFormReport(t: RunTelemetry): SourceFormReportRow[] {
  const rows: SourceFormReportRow[] = [];
  for (const cell of t.bySourceForm.values()) {
    const total = t.bySource.get(cell.sourceId)?.damage ?? 0;
    rows.push({ ...cell, shareOfSource: total > 0 ? cell.damage / total : 0 });
  }
  rows.sort((a, b) => b.damage - a.damage);
  return rows;
}

/** Total recorded outgoing damage (source view). */
export function totalOutgoing(t: RunTelemetry): number {
  let total = 0;
  for (const s of t.bySource.values()) total += s.damage;
  return total;
}

/** Prefix shared by every Cleanup Crew ally bucket. */
export const CLEANUP_CREW_PREFIX = 'titan-cleanup:';

/** Aggregate label for the whole Cleanup Crew squad. */
export const CLEANUP_CREW_LABEL = 'Cleanup Crew';

/** True when a source id belongs to a Cleanup Crew ally. */
export function isCleanupCrewSource(id: string): boolean {
  return id.startsWith(CLEANUP_CREW_PREFIX);
}

/**
 * Aggregate the per-ally Cleanup Crew buckets into one squad total.
 *
 * The ally buckets remain the ground truth — this is a *view*, so the By Source totals
 * and the source x form cross-tab both stay exact.
 */
export function cleanupCrewTotal(t: RunTelemetry): SourceStats | null {
  let found = false;
  const total: SourceStats = {
    id: 'titan-cleanup',
    damage: 0,
    bossDamage: 0,
    hits: 0,
    kills: 0,
    maxHit: 0,
  };
  for (const [id, s] of t.bySource) {
    if (!isCleanupCrewSource(id)) continue;
    found = true;
    total.damage += s.damage;
    total.bossDamage += s.bossDamage;
    total.hits += s.hits;
    total.kills += s.kills;
    if (s.maxHit > total.maxHit) total.maxHit = s.maxHit;
  }
  return found ? total : null;
}

/** Per-ally Cleanup Crew rows, ranked by damage. */
export function cleanupCrewRows(t: RunTelemetry): SourceStats[] {
  const rows: SourceStats[] = [];
  for (const [id, s] of t.bySource) if (isCleanupCrewSource(id)) rows.push(s);
  rows.sort((a, b) => b.damage - a.damage);
  return rows;
}

/** Human label for a source id. */
export function sourceLabel(id: string, weaponName: (id: string) => string): string {
  if (id.startsWith('weapon:')) return weaponName(id.slice('weapon:'.length));
  if (id === 'titan-cleanup') return CLEANUP_CREW_LABEL;
  if (isCleanupCrewSource(id)) {
    return `${CLEANUP_CREW_LABEL} · ${cleanupHeroName(id.slice(CLEANUP_CREW_PREFIX.length))}`;
  }
  if (id.startsWith('mech-special:')) {
    return `${cleanupHeroName(id.slice('mech-special:'.length))} Mech Special`;
  }
  switch (id) {
    case 'repulsor':
      return 'Repulsor Burst';
    case 'ship-body':
      return 'Ship Body';
    case 'ship-ram':
      return 'Ship Ram';
    case 'ship-exhaust':
      return 'Ship Exhaust';
    case 'ship-wake':
      return 'Ship Wake';
    case 'gunship':
      return 'Gunship Flyby';
    case 'mega-titan':
      return 'Titan Protocol';
    case 'mega-fleet':
      return 'Fleet Annihilation';
    case 'mega-singularity':
      return 'Singularity Event';
    case 'titan-carrier':
      return 'Carrier Wing';

    case 'titan-singularity':
      return 'Singularity Engine';
    case 'aegis-pulse':
      return 'Aegis Pulse';
    case 'containment-field':
      return 'Containment Field';
    default:
      return id;
  }
}

/** Player-facing hero name for a Cleanup Crew ally bucket. */
export function cleanupHeroName(heroId: string): string {
  switch (heroId) {
    case 'bee':
      return 'Boswell';
    case 'flamingo':
      return 'Fitzwilliam';
    case 'frog':
      return 'Fortunato';
    case 'red-panda':
      return 'Rutherford';
    default:
      return heroId;
  }
}

/** Human label for an incoming damage kind. */
export function damageTakenLabel(kind: string): string {
  switch (kind) {
    case 'horde-contact':
      return 'Horde contact';
    case 'elite-lunge':
      return 'Elite lunge';
    case 'miniboss-slam':
      return 'Miniboss slam';
    case 'boss-body':
      return 'Boss body';
    case 'boss-charge':
      return 'Boss charge';
    case 'boss-projectile':
      return 'Boss projectile';
    case 'boss-beam':
      return 'Boss beam';
    case 'boss-puddle':
      return 'Boss hazard';
    case 'boss-radial':
      return 'Boss shockwave';
    case 'boss-pattern':
      return 'Boss pattern';
    case 'hazard':
      return 'Hazard';
    default:
      return kind;
  }
}
