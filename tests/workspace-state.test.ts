import { describe, expect, it } from "vitest";
import {
  captureRequest,
  resolveConfig,
  validRequestSnapshot,
} from "../src/request-config";
import {
  createWorkspaceSession,
  selectActiveChat,
} from "../src/workspace-state";
import {
  configurationRows,
  safeDiagnosticLabel,
  serializeInspection,
  telemetryRows,
} from "../src/workspace-inspection";
import { defaultSettings } from "../src/types";

const settings = {
  ...defaultSettings,
  provider: "lmstudio" as const,
  providers: {
    ...defaultSettings.providers,
    lmstudio: {
      ...defaultSettings.providers.lmstudio,
      model: "global",
      vision: true,
      endpoint: "https://example.test/private-endpoint-token/v1",
    },
  },
};

describe("workspace state and configuration", () => {
  it("resolves request, conversation and global settings in order without stale capabilities", () => {
    expect(resolveConfig(defaultSettings).sources.model).toBe("default");
    expect(resolveConfig(settings).sources).toMatchObject({
      provider: "global",
      model: "global",
      vision: "global",
      endpoint: "global",
    });
    const conversation = {
      model: "conversation",
      vision: true,
      requestThoughts: true,
    };
    expect(
      resolveConfig(settings, conversation, { vision: false }),
    ).toMatchObject({
      config: { model: "conversation", vision: false, requestThoughts: true },
      sources: {
        model: "conversation",
        vision: "request",
        requestThoughts: "conversation",
      },
    });
    const request = resolveConfig(settings, conversation, {
      model: "override",
    });
    expect(request.config).toMatchObject({
      model: "override",
      vision: false,
      requestThoughts: false,
    });
    expect(
      resolveConfig(
        settings,
        { provider: "openai", model: "different-provider" },
        { provider: "lmstudio" },
      ).config.model,
    ).toBe("global");
  });

  it("captures immutable request facts and exports only allowed diagnostics, never identifiers or URLs", () => {
    const resolved = resolveConfig(settings, { model: "authorization-secret" });
    const captured = captureRequest(resolved, 10);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.sources)).toBe(true);
    expect(captured).toMatchObject({
      model: "authorization-secret",
      target: "network HTTPS",
      usageMode: "stream_options.include_usage",
    });
    expect(resolveConfig(settings, { model: "new" }).config.model).not.toBe(
      captured.model,
    );
    expect(validRequestSnapshot(captured)).toBe(true);
    expect(
      validRequestSnapshot({
        ...captured,
        headers: { Authorization: "token" },
      }),
    ).toBe(false);
    const redact = (value?: string) =>
      safeDiagnosticLabel(value, ["authorization-secret"]);
    const rows = configurationRows("historical", captured, redact);
    expect(rows.find(({ key }) => key === "historical.model")?.value).toBe(
      "Redacted",
    );
    const telemetry = telemetryRows(
      {
        id: "id",
        role: "assistant",
        content: "private message",
        createdAt: 10,
        telemetry: {
          provider: "lmstudio",
          model: "authorization-secret",
          finishReason: "authorization-secret",
          usage: { cached: 0 },
        },
      },
      redact,
    );
    const json = serializeInspection({
      Runtime: [],
      Context: [],
      Configuration: rows,
      Telemetry: telemetry,
      Storage: [],
      PWA: [],
    });
    expect(json).not.toMatch(
      /authorization-secret|private-endpoint-token|private message|historical\.model|finishReason/,
    );
    const result = JSON.parse(json);
    expect(result.sections.Telemetry.cachedTokens.value).toBe(0);
    expect(result.sections.Telemetry.totalTokens.value).toBeNull();
  });

  it("exposes one session projection to synchronous actions and subscribers", () => {
    const store = createWorkspaceSession({ settings, threads: [], active: "" });
    const observed: string[] = [];
    const stop = store.subscribe(() => {
      observed.push(selectActiveChat(store.get())?.draft ?? "");
    });
    const first = store.get();
    store.update({
      active: "a",
      threads: [
        { id: "a", title: "chat", draft: "draft", messages: [], updatedAt: 1 },
      ],
    });
    store.update((current) => ({
      threads: current.threads.map((chat) => ({ ...chat, draft: "changed" })),
    }));
    expect(observed).toEqual(["draft", "changed"]);
    expect(first.threads).toEqual([]);
    stop();
  });
});
