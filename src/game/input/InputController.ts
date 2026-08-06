import type { InputFrame } from '../simulation/types';
import { EMPTY_INPUT } from '../simulation/types';
import { screenToWorldMove } from '../simulation/screenBasis';

/**
 * Keyboard + pointer input for the vertical slice.
 * WASD is screen-relative (Gloamreach convention), then converted to world XZ.
 */
export class InputController {
  private keys = new Set<string>();
  private fireHeld = false;
  private edge = {
    fire: false,
    dodge: false,
    ability: false,
    repair: false,
    mech: false,
    pause: false,
    mute: false,
    interact: false,
  };
  private aimWorld = { x: 0, z: 1 };
  private bound = false;
  private canvas: HTMLElement | null = null;

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) || key === 'escape') {
      e.preventDefault();
    }
    if (e.repeat) {
      this.keys.add(key);
      return;
    }
    this.keys.add(key);
    if (key === ' ' || key === 'shift') this.edge.dodge = true;
    if (key === 'q' || key === '1') this.edge.ability = true;
    if (key === 'e') this.edge.repair = true;
    if (key === 'r') this.edge.mech = true;
    if (key === 'j') {
      this.fireHeld = true;
      this.edge.fire = true;
    }
    if (key === 'escape') this.edge.pause = true;
    if (key === 'm') this.edge.mute = true;
    if (key === 'f' || key === 'enter') this.edge.interact = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this.keys.delete(key);
    if (key === 'j') this.fireHeld = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.fireHeld = true;
      this.edge.fire = true;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.fireHeld = false;
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.fireHeld = false;
  };

  attach(canvas: HTMLElement): void {
    if (this.bound) return;
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    this.bound = true;
  }

  detach(): void {
    if (!this.bound) return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas = null;
    this.keys.clear();
    this.fireHeld = false;
    this.bound = false;
  }

  setAimWorld(x: number, z: number): void {
    this.aimWorld.x = x;
    this.aimWorld.z = z;
  }

  sample(): InputFrame {
    // Screen stick: +x = right on screen, +y = up on screen.
    let sx = 0;
    let sy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) sx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) sx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) sy += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) sy -= 1;

    const world = screenToWorldMove(sx, sy);

    const frame: InputFrame = {
      ...EMPTY_INPUT,
      moveX: world.x,
      moveZ: world.z,
      aimX: this.aimWorld.x,
      aimZ: this.aimWorld.z,
      fireHeld: this.fireHeld || this.keys.has('j'),
      firePressed: this.edge.fire,
      dodgePressed: this.edge.dodge,
      abilityPressed: this.edge.ability,
      repairPressed: this.edge.repair,
      mechPressed: this.edge.mech,
      pausePressed: this.edge.pause,
      mutePressed: this.edge.mute,
      interactPressed: this.edge.interact,
    };

    this.edge.fire = false;
    this.edge.dodge = false;
    this.edge.ability = false;
    this.edge.repair = false;
    this.edge.mech = false;
    this.edge.pause = false;
    this.edge.mute = false;
    this.edge.interact = false;

    return frame;
  }
}
