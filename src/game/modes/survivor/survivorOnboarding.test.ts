/**
 * First-ninety-seconds onboarding: the help strip must survive asset load and stay
 * until the player has actually used each ability. Wall-clock fade is the defect.
 */
import { describe, expect, it } from 'vitest';
import cssSource from '../../../styles/app.css?raw';
import hudSource from './survivorHud.ts?raw';
import { createSurvivorState } from './survivorState';
import { tryDodge, tryMech, tryRepulsor, tryShip } from './survivorSim';
import {
  onboardingHelpShouldFade,
  onboardingUseFromPlayer,
} from './survivorOnboarding';

function ruleBody(selector: string): string {
  const at = cssSource.indexOf(`${selector} {`);
  expect(at, `missing CSS rule for ${selector}`).toBeGreaterThan(-1);
  return cssSource.slice(at, cssSource.indexOf('}', at));
}

describe('onboarding help policy', () => {
  it('stays visible while any of the four abilities is still unused', () => {
    expect(
      onboardingHelpShouldFade(
        { dodge: true, repulsor: true, ship: true, mech: false },
        30,
      ),
    ).toBe(false);
    expect(
      onboardingHelpShouldFade(
        { dodge: false, repulsor: false, ship: false, mech: false },
        30,
      ),
    ).toBe(false);
  });

  it('fades only after every ability has been used at least once', () => {
    expect(
      onboardingHelpShouldFade(
        { dodge: true, repulsor: true, ship: true, mech: true },
        1,
      ),
    ).toBe(true);
  });

  it('does not fade on wall-clock delay while simulation time is still zero', () => {
    expect(
      onboardingHelpShouldFade(
        { dodge: true, repulsor: true, ship: true, mech: true },
        0,
      ),
    ).toBe(false);
    expect(hudSource).not.toMatch(/helpTimer\s*=\s*\(performance\.now/);
    expect(hudSource).not.toMatch(/startedAt\s*=\s*performance\.now/);
  });
});

describe('onboarding help presentation', () => {
  it('is large enough to read on a first run', () => {
    const body = ruleBody('.survivor-hud .sv-help');
    const size = body.match(/font-size:\s*([\d.]+)rem/);
    expect(size, 'sv-help has no rem font-size').toBeTruthy();
    expect(Number(size![1]), 'sv-help is still the 10.88px strip').toBeGreaterThanOrEqual(0.88);
  });

  it('uses high-contrast copy against the arena floor', () => {
    const body = ruleBody('.survivor-hud .sv-help');
    const color = body.match(/color:\s*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
    expect(color, 'sv-help has no rgba color').toBeTruthy();
    expect(Number(color![1]), 'sv-help alpha is still washed out').toBeGreaterThanOrEqual(0.9);
  });
});

describe('ability first-use is recorded by the simulation', () => {
  it('marks each ability only after a successful use', () => {
    const state = createSurvivorState('bee', null, 8110);
    expect(onboardingUseFromPlayer(state.player)).toEqual({
      dodge: false,
      repulsor: false,
      ship: false,
      mech: false,
    });

    expect(tryDodge(state, 1, 0)).toBe(true);
    expect(state.player.usedDodge).toBe(true);
    expect(tryRepulsor(state)).toBe(true);
    expect(state.player.usedRepulsor).toBe(true);
    expect(tryShip(state)).toBe(true);
    expect(state.player.usedShip).toBe(true);

    state.player.form = 'astronaut';
    state.player.shipDuration = 0;
    state.player.mechCd = 0;
    expect(tryMech(state)).toBe(true);
    expect(state.player.usedMech).toBe(true);
    expect(onboardingHelpShouldFade(onboardingUseFromPlayer(state.player), 1)).toBe(true);
  });

  it('does not mark an ability that was refused', () => {
    const state = createSurvivorState('bee', null, 8111);
    state.player.dodgeCd = 4;
    expect(tryDodge(state, 1, 0)).toBe(false);
    expect(state.player.usedDodge).toBe(false);
  });
});
