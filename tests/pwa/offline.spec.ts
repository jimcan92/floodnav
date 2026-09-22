import {test, expect, type Page} from '@playwright/test';
async function prepared(page: Page) {
 await page.goto('/');
 await page.evaluate(() => navigator.serviceWorker.ready);
 await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
 await expect(page.getByRole('status', {name: 'App update'})).toHaveCount(0);
}
async function controls(page: Page) { await page.getByRole('button',{name:'Simulation controls',exact:true}).click(); }

test('installed app relaunches offline and local demos never publish shared changes', async ({page, context, request}) => {
 await page.setViewportSize({width:390,height:844});
 const errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 await prepared(page);
 const manifest = await (await request.get('/manifest.webmanifest')).json();
 expect(manifest.display).toBe('standalone');
 for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
 const before = await (await request.get('/api/simulation')).json();
 await context.setOffline(true);
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.getByRole('dialog')).toContainText('Internet is needed');
 await page.getByRole('button',{name:'Start offline demo',exact:true}).click();
 await expect(page.locator('.demo-map')).toHaveClass(/offline/);
 await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible();
 await page.getByRole('button',{name:'Motorcycle',exact:true}).click();
 await controls(page);
 await page.getByLabel('Travel playback speed').selectOption('20');
 await page.getByText('Ready-made demo scenarios', {exact:true}).click();
 await page.getByRole('button',{name:'Flood + bypass',exact:true}).click();
 await expect(page.getByText('Applied on this device only',{exact:true})).toBeVisible();
 await expect(page.locator('.demo-route-card')).toContainText(['min','Blocked']);
 await page.getByRole('button',{name:'Dry roads',exact:true}).click();
 await page.getByRole('button',{name:'Close configuration'}).click();
 await page.getByRole('button',{name:'Start travel',exact:true}).click();
 await expect(page.locator('.trip-card small')).not.toContainText('0.00 km');
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.screenshot({path:'test-results/pwa-offline-mobile.png'});
 await context.setOffline(false);
 await expect(page.getByRole('button',{name:'Return to shared live mode'})).toBeVisible();
 await page.waitForTimeout(2200);
 const after = await (await request.get('/api/simulation')).json();
 expect(after).toEqual(before);
 const cachedUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r=>r.url)))).flat());
 expect(cachedUrls.some(url=>url.includes('/api/') || url.includes('google.com'))).toBe(false);
 await page.getByRole('button',{name:'Return to shared live mode'}).click();
 await expect(page.getByLabel('Travel mode')).toHaveValue('gps');
 expect(errors).toEqual([]);
});

test('a new worker notifies without interrupting travel, then updates on request', async ({page, request}) => {
 await prepared(page);
 // Use the offline workflow to start a self-contained demo without network providers.
 await page.evaluate(() => window.dispatchEvent(new Event('floodnav:offline-demo')));
 await page.getByRole('button',{name:'Start travel',exact:true}).click();
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const trip = await page.locator('.trip-card small').textContent();
 const release = Number(await (await request.post('/__test/update')).text());
 await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
 await expect(page.getByRole('status',{name:'App update'})).toContainText('Update available');
 await expect(page.locator('.trip-card small')).toHaveText(trip!);
 await expect(page.getByRole('status',{name:'App update'})).toContainText('end your trip');
 await page.getByRole('button',{name:'Update now',exact:true}).click();
 await expect(page.locator('.trip-card')).toHaveCount(0);
 await expect(page.getByRole('status',{name:'App update'})).toHaveCount(0);
 const activeRelease = await page.evaluate(() => new Promise(resolve => {
  const channel = new MessageChannel(); channel.port1.onmessage = event => resolve(event.data);
  navigator.serviceWorker.controller!.postMessage({type:'TEST_RELEASE'},[channel.port2]);
 }));
 expect(activeRelease).toBe(release);
});
