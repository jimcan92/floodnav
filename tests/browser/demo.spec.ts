import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import type {
  Conditions,
  SimulationZone,
} from "../../client/src/lib/types/demo";

const tile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const start = [123.8938, 10.3117],
  end = [123.9184, 10.3121];
function route(points: number[][], duration: number) {
  return {
    distance: 2800,
    duration,
    geometry: { coordinates: points },
    legs: [
      {
        steps: [
          {
            distance: 2800,
            duration,
            name: "Test road",
            maneuver: { type: "depart", location: points[0] },
          },
          {
            distance: 0,
            duration: 0,
            name: "",
            maneuver: { type: "arrive", location: points.at(-1) },
          },
        ],
      },
    ],
  };
}
const zone: SimulationZone = {
  id: "traffic",
  name: "Shared traffic",
  kind: "traffic",
  center: [10.3119, 123.9061],
  radiusMeters: 700,
  enabled: true,
  level: "heavy",
  depthCm: 10,
  rainMmH: 10,
};
const empty: Conditions = {
  trafficSimulation: true,
  floodSimulation: true,
  zones: [],
};
async function publish(request: APIRequestContext, conditions: Conditions) {
  const state = await (await request.get("/api/simulation")).json();
  const result = await request.patch("/api/simulation", {
    data: { revision: state.revision, conditions },
  });
  expect(result.ok()).toBeTruthy();
  return result.json();
}
async function mock(page: Page) {
  await page.route('**/api/observed-floods',r=>r.fulfill({json:{bounds:[123.75,10.15,124.1,10.55],status:'available',stale:false,message:'',fetchedAt:new Date().toISOString(),freshnessHours:24,features:[],coverage:{observedPixels:0,unknownPixels:0,excludedPixels:0,recentPixels:0,totalPixels:0},observations:[],attribution:'Copernicus'}}));
  await page.route("**/router.project-osrm.org/**", async (request) => {
    // Return geometries beginning at the requested position, including mid-trip reroutes.
    const coordinates = request
      .request()
      .url()
      .split("/driving/")[1]
      .split("?")[0]
      .split(";");
    const from = coordinates[0].split(",").map(Number),
      to = coordinates[1].split(",").map(Number);
    await request.fulfill({
      json: {
        code: "Ok",
        routes: [
          route([from, to], 100),
          route([from, [from[0], 10.325], [to[0], 10.325], to], 120),
        ],
      },
    });
  });
  await page.route("**/mt1.google.com/**", (r) =>
    r.fulfill({ contentType: "image/png", body: tile }),
  );
}
const chosenEta = (page: Page) =>
  page.getByRole("button", { pressed: true }).locator("strong");
async function openNotifications(page:Page) {
  const bell=page.getByRole('button',{name:/^Notifications, /});
  if(await bell.getAttribute('aria-expanded')!=='true') await bell.click();
}
async function openControls(page: Page) {
  await page
    .getByRole("button", { name: "Simulation controls", exact: true })
    .click();
}
test.beforeEach(async ({ page, request }) => {
  await publish(request, empty);
  await mock(page);
});

test("anyone can travel independently and edit shared conditions without rooms", async ({
  page,
  browser,
  request,
}) => {
  const errors: string[] = [],
    roomRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/rooms")) roomRequests.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start travel", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Create demo" })).toHaveCount(
    0,
  );
  const context = await browser.newContext(),
    second = await context.newPage();
  await mock(second);
  second.on("pageerror", (e) => errors.push(e.message));
  await second.goto("/");
  await expect(chosenEta(page)).toContainText("1 min 40 s");
  await expect(chosenEta(second)).toContainText("1 min 40 s");
  await openControls(page);
  await expect(page.getByLabel("Travel playback speed")).toHaveValue("1");
  await page.getByLabel("Travel playback speed").selectOption("0.5");
  await expect(chosenEta(page)).toContainText("1 min 40 s");
  await expect(second.getByLabel("Travel playback speed")).toHaveValue("1");
  await page.getByRole("button", { name: "Close configuration" }).click();

  await publish(request, { ...empty, zones: [{ ...zone, enabled: false }] });
  await openControls(second);
  await second.getByRole("button", { name: /^Shared traffic/ }).click();
  await second.getByLabel("Area enabled").check();
  await second
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    second.getByText("Published to everyone", { exact: true }),
  ).toBeVisible();
  await expect(chosenEta(page)).not.toContainText("1 min 40 s");
  await expect(chosenEta(second)).not.toContainText("1 min 40 s");
  await expect(page.locator(".alternative-banner")).toContainText(
    "Faster alternative",
  );
  await expect(page.locator(".demo-route-card").first()).toContainText(
    "2 min 0 s",
  );
  await second.screenshot({ path: "test-results/shared-controls-desktop.png" });
  await second.getByRole("button", { name: "Close configuration" }).click();
  await page.getByRole("button", { name: "Start travel", exact: true }).click();
  await expect(page.locator(".trip-card small")).not.toContainText("0.00 km");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const traveled = await page.locator(".trip-card small").textContent();
  await expect(
    second.getByRole("button", { name: "Start travel", exact: true }),
  ).toBeEnabled();
  await second
    .getByRole("button", { name: "Start travel", exact: true })
    .click();
  await expect(
    second.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await publish(request, empty);
  await expect(page.locator(".trip-card small")).toHaveText(traveled!);
  expect(roomRequests).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test("shallow floods change ETA, deep floods block, and alternatives can be selected", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(chosenEta(page)).toContainText("1 min 40 s");
  await publish(request, {
    ...empty,
    zones: [{ ...zone, kind: "flood", depthCm: 5 }],
  });
  await expect(chosenEta(page)).not.toContainText("1 min 40 s");
  await expect(
    page.getByRole("button", { name: "Start travel", exact: true }),
  ).toBeEnabled();
  await publish(request, {
    ...empty,
    zones: [{ ...zone, kind: "flood", depthCm: 30 }],
  });
  await expect(chosenEta(page)).toContainText("Blocked — ETA unavailable");
  await expect(
    page.getByRole("button", { name: "Start travel", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".alternative-banner")).toContainText(
    "Passable alternative",
  );
  await openNotifications(page);
  await page
    .getByRole("button", { name: "Use alternative", exact: true })
    .click();
  await expect(chosenEta(page)).toContainText("2 min 0 s");
  await expect(
    page.getByRole("button", { name: "Start travel", exact: true }),
  ).toBeEnabled();
  await publish(request, {
    ...empty,
    zones: [
      {
        ...zone,
        kind: "flood",
        depthCm: 100,
        center: [end[1], end[0]],
        radiusMeters: 1000,
      },
    ],
  });
  await openNotifications(page);
  await expect(
    page.getByText("Flood ahead. Travel paused.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No passable detour found in the nearby roads checked. Try another start or destination, or review the simulated flood areas.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use alternative", exact: true }),
  ).toHaveCount(0);
});

test("edits ahead mid-trip preserve position and update remaining ETA; reconnect loads latest", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start travel", exact: true }).click();
  await expect(page.locator(".trip-card small")).not.toContainText("0.00 km");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const distance = await page.locator(".trip-card small").textContent();
  const eta = await page.locator(".trip-card strong").textContent();
  await publish(request, { ...empty, zones: [zone] });
  await expect(page.locator(".trip-card strong")).not.toHaveText(eta!);
  await expect(page.locator(".trip-card small")).toHaveText(distance!);
  await expect(page.locator(".alternative-banner")).toContainText(
    "Faster alternative",
  );
  await openNotifications(page);
  await context.setOffline(true);
  await expect(
    page.getByText("Shared conditions disconnected. Travel paused.", {
      exact: false,
    }),
  ).toBeVisible();
  await publish(request, {
    ...empty,
    zones: [{ ...zone, kind: "flood", depthCm: 100 }],
  });
  await context.setOffline(false);
  await openNotifications(page);
  await expect(
    page.getByText("Flood ahead. Travel paused.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".trip-card small")).toHaveText(distance!);
});

test("mobile map editing retains drafts and conflicts require review without losing edits", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openControls(page);
  await page
    .getByRole("button", { name: "Add traffic area", exact: true })
    .click();
  await page.locator(".demo-map").click({ position: { x: 190, y: 370 } });
  await page.getByLabel("Area name").fill("My unpublished traffic");
  await page
    .getByRole("button", { name: "Add flood area", exact: true })
    .click();
  await page.locator(".demo-map").click({ position: { x: 210, y: 400 } });
  await expect(
    page.getByRole("button", { name: /^My unpublished traffic/ }),
  ).toBeVisible();
  await publish(request, { ...empty, zones: [zone] });
  await expect(
    page.getByText("Shared conditions changed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^My unpublished traffic/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Keep my draft after review" })
    .click();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    page.getByText("Published to everyone", { exact: true }),
  ).toBeVisible();
  const state = await (await request.get("/api/simulation")).json();
  expect(state.conditions.zones).toHaveLength(2);
  expect(state.conditions.zones[0].name).toBe("My unpublished traffic");
  await page.screenshot({ path: "test-results/shared-controls-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("legacy links redirect, shared state survives reload, and API rejects stale or invalid changes", async ({
  page,
  request,
}) => {
  const state = await publish(request, { ...empty, zones: [zone] });
  await page.goto("/demo/old-room/controller");
  await expect(page).toHaveURL(/\/$/);
  await expect(chosenEta(page)).not.toContainText("1 min 40 s");
  await page.reload();
  await expect(chosenEta(page)).not.toContainText("1 min 40 s");
  await page.goto("/demo/old-room");
  await expect(page).toHaveURL(/\/$/);
  const conflict = await request.patch("/api/simulation", {
    data: { revision: state.revision - 1, conditions: empty },
  });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).latest.conditions.zones).toHaveLength(1);
  expect(
    (
      await request.patch("/api/simulation", {
        data: {
          revision: state.revision,
          conditions: { ...empty, zones: [{ ...zone, radiusMeters: -1 }] },
        },
      })
    ).status(),
  ).toBe(400);
});

test("all live/simulated source combinations keep synthetic data out of research logging", async ({
  page,
  request,
}) => {
  let calls = 0;
  await page.route("**/api/demo/routes", (r) =>
    r.fulfill({
      json: [
        {
          key: "live",
          source: "tomtom",
          polyline: [start, end].map((p) => [p[1], p[0]]),
          distanceMeters: 2800,
          durationSeconds: 100,
          fetchedAt: new Date().toISOString(),
          steps: [],
        },
      ],
    }),
  );
  await page.route("**/api/demo/traffic/**", (r) =>
    r.fulfill({ contentType: "image/png", body: tile }),
  );
  await page.route("**/api/assessments", (r) => {
    const data = r.request().postDataJSON();
    expect(data.loggingEnabled).toBe(false);
    calls++;
    const now = new Date().toISOString();
    return r.fulfill({
      json: {
        assessedAt: now,
        recommendedKey: null,
        routes: data.roads.map((road: any) => ({ key: road.key, score: 1 })),
        hazards: { features: [], verified: true },
        weather: {
          errors: [],
          samples: [
            {
              observedAt: now,
              fetchedAt: now,
              forecastFetchedAt: now,
              rainMmH: 0,
              forecast: [
                {
                  endsAt: new Date(Date.now() + 7200000).toISOString(),
                  rainMm3h: 0,
                  probability: 0,
                },
              ],
            },
          ],
        },
      },
    });
  });
  await page.goto("/");
  for (const [trafficSimulation, floodSimulation] of [
    [true, false],
    [false, false],
    [false, true],
    [true, true],
  ]) {
    await publish(request, { ...empty, trafficSimulation, floodSimulation });
    await expect(page.locator(".map-source-badges")).toContainText(
      trafficSimulation ? "Simulated traffic" : "Live traffic",
    );
    await expect(page.locator(".map-source-badges")).toContainText(
      floodSimulation ? "Simulated flooding" : "Live rainfall",
    );
    await expect(
      page.getByRole("button", { name: "Start travel", exact: true }),
    ).toBeEnabled();
  }
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("live GPS travels without simulations or weather, follows fixes and releases tracking", async ({ page, context, request }) => {
  await page.setViewportSize({width: 390, height: 844});
  await publish(request, { ...empty, trafficSimulation: false, floodSimulation: false });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 10.3117, longitude: 123.8938, accuracy: 5 });
  await page.addInitScript(() => {
    const gps = navigator.geolocation;
    const watch = gps.watchPosition.bind(gps), clear = gps.clearWatch.bind(gps);
    (window as any).gpsWatches = 0;
    gps.watchPosition = (...args) => { (window as any).gpsWatches++; return watch(...args); };
    gps.clearWatch = (id) => { (window as any).gpsWatches--; clear(id); };
  });
  await page.route('**/api/demo/routes', r => r.fulfill({ status: 503, json: {error: 'Traffic unavailable'} }));
  await page.route('**/api/assessments', r => r.fulfill({ status: 503, json: {error: 'Rainfall unavailable'} }));
  await page.route('**/api/demo/traffic/**', r => r.fulfill({ contentType: 'image/png', body: tile }));
  const routes: string[] = [];
  page.on('request', r => { if (r.url().includes('router.project-osrm.org')) routes.push(r.url()); });
  await page.goto('/');
  await expect(page.getByLabel('Travel mode')).toHaveValue('gps');
  await page.getByRole('button', { name: /^Notifications, / }).click();
  await expect(page.getByText('Live traffic unavailable · using basic road directions and estimated ETA.')).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('button', {name: 'Start travel', exact: true}).click();
  await expect(page.locator('.trip-card small')).toContainText('Live GPS');
  await expect(page.locator('.trip-card strong')).toContainText('1 min 40 s');
  await expect.poll(() => page.evaluate(() => (window as any).gpsWatches)).toBe(1);
  await openControls(page);
  await page.getByLabel('Travel playback speed').selectOption('20');
  await page.getByRole('button', {name: 'Close configuration'}).click();
  // No synthetic movement while the device remains stationary, even at 20x playback.
  await page.waitForTimeout(1200);
  await expect(page.locator('.trip-card small')).toContainText('0.00 km');
  await publish(request, empty);
  await expect(page.locator('.map-source-badges')).toContainText('Simulated traffic');
  await expect(page.locator('.trip-card small')).toContainText('Live GPS');
  await expect.poll(() => page.evaluate(() => (window as any).gpsWatches)).toBe(1);
  await publish(request, {...empty, trafficSimulation: false, floodSimulation: false});
  await expect(page.locator('.map-source-badges')).toContainText('Live traffic');
  await expect(page.locator('.trip-card strong')).toContainText('1 min 40 s');
  await page.screenshot({path: 'test-results/live-gps-mobile.png'});
  await context.setGeolocation({latitude: 10.3119, longitude: 123.9061, accuracy: 5});
  await expect(page.locator('.trip-card small')).not.toContainText('0.00 km');
  await expect(page.locator('.trip-card strong')).not.toContainText('1 min 40 s');
  await page.getByRole('button', {name: 'Pause', exact: true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).gpsWatches)).toBe(0);
  const paused = await page.locator('.trip-card small').textContent();
  await context.setGeolocation({latitude: 10.312, longitude: 123.907, accuracy: 5});
  await expect(page.locator('.trip-card small')).toHaveText(paused!);
  await page.getByRole('button', {name: 'Resume', exact: true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).gpsWatches)).toBe(1);
  const beforeReroute = routes.length;
  await context.setGeolocation({latitude: 10.32, longitude: 123.907, accuracy: 5});
  await expect.poll(() => routes.length).toBeGreaterThan(beforeReroute);
  expect(routes.at(-1)).toContain('123.907,10.32');
  await expect(page.locator('.trip-card strong')).not.toContainText('Updating');
  await context.setGeolocation({latitude: 10.3121, longitude: 123.9184, accuracy: 5});
  await expect(page.locator('.trip-card strong')).toHaveText('Arrived');
  await expect.poll(() => page.evaluate(() => (window as any).gpsWatches)).toBe(0);
  await page.getByRole('button', {name: 'End trip'}).click();
  await expect(page.locator('.trip-card')).toHaveCount(0);
  const state = await (await request.get('/api/simulation')).json();
  expect(state.conditions).toEqual({...empty, trafficSimulation: false, floodSimulation: false});
});

test("live GPS permission denial offers retry and never starts demo movement", async ({page, request}) => {
  await publish(request, {...empty, trafficSimulation: false, floodSimulation: false});
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = (_success, error) => {
      setTimeout(() => error?.({code: 1, message: 'Denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3}), 0);
      return 42;
    };
    navigator.geolocation.clearWatch = () => {};
  });
  await page.route('**/api/demo/routes', r => r.fulfill({status: 503, json: {error: 'No traffic'}}));
  await page.route('**/api/assessments', r => r.fulfill({status: 503, json: {error: 'No weather'}}));
  await page.goto('/');
  await page.getByRole('button', {name: 'Start travel', exact: true}).click();
  await openNotifications(page);
  await expect(page.getByRole('status')).toContainText('Location permission denied');
  await expect(page.getByRole('button', {name: 'Resume', exact: true})).toBeEnabled();
  await expect(page.locator('.trip-card small')).toContainText('0.00 km');
  await page.getByRole('button', {name: 'End trip'}).click();
  await expect(page.locator('.trip-card')).toHaveCount(0);
});

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 740, height: 390 }]) {
  test(`mobile map space and collapsible controls ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const size = viewport;
    await page.setViewportSize(size);
    await page.goto('/');
    const startButton = page.getByRole('button', { name: 'Start travel', exact: true });
    await expect(startButton).toBeEnabled();
    await expect(page.getByLabel('Starting point', { exact: true })).toBeHidden();
    const map = page.locator('.demo-map');
    const box = await map.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(size.height * 0.6);
    await expect(page.locator('.demo-alerts')).toBeHidden();
    await page.screenshot({ path: `test-results/mobile-map-${size.width}x${size.height}.png` });
    await page.getByRole('button', { name: 'Expand trip controls' }).click();
    await expect(page.getByLabel('Starting point', { exact: true })).toBeVisible();
    expect((await page.locator('.directions-panel').boundingBox())!.height).toBeLessThanOrEqual(size.height / 2 + 1);
    await page.getByLabel('Destination', { exact: true }).fill('SM');
    await expect(page.getByRole('button', { name: 'Choose on map', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
    await expect(page.locator('.pick-banner')).toBeVisible();
    await expect(page.locator('.directions-panel')).toBeHidden();
    await map.click({ position: { x: 150, y: 100 } });
    await expect(page.locator('.pick-banner')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Expand trip controls' })).toBeVisible();
    await page.getByRole('button', { name: 'Expand trip controls' }).click();
    await page.locator('.demo-route-card').nth(1).click();
    await expect(page.getByRole('button', { name: 'Expand trip controls' })).toBeVisible();
    await startButton.click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'End trip', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('mobile bell groups active notices, keeps blocked warning compact and restores focus', async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start travel', exact: true })).toBeEnabled();
  await publish(request, { ...empty, zones: [{ ...zone, kind: 'flood', depthCm: 30 }] });
  await expect(page.locator('.mobile-urgent')).toContainText('route blocked');
  await expect(page.locator('.demo-alerts')).toBeHidden();
  const bell = page.getByRole('button', { name: /^Notifications, / });
  await bell.click();
  await expect(page.locator('.warning-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use alternative', exact: true })).toBeVisible();
  const count = await page.locator('.demo-alerts > .info-banner, .demo-alerts > .warning-banner, .demo-alerts > .error-banner').count();
  await expect(bell).toHaveAccessibleName(`Notifications, ${count} active`);
  expect((await page.locator('.demo-alerts').boundingBox())!.height).toBeLessThanOrEqual(256);
  await page.screenshot({ path: 'test-results/mobile-notifications.png' });
  await page.keyboard.press('Escape');
  await expect(bell).toBeFocused();
  await expect(page.locator('.demo-alerts')).toBeHidden();
  await bell.click();
  await page.locator('.demo-map').click({ position: { x: 160, y: 320 } });
  await expect(page.locator('.demo-alerts')).toBeHidden();
  await bell.click();
  await openNotifications(page);
  await page.getByRole('button', { name: 'Use alternative', exact: true }).click();
  await expect(page.locator('.mobile-urgent')).toHaveCount(0);
  await publish(request, empty);
  await page.getByRole('button', { name: 'Simulation controls', exact: true }).click();
  await expect(page.locator('.demo-alerts')).toBeHidden();
  await expect(page.locator('.controller-drawer')).toBeVisible();
  expect((await page.locator('.controller-drawer').boundingBox())!.height).toBeCloseTo(640 * 0.9, 0);
});

test('configuration drawer fills 90 percent on mobile and retains desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Simulation controls', exact: true }).click();
  const drawer = page.locator('.controller-drawer');
  await expect(drawer).toBeVisible();
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    const box = (await drawer.boundingBox())!;
    expect(box.height).toBeCloseTo(viewport.height * 0.9, 0);
    expect(box.y).toBeCloseTo(viewport.height * 0.05, 0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(await drawer.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(drawer).toBeHidden();
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await page.getByRole('button', { name: 'Simulation controls', exact: true }).click();
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())!.width).toBe(420);
  await page.setViewportSize({ width: 390, height: 844 });
  // Crossing back to mobile closes transient panels.
  await expect(drawer).toBeHidden();
  await page.getByRole('button', { name: 'Simulation controls', exact: true }).click();
  await expect(drawer).toBeVisible();
  await drawer.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByRole('button', { name: 'Load example trip: Fuente → SM City' })).toBeInViewport();
  await drawer.evaluate(el => { el.scrollTop = 0; });
  await page.getByRole('button', { name: 'Close configuration' }).click();
  await expect(drawer).toBeHidden();
});


test('mobile notifications preserve retry actions and offline mode keeps the map clear', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await publish(request, { ...empty, trafficSimulation: false, floodSimulation: false });
  await page.route('**/api/demo/routes', r => r.fulfill({ status: 503, json: { error: 'Traffic unavailable' } }));
  await page.route('**/api/demo/traffic/**', r => r.fulfill({ contentType: 'image/png', body: tile }));
  let attempts = 0;
  await page.route('**/api/assessments', r => { attempts++; return r.fulfill({ status: 503, json: { error: 'Rainfall unavailable' } }); });
  await page.goto('/');
  await expect.poll(() => attempts).toBeGreaterThan(0);
  const bell = page.getByRole('button', { name: /^Notifications, / });
  await expect(page.locator('.demo-alerts')).toBeHidden();
  await bell.click();
  await expect(page.locator('.error-banner')).toContainText('Rainfall unavailable');
  const previous = attempts;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect.poll(() => attempts).toBeGreaterThan(previous);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.dispatchEvent(new Event('floodnav:offline-demo')));
  await expect(page.locator('.mobile-sheet-summary')).toContainText('Demo');
  await expect(page.locator('.demo-alerts')).toBeHidden();
  expect((await page.locator('.demo-map').boundingBox())!.height).toBeGreaterThan(844 * 0.6);
  await bell.click();
  await expect(page.getByText('Offline route diagram · map tiles and live data need internet.')).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('button', { name: 'Start travel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});


test('mobile sheet fits a keyboard-sized visual viewport and preserves map pan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start travel', exact: true })).toBeEnabled();
  const map = page.locator('.demo-map');
  await page.mouse.move(160, 320);
  await page.mouse.down();
  await page.mouse.move(220, 380, { steps: 12 });
  await page.mouse.up();
  // Let Leaflet's drag inertia finish before comparing center-relative marker positions.
  await page.waitForTimeout(600);
  const relativeMarker = async () => {
    const marker = await page.locator('.traveler-marker').boundingBox();
    const bounds = await map.boundingBox();
    return { x: marker!.x + marker!.width / 2 - bounds!.x - bounds!.width / 2,
      y: marker!.y + marker!.height / 2 - bounds!.y - bounds!.height / 2 };
  };
  const before = await relativeMarker();
  await page.getByRole('button', { name: 'Expand trip controls' }).click();
  await page.getByRole('button', { name: 'Collapse trip controls' }).click();
  await expect.poll(async () => Math.abs((await relativeMarker()).x - before.x)).toBeLessThan(2);
  await expect.poll(async () => Math.abs((await relativeMarker()).y - before.y)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Expand trip controls' }).click();
  await page.getByLabel('Destination', { exact: true }).fill('SM');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 420 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => (await page.locator('.demo-shell').boundingBox())!.height).toBe(420);
  expect((await page.locator('.directions-panel').boundingBox())!.height).toBeLessThanOrEqual(210);
  await page.getByRole('button', { name: 'Close location picker' }).click();
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, 'height');
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => (await page.locator('.demo-shell').boundingBox())!.height).toBe(844);
  await page.getByRole('button', { name: 'Collapse trip controls' }).click();
  await expect(page.getByLabel('Destination', { exact: true })).toBeHidden();
});


test('blocked ordinary alternatives trigger road detours that can be selected', async ({ page, request }) => {
  let detourRequests = 0;
  await page.route('**/router.project-osrm.org/**', async (request) => {
    const points = request.request().url().split('/driving/')[1].split('?')[0].split(';').map(p => p.split(',').map(Number));
    const from = points[0], to = points.at(-1)!;
    if (points.length === 3) detourRequests++;
    await request.fulfill({ json: { code: 'Ok', routes: points.length === 3
      ? [route([from, [from[0], 10.325], [to[0], 10.325], to], 140)]
      : [route([from, to], 100), route([from, to], 105)] } });
  });
  await publish(request, { ...empty, zones: [{ ...zone, kind: 'flood', depthCm: 200 }] });
  await page.goto('/');
  await expect(page.locator('.alternative-banner')).toContainText('Passable alternative');
  expect(detourRequests).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Start travel', exact: true })).toBeDisabled();
  await openNotifications(page);
  await page.getByRole('button', { name: 'Use alternative', exact: true }).click();
  await expect(chosenEta(page)).toContainText('2 min 20 s');
  await expect(page.getByRole('button', { name: 'Start travel', exact: true })).toBeEnabled();
  await expect(page.locator('.warning-banner')).toHaveCount(0);
});

test('dashboard themes, map layer choice, and tablet layout preserve the journey', async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await expect(page.locator('.demo-shell')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('.insights-panel')).toBeVisible();
  await expect(page.locator('.demo-map')).toHaveAttribute('data-map-layer','Hybrid');
  const map=await page.locator('.demo-map').boundingBox(), left=await page.locator('.directions-panel').boundingBox(), right=await page.locator('.insights-panel').boundingBox();
  expect(map!.x).toBeGreaterThanOrEqual(left!.x+left!.width);expect(map!.x+map!.width).toBeLessThanOrEqual(right!.x);
  await page.locator('.layer-button').click();await page.getByRole('button',{name:'Streets',exact:true}).click();
  const transform=await page.locator('.leaflet-map-pane').getAttribute('style');
  await page.getByLabel('Color theme').selectOption('light');
  await expect(page.locator('.demo-shell')).toHaveAttribute('data-theme','light');
  await expect(page.locator('.leaflet-map-pane')).toHaveAttribute('style',transform!);
  await expect(page.locator('.demo-map')).toHaveAttribute('data-map-layer','Streets');
  await page.screenshot({path:'test-results/dashboard-light.png'});
  await page.reload();await expect(page.locator('.demo-shell')).toHaveAttribute('data-theme','light');
  await page.getByLabel('Color theme').selectOption('system');await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('.demo-shell')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:'test-results/dashboard-dark.png'});
  await page.setViewportSize({width:900,height:700});
  await expect(page.locator('.insights-panel')).toHaveCount(0);
  await expect(page.locator('.directions-panel .demo-route-card')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

function satelliteData(observedAt=new Date().toISOString(),quality:'high'|'caution'='high') {
  return {bounds:[123.75,10.15,124.1,10.55],status:'available',stale:false,message:'',fetchedAt:new Date().toISOString(),freshnessHours:24,
    features:[{type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[[[123.905,10.311],[123.907,10.311],[123.907,10.313],[123.905,10.313],[123.905,10.311]]]]},properties:{productId:'test-scene',observedAt,processedAt:observedAt,version:'4.1.1',quality,minimumLikelihood:quality==='high'?90:70,advisoryFlags:quality==='high'?[]:[1]}}],
    coverage:{observedPixels:60,unknownPixels:40,excludedPixels:30,recentPixels:60,totalPixels:100},observations:[{productId:'test-scene',observedAt,processedAt:observedAt,version:'4.1.1',coveredPixels:100}],attribution:'Copernicus CEMS'};
}
test('recent satellite flood warnings offer an optional verified detour without closing roads', async ({page})=>{
  await page.route('**/api/observed-floods',r=>r.fulfill({json:satelliteData()}));
  let probes=0;
  await page.route('**/router.project-osrm.org/**',async r=>{
    const points=r.request().url().split('/driving/')[1].split('?')[0].split(';').map(p=>p.split(',').map(Number));
    if(points.length===3) probes++;
    await r.fulfill({json:{code:'Ok',routes:[route(points.length===3?[points[0],[points[0][0],10.325],[points.at(-1)![0],10.325],points.at(-1)!]:[points[0],points.at(-1)!],140)]}});
  });
  await page.goto('/');await expect(page.getByRole('button',{name:'Start travel',exact:true})).toBeEnabled();
  await expect(page.locator('.satellite-card')).toContainText('PHT');
  await expect(page.locator('.demo-alerts')).not.toBeVisible();
  await openNotifications(page);
  await expect(page.getByText('Satellite-observed flooding intersects this route')).toBeVisible();
  await page.getByRole('button',{name:'Find alternative around observed flooding'}).click();
  await expect.poll(()=>probes).toBeGreaterThan(0);
  await expect(page.getByRole('button',{name:'Use alternative',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Use alternative',exact:true}).click();
  await expect(page.getByText('Satellite-observed flooding intersects this route')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Start travel',exact:true})).toBeEnabled();
});
test('old and quality-limited satellite observations remain context, with independent map toggles',async({page})=>{
  const old=new Date(Date.now()-3*86400000).toISOString();
  await page.route('**/api/observed-floods',r=>r.fulfill({json:satelliteData(old)}));
  await page.goto('/');await expect(page.locator('.satellite-card')).toContainText('PHT');
  await openNotifications(page);
  await expect(page.getByRole('button',{name:'Find alternative around observed flooding'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:/^Notifications,/})).toBeFocused();
  await page.locator('.layer-button').click();
  const paths=await page.locator('.leaflet-overlay-pane path').count();
  await page.getByLabel('Satellite observations',{exact:true}).uncheck();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(paths-1);
  await page.getByLabel('Satellite observations',{exact:true}).check();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(paths);
  await expect(page.getByLabel('Simulation areas')).toBeChecked();
});

for (const failure of ['verification', 'coverage', 'weather', 'hazard', 'request']) {
  test(`rainfall status separates ${failure} and recovers on retry`, async ({ page, request }) => {
    let recovered = false;
    await page.route('**/api/assessments', async (r) => {
      if (failure === 'request' && !recovered) return r.fulfill({ status: 503, json: { error: 'Assessment provider unavailable' } });
      const now = new Date().toISOString();
      return r.fulfill({ json: {
        assessedAt: now, recommendedKey: null,
        routes: r.request().postDataJSON().roads.map((road: any) => ({ key: road.key, score: recovered ? 1 : null })),
        hazards: { features: [], verified: recovered || failure === 'coverage', ...(failure === 'hazard' && !recovered ? { error: 'MGB query failed' } : {}) },
        weather: { errors: failure === 'weather' && !recovered ? ['OpenWeather timeout'] : [], samples: [] }
      } });
    });
    await publish(request, { ...empty, floodSimulation: false });
    await page.goto('/');
    const notices = page.locator('#mobile-notifications');
    if (failure === 'verification' || failure === 'coverage') {
      await expect(notices).toContainText(failure === 'verification' ? 'MGB verification pending' : 'Route exposure assessment incomplete');
      await expect(notices.locator('.error-banner')).toHaveCount(0);
      await expect(notices.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Start travel', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    } else {
      await expect(notices.locator('.error-banner')).toContainText(failure === 'weather' ? 'Rainfall unavailable' : failure === 'hazard' ? 'MGB unavailable' : 'assessment request failed');
      await expect(notices).not.toContainText('Rainfall assessed');
      await expect(notices).not.toContainText('MGB verification pending');
      recovered = true;
      await notices.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(notices).toContainText('Rainfall assessed');
      await expect(notices.locator('.error-banner')).toHaveCount(0);
    }
  });
}

test('compact planner keeps the map clear and preserves routes when reopened', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const panel = page.locator('#directions-panel');
  await expect(page.getByRole('button', { name: 'Search destination', exact: true })).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page.locator('.insights-panel')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/floodnav-compact-map.png' });
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.demo-route-card')).toHaveCount(2);
  await panel.screenshot({ path: '/tmp/floodnav-open-planner.png' });
  await expect(panel.getByText('Satellite flood observations', { exact: true })).toBeHidden();
  await panel.getByText('Flood & weather details', { exact: true }).click();
  await expect(panel.getByText('Satellite flood observations', { exact: true })).toBeVisible();
  await panel.getByText('Flood & weather details', { exact: true }).click();
  const destination = await panel.getByRole('textbox', { name: 'Destination', exact: true }).inputValue();
  await panel.locator('.demo-route-card').nth(1).click();
  await page.getByRole('button', { name: 'Collapse directions' }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Destination', exact: true })).toHaveValue(destination);
  await expect(panel.locator('.demo-route-card').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start travel', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Open journey details' }).click();
  await expect(panel.locator('.maneuver-card')).toBeVisible();
  await page.locator('.leaflet-container').click({ position: { x: 700, y: 300 } });
  await expect(panel).toBeHidden();
});

test('compact search opens destination input and map picking collapses the planner', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Search destination', exact: true }).click();
  const destination = page.getByRole('textbox', { name: 'Destination', exact: true });
  await expect(destination).toBeEnabled();
  // Reopen once data is ready so keyboard focus also opens the place chooser.
  await page.getByRole('button', { name: 'Collapse directions' }).click();
  await page.getByRole('button', { name: 'Search destination', exact: true }).click();
  await expect(destination).toBeFocused();
  await page.getByRole('button', { name: 'Choose on map', exact: true }).click();
  await expect(page.locator('#directions-panel')).toBeHidden();
  await page.locator('.leaflet-container').click({ position: { x: 700, y: 300 } });
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await expect(destination).not.toHaveValue('SM City Cebu');
});

test('map status chips and bottom-left layers stay compact', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/api/demo/routes', r => r.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await publish(request, { ...empty, trafficSimulation: false });
  await page.goto('/');
  const chips = page.locator('.map-source-badges');
  await expect(chips).toContainText('Basic ETA · no live traffic');
  await expect(page.locator('#mobile-notifications .info-banner')).toHaveCount(0);
  expect((await chips.boundingBox())!.y).toBeLessThan(80);
  const layers = page.getByRole('button', { name: 'Map layers', exact: true });
  await layers.click();
  const popup = page.locator('#map-layer-options');
  await expect(popup).toBeVisible();
  const triggerBox = (await layers.boundingBox())!;
  expect(triggerBox.x).toBeLessThan(50);
  expect(triggerBox.y).toBeGreaterThan(750);
  expect((await popup.boundingBox())!.y).toBeLessThan(triggerBox.y);
  await page.getByRole('checkbox', { name: 'Flood susceptibility' }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Flood susceptibility' })).not.toBeChecked();
  await page.screenshot({ path: '/tmp/floodnav-map-controls.png' });
  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
  await expect(page.locator('.demo-map')).toHaveAttribute('data-map-layer', 'Satellite');
  await layers.click();
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await layers.click();
  await expect(popup).toBeVisible();
  expect(await popup.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect((await popup.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: '/tmp/floodnav-mobile-controls.png' });
});

test('all alternative routes are visible and selectable on the map with an overlaid bell count', async ({ page }) => {
  await page.route('**/router.project-osrm.org/**', r => r.fulfill({ json: { code: 'Ok', routes: [route([start, end], 100), route([start, [123.90,10.33], end], 120), route([start, [123.90,10.29], end], 140)] } }));
  await page.route('**/api/observed-floods', r => r.fulfill({ json: satelliteData() }));
  await page.goto('/');
  await expect(page.locator('.alternative-route-path')).toHaveCount(2);
  await expect(page.locator('.alternative-route-label')).toHaveCount(2);
  await page.locator('.alternative-route-label').first().click();
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await expect(page.locator('.demo-route-card').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.demo-route-card').first().click();
  await page.locator('.leaflet-container').click({ position: { x: 1000, y: 400 } });
  await page.locator('.alternative-route-path').nth(1).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await expect(page.locator('.demo-route-card').nth(2)).toHaveAttribute('aria-pressed', 'true');
  const vehicles = page.getByRole('group', { name: 'Vehicle', exact: true });
  const paths = await vehicles.locator('svg path').evaluateAll(nodes => nodes.map(n => n.getAttribute('d')));
  expect(new Set(paths).size).toBe(5);
  for (const name of ['Car', 'SUV', 'Truck', 'Motorcycle', 'Bicycle']) await expect(vehicles.getByRole('button', { name, exact: true })).toHaveAttribute('title', new RegExp(name));
  await page.locator('.demo-route-card').first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  const bell = page.locator('.mobile-topbar .notification-toggle');
  const badge = bell.locator('.notification-count');
  await expect(badge).toBeVisible();
  expect(await badge.evaluate(el => getComputedStyle(el).position)).toBe('absolute');
  const b = (await bell.boundingBox())!, c = (await badge.boundingBox())!;
  expect(c.x).toBeLessThan(b.x + b.width);
  expect(c.y).toBeLessThan(b.y + b.height / 2);
  await page.screenshot({ path: '/tmp/floodnav-route-alternatives.png' });
});

test('compact status chips reveal provider explanations without permanent banners', async ({ page, request }) => {
  await page.route('**/api/demo/routes', r => r.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.route('**/api/assessments', r => r.fulfill({ json: { assessedAt: new Date().toISOString(), routes: [{key:'road_0',score:null}], hazards: { features: [], verified: false }, weather: { samples: [], errors: [] } } }));
  await publish(request, { ...empty, floodSimulation: false, trafficSimulation: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Basic ETA', exact: true }).click();
  await expect(page.locator('#map-status-detail')).toContainText('Live traffic unavailable');
  await page.getByRole('button', { name: 'MGB pending', exact: true }).click();
  await expect(page.locator('#map-status-detail')).toContainText('verification pending');
  await expect(page.locator('#mobile-notifications .info-banner')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-status-detail')).toHaveCount(0);
});

test('dry travel keeps original routes and alternatives visible after movement and switching', async ({ page }) => {
  await page.route('**/router.project-osrm.org/**', r => r.fulfill({ json: { code: 'Ok', routes: [route([start, end], 100), route([start, [123.90,10.33], end], 120), route([start, [123.90,10.29], end], 140)] } }));
  await page.goto('/');
  await expect(page.locator('.alternative-route-path')).toHaveCount(2);
  await page.getByRole('button', { name: 'Open directions', exact: true }).click();
  await page.locator('.demo-route-card').nth(1).click();
  await expect(page.locator('.alternative-route-path')).toHaveCount(2);
  await page.getByRole('button', { name: 'Start travel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(async () => Number((await page.locator('.trip-card').innerText()).match(/([\d.]+) km traveled/)?.[1] || 0)).toBeGreaterThan(0.04);
  await expect(page.locator('.alternative-route-path')).toHaveCount(2);
  await expect(page.locator('.alternative-route-label')).toHaveCount(2);
  await page.getByRole('button', { name: 'Open journey details' }).click();
  await expect(page.locator('#directions-panel .demo-route-card')).toHaveCount(2);
  await page.locator('#directions-panel .demo-route-card').first().click();
  await expect(page.locator('#mobile-notifications')).toContainText('Original routes remain visible');
  await expect(page.locator('.alternative-route-path')).toHaveCount(2);
});
