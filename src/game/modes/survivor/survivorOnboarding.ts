/**
 * First-run help policy. The HUD presents this; the simulation records first use.
 *
 * Help stays up until Dodge, Repulsor, Ship and Mech have each been used once.
 * Timing is simulation-owned — wall clock is how the strip used to vanish during
 * asset load, before the arena was even visible.
 */
export const ONBOARDING_ABILITIES = ['dodge', 'repulsor', 'ship', 'mech'] as const;
export type OnboardingAbility = (typeof ONBOARDING_ABILITIES)[number];

export type OnboardingUse = Record<OnboardingAbility, boolean>;

export function onboardingHelpShouldFade(used: OnboardingUse, simTime: number): boolean {
  // Simulation time, not wall clock: asset load must not consume the strip.
  if (simTime <= 0) return false;
  return ONBOARDING_ABILITIES.every((id) => used[id]);
}

export function onboardingUseFromPlayer(player: {
  usedDodge: boolean;
  usedRepulsor: boolean;
  usedShip: boolean;
  usedMech: boolean;
}): OnboardingUse {
  return {
    dodge: player.usedDodge,
    repulsor: player.usedRepulsor,
    ship: player.usedShip,
    mech: player.usedMech,
  };
}
