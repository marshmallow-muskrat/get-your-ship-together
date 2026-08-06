import type { HeroId } from '../game/content/heroes';
import { isHeroId } from '../game/content/heroes';
import { GystRuntime } from '../game/GystRuntime';
import { CrewSelectScreen } from '../screens/CrewSelectScreen';

export type DevFixture = 'combat' | 'boss' | 'mech' | null;

function parseFixture(): { heroId: HeroId | null; fixture: DevFixture } {
  const params = new URLSearchParams(window.location.search);
  const fixtureParam = params.get('fixture');
  const fixture: DevFixture =
    fixtureParam === 'combat' || fixtureParam === 'boss' || fixtureParam === 'mech'
      ? fixtureParam
      : null;
  const heroParam = params.get('hero');
  const heroId = heroParam && isHeroId(heroParam) ? heroParam : fixture ? 'bee' : null;
  return { heroId, fixture };
}

/**
 * Application shell: exclusive screen ownership (selection XOR game).
 */
export class AppController {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private selection: CrewSelectScreen | null = null;
  private runtime: GystRuntime | null = null;
  private transitioning = false;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement) {
    this.host = host;
    this.canvas = canvas;
  }

  async start(): Promise<void> {
    const { heroId, fixture } = parseFixture();
    if (heroId && fixture) {
      await this.mountGame(heroId, fixture);
      return;
    }
    await this.mountSelection();
  }

  private async mountSelection(): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.runtime?.dispose();
    this.runtime = null;
    this.selection?.dispose();
    this.selection = new CrewSelectScreen(this.host, this.canvas, {
      onContinue: (id) => {
        void this.mountGame(id, null);
      },
    });
    await this.selection.mount();
    this.transitioning = false;
  }

  private async mountGame(heroId: HeroId, fixture: DevFixture): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.selection?.dispose();
    this.selection = null;
    this.runtime?.dispose();
    this.runtime = new GystRuntime({
      heroId,
      host: this.host,
      canvas: this.canvas,
      fixture,
      handlers: {
        onReturnToCrew: () => {
          void this.mountSelection();
        },
      },
    });
    try {
      await this.runtime.start();
    } catch (err) {
      console.error('Failed to start game runtime', err);
      this.runtime.dispose();
      this.runtime = null;
      this.transitioning = false;
      await this.mountSelection();
      return;
    }
    this.transitioning = false;
  }
}
