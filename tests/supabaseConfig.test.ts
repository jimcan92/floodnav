import { describe, expect, it } from "vitest";
import { validateSupabaseConfig } from "../client/src/lib/services/supabaseConfig";
describe("browser Supabase configuration", () => {
  it("normalizes a project origin", () =>
    expect(
      validateSupabaseConfig({
        url: " https://test.supabase.co/ ",
        key: " sb_publishable_test ",
      }),
    ).toEqual({ url: "https://test.supabase.co", key: "sb_publishable_test" }));
  it.each([
    "https://user:password@test.supabase.co",
    "https://test.supabase.co/rest/v1",
    "https://test.supabase.co?key=123",
    "http://test.supabase.co",
    "not a URL",
  ])("rejects unsafe or non-project URL %s", (url) =>
    expect(() =>
      validateSupabaseConfig({ url, key: "sb_publishable_test" }),
    ).toThrow(),
  );
  it("allows local Supabase for development", () =>
    expect(
      validateSupabaseConfig({
        url: "http://127.0.0.1:54321",
        key: "sb_publishable_test",
      }).url,
    ).toBe("http://127.0.0.1:54321"));
  it("rejects server secrets and legacy service-role JWTs", () => {
    const url = "https://test.supabase.co";
    expect(() =>
      validateSupabaseConfig({ url, key: "sb_secret_private" }),
    ).toThrow();
    expect(() =>
      validateSupabaseConfig({ url, key: `eyJ.test.signature` }),
    ).toThrow();
    const payload = btoa(JSON.stringify({ role: "service_role" }));
    expect(() =>
      validateSupabaseConfig({ url, key: `eyJ.${payload}.signature` }),
    ).toThrow();
  });
});

