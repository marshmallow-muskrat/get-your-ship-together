import type { HeroId } from '../game/content/heroes';
import { isHeroId } from '../game/content/heroes';
import { AudioBus } from '../game/audio/AudioBus';
import { SurvivorMode } from '../game/modes/survivor/SurvivorMode';
import {
  ALL_SURVIVOR_FIXTURES,
  type SurvivorFixture,
} from '../game/modes/survivor/survivorContent';
import { CrewSelectScreen } from '../screens/CrewSelectScreen';

function parseLaunch(): {
  heroId: HeroId | null;
  launchGame: boolean;
  fixture: SurvivorFixture;
} {
  const params = new URLSearchParams(window.location.search);
  const fixtureParam = params.get('fixture');
  const modeParam = params.get('mode');

  // Single source of truth — a new fixture is routable the moment it is declared.
  const knownFixture =
    fixtureParam && (ALL_SURVIVOR_FIXTURES as string[]).includes(fixtureParam)
      ? (fixtureParam as SurvivorFixture)
      : null;

  // Retired campaign modes never launch a campaign runtime.
  const wantsGame =
    modeParam === 'survivor' ||
    modeParam === 'containment' ||
    !!knownFixture ||
    // Treat bare mode=campaign as crew select (no campaign runtime).
    false;

  const heroParam = params.get('hero');
  const heroId = heroParam && isHeroId(heroParam) ? heroParam : wantsGame ? 'bee' : null;

  return {
    heroId,
    launchGame: wantsGame,
    fixture: knownFixture ?? (wantsGame ? 'survivor-start' : null),
  };
}

/**
 * Application shell: crew selection + Containment Protocol only.
 */
export class AppController {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly audio = new AudioBus();
  private selection: CrewSelectScreen | null = null;
  private survivor: SurvivorMode | null = null;
  private transitioning = false;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement) {
    this.host = host;
    this.canvas = canvas;
  }

  async start(): Promise<void> {
    const launch = parseLaunch();
    if (launch.launchGame) {
      await this.mountSurvivor(launch.heroId ?? 'bee', launch.fixture);
      return;
    }
    await this.mountSelection();
  }

  private disposeAllModes(): void {
    this.survivor?.dispose();
    this.survivor = null;
    this.selection?.dispose();
    this.selection = null;
  }

  private async mountSelection(): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.disposeAllModes();
    this.selection = new CrewSelectScreen(
      this.host,
      this.canvas,
      {
        onLaunch: (id) => {
          void this.mountSurvivor(id, null);
        },
      },
      this.audio,
    );
    await this.selection.mount();
    this.transitioning = false;
  }

  private async mountSurvivor(heroId: HeroId, fixture: SurvivorFixture): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.disposeAllModes();
    this.survivor = new SurvivorMode({
      heroId,
      host: this.host,
      canvas: this.canvas,
      fixture,
      audio: this.audio,
      handlers: {
        onReturnToCrew: () => {
          void this.mountSelection();
        },
      },
    });
    try {
      await this.survivor.start();
    } catch (err) {
      console.error('Failed to start Containment Protocol', err);
      this.survivor.dispose();
      this.survivor = null;
      this.transitioning = false;
      await this.mountSelection();
      return;
    }
    this.transitioning = false;
  }
}
