import { devices, expect, test, type Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Os testes usam sempre o catálogo de amostra, não o acervo real que o sync grava em web/public.
test.beforeEach(async ({ page }) => {
  await page.route('**/catalog.json', (route) => route.fulfill({ path: 'e2e/fixtures/catalog.json' }));
  // A janela "Instalar" do primeiro acesso cobriria os botões; os testes dela usam um celular novo.
  await page.addInitScript(() => localStorage.setItem('louvar.instalar.adiado', String(Date.now())));
});

// Celular "recém-chegado": sem nada guardado, como no primeiro acesso.
async function freshPhone(browser: Browser) {
  const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...pixel, baseURL: 'http://localhost:4173' });
  const page = await ctx.newPage();
  await page.route('**/catalog.json', (route) => route.fulfill({ path: 'e2e/fixtures/catalog.json' }));
  return { ctx, page };
}

test('início mostra seções e capas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Projeto Louvar' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Biblioteca Completa' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Bônus' })).toBeVisible();
  // Hinos Infantis entra na biblioteca (sem o "Bônus 1 -"); Lançamentos fica no Bônus
  const secao = (t: string) => page.locator('section', { has: page.getByRole('heading', { level: 2, name: t }) });
  await expect(secao('Biblioteca Completa').getByRole('link', { name: /^Hinos Infantis/ })).toBeVisible();
  await expect(secao('Bônus').getByRole('link', { name: /^Lançamentos 2026/ })).toBeVisible();
  await expect(page.getByText('Bônus 1')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Louvor & Adoração/ })).toBeVisible();
});

test('abre coleção, toca, avança e mostra downloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Louvor & Adoração/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Louvor & Adoração' })).toBeVisible();

  await page.getByRole('button', { name: 'Tocar Consagração / Louvor ao Rei (Ao Vivo)' }).click();
  const bar = page.getByRole('region', { name: 'Tocador' });
  await expect(bar).toBeVisible();
  await expect(bar.locator('.pb-title')).toHaveText('Consagração / Louvor ao Rei (Ao Vivo)');

  await bar.getByRole('button', { name: 'Próxima' }).click();
  await expect(bar.locator('.pb-title')).toHaveText('O Hino (Ao Vivo)');

  await expect(page.getByRole('link', { name: 'Baixar O Hino (Ao Vivo)' })).toBeVisible();
});

test('baixar todas: zip no computador, sequência no celular', async ({ page }, info) => {
  await page.goto('/#/c/louvor-adoracao');
  if (info.project.name === 'computador') {
    await expect(page.getByRole('link', { name: /Baixar todas \(\.zip\)/ })).toHaveAttribute('href', './sample-audio/louvor-adoracao.zip');
  } else {
    await expect(page.getByRole('button', { name: /Baixar todas/ })).toBeVisible();
  }
});

test('busca ignora acentos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Buscar música' }).fill('hino vitoria');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('button', { name: 'Tocar Hino da Vitória' })).toBeVisible();
});

test('voltar de subcoleção leva à coleção-mãe', async ({ page }) => {
  await page.goto('/#/c/grande-deus');
  await page.getByRole('link', { name: '← Voltar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Grupo Integração' })).toBeVisible();
  await page.getByRole('link', { name: '← Voltar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projeto Louvar' })).toBeVisible();
});

test('sem rolagem horizontal em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const routes: [string, string][] = [['/', 'Projeto Louvar'], ['/#/c/louvor-adoracao', 'Louvor & Adoração'], ['/#/busca?q=louvor', 'Buscar']];
  for (const [path, title] of routes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(360);
  }
});

test('sem rolagem horizontal em 360px com o tocador aberto', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/#/c/louvor-adoracao');
  await page.getByRole('button', { name: /^Tocar Consagração/ }).click();
  await expect(page.getByRole('region', { name: 'Tocador' })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

test('coleção inexistente mostra aviso', async ({ page }) => {
  await page.goto('/#/c/nao-existe');
  await expect(page.getByRole('heading', { level: 1, name: 'Coleção não encontrada' })).toBeVisible();
});

test('manifesto, service worker e noindex', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Projeto Louvar', short_name: 'Louvar', display: 'standalone', start_url: './' });
  expect((await request.get('/sw.js')).ok()).toBe(true);
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))).toBe(true);
});

test('capa mostra a foto da coleção e a página da coleção repete a foto', async ({ page }) => {
  // Troca o id de "Louvor & Adoração" pelo id real que tem foto, para exercitar coverData.json
  const realId = Object.keys(JSON.parse(readFileSync('web/src/coverData.json', 'utf8')))[0];
  const fixture = readFileSync('e2e/fixtures/catalog.json', 'utf8').replaceAll('"louvor-adoracao"', JSON.stringify(realId));
  await page.route('**/catalog.json', (route) => route.fulfill({ body: fixture, contentType: 'application/json' }));
  await page.goto('/');
  const img = page.getByRole('link', { name: /Louvor & Adoração/ }).locator('img');
  await expect(img).toHaveAttribute('src', /^covers\/.+\.webp$/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('link', { name: /Louvor & Adoração/ }).click();
  await expect(page.locator('.col-header img')).toHaveAttribute('src', /^covers\/.+\.webp$/);
});

test('página de créditos lista o autor de cada foto', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Créditos das fotos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Créditos das fotos' })).toBeVisible();
  expect(await page.locator('.credits li').count()).toBeGreaterThanOrEqual(50);
  await expect(page.locator('.credits li a').first()).toHaveAttribute('href', /commons\.wikimedia\.org/);
});

test.describe('instalar no celular', () => {
  test('primeiro acesso: janela sobe de baixo; "Agora não" fecha e é lembrado', async ({ browser }) => {
    const { ctx, page } = await freshPhone(browser);
    await page.goto('/');
    const sheet = page.getByRole('dialog', { name: 'Instale o Louvar no celular' });
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 4); // encostada embaixo
    const [agora, instalar] = [sheet.getByRole('button', { name: 'Agora não' }), sheet.getByRole('button', { name: 'Instalar' })];
    expect((await agora.boundingBox())!.y).toBe((await instalar.boundingBox())!.y); // lado a lado
    await agora.click();
    await expect(sheet).toBeHidden();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Projeto Louvar' })).toBeVisible();
    await page.waitForTimeout(1600);
    await expect(sheet).toBeHidden();
    await ctx.close();
  });

  test('janela: "Instalar" sem convite do navegador leva ao passo a passo', async ({ browser }) => {
    const { ctx, page } = await freshPhone(browser);
    await page.goto('/');
    await page.getByRole('dialog').getByRole('button', { name: 'Instalar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Instalar no celular' })).toBeVisible();
    await expect(page.locator('.steps').first()).toContainText('Instalar app');
    await expect(page.getByRole('dialog')).toBeHidden();
    await ctx.close();
  });

  test('janela: com o convite do Chrome, instala e confirma', async ({ browser }) => {
    const { ctx, page } = await freshPhone(browser);
    await page.goto('/');
    await page.evaluate(() => {
      const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: () => { (window as unknown as { asked: boolean }).asked = true; return Promise.resolve(); },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(e);
    });
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Instalar' }).click();
    await expect(sheet).toContainText('Pronto! O Louvar já está na tela do seu celular');
    expect(await page.evaluate(() => (window as unknown as { asked: boolean }).asked)).toBe(true);
    await sheet.getByRole('button', { name: 'Fechar' }).click();
    await expect(sheet).toBeHidden();
    await ctx.close();
  });

  test('iPhone: passo a passo do Safari', async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    });
    const page = await ctx.newPage();
    await page.route('**/catalog.json', (route) => route.fulfill({ path: 'e2e/fixtures/catalog.json' }));
    await page.goto('/#/instalar');
    await expect(page.locator('.steps').first()).toContainText('Adicionar à Tela de Início');
    await expect(page.getByText('Tem um celular Android?')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await ctx.close();
  });

  test('computador: sem aviso; a página explica abrir no celular', async ({ page }, info) => {
    test.skip(info.project.name !== 'computador', 'só no computador');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Projeto Louvar' })).toBeVisible();
    await page.waitForTimeout(1600);
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('link', { name: 'Instalar no celular' }).click();
    await expect(page.getByText('Abra este mesmo endereço no seu celular')).toBeVisible();
  });

  test('sem rolagem horizontal em 360px na página de instalar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/#/instalar');
    await expect(page.getByRole('heading', { level: 1, name: 'Instalar no celular' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});

test('todo link tem cara de botão (sem link solto no texto)', async ({ page }) => {
  for (const path of ['/', '/#/instalar', '/#/creditos', '/#/c/louvor-adoracao', '/#/c/grande-deus', '/#/busca?q=louvor']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const soltos = await page.locator('a:not(.btn):not(.tile), summary:not(.btn)').evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.textContent));
    expect(soltos, path).toEqual([]);
  }
});
