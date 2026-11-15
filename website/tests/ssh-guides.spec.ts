import { test, expect } from '@playwright/test';

const sshRoutes = ['overview', 'connections', 'channels-and-files', 'security', 'comparison'];

test('SSH security documentation exposes its complete navigation and working section links', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/docs/ssh/security');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SSH trust and cryptography');
  const sidebar = page.getByRole('navigation', { name: 'Documentation sections', exact: true });
  for (const route of sshRoutes) await expect(sidebar.locator(`a[href="/docs/ssh/${route}"]`).first()).toBeVisible();
  const sectionNav = page.getByRole('navigation', { name: 'Table of contents', exact: true });
  await sectionNav.getByRole('link', { name: 'First-use writes', exact: true }).click();
  await expect(page).toHaveURL(/#first-use-writes$/);
  await expect(sectionNav.locator('a[aria-current="location"]')).toHaveAttribute('href', '#first-use-writes');
  await expect(page.locator('.lumen-doc')).toContainText('no automatic unlock or reconciliation API');
  await page.screenshot({ path: info.outputPath('ssh-security-light.png'), fullPage: true });
  await sidebar.locator('a[href="/docs/ssh/comparison"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compared with ssh2');
  await expect(page.getByRole('table').first()).toContainText('@xec-sh/ssh');
  expect(errors).toEqual([]);
});

test('SSH comparison and security remain readable and navigable without JavaScript on mobile', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto('/docs/ssh/comparison');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compared with ssh2');
    await expect(page.getByRole('table')).toHaveCount(3);
    await expect(page.getByRole('table').first()).toContainText('Strict known_hosts by default');
    await expect(page.locator('.lumen-doc')).toContainText('there is no silent compatibility fallback');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    await page.screenshot({ path: info.outputPath('ssh-comparison-mobile-nojs.png'), fullPage: true });
    await page.locator('.mobile-document-nav > summary').click();
    const navigation = page.getByRole('navigation', { name: 'Mobile documentation', exact: true });
    for (const route of sshRoutes) await expect(navigation.locator(`a[href="/docs/ssh/${route}"]`).first()).toBeVisible();
    await navigation.locator('a[href="/docs/ssh/security"]').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SSH trust and cryptography');
    await expect(page.locator('#first-use-writes')).toBeVisible();
    await expect(page.locator('.lumen-doc h2').last()).toHaveText('See also');
  } finally { await context.close(); }
});


test('home security guidance remains in flow and opens its complete documentation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const privacy = page.getByRole('link', { name: 'Read the guarantees and current scope.', exact: true });
    await expect(privacy).toBeVisible();
    const guidance = await privacy.locator('..').boundingBox();
    const actions = await page.locator('.hero-actions').boundingBox();
    expect(guidance!.height).toBeGreaterThan(0);
    expect(actions!.y).toBeGreaterThanOrEqual(guidance!.y + guidance!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await privacy.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Security and privacy');
    await expect(page.locator('#dependencies-are-part-of-the-product')).toBeVisible();
    await expect(page.locator('.lumen-doc')).toContainText('That target is not yet fully implemented.');
    await expect(page.locator('.lumen-doc h2').last()).toHaveText('See also');
  }
});
