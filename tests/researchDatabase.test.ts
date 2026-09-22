import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
const db = new PGlite();
const id = "469099cc-cf60-4789-90a0-75c161294169";
const batch = {
  id,
  assessedAt: "2026-09-22T01:00:00Z",
  fingerprint: "c".repeat(64),
  roads: [
    {
      key: "road_0",
      distanceMeters: 123,
      durationSeconds: 45,
      polyline: [
        [10.3, 123.9],
        [10.31, 123.91],
      ],
    },
  ],
  model: { version: "test" },
  result: {
    routes: [
      {
        key: "road_0",
        score: 2,
        coverage: 1,
        distanceByClass: { LF: 0.123 },
        reasons: [],
      },
    ],
    recommendedKey: null,
  },
  snapshots: [
    {
      id: "a".repeat(64),
      kind: "weather",
      payload: {
        cell: "515:6195",
        product: "current",
        fetchedAt: "2026-09-22T01:00:00Z",
        raw: { dt: 1234, rain: { "1h": 2 } },
      },
    },
  ],
};
const save = (value: unknown) =>
  db.query("select save_research_assessment($1::jsonb)", [
    JSON.stringify(value),
  ]);
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;",
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202609220001_research_logging.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(() => db.close());
it("denies all public research access and RPC execution", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of [
        "research_snapshots",
        "research_assessments",
        "research_assessment_snapshots",
        "research_route_export",
        "research_weather_export",
      ])
        await expect(db.query(`select * from ${table}`)).rejects.toThrow(
          /permission denied/,
        );
      await expect(save(batch)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});
it("atomically saves deduplicated snapshots and idempotent assessments with usable exports", async () => {
  await db.exec("set role service_role");
  try {
    await save(batch);
    await save(batch);
    await save({ ...batch, id: "469099cc-cf60-4789-90a0-75c161294170" });
    expect(
      (await db.query("select * from research_snapshots")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from research_assessments")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from research_assessment_snapshots")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from research_route_export")).rows,
    ).toHaveLength(2);
    expect(
      (await db.query("select * from research_weather_export")).rows,
    ).toHaveLength(1);
    await expect(
      save({ ...batch, fingerprint: "d".repeat(64) }),
    ).rejects.toThrow(/conflict/);
  } finally {
    await db.exec("reset role");
  }
});
it("rolls back the entire assessment if a snapshot fails validation", async () => {
  const invalidId = "469099cc-cf60-4789-90a0-75c161294171";
  await db.exec("set role service_role");
  try {
    await expect(
      save({
        ...batch,
        id: invalidId,
        snapshots: [
          ...batch.snapshots,
          { id: "bad", kind: "hazard", payload: {} },
        ],
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.query("select * from research_assessments where id=$1", [
          invalidId,
        ])
      ).rows,
    ).toHaveLength(0);
  } finally {
    await db.exec("reset role");
  }
});
