import { expect, it } from "vitest";
import { listModels, streamChat } from "../src/providers";
import {
  createResponseTracker,
  responseIdentity,
  responseThroughput,
} from "../src/response-telemetry";
import { defaultSettings } from "../src/types";

// Opt-in only: does not transmit chat history, print credentials, or call cloud APIs.
const endpoint = process.env.LMS_LIVE_URL;
it.skipIf(!endpoint)(
  "receives token telemetry from a real LM Studio server",
  async () => {
    const url = new URL(endpoint!);
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))
      throw new Error("The live probe only accepts loopback addresses.");
    const config = {
      ...defaultSettings.providers.lmstudio,
      endpoint: endpoint!,
    };
    const secret = process.env.LMS_LIVE_TOKEN ?? "";
    const models = await listModels(config, secret);
    config.model = process.env.LMS_LIVE_MODEL || models[0] || "";
    if (!config.model)
      throw new Error(
        "Load an LM Studio chat model before running this check.",
      );
    const tracker = createResponseTracker(responseIdentity(config));
    let hasAnswer = false;
    await streamChat(
      config,
      secret,
      [
        {
          id: "live-probe",
          role: "user",
          content:
            "Write two short sentences about a park. Reply in plain text.",
          createdAt: Date.now(),
        },
      ],
      AbortSignal.timeout(45_000),
      (delta) => {
        if (delta.trim()) hasAnswer = true;
        tracker.visible(delta);
      },
      undefined,
      (sample, at) => {
        tracker.receive(sample, at);
      },
    );
    const result = tracker.snapshot();
    const throughput = responseThroughput(result);
    expect(hasAnswer).toBe(true);
    expect(result.generation?.tokens ?? result.usage?.output).toBeGreaterThan(
      0,
    );
    expect(throughput?.value).toBeGreaterThan(0);
    console.log({
      usage: result.usage,
      generation: result.generation,
      throughput,
    });
  },
  50_000,
);
