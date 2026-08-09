/** Boss time-to-kill probe used to choose endless-2.3.0 boss durability. */
import { bossTimeToKill } from '../src/game/modes/survivor/survivorWeaponBenchmark';
import type { PassiveId, WeaponId } from '../src/game/modes/survivor/survivorContent';

type B = { label: string; idx: number; weapons: Array<{ id: WeaponId; level: number }>; passives: Partial<Record<PassiveId, number>>; level: number };
const builds: B[] = [
  { label: 'boss1 appropriate', idx: 1, weapons: [{ id: 'pulse', level: 4 }, { id: 'microdrone', level: 4 }], passives: { 'weapon-haste': 2, area: 2 }, level: 10 },
  { label: 'boss1 balanced', idx: 1, weapons: [{ id: 'pulse', level: 3 }, { id: 'microdrone', level: 2 }], passives: { 'weapon-haste': 1, area: 1, 'move-speed': 1 }, level: 8 },
  { label: 'boss3 appropriate', idx: 3, weapons: [{ id: 'pulse', level: 5 }, { id: 'microdrone', level: 4 }, { id: 'rail', level: 3 }], passives: { 'weapon-haste': 3, area: 2 }, level: 16 },
  { label: 'boss5 MEGA appropriate', idx: 5, weapons: [{ id: 'pulse', level: 5 }, { id: 'microdrone', level: 5 }, { id: 'rail', level: 4 }, { id: 'bioplasma', level: 4 }], passives: { 'weapon-haste': 4, area: 3, 'max-health': 4 }, level: 24 },
  { label: 'boss10 MEGA appropriate', idx: 10, weapons: [{ id: 'pulse', level: 8 }, { id: 'microdrone', level: 8 }, { id: 'rail', level: 7 }, { id: 'bioplasma', level: 7 }, { id: 'gravity', level: 6 }], passives: { 'weapon-haste': 5, area: 5, 'max-health': 10 }, level: 45 },
];
for (const b of builds) {
  const a = bossTimeToKill({ bossIndex: b.idx, weapons: b.weapons, passives: b.passives, level: b.level, windowSec: 200 });
  const m = bossTimeToKill({ bossIndex: b.idx, weapons: b.weapons, passives: b.passives, level: b.level, form: 'mech', windowSec: 200 });
  console.log(`${b.label.padEnd(24)} HP ${String(Math.round(a.maxHealth)).padStart(7)} | astro ${(a.killed ? a.timeToKill.toFixed(1) : '>200').padStart(6)}s | mech ${(m.killed ? m.timeToKill.toFixed(1) : '>200').padStart(6)}s`);
}
