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
  page.locator(".demo-route-card.chosen strong");
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
  await expect(
    page.getByText("Flood ahead. Travel paused.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No passable alternative available among returned roads. Travel stays paused.",
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
