import { screenToWorldMove } from '../../simulation/screenBasis';
import { SpatialHash } from './spatialHash';
import {
  HORDE,
  PASSIVES,
  SURVIVOR,
  SURVIVOR_BOSS,
  WEAPONS,
  compositionAt,
  spawnPressure,
  weaponLevelDef,
  xpForLevel,
  type PassiveId,
  type WeaponId,
} from './survivorContent';
import {
  nextEntityId,
  type SurvivorEnemy,
  type SurvivorPickup,
  type SurvivorProjectile,
  type SurvivorState,
  type UpgradeChoice,
} from './survivorState';

function wdef(weaponId: WeaponId, level: number) {
  return weaponLevelDef(weaponId, level);
}

export interface SurvivorInput {
  moveX: number; // screen stick
  moveY: number;
  mechPressed: boolean;
  pausePressed: boolean;
  mutePressed: boolean;
  choiceIndex: number | null; // 0–2 when selecting upgrade
}

export const EMPTY_SURVIVOR_INPUT: SurvivorInput = {
  moveX: 0,
  moveY: 0,
  mechPressed: false,
  pausePressed: false,
  mutePressed: false,
  choiceIndex: null,
};

const hash = new SpatialHash(2.4);
const queryBuf: number[] = [];

function rng(state: SurvivorState): number {
  // xorshift
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

function magnetRadius(state: SurvivorState): number {
  return SURVIVOR.xpMagnetBase + passiveLevel(state, 'pickup-radius') * 0.35;
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

function acquireEnemySlot(state: SurvivorState): SurvivorEnemy | null {
  for (let i = 0; i < state.enemies.length; i += 1) {
    if (!state.enemies[i]!.alive) return state.enemies[i]!;
  }
  if (state.enemies.length >= state.enemyCap) return null;
  const e: SurvivorEnemy = {
    id: 0,
    defId: 'basic',
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    health: 1,
    maxHealth: 1,
    radius: 0.4,
    role: 'basic',
    hitFlash: 0,
    attackCd: 0,
    alive: false,
    isElite: false,
    xp: 1,
    windup: 0,
    facingX: 0,
    facingZ: -1,
  };
  state.enemies.push(e);
  return e;
}

function spawnEnemy(state: SurvivorState, defId: string, x: number, z: number): void {
  const def = HORDE[defId];
  if (!def) return;
  const slot = acquireEnemySlot(state);
  if (!slot) return;
  const v = def.visual;
  slot.id = nextEntityId(state);
  slot.defId = defId;
  slot.x = x;
  slot.z = z;
  slot.vx = 0;
  slot.vz = 0;
  slot.health = v.maxHealth * (def.isElite ? 2.2 : 1);
  slot.maxHealth = slot.health;
  slot.radius = v.colliderRadius * (def.isElite ? 1.25 : 1);
  slot.role = def.role;
  slot.hitFlash = 0;
  slot.attackCd = 0.4 + rng(state) * 0.6;
  slot.alive = true;
  slot.isElite = !!def.isElite;
  slot.xp = def.xp;
  slot.windup = 0;
  slot.facingX = -x;
  slot.facingZ = -z;
  pushEffect(state, 'impact', x, z, 0.25, '#ff6688', 0.8);
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
  pushEffect(state, 'death', e.x, e.z, 0.4, '#ff8866', e.isElite ? 1.6 : 1);
  dropPickup(state, e.x, e.z, 'xp', e.xp);
  const charge =
    (e.isElite ? SURVIVOR.mech.chargePerElite : SURVIVOR.mech.chargePerKill) * mechChargeMul(state);
  if (state.player.form !== 'mech') {
    state.player.mechCharge = Math.min(1, state.player.mechCharge + charge);
  }
  if (e.isElite) {
    dropPickup(state, e.x + 0.3, e.z, 'supply', 1);
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
      // merge: boost nearest xp
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

function damageEnemy(state: SurvivorState, e: SurvivorEnemy, dmg: number): void {
  if (!e.alive) return;
  e.health -= dmg;
  e.hitFlash = 0.1;
  if (e.health <= 0) killEnemy(state, e);
}

function damagePlayer(state: SurvivorState, amount: number): void {
  const p = state.player;
  if (!p.alive || p.invuln > 0) return;
  const mul = p.form === 'mech' ? SURVIVOR.mech.damageTakenMul : 1;
  p.health = Math.max(0, p.health - amount * mul);
  p.hitFlash = 0.15;
  p.invuln = 0.55;
  if (p.health <= 0) {
    p.alive = false;
    p.health = 0;
    state.phase = 'defeat';
  }
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
    active: false,
  };
  state.projectiles.push(p);
  return p;
}

function nearestEnemy(state: SurvivorState, x: number, z: number, maxR: number): SurvivorEnemy | null {
  hash.query(x, z, maxR, queryBuf);
  let best: SurvivorEnemy | null = null;
  let bestD = maxR * maxR;
  const seen = new Set<number>();
  for (const id of queryBuf) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = state.enemies.find((en) => en.id === id && en.alive);
    if (!e) continue;
    const d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  // fallback full scan if hash empty (first frames)
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

function densestPoint(state: SurvivorState, originX: number, originZ: number): { x: number; z: number } {
  // Sample toward clusters: average of nearest few enemies
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

function fireWeapons(state: SurvivorState, dt: number): void {
  const p = state.player;
  const haste = hasteMul(state);
  const area = areaMul(state);
  const mech = p.form === 'mech';

  for (const slot of state.weapons) {
    slot.cooldown = Math.max(0, slot.cooldown - dt);
    if (slot.cooldown > 0) continue;
    const def = wdef(slot.weaponId, slot.level);
    const cadence = def.cadence / haste / (mech ? 1.2 : 1);
    slot.cooldown = cadence;
    const count = def.count + (mech ? 1 : 0);

    if (slot.weaponId === 'pulse') {
      const target = nearestEnemy(state, p.x, p.z, 14);
      if (!target) continue;
      const ang0 = Math.atan2(target.x - p.x, target.z - p.z);
      for (let i = 0; i < count; i += 1) {
        const spread = (i - (count - 1) / 2) * 0.12;
        const a = ang0 + spread;
        const proj = acquireProjectile(state);
        if (!proj) break;
        const spd = def.speed ?? 26;
        proj.id = nextEntityId(state);
        proj.kind = 'bolt';
        proj.weaponId = 'pulse';
        proj.x = p.x;
        proj.z = p.z;
        proj.vx = Math.sin(a) * spd;
        proj.vz = Math.cos(a) * spd;
        proj.damage = def.damage * (mech ? 1.4 : 1);
        proj.radius = (def.radius ?? 0.2) * area;
        proj.life = def.life ?? 1;
        proj.pierce = (def.pierce ?? 0) + (mech ? 1 : 0);
        proj.homing = false;
        proj.owner = 'player';
        proj.color = state.accent;
        proj.armTimer = 0;
        proj.explodeRadius = 0;
        proj.active = true;
      }
      pushEffect(state, 'muzzle', p.x, p.z, 0.08, state.accent, 0.8);
    } else if (slot.weaponId === 'microdrone') {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + state.time;
        const proj = acquireProjectile(state);
        if (!proj) break;
        const spd = def.speed ?? 12;
        proj.id = nextEntityId(state);
        proj.kind = 'drone';
        proj.weaponId = 'microdrone';
        proj.x = p.x + Math.cos(a) * 0.6;
        proj.z = p.z + Math.sin(a) * 0.6;
        proj.vx = Math.cos(a) * spd;
        proj.vz = Math.sin(a) * spd;
        proj.damage = def.damage * (mech ? 1.35 : 1);
        proj.radius = (def.radius ?? 0.18) * area;
        proj.life = (def.life ?? 2.2) * (mech ? 1.2 : 1);
        proj.pierce = 0;
        proj.homing = true;
        proj.owner = 'player';
        proj.color = state.accent;
        proj.armTimer = 0;
        proj.explodeRadius = 0;
        proj.active = true;
      }
    } else if (slot.weaponId === 'rail') {
      for (let i = 0; i < count; i += 1) {
        const target = nearestEnemy(state, p.x, p.z, 16);
        let fx = p.facingX;
        let fz = p.facingZ;
        if (target) {
          const len = Math.hypot(target.x - p.x, target.z - p.z) || 1;
          fx = (target.x - p.x) / len;
          fz = (target.z - p.z) / len;
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
        const dmg = def.damage * (mech ? 1.45 : 1);
        for (const e of state.enemies) {
          if (!e.alive) continue;
          if (segmentHit(p.x + ox, p.z + oz, x1, z1, e.x, e.z, e.radius + width * 0.5)) {
            damageEnemy(state, e, dmg);
          }
        }
        if (state.boss.active && state.boss.state !== 'dead') {
          if (
            segmentHit(
              p.x + ox,
              p.z + oz,
              x1,
              z1,
              state.boss.x,
              state.boss.z,
              SURVIVOR_BOSS.colliderRadius + width * 0.5,
            )
          ) {
            damageBoss(state, dmg * 0.85);
          }
        }
      }
    } else if (slot.weaponId === 'gravity') {
      for (let i = 0; i < count; i += 1) {
        const delay = i * 0.12;
        const radius = (def.radius ?? 3) * area * (mech ? 1.2 : 1);
        // apply immediately for first; later pulses offset slightly
        const cx = p.x + state.player.facingX * i * 0.8;
        const cz = p.z + state.player.facingZ * i * 0.8;
        pushEffect(state, 'pulse', cx, cz, 0.4 + delay * 0.1, state.accent, radius, { radius });
        const dmg = def.damage * (mech ? 1.4 : 1);
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const dx = e.x - cx;
          const dz = e.z - cz;
          if (dx * dx + dz * dz <= (radius + e.radius) ** 2) {
            damageEnemy(state, e, dmg);
            const len = Math.hypot(dx, dz) || 1;
            e.x -= (dx / len) * 0.35;
            e.z -= (dz / len) * 0.35;
          }
        }
        if (state.boss.active && state.boss.state !== 'dead') {
          const dx = state.boss.x - cx;
          const dz = state.boss.z - cz;
          if (dx * dx + dz * dz <= (radius + SURVIVOR_BOSS.colliderRadius) ** 2) {
            damageBoss(state, dmg * 0.7);
          }
        }
      }
    } else if (slot.weaponId === 'rocket') {
      const cluster = densestPoint(state, p.x, p.z);
      for (let i = 0; i < count; i += 1) {
        const ox = (i - (count - 1) / 2) * 0.9;
        const tx = cluster.x - state.player.facingZ * ox + (rng(state) - 0.5) * 0.6;
        const tz = cluster.z + state.player.facingX * ox + (rng(state) - 0.5) * 0.6;
        const proj = acquireProjectile(state);
        if (!proj) break;
        const arm = 0.35 + i * 0.06;
        proj.id = nextEntityId(state);
        proj.kind = 'rocket';
        proj.weaponId = 'rocket';
        proj.x = tx;
        proj.z = tz;
        proj.vx = 0;
        proj.vz = 0;
        proj.damage = def.damage * (mech ? 1.35 : 1);
        proj.radius = 0.25;
        proj.life = arm + 0.05;
        proj.pierce = 0;
        proj.homing = false;
        proj.owner = 'player';
        proj.color = state.accent;
        proj.armTimer = arm;
        proj.explodeRadius = (def.radius ?? 1.4) * area * (mech ? 1.2 : 1);
        proj.active = true;
        pushEffect(state, 'telegraph', tx, tz, arm, state.accent, proj.explodeRadius, {
          radius: proj.explodeRadius,
        });
      }
    }
  }
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

function damageBoss(state: SurvivorState, dmg: number): void {
  const b = state.boss;
  if (!b.active || b.state === 'dead') return;
  b.health = Math.max(0, b.health - dmg);
  b.hitFlash = 0.1;
  if (b.health <= 0) {
    b.state = 'dead';
    b.timer = 1.2;
    pushEffect(state, 'death', b.x, b.z, 1.2, '#66e0ff', 3.5);
    state.phase = 'victory';
  }
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
    if (proj.kind === 'rocket') {
      proj.armTimer -= dt;
      proj.life -= dt;
      if (proj.armTimer > 0) continue;
      // explode
      pushEffect(state, 'impact', proj.x, proj.z, 0.35, proj.color, proj.explodeRadius * 1.3);
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const dx = e.x - proj.x;
        const dz = e.z - proj.z;
        if (dx * dx + dz * dz <= (proj.explodeRadius + e.radius) ** 2) {
          damageEnemy(state, e, proj.damage);
        }
      }
      if (state.boss.active && state.boss.state !== 'dead') {
        const dx = state.boss.x - proj.x;
        const dz = state.boss.z - proj.z;
        if (dx * dx + dz * dz <= (proj.explodeRadius + SURVIVOR_BOSS.colliderRadius) ** 2) {
          damageBoss(state, proj.damage);
        }
      }
      proj.active = false;
      continue;
    }

    if (proj.homing) {
      const t = nearestEnemy(state, proj.x, proj.z, 12);
      let tx = state.player.x;
      let tz = state.player.z;
      if (t) {
        tx = t.x;
        tz = t.z;
      } else if (state.boss.active && state.boss.state !== 'dead') {
        tx = state.boss.x;
        tz = state.boss.z;
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
      let hit = false;
      hash.query(proj.x, proj.z, proj.radius + 1.2, queryBuf);
      const seen = new Set<number>();
      for (const id of queryBuf) {
        if (seen.has(id)) continue;
        seen.add(id);
        const e = state.enemies.find((en) => en.id === id && en.alive);
        if (!e) continue;
        const dx = e.x - proj.x;
        const dz = e.z - proj.z;
        if (dx * dx + dz * dz <= (proj.radius + e.radius) ** 2) {
          damageEnemy(state, e, proj.damage);
          hit = true;
          if (proj.pierce > 0) proj.pierce -= 1;
          else {
            proj.active = false;
            pushEffect(state, 'impact', proj.x, proj.z, 0.12, proj.color, 0.5);
            break;
          }
        }
      }
      if (proj.active && state.boss.active && state.boss.state !== 'dead') {
        const dx = state.boss.x - proj.x;
        const dz = state.boss.z - proj.z;
        if (dx * dx + dz * dz <= (proj.radius + SURVIVOR_BOSS.colliderRadius) ** 2) {
          damageBoss(state, proj.damage);
          if (proj.pierce > 0) proj.pierce -= 1;
          else {
            proj.active = false;
            pushEffect(state, 'impact', proj.x, proj.z, 0.12, proj.color, 0.6);
          }
        }
      }
      void hit;
    } else {
      const p = state.player;
      const dx = p.x - proj.x;
      const dz = p.z - proj.z;
      if (dx * dx + dz * dz <= (proj.radius + SURVIVOR.playerRadius) ** 2) {
        damagePlayer(state, proj.damage);
        proj.active = false;
        pushEffect(state, 'impact', proj.x, proj.z, 0.12, '#ff5566', 0.6);
      }
    }
  }
}

function updateEnemies(state: SurvivorState, dt: number): void {
  const p = state.player;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.attackCd = Math.max(0, e.attackCd - dt);

    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ndx = dx / dist;
    const ndz = dz / dist;
    e.facingX = ndx;
    e.facingZ = ndz;

    const visual = HORDE[e.defId]?.visual;
    const speed = (visual?.moveSpeed ?? 3) * (e.role === 'fast' ? 1.15 : 1);

    if (e.role === 'ranged') {
      if (dist < 4.5) {
        e.x -= ndx * speed * dt;
        e.z -= ndz * speed * dt;
      } else if (dist > 8) {
        e.x += ndx * speed * dt;
        e.z += ndz * speed * dt;
      } else {
        // orbit
        e.x += -ndz * speed * 0.7 * dt;
        e.z += ndx * speed * 0.7 * dt;
      }
      if (e.attackCd <= 0 && dist < 10 && dist > 2.5) {
        e.attackCd = visual?.attackCooldown ?? 1.8;
        const proj = acquireProjectile(state);
        if (proj) {
          const spd = visual?.projectileSpeed ?? 12;
          proj.id = nextEntityId(state);
          proj.kind = 'enemy';
          proj.weaponId = null;
          proj.x = e.x;
          proj.z = e.z;
          proj.vx = ndx * spd;
          proj.vz = ndz * spd;
          proj.damage = visual?.damage ?? 7;
          proj.radius = visual?.projectileRadius ?? 0.2;
          proj.life = 2.2;
          proj.pierce = 0;
          proj.homing = false;
          proj.owner = 'enemy';
          proj.color = '#ff5566';
          proj.armTimer = 0;
          proj.explodeRadius = 0;
          proj.active = true;
        }
      }
    } else {
      e.x += ndx * speed * dt;
      e.z += ndz * speed * dt;
      // contact damage
      if (dist < e.radius + SURVIVOR.playerRadius + 0.05) {
        if (e.attackCd <= 0) {
          e.attackCd = 0.75;
          damagePlayer(state, Math.max(4, (visual?.damage ?? 8) * 0.65));
        }
      }
    }

    // soft separation via hash
    hash.query(e.x, e.z, e.radius * 3, queryBuf);
    let sepX = 0;
    let sepZ = 0;
    let n = 0;
    const seen = new Set<number>();
    for (const id of queryBuf) {
      if (id === e.id || seen.has(id)) continue;
      seen.add(id);
      const o = state.enemies.find((en) => en.id === id && en.alive);
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
    // allow slightly outside for edge spawns pulling in
    e.x = c.x;
    e.z = c.z;
  }
}

function updatePickups(state: SurvivorState, dt: number): void {
  const p = state.player;
  const mag = magnetRadius(state);
  for (const pk of state.pickups) {
    if (!pk.active) continue;
    const dx = p.x - pk.x;
    const dz = p.z - pk.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < mag * mag) pk.magnetized = true;
    if (pk.magnetized) {
      const d = Math.sqrt(d2) || 1;
      const spd = 14;
      pk.x += (dx / d) * spd * dt;
      pk.z += (dz / d) * spd * dt;
    }
    if (d2 < 0.55) {
      pk.active = false;
      if (pk.kind === 'xp') {
        gainXp(state, pk.value);
        pushEffect(state, 'pickup', pk.x, pk.z, 0.25, '#88ffcc', 0.7);
      } else if (pk.kind === 'repair') {
        p.health = Math.min(p.maxHealth, p.health + pk.value);
        pushEffect(state, 'pulse', p.x, p.z, 0.4, '#4df0d0', 1.4);
      } else if (pk.kind === 'supply') {
        openSupply(state);
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

export function generateChoices(state: SurvivorState): UpgradeChoice[] {
  const pool: UpgradeChoice[] = [];
  // upgrade owned weapons
  for (const w of state.weapons) {
    const fam = WEAPONS[w.weaponId];
    if (w.level < fam.levels.length) {
      const next = fam.levels[w.level]!;
      pool.push({
        kind: 'weapon',
        id: `w-${w.weaponId}-${w.level + 1}`,
        title: next.label,
        body: fam.description,
        weaponId: w.weaponId,
      });
    }
  }
  // new weapons
  if (state.weapons.length < 5) {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      if (ownedWeaponLevel(state, id) > 0) continue;
      const fam = WEAPONS[id];
      pool.push({
        kind: 'new-weapon',
        id: `new-${id}`,
        title: fam.name,
        body: fam.description,
        weaponId: id,
      });
    }
  }
  // passives
  for (const pas of PASSIVES) {
    const lv = passiveLevel(state, pas.id);
    if (lv >= pas.maxLevel) continue;
    pool.push({
      kind: 'passive',
      id: `p-${pas.id}-${lv + 1}`,
      title: `${pas.name} ${lv + 1}`,
      body: pas.description,
      passiveId: pas.id,
    });
  }

  // shuffle pick 3 unique families
  const choices: UpgradeChoice[] = [];
  const used = new Set<string>();
  const bag = [...pool];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng(state) * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  for (const c of bag) {
    const key =
      c.kind === 'passive' ? `p:${c.passiveId}` : c.kind === 'new-weapon' ? `n:${c.weaponId}` : `u:${c.weaponId}`;
    if (used.has(key)) continue;
    used.add(key);
    choices.push(c);
    if (choices.length >= 3) break;
  }
  // pad if needed
  while (choices.length < 3 && bag.length > 0) {
    const c = bag[choices.length % bag.length]!;
    choices.push(c);
  }
  return choices.slice(0, 3);
}

function openLevelUp(state: SurvivorState): void {
  state.phase = 'levelup';
  state.choices = generateChoices(state);
  pushEffect(state, 'levelup', state.player.x, state.player.z, 0.6, state.accent, 2);
}

function openSupply(state: SurvivorState): void {
  // grant random weapon upgrade or big heal
  if (rng(state) < 0.45) {
    state.player.health = Math.min(state.player.maxHealth, state.player.health + 35);
    pushEffect(state, 'pulse', state.player.x, state.player.z, 0.5, '#4df0d0', 1.8);
  } else {
    const upgradable = state.weapons.filter((w) => w.level < WEAPONS[w.weaponId].levels.length);
    if (upgradable.length > 0) {
      const w = upgradable[Math.floor(rng(state) * upgradable.length)]!;
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
    if (slot) slot.level = Math.min(WEAPONS[slot.weaponId].levels.length, slot.level + 1);
  } else if (choice.kind === 'new-weapon' && choice.weaponId) {
    if (!state.weapons.some((w) => w.weaponId === choice.weaponId)) {
      state.weapons.push({ weaponId: choice.weaponId, level: 1, cooldown: 0.5 });
    }
  } else if (choice.kind === 'passive' && choice.passiveId) {
    const id = choice.passiveId;
    state.passives[id] = (state.passives[id] ?? 0) + 1;
    if (id === 'max-health') {
      state.player.maxHealth += 20;
      state.player.health += 20;
    }
  }
  state.choices = [];
  state.phase = 'playing';
}

function updatePlayer(state: SurvivorState, input: SurvivorInput, dt: number): void {
  const p = state.player;
  if (!p.alive) return;
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);

  // regen
  const regen = passiveLevel(state, 'regen') * 0.8;
  if (regen > 0 && p.health < p.maxHealth) {
    p.health = Math.min(p.maxHealth, p.health + regen * dt);
  }

  // mech form
  if (p.form === 'mech') {
    p.mechDuration -= dt;
    if (p.mechDuration <= 0) {
      p.form = 'astronaut';
      p.formTimer = 0;
      pushEffect(state, 'transform', p.x, p.z, 0.45, '#88e0ff', 1.5);
    }
  } else if (input.mechPressed && p.mechCharge >= 1) {
    p.form = 'mech';
    p.mechCharge = 0;
    p.mechDuration = SURVIVOR.mech.duration * mechDurationMul(state);
    p.invuln = Math.max(p.invuln, 0.4);
    pushEffect(state, 'transform', p.x, p.z, 0.65, state.accent, 2.2);
  }

  const world = screenToWorldMove(input.moveX, input.moveY);
  const len = Math.hypot(world.x, world.z);
  let speed = SURVIVOR.playerSpeed * moveMul(state);
  if (p.form === 'mech') speed *= 0.92;
  if (len > 0.1) {
    const nx = world.x / len;
    const nz = world.z / len;
    p.x += nx * speed * dt;
    p.z += nz * speed * dt;
    p.facingX = nx;
    p.facingZ = nz;
  }
  const c = clampArena(p.x, p.z, SURVIVOR.playerRadius);
  p.x = c.x;
  p.z = c.z;
}

function updateSpawns(state: SurvivorState, dt: number): void {
  if (state.boss.active && state.boss.state !== 'dead') {
    // reduced spawn
    state.spawnAcc += dt * spawnPressure(state.time) * 0.45;
  } else {
    state.spawnAcc += dt * spawnPressure(state.time) * 2.8;
  }
  const alive = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  while (state.spawnAcc >= 1 && alive + 1 <= state.enemyCap) {
    state.spawnAcc -= 1;
    const pos = edgeSpawn(state);
    spawnEnemy(state, pickComposition(state), pos.x, pos.z);
  }

  state.eliteTimer -= dt;
  if (state.eliteTimer <= 0 && state.time > 100) {
    state.eliteTimer = 22 + rng(state) * 14;
    const pos = edgeSpawn(state);
    spawnEnemy(state, 'elite', pos.x, pos.z);
  }
}

function ensureBoss(state: SurvivorState): void {
  if (state.boss.active || state.time < SURVIVOR.bossTime) return;
  state.boss.active = true;
  state.boss.x = 0;
  state.boss.z = -SURVIVOR.arenaHalf * 0.35;
  state.boss.health = SURVIVOR_BOSS.maxHealth;
  state.boss.maxHealth = SURVIVOR_BOSS.maxHealth;
  state.boss.state = 'idle';
  state.boss.timer = 1.2;
  state.boss.pattern = null;
  pushEffect(state, 'transform', state.boss.x, state.boss.z, 1, '#ff4455', 3);
}

function updateBoss(state: SurvivorState, dt: number): void {
  const b = state.boss;
  if (!b.active || b.state === 'dead') return;
  if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
  const p = state.player;
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const dist = Math.hypot(dx, dz) || 1;
  b.facingX = dx / dist;
  b.facingZ = dz / dist;
  b.timer -= dt;

  if (b.state === 'idle') {
    if (dist > 5) {
      b.x += b.facingX * SURVIVOR_BOSS.moveSpeed * dt;
      b.z += b.facingZ * SURVIVOR_BOSS.moveSpeed * dt;
    }
    if (b.timer <= 0) {
      const roll = rng(state);
      b.pattern = roll < 0.28 ? 'pulse' : roll < 0.55 ? 'line' : roll < 0.78 ? 'fan' : 'summon';
      b.state = 'windup';
      if (b.pattern === 'pulse') {
        const pulse = SURVIVOR_BOSS.patterns.pulse;
        b.timer = pulse.windup;
        pushEffect(state, 'telegraph', b.x, b.z, pulse.windup, '#ffaa33', pulse.maxRadius, {
          radius: pulse.maxRadius,
        });
      } else if (b.pattern === 'line') {
        const line = SURVIVOR_BOSS.patterns.line;
        b.timer = line.windup;
        b.chargeX = b.facingX;
        b.chargeZ = b.facingZ;
        pushEffect(state, 'telegraph', b.x, b.z, line.windup, '#ff4455', 1, {
          facingX: b.chargeX,
          facingZ: b.chargeZ,
          length: line.length,
          width: line.width,
        });
      } else if (b.pattern === 'fan') {
        b.timer = SURVIVOR_BOSS.patterns.fan.windup;
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
      if (Math.abs(d - b.telegraphR) < 1.1) damagePlayer(state, pulse.damage * dt * 2.5);
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = pulse.recovery;
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
        damagePlayer(state, line.damage);
      }
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = line.recovery;
        b.pattern = null;
        b.telegraphR = 0;
      }
    } else if (b.pattern === 'fan') {
      const fan = SURVIVOR_BOSS.patterns.fan;
      if (b.timer > fan.active * 0.7) {
        for (let i = 0; i < fan.count; i += 1) {
          const a = Math.atan2(b.facingX, b.facingZ) + (i - (fan.count - 1) / 2) * 0.28;
          const proj = acquireProjectile(state);
          if (!proj) break;
          proj.id = nextEntityId(state);
          proj.kind = 'enemy';
          proj.weaponId = null;
          proj.x = b.x;
          proj.z = b.z;
          proj.vx = Math.sin(a) * fan.speed;
          proj.vz = Math.cos(a) * fan.speed;
          proj.damage = fan.damage;
          proj.radius = 0.28;
          proj.life = 2.5;
          proj.pierce = 0;
          proj.homing = false;
          proj.owner = 'enemy';
          proj.color = '#ff6688';
          proj.armTimer = 0;
          proj.explodeRadius = 0;
          proj.active = true;
        }
      }
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = fan.recovery;
        b.pattern = null;
        b.telegraphR = 0;
      }
    } else if (b.pattern === 'summon') {
      const summon = SURVIVOR_BOSS.patterns.summon;
      if (b.timer > summon.active * 0.5) {
        for (let i = 0; i < Math.min(4, summon.count); i += 1) {
          const ang = rng(state) * Math.PI * 2;
          spawnEnemy(state, 'basic', b.x + Math.cos(ang) * 3, b.z + Math.sin(ang) * 3);
        }
      }
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = summon.recovery;
        b.pattern = null;
        b.telegraphR = 0;
      }
    }
    return;
  }

  if (b.state === 'recover' && b.timer <= 0) {
    b.state = 'idle';
    b.timer = 0.5 + rng(state) * 0.4;
  }
}

export function stepSurvivor(state: SurvivorState, input: SurvivorInput, dt: number): void {
  if (input.mutePressed) state.muted = !state.muted;

  if (state.phase === 'levelup') {
    if (input.choiceIndex != null && input.choiceIndex >= 0 && input.choiceIndex < 3) {
      applyChoice(state, input.choiceIndex);
    }
    // decay effects only
    state.effects = state.effects
      .map((e) => ({ ...e, life: e.life - dt }))
      .filter((e) => e.life > 0);
    return;
  }

  if (input.pausePressed && (state.phase === 'playing' || state.phase === 'paused')) {
    state.phase = state.phase === 'paused' ? 'playing' : 'paused';
  }
  if (state.phase === 'paused' || state.phase === 'victory' || state.phase === 'defeat') {
    state.effects = state.effects
      .map((e) => ({ ...e, life: e.life - dt }))
      .filter((e) => e.life > 0);
    return;
  }

  state.time += dt;
  // Consume pending level-up XP (pickups or fixtures).
  if (state.xp >= state.xpNext && state.phase === 'playing') {
    state.xp -= state.xpNext;
    state.level += 1;
    state.xpNext = xpForLevel(state.level);
    openLevelUp(state);
    return;
  }
  ensureBoss(state);
  updatePlayer(state, input, dt);
  rebuildHash(state);
  fireWeapons(state, dt);
  updateProjectiles(state, dt);
  updateEnemies(state, dt);
  updateBoss(state, dt);
  updatePickups(state, dt);
  updateSpawns(state, dt);

  state.rails = state.rails
    .map((r) => ({ ...r, life: r.life - dt }))
    .filter((r) => r.life > 0);
  state.effects = state.effects
    .map((e) => ({ ...e, life: e.life - dt }))
    .filter((e) => e.life > 0);

  state.metrics.enemies = state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  state.metrics.projectiles = state.projectiles.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  state.metrics.pickups = state.pickups.reduce((n, p) => n + (p.active ? 1 : 0), 0);
}

