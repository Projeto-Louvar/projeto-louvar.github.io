import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/playfair-display/latin-700.css';
import './styles.css';
import { CatalogIndex, loadCatalog } from './catalogIndex';
import { h } from './dom';
import { detectPlatform } from './downloads';
import { FULL_EDITION } from './edition';
import { InstallState } from './install';
import { mountInstallSheet } from './installView';
import { Player } from './player';
import { renderPlayerBar } from './playerBar';
import { parseHash } from './router';
import { renderCollection, renderCredits, renderError, renderHome, renderInstall, renderSearch, type Ctx } from './views';

// Precisa existir antes de carregar o catálogo: o Chrome avisa que dá para instalar logo no começo.
const install = new InstallState();

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  let idx: CatalogIndex;
  try {
    idx = new CatalogIndex(await loadCatalog(), { lockBonus: !FULL_EDITION });
  } catch {
    app.replaceChildren(renderError(() => void boot()));
    return;
  }

  const audio = new Audio();
  audio.preload = 'metadata';
  const player = new Player(audio);
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const outlet = h('div');
  app.replaceChildren(outlet, renderPlayerBar(player));
  player.restore((id) => idx.track(id));

  let cleanups: (() => void)[] = [];
  const render = () => {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    const ctx: Ctx = { idx, player, platform, install, onCleanup: (fn) => cleanups.push(fn) };
    const route = parseHash(location.hash);
    const view =
      route.name === 'collection' ? renderCollection(ctx, route.id)
      : route.name === 'search' ? renderSearch(ctx, route.q)
      : route.name === 'credits' ? renderCredits(ctx)
      : route.name === 'install' ? renderInstall(ctx)
      : renderHome(ctx);
    outlet.replaceChildren(view);
    window.scrollTo(0, 0);
    view.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  };
  window.addEventListener('hashchange', render);
  render();
  mountInstallSheet(install, platform);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => undefined);
  }
}

void boot();
