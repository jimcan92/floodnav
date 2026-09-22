import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const direct = JSON.parse(
  readFileSync(
    new URL("../../client/src/lib/data/demoRoutes.json", import.meta.url),
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
const tile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
function weatherResponse(body: any, failed = false) {
  const stamp = new Date().toISOString();
  return {
    assessmentId: body.assessmentId,
    assessedAt: stamp,
    modelVersion: "experimental-exposure-v1",
    routes: body.roads.map((r: any, i: number) => ({
      key: r.key,
      score: i ? 40 : 100,
      coverage: 1,
      distanceByClass: { LF: 1, MF: 0, HF: 0, VHF: 0, unclassified: 0 },
      segments: [],
      reasons: [],
    })),
    recommendedKey: body.roads[1]?.key || null,
    weather: {
      samples: [
        {
          cell: "515:6195",
          coordinate: [10.31, 123.91],
          returnedCoordinate: [10.31, 123.91],
          observedAt: stamp,
          fetchedAt: stamp,
          forecastFetchedAt: stamp,
          rainMmH: 2,
          forecast: [
            {
              endsAt: new Date(Date.now() + 7200000).toISOString(),
              rainMm3h: 6,
              probability: 0.7,
            },
          ],
        },
      ],
      errors: [],
    },
    hazards: {
      features: [],
      source: "https://controlmap.mgb.gov.ph",
      fetchedAt: stamp,
      verified: true,
    },
    loggingStatus: body.loggingEnabled
      ? failed
        ? "failed"
        : "saved"
      : "disabled",
  };
}
test.beforeEach(async ({ page }) => {
  await page.route("**/api/assessments", (route) =>
    route.fulfill({ json: weatherResponse(route.request().postDataJSON()) }),
  );
  await page.route("**/router.project-osrm.org/**", (route) =>
    route.fulfill({ json: direct }),
  );
  await page.route("**/floodnav-test.supabase.co/rest/v1/**", (route) =>
    route.fulfill({
      json: [
        {
          sensor_id: "test",
          name: "Test sensor",
          affected_road: "Test road",
          latitude: 10.3117,
          longitude: 123.8938,
          radius_meters: 50,
          water_depth_cm: 0,
          observed_at: new Date().toISOString(),
          received_at: new Date().toISOString(),
        },
      ],
    }),
  );
  await page.route("**/mt1.google.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: tile }),
  );
});
test("layers preserve demo state; scenarios block and reroute; map survives mode changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/research");
  await page.getByLabel("Routing mode").selectOption("demo");
  await expect(page.locator("[data-map-layer]")).toHaveAttribute(
    "data-map-layer",
    "Hybrid",
  );
  await expect(page.getByText("© Google")).toBeVisible();
  await expect(page.locator(".leaflet-overlay-pane path")).not.toHaveCount(0);
  await page.getByLabel("Demo scenario").selectOption("bypass");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Apply flood-avoiding alternative" })
    .click();
  const card = page.getByRole("button", { name: /Primary road route/ });
  await expect(card).toContainText("Blocked");
  await page.getByLabel("Satellite", { exact: true }).check();
  await expect(page.locator("[data-map-layer]")).toHaveAttribute(
    "data-map-layer",
    "Satellite",
  );
  await expect(
    page.getByRole("button", {
      name: /Flood-avoiding alternative.*Bundled demo/,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Start / resume simulation" }).click();
  await expect
    .poll(async () =>
      Number(await page.getByRole("progressbar").getAttribute("value")),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const before = await page.getByRole("progressbar").getAttribute("value");
  await page.getByLabel("Streets", { exact: true }).check();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", before!);
  await page.getByLabel("Demo scenario").selectOption("blocked");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reset trip" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  expect(errors).toEqual([]);
});
test("failed API and tiles show recovery; demo works without API", async ({
  page,
}) => {
  await page.route("**/router.project-osrm.org/**", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.route("**/mt1.google.com/**", (route) => route.abort());
  await page.goto("/research");
  await expect(
    page.getByRole("button", { name: "Retry routing" }),
  ).toBeVisible();
  await expect(
    page.getByText("Google map tiles unavailable.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use Demo scenarios" }).click();
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
});
test("mobile, map destination, GPS denial, and missing speech", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: unknown, error: (e: unknown) => void) =>
          error({ code: 1 }),
      },
    });
    Object.defineProperty(window, "speechSynthesis", { value: undefined });
  });
  await page.goto("/research");
  await page.getByRole("button", { name: "Use my GPS location" }).click();
  await expect(
    page.getByText("GPS unavailable or permission denied.", { exact: false }),
  ).toBeVisible();
  await page
    .locator(".leaflet-container")
    .click({ position: { x: 180, y: 160 } });
  await expect(page.getByLabel("Destination", { exact: true })).toHaveValue(
    "custom",
  );
  await page.getByRole("button", { name: "Test voice" }).click();
  await expect(
    page.getByText("Speech synthesis is unavailable in this browser."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("arrival and decreasing distance with virtual clock", async ({ page }) => {
  await page.clock.install();
  await page.goto("/research");
  await page.getByLabel("Routing mode").selectOption("demo");
  await page.getByRole("button", { name: "Start / resume simulation" }).click();
  await page.clock.runFor(2000);
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "160");
  await page.clock.runFor(120000);
  await expect(page.getByText("Arrived at destination")).toBeVisible();
  await expect(page.getByText("0 m remaining · 0 min")).toBeVisible();
});

test("late online responses cannot overwrite demo and vehicle changes do not refetch", async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/router.project-osrm.org/**", async (route) => {
    calls++;
    await pending;
    await route.fulfill({ json: direct }).catch(() => {});
  });
  await page.goto("/research");
  await expect(page.getByText("Loading road routes…")).toBeVisible();
  await page.getByLabel("Routing mode").selectOption("demo");
  release();
  await page
    .getByLabel("Demo scenario", { exact: true })
    .selectOption("bypass");
  await expect(
    page.getByRole("button", { name: /Primary road route/ }),
  ).toContainText("Bundled demo");
  await expect(
    page.getByRole("button", {
      name: /Flood-avoiding alternative.*Bundled demo/,
    }),
  ).toBeVisible();
  const requestsBefore = calls;
  await page
    .getByRole("button", { name: "Vehicle: Low Ground Clearance" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(calls).toBe(requestsBefore);
});
test("routing timeout offers retry and a new trip resets simulation", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/router.project-osrm.org/**", () => {});
  await page.goto("/research");
  await expect(page.getByLabel("Routing mode")).toBeEnabled();
  await page.clock.runFor(10001);
  await expect(
    page.getByText("Routing timed out. Retry or use Demo scenarios."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use Demo scenarios" }).click();
  await page.getByRole("button", { name: "Start / resume simulation" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "80");
  await page
    .getByRole("button", { name: /Flood-avoiding alternative.*Bundled demo/ })
    .click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "0");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
});

test("rainfall is default and sensors remain disabled with a note", async ({
  page,
}) => {
  await page.goto("/research");
  await expect(page.getByLabel("Flood source")).toHaveValue("rainfall");
  await expect(page.locator('option[value="supabase"]')).toBeDisabled();
  await expect(
    page.getByText("ESP sensors: Temporarily unavailable", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Research data logging" }),
  ).toBeChecked();
  await expect(
    page.getByText("Logging enabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
});

test("logging switch disables all subsequent save requests and persists before first request on reload", async ({
  page,
}) => {
  const flags: boolean[] = [];
  await page.route("**/api/assessments", (route) => {
    const body = route.request().postDataJSON();
    flags.push(body.loggingEnabled);
    return route.fulfill({ json: weatherResponse(body) });
  });
  await page.goto("/research");
  const toggle = page.getByRole("switch", { name: "Research data logging" });
  await expect(
    page.getByText("Logging enabled", { exact: true }),
  ).toBeVisible();
  await toggle.uncheck();
  await expect(
    page.getByText("Logging disabled", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => flags.at(-1)).toBe(false);
  flags.length = 0;
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Research data logging" }),
  ).not.toBeChecked();
  await expect.poll(() => flags.length).toBeGreaterThan(0);
  expect(flags.every((flag) => flag === false)).toBe(true);
  await page.getByRole("switch", { name: "Research data logging" }).check();
  await expect.poll(() => flags.at(-1)).toBe(true);
});

test("save failure supports idempotent retry, and disabling removes retry", async ({
  page,
}) => {
  const requests: any[] = [];
  await page.route("**/api/assessments", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({ json: weatherResponse(body, true) });
  });
  await page.goto("/research");
  await expect(
    page.getByText("Research log not saved", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry research save" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[0].assessmentId).toBe(requests[1].assessmentId);
  await page.getByRole("switch", { name: "Research data logging" }).uncheck();
  await expect(
    page.getByRole("button", { name: "Retry research save" }),
  ).toHaveCount(0);
  await expect.poll(() => requests.at(-1).loggingEnabled).toBe(false);
});

test("late enabled save response cannot overwrite disabled state", async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/api/assessments", async (route) => {
    const body = route.request().postDataJSON();
    if (body.loggingEnabled) {
      started = true;
      await pending;
    }
    await route.fulfill({ json: weatherResponse(body, true) }).catch(() => {});
  });
  await page.goto("/research");
  await expect.poll(() => started).toBe(true);
  await page.getByRole("switch", { name: "Research data logging" }).uncheck();
  release();
  await expect(
    page.getByText("Logging disabled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry research save" }),
  ).toHaveCount(0);
});

test("recommendation is manual, does not block simulation, and survives layer changes", async ({
  page,
}) => {
  const bypass = JSON.parse(
    readFileSync(
      new URL("../../client/src/lib/data/demoBypass.json", import.meta.url),
      "utf8",
    ).replace(/^\uFEFF/, ""),
  );
  await page.route("**/router.project-osrm.org/**", (route) =>
    route.fulfill({
      json: { ...direct, routes: [direct.routes[0], bypass.routes[0]] },
    }),
  );
  await page.goto("/research");
  const primary = page.getByRole("button", { name: /Primary road route/ });
  const alternative = page.getByRole("button", {
    name: /Alternative road route/,
  });
  await expect(alternative).toContainText("Lower estimated exposure");
  await expect(primary).toHaveAttribute("aria-pressed", "true");
  await alternative.click();
  await expect(alternative).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Satellite", { exact: true }).check();
  await expect(alternative).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
});

test("weather failure leaves route preview and simulator usable", async ({
  page,
}) => {
  await page.route("**/api/assessments", (route) =>
    route.fulfill({ status: 503, json: { error: "Weather unavailable" } }),
  );
  await page.goto("/research");
  await expect(page.getByRole("alert")).toContainText("Assessment unavailable");
  await expect(
    page.getByRole("button", { name: /Primary road route/ }),
  ).toContainText("Assessment unavailable");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
  await page.getByLabel("Routing mode").selectOption("demo");
  await expect(
    page.getByRole("button", { name: /Primary road route/ }),
  ).toContainText("Bundled demo");
});

