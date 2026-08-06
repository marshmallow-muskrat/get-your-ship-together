import type { HeroId } from '../game/content/heroes';
import { isHeroId } from '../game/content/heroes';
import { GystRuntime } from '../game/GystRuntime';
import { SurvivorMode } from '../game/modes/survivor/SurvivorMode';
import type { SurvivorFixture } from '../game/modes/survivor/survivorContent';
import { CrewSelectScreen } from '../screens/CrewSelectScreen';

export type CampaignFixture = 'combat' | 'boss' | 'mech' | null;
export type ModeId = 'campaign' | 'survivor';

function parseLaunch(): {
  heroId: HeroId | null;
  mode: ModeId | null;
  campaignFixture: CampaignFixture;
  survivorFixture: SurvivorFixture;
} {
  const params = new URLSearchParams(window.location.search);
  const fixtureParam = params.get('fixture');
  const modeParam = params.get('mode');

  const survivorFixtures: SurvivorFixture[] = [
    'survivor-start',
    'survivor-levelup',
    'survivor-horde',
    'survivor-mech',
    'survivor-boss',
    'survivor-repulsor',
    'survivor-ship',
    'survivor-damage',
    'survivor-miniboss',
  ];
  const survivorFixture =
    fixtureParam && (survivorFixtures as string[]).includes(fixtureParam)
      ? (fixtureParam as SurvivorFixture)
      : modeParam === 'survivor'
        ? 'survivor-start'
        : null;

  const campaignFixture: CampaignFixture =
    fixtureParam === 'combat' || fixtureParam === 'boss' || fixtureParam === 'mech'
      ? fixtureParam
      : null;

  let mode: ModeId | null = null;
  if (modeParam === 'survivor' || survivorFixture) mode = 'survivor';
  else if (modeParam === 'campaign' || campaignFixture) mode = 'campaign';

  const heroParam = params.get('hero');
  const heroId =
    heroParam && isHeroId(heroParam) ? heroParam : mode || campaignFixture || survivorFixture ? 'bee' : null;

  return { heroId, mode, campaignFixture, survivorFixture };
}

/**
 * Application shell: exclusive ownership of selection, campaign, or survivor.
 */
export class AppController {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private selection: CrewSelectScreen | null = null;
  private campaign: GystRuntime | null = null;
  private survivor: SurvivorMode | null = null;
  private transitioning = false;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement) {
    this.host = host;
    this.canvas = canvas;
  }

  async start(): Promise<void> {
    const launch = parseLaunch();
    if (launch.heroId && launch.mode === 'survivor') {
      await this.mountSurvivor(launch.heroId, launch.survivorFixture);
      return;
    }
    if (launch.heroId && (launch.mode === 'campaign' || launch.campaignFixture)) {
      await this.mountCampaign(launch.heroId, launch.campaignFixture);
      return;
    }
    await this.mountSelection();
  }

  private disposeAllModes(): void {
    this.campaign?.dispose();
    this.campaign = null;
    this.survivor?.dispose();
    this.survivor = null;
    this.selection?.dispose();
    this.selection = null;
  }

  private async mountSelection(): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.disposeAllModes();
    this.selection = new CrewSelectScreen(this.host, this.canvas, {
      onContinue: (id) => {
        void this.mountCampaign(id, null);
      },
      onSurvivor: (id) => {
        void this.mountSurvivor(id, null);
      },
    });
    await this.selection.mount();
    this.transitioning = false;
  }

  private async mountCampaign(heroId: HeroId, fixture: CampaignFixture): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.disposeAllModes();
    this.campaign = new GystRuntime({
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
      await this.campaign.start();
    } catch (err) {
      console.error('Failed to start campaign', err);
      this.campaign.dispose();
      this.campaign = null;
      this.transitioning = false;
      await this.mountSelection();
      return;
    }
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
      handlers: {
        onReturnToCrew: () => {
          void this.mountSelection();
        },
      },
    });
    try {
      await this.survivor.start();
    } catch (err) {
      console.error('Failed to start survivor mode', err);
      this.survivor.dispose();
      this.survivor = null;
      this.transitioning = false;
      await this.mountSelection();
      return;
    }
    this.transitioning = false;
  }
}
