import { memo, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { translate } from "../i18n";
import type { Locale } from "../i18n";
import { responseTps } from "../response-telemetry";
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
  const costText = !cost
    ? missing
    : cost.usd > 0 && cost.usd < 0.000001
      ? `<${currency.format(0.000001)}`
      : currency.format(cost.usd);
  const timestamp = new Date(message.createdAt);
  const timestampText = Number.isNaN(timestamp.getTime())
    ? missing
    : date.format(timestamp);
  const tps = formatCount(responseTps(telemetry));
  const ttft = formatTime(telemetry?.ttftMs);
  const duration = formatTime(telemetry?.durationMs);
  const title = t("Response inspector");
  const metrics = [
    ["TPS", tps],
    ["TTFT", ttft],
    [t("Duration"), duration],
    [t("Tokens"), formatCount(usage?.total)],
    [t("Cost"), cost?.source === "estimated" ? `≈${costText}` : costText],
  ];
  const fields = [
    [
      t("Provider"),
      telemetry ? labels[telemetry.provider] || missing : missing,
    ],
    [t("Model"), telemetry?.model || missing],
    ...(telemetry?.servedModel && telemetry.servedModel !== telemetry.model
      ? [[t("Served model"), telemetry.servedModel, reported]]
      : []),
    [
      "TPS",
      tps,
      t(
        "Client estimate: reported output tokens ÷ time between first and last generated deltas",
      ),
    ],
    ["TTFT", ttft, measured],
    ["TTFV", formatTime(telemetry?.ttfvMs), measured],
    [t("Total duration"), duration, measured],
    [t("Input tokens"), formatCount(usage?.input), reported],
    [t("Output tokens"), formatCount(usage?.output), reported],
    [t("Total tokens"), formatCount(usage?.total), reported],
    [t("Reasoning tokens"), formatCount(usage?.reasoning), reported],
    [t("Cached tokens"), formatCount(usage?.cached), reported],
    [
      t("API cost (USD)"),
      costText,
      cost?.source === "estimated" ? t("Catalog estimate") : reported,
    ],
    [t("Reasoning effort"), telemetry?.reasoningEffort || missing, reported],
    [t("Finish reason"), telemetry?.finishReason || missing, reported],
    [t("Timestamp"), timestampText],
  ];

  return (
    <details className="response-inspector">
      <summary
        aria-label={`${title}: ${metrics.map(([label, value]) => `${label} ${value}`).join(", ")}`}
        title={title}
      >
        <span className="response-metrics">
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
        <dl>
          {fields.map(([label, value, source]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
              {source && value !== missing && (
                <dd className="response-source">{source}</dd>
              )}
            </div>
          ))}
        </dl>
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
