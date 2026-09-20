import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;",
  );
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202609200001_flood_sensors.sql",
      import.meta.url,
    ),
    "utf8",
  );
  // pgcrypto is only needed for device provisioning, not schema/RLS; Supabase supplies it.
  await db.exec(
    sql.replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    ),
  );
  await db.exec(`insert into flood_sensors(id,name,affected_road,latitude,longitude) values ('visible','Visible','Road',10.3,123.9), ('hidden','Hidden','Road',10.4,123.9), ('empty','Empty','Road',10.5,123.9);
    update flood_sensors set active=false where id='hidden';
    insert into sensor_devices(sensor_id,token_sha256) values ('visible',repeat('a',64));
    insert into flood_readings(sensor_id,reading_id,water_depth_cm,observed_at) values
    ('visible','469099cc-cf60-4789-90a0-75c161294169',20,now() - interval '1 minute'),
    ('visible','469099cc-cf60-4789-90a0-75c161294170',25,now()),
    ('hidden','469099cc-cf60-4789-90a0-75c161294171',30,now());`);
}, 30000);
afterAll(async () => {
  await db.close();
});
it("public view exposes latest active sensors, including missing readings", async () => {
  await db.exec("set role anon");
  try {
    const result = await db.query<{
      sensor_id: string;
      water_depth_cm: string | null;
    }>(
      "select sensor_id,water_depth_cm from latest_flood_readings order by sensor_id",
    );
    expect(result.rows).toEqual([
      { sensor_id: "empty", water_depth_cm: null },
      { sensor_id: "visible", water_depth_cm: "25.00" },
    ]);
  } finally {
    await db.exec("reset role");
  }
});
it("anonymous and authenticated clients cannot read tokens or write readings", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select * from sensor_devices")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.exec(
          "insert into flood_readings(sensor_id,reading_id,water_depth_cm,observed_at) values ('visible','469099cc-cf60-4789-90a0-75c161294172',0,now())",
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.exec("update flood_sensors set active=false where id='visible'"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
});
it("server role can ingest and duplicate IDs cannot overwrite readings", async () => {
  await db.exec("set role service_role");
  try {
    await db.exec(
      "insert into flood_readings(sensor_id,reading_id,water_depth_cm,observed_at) values ('visible','469099cc-cf60-4789-90a0-75c161294170',0,now()) on conflict(sensor_id,reading_id) do nothing",
    );
    const result = await db.query<{ water_depth_cm: string }>(
      "select water_depth_cm from flood_readings where reading_id='469099cc-cf60-4789-90a0-75c161294170'",
    );
    expect(result.rows[0].water_depth_cm).toBe("25.00");
    await expect(
      db.exec(
        "insert into flood_readings(sensor_id,reading_id,water_depth_cm,observed_at) values ('visible','469099cc-cf60-4789-90a0-75c161294173',-1,now())",
      ),
    ).rejects.toThrow(/check constraint/);
  } finally {
    await db.exec("reset role");
  }
});
