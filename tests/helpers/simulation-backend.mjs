// Test-only PostgREST stand-in backed by the real migration and an isolated database.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  "create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;",
);
await db.exec(
  readFileSync(
    new URL(
      "../../supabase/migrations/202609230001_shared_simulation.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(readFileSync(new URL("../../supabase/migrations/202609230002_live_simulation_defaults.sql", import.meta.url), "utf8"));
const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json");
  try {
    if (request.url === "/health") {
      response.end("{}");
      return;
    }
    if (request.headers.apikey !== "test-service-role") {
      response.writeHead(401).end("{}");
      return;
    }
    let rows;
    if (
      request.method === "GET" &&
      request.url.startsWith("/rest/v1/simulation_state?")
    ) {
      rows = (await db.query("select * from simulation_state where id = true"))
        .rows;
    } else if (
      request.method === "POST" &&
      request.url === "/rest/v1/rpc/update_simulation"
    ) {
      let text = "";
      for await (const chunk of request) text += chunk;
      const payload = JSON.parse(text);
      rows = (
        await db.query("select * from update_simulation($1, $2::jsonb)", [
          payload.p_revision,
          JSON.stringify(payload.p_conditions),
        ])
      ).rows;
    } else {
      response.writeHead(404).end("{}");
      return;
    }
    response.end(JSON.stringify(rows));
  } catch (error) {
    response.writeHead(500).end(JSON.stringify({ error: String(error) }));
  }
});
server.listen(4319, "127.0.0.1");
process.on("SIGTERM", () =>
  server.close(() => {
    void db.close().then(() => process.exit(0));
  }),
);
