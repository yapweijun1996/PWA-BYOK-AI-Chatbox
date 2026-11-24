import { useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { translate, translateNotice } from "../i18n";
import type { Locale } from "../i18n";
import { compactModelName } from "../model-options";
import type { ModelOption } from "../model-options";
import { labels } from "../types";
import type { ProviderId } from "../types";

export type ModelGroup = { provider: ProviderId; options: ModelOption[] };

export function ModelSelector({
  locale,
  autoFocusSearch,
  provider,
  selected,
  groups,
  onLoad,
  onSelect,
  onSettings,
}: {
  locale: Locale;
  autoFocusSearch: boolean;
  provider: ProviderId;
  selected?: ModelOption;
  groups: ModelGroup[];
  onLoad: (provider: ProviderId) => Promise<ModelOption[]>;
  onSelect: (provider: ProviderId, option: ModelOption) => void;
  onSettings: () => void;
}) {
  const t = (text: string) => translate(locale, text);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const id = useId();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState<ProviderId>();
  const name = selected ? compactModelName(selected) : t("Choose model");
  const keyword = query.trim().toLowerCase();
  const matches = groups.map((group) => ({
    ...group,
    options: keyword
      ? group.options.filter((option) =>
          `${option.id} ${option.name || ""} ${labels[group.provider]}`
            .toLowerCase()
            .includes(keyword),
        )
      : group.options,
  }));
  const load = async (id: ProviderId) => {
    if (loading) return;
    setLoading(id);
    setNotice("");
    try {
      const options = await onLoad(id);
      if (!options.length)
        setNotice("No models were listed. Enter the model ID in Providers.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setLoading(undefined);
    }
  };

  return (
    <>
      <button
        className="model-pill"
        type="button"
        ref={trigger}
        title={selected?.id || name}
        aria-label={selected ? `${t("Choose model")} · ${name}` : name}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => {
          setQuery("");
          setNotice("");
          dialog.current?.showModal();
          if (autoFocusSearch) search.current?.focus();
        }}
      >
        <span>{name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <dialog
        className="model-dialog"
        id={id}
        ref={dialog}
        aria-labelledby={headingId}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="model-dialog-content">
          <div className="model-dialog-heading">
            <h2 id={headingId}>{t("Choose model")}</h2>
            <button
              className="icon"
              type="button"
              aria-label={t("Close model selector")}
              onClick={() => dialog.current?.close()}
            >
              <X size={19} aria-hidden="true" />
            </button>
          </div>
          <input
            className="model-search"
            ref={search}
            type="search"
            aria-label={t("Search models")}
            placeholder={t("Search models")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
          />
          {notice && (
            <p className="hint" role="status">
              {translateNotice(locale, notice)}
            </p>
          )}
          <div className="model-results">
            {keyword && matches.every((group) => !group.options.length) && (
              <p className="hint">
                {t(
                  "No matching models. Clear the search to load another catalog.",
                )}
              </p>
            )}
            {matches
              .filter((group) => !keyword || group.options.length)
              .map((group) => (
                <section
                  key={group.provider}
                  aria-label={labels[group.provider]}
                >
                  <div className="model-group-heading">
                    <h3>{labels[group.provider]}</h3>
                    {!keyword && (
                      <button
                        className="secondary"
                        type="button"
                        disabled={Boolean(loading)}
                        onClick={() => void load(group.provider)}
                      >
                        {loading === group.provider
                          ? t("Loading models…")
                          : t("Load models")}
                      </button>
                    )}
                  </div>
                  {group.options.slice(0, 30).map((option) => {
                    const active =
                      group.provider === provider && option.id === selected?.id;
                    return (
                      <button
                        className="model-option"
                        type="button"
                        key={option.id}
                        aria-pressed={active}
                        onClick={() => {
                          onSelect(group.provider, option);
                          dialog.current?.close();
                        }}
                      >
                        <span>
                          <strong>{compactModelName(option)}</strong>
                          <code>{option.id}</code>
                          {(option.vision || option.reasoning) && (
                            <small className="model-capabilities">
                              {[
                                option.vision && t("Image input"),
                                option.reasoning && t("Reasoning"),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          )}
                        </span>
                        {active && <Check size={18} aria-hidden="true" />}
                      </button>
                    );
                  })}
                  {group.options.length > 30 && (
                    <p className="hint">
                      {t("Refine your search to see more models.")}
                    </p>
                  )}
                </section>
              ))}
          </div>
          <button
            className="secondary model-settings"
            type="button"
            onClick={() => {
              dialog.current?.close();
              onSettings();
            }}
          >
            {t("Open provider settings")}
          </button>
        </div>
      </dialog>
    </>
  );
}
