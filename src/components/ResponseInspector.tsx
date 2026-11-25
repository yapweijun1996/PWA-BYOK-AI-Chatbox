import { memo, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { translate } from "../i18n";
import type { Locale } from "../i18n";
import { responseThroughput } from "../response-telemetry";
import { labels } from "../types";
import type { Message } from "../types";

export const ResponseInspector = memo(function ResponseInspector({
  message,
  locale,
}: {
  message: Message;
  locale: Locale;
}) {
  const t = (text: string) => translate(locale, text);
  const [explainSources, setExplainSources] = useState(false);
  const telemetry = message.telemetry;
  const usage = telemetry?.usage;
  const cost = telemetry?.cost;
  const missing = t("N/A");
  const measured = t("Client measured");
  const reported = t("Provider reported");
  const { number, currency, date } = useMemo(
    () => ({
      number: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      currency: new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 6,
      }),
      date: new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
      }),
    }),
    [locale],
  );
  const formatCount = (value?: number) =>
    value === undefined ? missing : number.format(value);
  const formatTime = (value?: number) =>
    value === undefined
      ? missing
      : value < 1000
        ? `${number.format(value)} ms`
        : `${number.format(value / 1000)} s`;
  const local = telemetry?.provider === "lmstudio";
  const generation = telemetry?.generation;
  const costText = local
    ? t("Local inference — no API charge")
    : !cost
      ? missing
      : cost.usd > 0 && cost.usd < 0.000001
        ? `<${currency.format(0.000001)}`
        : currency.format(cost.usd);
  const timestamp = new Date(message.createdAt);
  const timestampText = Number.isNaN(timestamp.getTime())
    ? missing
    : date.format(timestamp);
  const throughput = responseThroughput(telemetry);
  const tps = formatCount(throughput?.value);
  const ttft = formatTime(telemetry?.ttftMs);
  const duration = formatTime(telemetry?.durationMs);
  const title = t("Response inspector");
  const metrics = [
    ...(throughput ? [["TPS", tps]] : []),
    ...(telemetry?.ttftMs !== undefined ? [["TTFT", ttft]] : []),
    ...(telemetry?.durationMs !== undefined ? [[t("Duration"), duration]] : []),
    ...(usage?.total !== undefined
      ? [[t("Tokens"), formatCount(usage.total)]]
      : []),
    ...(cost
      ? [[t("Cost"), cost.source === "estimated" ? `≈${costText}` : costText]]
      : []),
  ];
  const groups: Array<{
    key: string;
    heading: string;
    fields: Array<[string, string, string?]>;
  }> = [
    {
      key: "model",
      heading: t("Model information"),
      fields: [
        [
          t("Provider"),
          telemetry ? labels[telemetry.provider] || missing : missing,
        ],
        [t("Model"), telemetry?.model || missing],
        ...(telemetry?.servedModel && telemetry.servedModel !== telemetry.model
          ? [
              [t("Served model"), telemetry.servedModel, reported] as [
                string,
                string,
                string,
              ],
            ]
          : []),
        [
          t("Reasoning effort"),
          telemetry?.reasoningEffort || missing,
          reported,
        ],
      ],
    },
    {
      key: "timing",
      heading: t("Speed and timing"),
      fields: [
        [
          "TPS",
          tps,
          throughput?.source === "provider"
            ? t("Provider timings: generated tokens ÷ generation duration")
            : t(
                "Client estimate: reported output tokens ÷ time between first and last generated deltas",
              ),
        ],
        ["TTFT", ttft, measured],
        ["TTFV", formatTime(telemetry?.ttfvMs), measured],
        [t("Total duration"), duration, measured],
        ...(generation
          ? [
              [
                t("Generation duration"),
                formatTime(generation.durationMs),
                reported,
              ] as [string, string, string],
            ]
          : []),
      ],
    },
    {
      key: "tokens",
      heading: t("Token usage"),
      fields: [
        [t("Input tokens"), formatCount(usage?.input), reported],
        [t("Output tokens"), formatCount(usage?.output), reported],
        [t("Total tokens"), formatCount(usage?.total), reported],
        [t("Reasoning tokens"), formatCount(usage?.reasoning), reported],
        [t("Cached tokens"), formatCount(usage?.cached), reported],
        ...(generation
          ? [
              [
                t("Generated tokens"),
                formatCount(generation.tokens),
                reported,
              ] as [string, string, string],
              [
                t("Prompt evaluation tokens"),
                formatCount(generation.promptEvaluated),
                reported,
              ] as [string, string, string],
              [
                t("Timing cache tokens"),
                formatCount(generation.cacheTokens),
                reported,
              ] as [string, string, string],
            ]
          : []),
      ],
    },
    {
      key: "status",
      heading: t("Cost and status"),
      fields: [
        [
          t("API cost (USD)"),
          costText,
          local
            ? undefined
            : cost?.source === "estimated"
              ? t("Catalog estimate")
              : reported,
        ],
        [t("Finish reason"), telemetry?.finishReason || missing, reported],
        [t("Timestamp"), timestampText],
      ],
    },
  ];
  const sourceLabel = (source: string) => {
    if (source === reported) return t("Provider");
    if (source === measured) return t("Client");
    if (source === t("Catalog estimate")) return t("Estimate");
    if (
      source === t("Provider timings: generated tokens ÷ generation duration")
    )
      return t("Provider timings");
    if (
      source ===
      t(
        "Client estimate: reported output tokens ÷ time between first and last generated deltas",
      )
    )
      return t("Client estimate");
    return source;
  };

  return (
    <details className="response-inspector">
      <summary
        aria-label={
          metrics.length
            ? `${title}: ${metrics.map(([label, value]) => `${label} ${value}`).join(", ")}`
            : title
        }
        title={title}
      >
        <span className="response-metrics">
          {metrics.length === 0 && title}
          {metrics.map(([label, value]) => (
            <span className="response-metric" key={label}>
              <span>{label}</span> <strong>{value}</strong>
            </span>
          ))}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="response-inspector-content">
        <h3>{title}</h3>
        <button
          type="button"
          className="response-explain-button"
          aria-expanded={explainSources}
          onClick={() => setExplainSources((value) => !value)}
        >
          {t("Explain metric sources")}
        </button>
        {explainSources && (
          <p className="response-source-legend">
            {t(
              "Provider values come from the selected provider. Client values are measured or estimated in this browser. Estimates are not billing records.",
            )}
          </p>
        )}
        {Boolean(message.toolExecutions?.length) && (
          <p>
            {t(
              "These metrics describe the most recent model request, not tool execution or earlier requests in this reply.",
            )}
          </p>
        )}
        {groups.map(({ key, heading, fields }) => (
          <section className="response-group" key={key}>
            <h4>{heading}</h4>
            <dl>
              {fields.map(([label, value, source]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  {source && value !== missing && (
                    <dd className="response-source">
                      <span role="note" title={source} aria-label={source}>
                        {sourceLabel(source)}
                      </span>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        ))}
        {throughput && (
          <p className="response-explanation">
            <strong>TPS: </strong>
            {throughput.source === "provider"
              ? t("Provider timings: generated tokens ÷ generation duration")
              : t(
                  "Client estimate: reported output tokens ÷ time between first and last generated deltas",
                )}
          </p>
        )}
        <p>
          {t(
            "TTFT starts at the request and ends at the first generated text or reasoning delta. TTFV ends at the first nonblank answer text. Neither measures provider compute time.",
          )}
        </p>
        {telemetry?.provider === "gemini" && (
          <p>
            {t(
              "Gemini reports answer and reasoning tokens separately; output tokens show answer tokens only.",
            )}
          </p>
        )}
        {cost?.source === "reported" &&
          telemetry?.provider === "openrouter" && (
            <p>
              {t(
                "OpenRouter's reported cost may not include charges from a separate upstream account.",
              )}
            </p>
          )}
        {cost?.source === "estimated" && (
          <p>
            {t(
              "Estimate uses catalog token rates for the selected model, not a billing record.",
            )}
          </p>
        )}
      </div>
    </details>
  );
});
