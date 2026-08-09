/**
 * Authoritative upgrade-card copy.
 *
 * The endless-2.2.1 card read:
 *
 *     WEAPON • 1
 *     Twin Globs
 *     Impact 42 → 47
 *
 * which does not say whether "Twin Globs" is a new weapon, a passive or an upgrade,
 * what it changes, or that it also halves the fire rate. The player was choosing
 * blind. This module is the single place that answers those questions, and it derives
 * the numbers by diffing the authored level definitions rather than by hand-written
 * copy that can drift away from the tables.
 *
 * The rule: if a field that changes how the weapon *behaves* differs between levels,
 * it appears on the card. Especially the tradeoffs — a bigger volley fired more slowly
 * must never be presented as a pure upgrade.
 */
import {
  PASSIVES,
  SURVIVOR,
  WEAPONS,
  formatOverclockLabel,
  hullPlatingGainAtLevel,
  mechCooldownReduction,
  mechDurationBonus,
  moveSpeedBonus,
  overclockLevel,
  regenFractionAtLevel,
  repairOrbBonusAtLevel,
  weaponStatsAtLevel,
  type PassiveId,
  type WeaponId,
  type WeaponLevelDef,
} from './survivorContent';

/** Card category badge. */
export type CardCategory =
  | 'NEW WEAPON'
  | 'WEAPON UPGRADE'
  | 'NEW PASSIVE'
  | 'PASSIVE UPGRADE'
  | 'NEW PROTOTYPE'
  | 'PROTOTYPE UPGRADE'
  | 'OVERCLOCK'
  | 'PROTOCOL';

/** Fully-described upgrade card. */
export interface UpgradeCardCopy {
  category: CardCategory;
  /** Parent weapon or passive name, e.g. "BIO-PLASMA GLOB". */
  parent: string;
  /** Level transition, e.g. "L3 → L4". Empty for brand-new picks. */
  levels: string;
  /** Authored upgrade name, e.g. "Twin Globs". */
  name: string;
  /** One plain-language sentence describing the gameplay change. */
  summary: string;
  /** Numeric differences worth reading, most important first. */
  stats: string[];
  /** Explicit downside, when the upgrade has one. */
  tradeoff: string | null;
}

function round(n: number, dp = 0): string {
  const f = Math.pow(10, dp);
  return String(Math.round(n * f) / f);
}

/**
 * A stat row, emitted only when the value actually changed.
 *
 * An absent field is treated as zero rather than skipped. Bio-plasma's L4→L5 step is
 * exactly this case: `bounce` and `split` are undefined at L4 and 1 at L5, and those
 * two fields *are* the Virulent Cascade breakpoint. Skipping them would hide the whole
 * identity of the upgrade — the same class of omission this module exists to fix.
 */
function diffRow(
  label: string,
  from: number | undefined,
  to: number | undefined,
  dp = 0,
  suffix = '',
): string | null {
  if (from == null && to == null) return null;
  const a = round(from ?? 0, dp);
  const b = round(to ?? 0, dp);
  if (a === b) return null;
  return `${label} ${a}${suffix} → ${b}${suffix}`;
}

/** Volleys per second, the honest read on cadence. */
function rate(def: WeaponLevelDef): number {
  return def.cadence > 0 ? 1 / def.cadence : 0;
}

/** "Impact" for bio-plasma reads better than "Damage"; everything else is Damage. */
function damageLabel(weaponId: WeaponId): string {
  return weaponId === 'bioplasma' ? 'Impact' : 'Damage';
}

/**
 * Every mechanically relevant field, diffed.
 *
 * Ordered so the most decision-relevant change is first: structural changes (how many
 * things it fires, whether it pierces, whether it splits) outrank raw damage, because
 * a structural change is the actual identity of the upgrade.
 */
export function weaponStatDiff(
  weaponId: WeaponId,
  fromLevel: number,
  toLevel: number,
): string[] {
  const a = weaponStatsAtLevel(weaponId, fromLevel);
  const b = weaponStatsAtLevel(weaponId, toLevel);
  const isStrike = weaponId === 'orbital' || weaponId === 'rocket';
  const countLabel = isStrike ? 'Strikes' : weaponId === 'rail' ? 'Beams' : 'Projectiles';
  const rows: Array<string | null> = [
    diffRow(countLabel, a.count, b.count),
    diffRow('Chains', a.pierce, b.pierce),
    diffRow('Bounces', a.bounce, b.bounce),
    diffRow('Splits', a.split, b.split),
    diffRow(damageLabel(weaponId), a.damage, b.damage),
    diffRow('Puddle damage', a.puddleDamage, b.puddleDamage, 1),
    diffRow('Volley interval', a.cadence, b.cadence, 2, 's'),
    diffRow('Volleys/sec', rate(a), rate(b), 2),
    diffRow('Radius', a.radius, b.radius, 2),
    diffRow('Splash', a.splash, b.splash, 2),
    diffRow('Puddle radius', a.puddleRadius, b.puddleRadius, 1),
    diffRow('Puddle duration', a.puddleLife, b.puddleLife, 1, 's'),
    diffRow('Width', a.width, b.width, 2),
    diffRow('Length', a.length, b.length, 1),
    diffRow('Speed', a.speed, b.speed, 1),
    diffRow('Lifetime', a.life, b.life, 2, 's'),
  ];
  return rows.filter((r): r is string => r != null);
}

/**
 * Plain-language description of what an authored level step does.
 *
 * Derived from the diff so it cannot claim something the tables do not do, then
 * specialised per weapon so the sentence reads like the weapon rather than like a
 * generic template.
 */
export function weaponUpgradeSummary(
  weaponId: WeaponId,
  fromLevel: number,
  toLevel: number,
): string {
  const a = weaponStatsAtLevel(weaponId, fromLevel);
  const b = weaponStatsAtLevel(weaponId, toLevel);
  const fam = WEAPONS[weaponId];
  const parts: string[] = [];

  if (b.count > a.count) {
    const noun =
      weaponId === 'rail'
        ? 'beam'
        : weaponId === 'orbital'
          ? 'lance'
          : weaponId === 'rocket'
            ? 'rocket'
            : weaponId === 'gravity'
              ? 'well'
              : weaponId === 'microdrone'
                ? 'drone'
                : 'projectile';
    const plural = b.count === 1 ? noun : `${noun}s`;
    parts.push(
      `Fires ${b.count} ${plural} per volley instead of ${a.count}.`,
    );
  }
  if ((b.pierce ?? 0) > (a.pierce ?? 0)) {
    parts.push(
      weaponId === 'arc'
        ? `Lightning jumps to ${1 + (b.pierce ?? 0)} targets instead of ${1 + (a.pierce ?? 0)}.`
        : `Passes through ${b.pierce} targets instead of ${a.pierce}.`,
    );
  }
  if ((b.bounce ?? 0) > (a.bounce ?? 0)) parts.push('Globs now ricochet to a second target.');
  if ((b.split ?? 0) > (a.split ?? 0)) parts.push('Impacts split into smaller globs.');
  if (parts.length === 0) {
    // No structural change: say what actually got better, in order of magnitude.
    const dmgUp = b.damage > a.damage;
    const faster = b.cadence < a.cadence;
    const bigger = (b.radius ?? 0) > (a.radius ?? 0) || (b.splash ?? 0) > (a.splash ?? 0);
    const bits: string[] = [];
    if (dmgUp) bits.push('hits harder');
    if (faster) bits.push('fires faster');
    if (bigger) bits.push('covers more ground');
    const phrase =
      bits.length <= 1
        ? bits[0]
        : `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`;
    parts.push(phrase ? `${fam.name} ${phrase}.` : fam.description);
  }
  return parts.join(' ');
}

/**
 * The tradeoff line.
 *
 * A card that adds a projectile while slowing the volley is not a pure upgrade, and
 * hiding that is how a player ends up worse off after "upgrading". Twin Globs is
 * exactly this case: +1 projectile, but the volley interval goes 0.40s → 0.65s.
 */
export function weaponTradeoff(
  weaponId: WeaponId,
  fromLevel: number,
  toLevel: number,
): string | null {
  const a = weaponStatsAtLevel(weaponId, fromLevel);
  const b = weaponStatsAtLevel(weaponId, toLevel);
  const notes: string[] = [];
  if (b.cadence > a.cadence + 1e-6) {
    const pct = Math.round(((b.cadence - a.cadence) / a.cadence) * 100);
    notes.push(`fires ${pct}% less often`);
  }
  if ((b.radius ?? 0) < (a.radius ?? 0) - 1e-6) notes.push('smaller projectiles');
  if ((b.width ?? 0) < (a.width ?? 0) - 1e-6) notes.push('narrower beam');
  if ((b.splash ?? 0) < (a.splash ?? 0) - 1e-6) notes.push('less splash');
  if ((b.life ?? 0) < (a.life ?? 0) - 1e-6 && weaponId !== 'rocket' && weaponId !== 'orbital') {
    notes.push('shorter range');
  }
  if (notes.length === 0) return null;
  return `Tradeoff: ${notes.join(', ')}.`;
}

/** Card for levelling an owned weapon (authored L1–L5 or an Overclock). */
export function weaponUpgradeCard(
  weaponId: WeaponId,
  currentLevel: number,
): UpgradeCardCopy {
  const fam = WEAPONS[weaponId];
  const next = currentLevel + 1;
  const authored = next <= fam.levels.length;
  const stats = weaponStatDiff(weaponId, currentLevel, next);
  if (authored) {
    return {
      category: fam.prototype ? 'PROTOTYPE UPGRADE' : 'WEAPON UPGRADE',
      parent: fam.name.toUpperCase(),
      levels: `L${currentLevel} → L${next}`,
      name: fam.levels[next - 1]!.label,
      summary: weaponUpgradeSummary(weaponId, currentLevel, next),
      stats,
      tradeoff: weaponTradeoff(weaponId, currentLevel, next),
    };
  }
  const oc = overclockLevel(next);
  return {
    category: 'OVERCLOCK',
    parent: fam.name.toUpperCase(),
    levels: `L${currentLevel} → L${next}`,
    name: formatOverclockLabel(oc),
    summary: `Keeps the ${fam.levels[fam.levels.length - 1]!.label} structure and adds flat damage. Overclock damage is additive, so it never compounds.`,
    stats,
    tradeoff: null,
  };
}

/** Card for acquiring a weapon the player does not own. */
export function newWeaponCard(weaponId: WeaponId): UpgradeCardCopy {
  const fam = WEAPONS[weaponId];
  const l1 = weaponStatsAtLevel(weaponId, 1);
  const stats: string[] = [];
  const countLabel =
    weaponId === 'orbital' || weaponId === 'rocket'
      ? 'Strikes'
      : weaponId === 'rail'
        ? 'Beams'
        : 'Projectiles';
  stats.push(`${countLabel} ${l1.count}`);
  stats.push(`${damageLabel(weaponId)} ${round(l1.damage)}`);
  stats.push(`Volley interval ${round(l1.cadence, 2)}s`);
  if ((l1.pierce ?? 0) > 0) {
    stats.push(weaponId === 'arc' ? `Chains ${1 + (l1.pierce ?? 0)} targets` : `Pierces ${l1.pierce}`);
  }
  if (l1.radius != null) stats.push(`Radius ${round(l1.radius, 2)}`);
  if (l1.splash != null) stats.push(`Splash ${round(l1.splash, 2)}`);
  if (l1.puddleDamage != null) stats.push(`Puddle ${round(l1.puddleDamage, 1)}/s`);
  if (l1.length != null) stats.push(`Length ${round(l1.length, 1)}`);
  return {
    category: fam.prototype ? 'NEW PROTOTYPE' : 'NEW WEAPON',
    parent: fam.name.toUpperCase(),
    levels: '',
    name: fam.levels[0]!.label,
    summary: fam.prototype
      ? `${fam.description} Prototypes do not use an ordinary weapon slot.`
      : fam.description,
    stats,
    tradeoff: null,
  };
}

/**
 * Passive card copy.
 *
 * Passives were the least legible cards in the game: "Nanite Bleed — Regen 0.44/s →
 * 0.66/s" told the player neither what the passive does nor that it also improves
 * repair orbs. Each passive states its practical effect and both of its numbers.
 */
export function passiveCard(
  passiveId: PassiveId,
  currentLevel: number,
  maxHealth: number,
): UpgradeCardCopy {
  const def = PASSIVES.find((p) => p.id === passiveId)!;
  const next = currentLevel + 1;
  const stats: string[] = [];
  let summary = def.description;

  switch (passiveId) {
    case 'max-health': {
      const gain = hullPlatingGainAtLevel(next);
      stats.push(`Max integrity ${round(maxHealth)} → ${round(maxHealth + gain)}`);
      summary = 'Permanently increases maximum integrity. Also increases how much Nanite Bleed repairs, since regeneration scales with hull size.';
      break;
    }
    case 'regen': {
      const a = regenFractionAtLevel(currentLevel);
      const b = regenFractionAtLevel(next);
      stats.push(`Repair ${round(a * 100, 2)}%/s → ${round(b * 100, 2)}%/s of max integrity`);
      stats.push(`At ${round(maxHealth)} integrity: ${round(a * maxHealth, 2)}/s → ${round(b * maxHealth, 2)}/s`);
      const ra = repairOrbBonusAtLevel(currentLevel);
      const rb = repairOrbBonusAtLevel(next);
      if (rb > ra) stats.push(`Repair orbs +${round(ra * 100)}% → +${round(rb * 100)}%`);
      summary = `Repairs ${round(b * 100, 2)}% of maximum integrity per second after ${round(SURVIVOR.regenDamagePause, 0)} seconds without taking damage, and increases healing from repair orbs.`;
      break;
    }
    case 'move-speed': {
      const a = moveSpeedBonus(currentLevel);
      const b = moveSpeedBonus(next);
      stats.push(`Move speed +${round(a * 100)}% → +${round(b * 100)}%`);
      stats.push(`Hard cap +${round(moveSpeedBonus(def.maxLevel) * 100)}%`);
      summary = 'Move faster through the horde. Helps you keep spacing and reposition for surges and boss telegraphs.';
      break;
    }
    case 'pickup-radius': {
      const eA = SURVIVOR.xpMagnetBase + currentLevel * SURVIVOR.xpMagnetPerLevel;
      const eB = SURVIVOR.xpMagnetBase + next * SURVIVOR.xpMagnetPerLevel;
      const hA = SURVIVOR.healthMagnetBase + currentLevel * SURVIVOR.healthMagnetPerLevel;
      const hB = SURVIVOR.healthMagnetBase + next * SURVIVOR.healthMagnetPerLevel;
      stats.push(`Energy reach ${round(eA, 2)} → ${round(eB, 2)}`);
      stats.push(`Repair reach ${round(hA, 2)} → ${round(hB, 2)}`);
      stats.push('Pickups also travel to you faster');
      summary = 'Pulls energy and repair orbs from farther away, and pulls them in faster. Repair reach gains almost twice as much as energy reach. Ship and Mech forms keep their larger collection radii on top of this.';
      break;
    }
    case 'weapon-haste': {
      stats.push(`Fire rate +${round(currentLevel * def.perLevel * 100)}% → +${round(next * def.perLevel * 100)}%`);
      summary = 'Every weapon fires faster, including prototypes.';
      break;
    }
    case 'area': {
      stats.push(`Area +${round(currentLevel * def.perLevel * 100)}% → +${round(next * def.perLevel * 100)}%`);
      summary = 'Every weapon radius, blast and beam gets larger.';
      break;
    }
    case 'mech-cycle': {
      const a = mechCooldownReduction(currentLevel);
      const b = mechCooldownReduction(next);
      stats.push(`Mech cooldown ${round(SURVIVOR.mech.cooldown * (1 - a), 1)}s → ${round(SURVIVOR.mech.cooldown * (1 - b), 1)}s`);
      stats.push(`Hard cap −${round(mechCooldownReduction(def.maxLevel) * 100)}%`);
      summary = 'Mech Overdrive comes back sooner. The cooldown runs from activation to activation, including the time you spend in Mech.';
      break;
    }
    case 'mech-duration': {
      const a = mechDurationBonus(currentLevel);
      const b = mechDurationBonus(next);
      stats.push(`Mech duration ${round(SURVIVOR.mech.duration * (1 + a), 1)}s → ${round(SURVIVOR.mech.duration * (1 + b), 1)}s`);
      stats.push(`Hard cap +${round(mechDurationBonus(def.maxLevel) * 100)}%`);
      summary = 'Each Mech Overdrive lasts longer. It does not change the cooldown.';
      break;
    }
    case 'breach-shielding': {
      stats.push(`Boss damage taken −${round(currentLevel * def.perLevel * 100)}% → −${round(next * def.perLevel * 100)}%`);
      summary = 'Reduces damage from boss attacks only. Ordinary horde contact is unaffected.';
      break;
    }
  }

  const capped = Number.isFinite(def.maxLevel) && next >= def.maxLevel;
  if (capped) stats.push('Reaches its hard cap at this level');

  return {
    category: currentLevel > 0 ? 'PASSIVE UPGRADE' : 'NEW PASSIVE',
    parent: def.name.toUpperCase(),
    levels: currentLevel > 0 ? `L${currentLevel} → L${next}` : `L${next}`,
    name: def.name,
    summary,
    stats,
    tradeoff: null,
  };
}

/** Flatten card copy into the `title`/`body` an UpgradeChoice carries. */
export function cardToChoiceText(card: UpgradeCardCopy): { title: string; body: string } {
  const lines: string[] = [];
  lines.push(card.summary);
  for (const s of card.stats) lines.push(s);
  if (card.tradeoff) lines.push(card.tradeoff);
  return { title: card.name, body: lines.join('\n') };
}
