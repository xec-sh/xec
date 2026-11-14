import { test, expect } from '@playwright/test';

test('homepage is a real, keyboard-operable execution reference', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make thework flow.');
  for (const [name, source] of [
    ['Local', 'git rev-parse'],
    ['SSH', 'build.example.com'],
    ['Docker', "image: 'node:24'"],
    ['Kubernetes', "namespace: 'staging'"],
    ['Pipeline', "Pipeline.create('verify')"],
    ['Terminal UI', 'isCancel(target)'],
  ]) {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText(source);
  }
  await page.getByRole('tab', { name: 'Local', exact: true }).click();
  await page.getByRole('tab', { name: 'Local', exact: true }).press('ArrowRight');
  await page.getByRole('tab', { name: 'SSH', exact: true }).press('Enter');
  await expect(page.getByRole('tabpanel')).toContainText('build.example.com');
  await page.getByRole('button', { name: 'Copy example', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Example copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("import { $ } from '@xec-sh/core'");
  expect(errors).toEqual([]);
});

test('theme is persistent and system mode follows the OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-xec-theme', 'light');
  await page.getByRole('button', { name: 'Color theme: system' }).click();
  await page.getByRole('menuitem', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-xec-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-xec-theme', 'dark');
  await page.getByRole('button', { name: 'Color theme: dark' }).click();
  await page.getByRole('menuitem', { name: 'System', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-xec-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-xec-theme', 'dark');
});

test('search loads the generated local index and restores focus on Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search documentation' }).click();
  await page.getByRole('searchbox', { name: 'Search query' }).fill('Pipeline');
  await expect(page.locator('.lumen-search-result-link').first()).toBeVisible();
  await expect(page.locator('.lumen-search-results')).toContainText(/Pipeline/i);
  await page.getByRole('searchbox', { name: 'Search query' }).press('Escape');
  await expect(page.getByRole('searchbox', { name: 'Search query' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Search documentation' })).toBeFocused();
});

test('documentation retains navigation, syntax highlighting and current-section tracking', async ({ page }) => {
  await page.goto('/docs/ops/pipeline');
  await expect(page.locator('.lumen-doc h1')).toHaveText('Pipeline Engine');
  await expect(page.locator('.lumen-doc .shiki span[style]').first()).toBeVisible();
  const heading = page.locator('.lumen-doc h2').last();
  const id = await heading.getAttribute('id');
  await page.locator(`.lumen-section-nav a[href="#${id}"]`).click();
  await expect(page.locator('.lumen-section-nav a[aria-current="location"]')).toHaveAttribute(
    'href',
    `#${encodeURIComponent(id!)}`
  );
  await expect(page.locator('.lumen-pagination-prev .lumen-pagination-direction')).toHaveText('Previous');
  await expect(page.locator('.lumen-pagination-next .lumen-pagination-direction')).toHaveText('Next');
  await expect(page.locator('.lumen-pagination-arrow')).toHaveCount(2);
  await page.goto('/docs/introduction');
  await expect(page.locator('.lumen-pagination-prev')).toHaveCount(0);
  const nav = await page.locator('.lumen-pagination').boundingBox();
  const next = await page.locator('.lumen-pagination-next').boundingBox();
  expect(next!.x).toBeGreaterThan(nav!.x + nav!.width * 0.45);
});

test('mobile navigation and content fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.mobile-nav > summary').click();
  await page
    .getByRole('navigation', { name: 'Mobile main navigation' })
    .getByRole('link', { name: 'Learn', exact: true })
    .click();
  await expect(page.locator('.lumen-doc h1')).toBeVisible();
  await page.locator('.mobile-document-nav > summary').click();
  await expect(page.getByRole('navigation', { name: 'Mobile documentation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('visual evidence covers coherent light/dark themes, mobile and file-tree docs', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Color theme: system' })).toBeVisible();
  await expect(page.locator('.xec-site')).toHaveCSS('background-color', 'rgb(250, 250, 247)');
  await expect(page.locator('.brand')).toHaveCSS('color', 'rgb(32, 32, 43)');
  await page.screenshot({ path: info.outputPath('home-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Color theme: system' }).click();
  await page.getByRole('menuitem', { name: 'Dark', exact: true }).click();
  await expect(page.locator('.xec-site')).toHaveCSS('background-color', 'rgb(16, 17, 22)');
  await page.screenshot({ path: info.outputPath('home-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('home-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/docs/configuration/overview#file-structure');
  await expect(page.locator('.lumen-file-tree')).toBeVisible();
  await page.screenshot({ path: info.outputPath('documentation-tree.png') });
  await page.goto('/docs/ops/pipeline');
  await page.locator('.lumen-section-nav a[href="#matrix-builds"]').click();
  await expect(page.locator('.lumen-section-nav a[aria-current="location"]')).toHaveAttribute('href', '#matrix-builds');
  await page.screenshot({ path: info.outputPath('documentation-toc.png') });
});
