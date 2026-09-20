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
test.beforeEach(async ({ page }) => {
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
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
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
  await page.goto("/");
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

test("Supabase readings refresh, block positive water and pause stale feeds", async ({
  page,
}) => {
  await page.clock.install();
  let depth = 0;
  let stamp = new Date().toISOString();
  await page.route("**/floodnav-test.supabase.co/rest/v1/**", (route) =>
    route.fulfill({
      json: [
        {
          sensor_id: "esp-001",
          name: "ESP sensor",
          affected_road: "Fuente",
          latitude: 10.3117,
          longitude: 123.8938,
          radius_meters: 100,
          water_depth_cm: depth,
          observed_at: stamp,
          received_at: stamp,
        },
      ],
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Flood source")).toHaveValue("supabase");
  await expect(
    page.getByText("1/1 sensors have fresh readings", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
  depth = 1;
  await page.getByRole("button", { name: "Refresh sensors" }).click();
  await expect(
    page.getByRole("button", { name: /Primary road route/ }),
  ).toContainText("Blocked by sensor-reported water");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeDisabled();
  depth = 0;
  stamp = new Date(Date.now() - 6 * 60000).toISOString();
  await page.getByRole("button", { name: "Refresh sensors" }).click();
  await expect(
    page.getByText("0/1 sensors have fresh readings", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeDisabled();
  await page.getByLabel("Routing mode").selectOption("demo");
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeEnabled();
});

test("connection form persists public settings and rejects secret keys without a request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/new-project.supabase.co/rest/v1/**", (route) => {
    requests++;
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await expect(page.getByLabel("Routing mode")).toBeEnabled();
  await page.getByText("Supabase connection", { exact: true }).click();
  await page
    .getByLabel("Supabase project URL")
    .fill("https://new-project.supabase.co");
  await page
    .getByLabel("Supabase publishable key")
    .fill("sb_secret_do_not_send");
  await page.getByRole("button", { name: "Test and save connection" }).click();
  await expect(
    page.getByText(
      "Use a publishable key, never a secret key in the frontend.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page
    .getByLabel("Supabase publishable key")
    .fill("sb_publishable_new_project");
  await page.getByRole("button", { name: "Test and save connection" }).click();
  await expect(
    page.getByText("Connected: 0 sensors found.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start / resume simulation" }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Routing mode")).toBeEnabled();
  await page.getByText("Supabase connection", { exact: true }).click();
  await expect(page.getByLabel("Supabase project URL")).toHaveValue(
    "https://new-project.supabase.co",
  );
  await page.getByRole("button", { name: "Use environment defaults" }).click();
  await expect(page.getByLabel("Supabase project URL")).toHaveValue(
    "https://floodnav-test.supabase.co",
  );
});
