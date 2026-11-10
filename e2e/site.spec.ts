import { expect, test } from '@playwright/test';

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
  for (const path of ['/', '/#/c/louvor-adoracao', '/#/busca?q=louvor']) {
    await page.goto(path);
    await page.waitForSelector('h1');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(360);
  }
});

test('coleção inexistente mostra aviso', async ({ page }) => {
  await page.goto('/#/c/nao-existe');
  await expect(page.getByRole('heading', { level: 1, name: 'Coleção não encontrada' })).toBeVisible();
});
