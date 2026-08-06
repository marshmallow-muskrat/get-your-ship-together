/** Versioned keyboard settings for Containment Protocol. */

export const SETTINGS_STORAGE_KEY = 'gyst.settings.v1';

export type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'dodge'
  | 'repulsor'
  | 'ship'
  | 'mech'
  | 'pause'
  | 'choice1'
  | 'choice2'
  | 'choice3'
  | 'mute';

export type KeybindMap = Record<ActionId, string>;

export const ACTION_LABELS: Record<ActionId, string> = {
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  dodge: 'Dodge',
  repulsor: 'Repulsor Burst',
  ship: 'Afterburner',
  mech: 'Mech Overdrive',
  pause: 'Pause',
  choice1: 'Level-Up Choice 1',
  choice2: 'Level-Up Choice 2',
  choice3: 'Level-Up Choice 3',
  mute: 'Mute',
};

export const DEFAULT_KEYBINDS: KeybindMap = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  dodge: 'Space',
  repulsor: 'KeyQ',
  ship: 'KeyE',
  mech: 'KeyR',
  pause: 'Escape',
  choice1: 'Digit1',
  choice2: 'Digit2',
  choice3: 'Digit3',
  mute: 'KeyM',
};

const ALL_ACTIONS = Object.keys(DEFAULT_KEYBINDS) as ActionId[];

export function isActionId(v: unknown): v is ActionId {
  return typeof v === 'string' && (ALL_ACTIONS as string[]).includes(v);
}

export function cloneDefaults(): KeybindMap {
  return { ...DEFAULT_KEYBINDS };
}

export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && code.length > 0 && code.length < 40;
}

/** Validate and repair a partial/malformed map → always returns a complete KeybindMap. */
export function normalizeKeybinds(raw: unknown): KeybindMap {
  const out = cloneDefaults();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  const used = new Set<string>();
  for (const action of ALL_ACTIONS) {
    const code = obj[action];
    if (isValidCode(code) && !used.has(code)) {
      out[action] = code;
      used.add(code);
    }
  }
  // Ensure uniqueness: if defaults collide with assigned, leave assigned and fix later actions
  const seen = new Set<string>();
  for (const action of ALL_ACTIONS) {
    if (seen.has(out[action])) {
      // find free default or synthetic
      const fallback = DEFAULT_KEYBINDS[action];
      if (!seen.has(fallback)) out[action] = fallback;
      else {
        // last resort unique code
        out[action] = `Unbound${action}`;
      }
    }
    seen.add(out[action]);
  }
  return out;
}

export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.5;
export const UI_SCALE_DEFAULT = 1;

export interface StoredSettings {
  version: 1;
  keybinds: KeybindMap;
  uiScale: number;
}

export function clampUiScale(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return UI_SCALE_DEFAULT;
  const stepped = Math.round(n * 20) / 20; // 0.05 steps
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped));
}

export function loadSettings(): StoredSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { version: 1, keybinds: cloneDefaults(), uiScale: UI_SCALE_DEFAULT };
    }
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { version: 1, keybinds: cloneDefaults(), uiScale: UI_SCALE_DEFAULT };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { version: 1, keybinds: cloneDefaults(), uiScale: UI_SCALE_DEFAULT };
    }
    const p = parsed as { version?: unknown; keybinds?: unknown; uiScale?: unknown };
    if (p.version !== 1) return { version: 1, keybinds: cloneDefaults(), uiScale: UI_SCALE_DEFAULT };
    return {
      version: 1,
      keybinds: normalizeKeybinds(p.keybinds),
      uiScale: clampUiScale(p.uiScale ?? UI_SCALE_DEFAULT),
    };
  } catch {
    return { version: 1, keybinds: cloneDefaults(), uiScale: UI_SCALE_DEFAULT };
  }
}

export function saveSettings(settings: StoredSettings): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const payload: StoredSettings = {
      version: 1,
      keybinds: normalizeKeybinds(settings.keybinds),
      uiScale: clampUiScale(settings.uiScale),
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

/** Assign code to action; if code is used by another action, swap. Returns new map. */
export function assignKeybind(map: KeybindMap, action: ActionId, code: string): KeybindMap {
  const next = { ...map };
  if (!isValidCode(code)) return next;
  let other: ActionId | null = null;
  for (const a of ALL_ACTIONS) {
    if (a !== action && next[a] === code) {
      other = a;
      break;
    }
  }
  if (other) {
    const prev = next[action];
    next[action] = code;
    next[other] = prev;
  } else {
    next[action] = code;
  }
  return next;
}

export function resetKeybinds(): KeybindMap {
  return cloneDefaults();
}

/** User-facing label from KeyboardEvent.code */
export function formatKeyCode(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Arrow')) return code.replace('Arrow', 'Arrow ');
  const special: Record<string, string> = {
    Escape: 'Esc',
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    MetaLeft: 'Meta',
    MetaRight: 'Meta',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Backquote: '`',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
  };
  if (special[code]) return special[code]!;
  if (code.startsWith('Unbound')) return '—';
  return code;
}

export function findActionForCode(map: KeybindMap, code: string): ActionId | null {
  for (const a of ALL_ACTIONS) {
    if (map[a] === code) return a;
  }
  return null;
}

export const REBINDABLE_ACTIONS: ActionId[] = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'dodge',
  'repulsor',
  'ship',
  'mech',
  'pause',
  'choice1',
  'choice2',
  'choice3',
  'mute',
];
