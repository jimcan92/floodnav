import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
import { SimulationStore } from "../client/src/lib/server/simulationStore";
const db = new PGlite();
const settings = () => ({
  SUPABASE_URL: "http://database.test",
  SUPABASE_SERVICE_ROLE_KEY: "server-test-key",
});
const request: typeof fetch = async (input, init) => {
  const path = String(input);
  expect((init!.headers as Record<string, string>).apikey).toBe(
    "server-test-key",
  );
  const rows = path.includes("/rpc/")
    ? (
        await db.query("select * from update_simulation($1, $2::jsonb)", [
          JSON.parse(String(init!.body)).p_revision,
          JSON.stringify(JSON.parse(String(init!.body)).p_conditions),
        ])
      ).rows
    : (await db.query("select * from simulation_state where id = true")).rows;
  return new Response(JSON.stringify(rows));
};
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;",
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202609230001_shared_simulation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(() => db.close());
it("persists across application instances and atomically rejects conflicting saves", async () => {
  const first = new SimulationStore(settings, request),
    second = new SimulationStore(settings, request);
  const initial = await first.get();
  const updated = { ...initial.conditions, trafficSimulation: false };
  const saved = await first.update(initial.revision, updated);
  expect(saved?.revision).toBe(initial.revision + 1);
  expect((await second.get()).conditions).toEqual(updated);
  expect(await second.update(initial.revision, initial.conditions)).toBeNull();
  expect(
    (await new SimulationStore(settings, request).get()).conditions,
  ).toEqual(updated);
  const concurrent = await Promise.all([
    first.update(saved!.revision, initial.conditions),
    second.update(saved!.revision, updated),
  ]);
  expect(concurrent.filter(Boolean)).toHaveLength(1);
});
it("denies public database access and permits only server-role reads/updates", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select * from simulation_state")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.query("select * from update_simulation(0, '{}'::jsonb)"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
  await db.exec("set role service_role");
  try {
    const store = new SimulationStore(settings, request),
      state = await store.get();
    expect(
      await store.update(state.revision, state.conditions, "bypass"),
    ).not.toBeNull();
    await expect(db.query("delete from simulation_state")).rejects.toThrow(
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
});
it("validates payloads, preserves existing values on errors, and never falls back to memory", async () => {
  const store = new SimulationStore(settings, request),
    state = await store.get();
  await expect(store.update(-1, state.conditions)).rejects.toThrow(/revision/);
  await expect(
    store.update(state.revision, {
      ...state.conditions,
      zones: Array(101).fill({}),
    }),
  ).rejects.toThrow();
  await expect(
    db.query("select * from update_simulation($1, '{}'::jsonb)", [
      state.revision,
    ]),
  ).rejects.toThrow();
  expect((await store.get()).revision).toBe(state.revision);
  await expect(new SimulationStore(() => ({}), request).get()).rejects.toThrow(
    /not configured/,
  );
  await expect(
    new SimulationStore(
      settings,
      async () => new Response("{}", { status: 503 }),
    ).get(),
  ).rejects.toThrow(/storage unavailable/);
});
