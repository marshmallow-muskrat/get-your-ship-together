import type { RunReportSnapshot } from './survivorRecords';
import { damageTakenLabel, sourceLabel } from './survivorTelemetry';

const FORM_LABEL: Record<string, string> = {
  astronaut: 'Astronaut',
  mech: 'Mech',
  ship: 'Ship',
};

const number = (value: number): string => Math.round(value).toLocaleString();
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

function section(root: HTMLElement, label: string): HTMLElement {
  const block = document.createElement('section');
  block.className = 'stored-report-section';
  const title = document.createElement('h4');
  title.textContent = label;
  block.appendChild(title);
  root.appendChild(block);
  return block;
}

function table(parent: HTMLElement, headers: string[], rows: string[][]): void {
  const grid = document.createElement('div');
  grid.className = 'stored-report-table';
  grid.style.gridTemplateColumns =
    `minmax(8.5rem, 1.8fr) repeat(${Math.max(0, headers.length - 1)}, minmax(4.4rem, 1fr))`;
  for (const header of headers) {
    const cell = document.createElement('strong');
    cell.className = 'stored-report-cell head';
    cell.textContent = header;
    grid.appendChild(cell);
  }
  for (const row of rows) {
    for (let i = 0; i < headers.length; i += 1) {
      const cell = document.createElement('span');
      cell.className = `stored-report-cell${row[0]?.startsWith('↳') ? ' sub' : ''}`;
      cell.textContent = row[i] ?? '';
      grid.appendChild(cell);
    }
  }
  parent.appendChild(grid);
}

/**
 * Full persisted telemetry for one historical run.
 *
 * Built with textContent only: local storage is untrusted input. New runs retain every
 * table from the live Run Report; older snapshots render the fields their version had.
 */
export function renderStoredRunReport(
  report: RunReportSnapshot,
  weaponName: (id: string) => string,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'stored-run-report';
  const totalDamage = report.sources.reduce((sum, row) => sum + row.damage, 0);
  const elapsed = Math.max(0.001, report.elapsed || 0.001);

  const overview = section(root, 'Run totals');
  table(overview, ['Metric', 'Value'], [
    ['Total damage', number(totalDamage)],
    ['Elite kills', String(report.eliteKills)],
    ['Miniboss kills', String(report.minibossKills)],
    ['Healed by repair orbs', number(report.healedByOrbs)],
    ['Healed by Nanite Bleed', number(report.healedByRegen)],
    ['Absorbed by Aegis', number(report.shieldAbsorbed)],
  ]);

  if (report.sources.length > 0) {
    const damage = section(root, 'Damage by source');
    const rows: string[][] = [];
    for (const source of report.sources) {
      rows.push([
        sourceLabel(source.id, weaponName),
        number(source.damage),
        percent(totalDamage > 0 ? source.damage / totalDamage : 0),
        (source.damage / elapsed).toFixed(1),
        String(source.hits),
        String(source.kills),
        number(source.bossDamage),
        number(source.maxHit),
      ]);
      for (const form of report.sourceForms.filter((row) => row.sourceId === source.id)) {
        rows.push([
          `↳ ${FORM_LABEL[form.form] ?? form.form}`,
          number(form.damage),
          percent(source.damage > 0 ? form.damage / source.damage : 0),
          '',
          String(form.hits),
          String(form.kills),
          number(form.bossDamage),
          number(form.maxHit),
        ]);
      }
    }
    table(damage, ['Source', 'Damage', '%', 'DPS', 'Hits', 'Kills', 'Boss', 'Max hit'], rows);
  }

  if (report.forms.length > 0) {
    const forms = section(root, 'Damage by form');
    table(
      forms,
      ['Form', 'Damage', '%', 'Uptime', 'Time', 'Active DPS'],
      report.forms.map((form) => [
        FORM_LABEL[form.form] ?? form.form,
        number(form.damage),
        percent(totalDamage > 0 ? form.damage / totalDamage : 0),
        percent(form.time / elapsed),
        clock(form.time),
        form.time > 0 ? (form.damage / form.time).toFixed(1) : '0.0',
      ]),
    );
  }

  if (report.bossKills.length > 0) {
    const bosses = section(root, 'Boss encounters');
    table(
      bosses,
      ['Boss', 'Time to kill', 'Build DPS', 'Finishing form'],
      report.bossKills.map((boss) => [
        `#${boss.index} ${boss.displayName}${boss.isMega ? ' [Mega]' : ''}`,
        `${boss.timeToKill.toFixed(1)}s`,
        boss.buildDps.toFixed(1),
        FORM_LABEL[boss.form] ?? boss.form,
      ]),
    );
  }

  if (report.damageTaken.length > 0) {
    const incoming = section(root, 'Damage taken by source');
    table(
      incoming,
      ['Source', 'Total'],
      report.damageTaken.map((row) => [damageTakenLabel(row.id), number(row.amount)]),
    );
  }

  if (report.cacheChoices.length > 0) {
    const caches = section(root, 'Protocol Cache picks');
    table(
      caches,
      ['Protocol', 'Count'],
      report.cacheChoices.map((row) => [row.id.replaceAll('-', ' '), String(row.count)]),
    );
  }

  if (report.megaChoices.length > 0) {
    const megas = section(root, 'Mega Cache picks');
    table(
      megas,
      ['Armament / refit', 'Count'],
      report.megaChoices.map((row) => [row.id.replaceAll('-', ' '), String(row.count)]),
    );
  }

  return root;
}
