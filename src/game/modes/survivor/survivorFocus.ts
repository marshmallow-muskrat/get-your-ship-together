/**
 * Focus-loss policy for the Containment Protocol runtime.
 *
 * Kept as a pure transition so the rules are unit-testable without a DOM, while
 * `SurvivorMode` owns only listener plumbing and the held-key/edge clearing.
 */
import type { SurvivorPhase } from './survivorState';
import type { ActionId } from './survivorKeybinds';

export interface FocusState {
  /** Live run phase, or null when no run exists yet. */
  phase: SurvivorPhase | null;
  settingsOpen: boolean;
  /** Keybind capture in progress, if any. */
  rebinding: ActionId | null;
  /** Pending upgrade-card selection that must not survive a focus change. */
  choiceIndex: number | null;
  inputBlocked: boolean;
}

/**
 * Only a hidden document counts as focus loss.
 * Returning to visible must never trigger the transition (and never auto-resumes).
 */
export function shouldHandleVisibility(hidden: boolean): boolean {
  return hidden === true;
}

/**
 * Applied on `window.blur` and on `document.visibilitychange` while hidden.
 *
 * - Pauses active play only. `levelup` and `protocol` keep their own phase so the
 *   player still owes the same decision when they come back.
 * - Never resumes: `paused` stays `paused`.
 * - Cancels keybind capture and drops any pending choice so nothing stale is applied.
 * - `inputBlocked` tracks the settings panel and nothing else.
 */
export function focusLossTransition(s: FocusState): FocusState {
  const pausable = s.phase === 'playing' && !s.settingsOpen;
  return {
    phase: pausable ? 'paused' : s.phase,
    settingsOpen: s.settingsOpen,
    rebinding: null,
    choiceIndex: null,
    inputBlocked: s.settingsOpen,
  };
}
