import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Os testes usam sempre o catálogo de amostra, não o acervo real que o sync grava em web/public.
test.beforeEach(async ({ page }) => {
  await page.route('**/catalog.json', (route) => route.fulfill({ path: 'e2e/fixtures/catalog.json' }));
});

test('início mostra seções e capas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Louvores' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Biblioteca Completa' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Bônus' })).toBeVisible();
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
  await expect(page.getByRole('heading', { level: 1, name: 'Louvores' })).toBeVisible();
});

test('sem rolagem horizontal em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const routes: [string, string][] = [['/', 'Louvores'], ['/#/c/louvor-adoracao', 'Louvor & Adoração'], ['/#/busca?q=louvor', 'Buscar']];
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
  expect(manifest).toMatchObject({ name: 'Louvores', display: 'standalone', start_url: './' });
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
