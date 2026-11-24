import { describe, expect, it, vi } from "vitest";
import { credentialDestination, credentialFor } from "../src/credential-destination";
import { listModelOptions } from "../src/providers";
import { defaultSettings } from "../src/types";

const a = { ...defaultSettings.providers.lmstudio, endpoint: "https://a.example/v1" };
const b = { ...a, endpoint: "https://b.example/v1" };
const credential = { destination: credentialDestination(a)!, value: "dummy-A" };

describe("destination-bound credentials", () => {
  it("includes the base path, port and scheme; invalid addresses fail closed", () => {
    expect(credentialFor({ ...a, endpoint: "https://A.example:443/v1/" }, credential)).toBe("dummy-A");
    for (const endpoint of [b.endpoint, "https://a.example/v2", "https://a.example:8443/v1", "http://a.example/v1", "invalid"]) {
      expect(credentialFor({ ...a, endpoint }, credential)).toBe("");
    }
  });
  it("sends the catalog token to A, never to B, even if the old session entry survives", async () => {
    const requests: [string, string | null][] = [];
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      requests.push([url, new Headers(options.headers).get("Authorization")]);
      return Response.json({ data: [] });
    });
    try {
      for (const config of [a, b]) await listModelOptions(config, credentialFor(config, credential));
      expect(requests).toEqual([[a.endpoint + "/models", "Bearer dummy-A"], [b.endpoint + "/models", null]]);
    } finally { vi.unstubAllGlobals(); }
  });
});
