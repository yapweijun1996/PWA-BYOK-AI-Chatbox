import { useEffect, useId, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { translate } from "../i18n";
import type { Locale } from "../i18n";
import type { Settings } from "../types";

export type PreferenceProps = Pick<Settings, "theme" | "language"> & {
  locale: Locale;
  onTheme: (theme: Settings["theme"]) => void;
  onLanguage: (language: Settings["language"]) => void;
};

export function PreferenceFields({
  locale,
  theme,
  language,
  onTheme,
  onLanguage,
  fieldClassName,
}: PreferenceProps & { fieldClassName?: string }) {
  const t = (text: string) => translate(locale, text);
  return (
    <>
      <label className={fieldClassName}>
        <span>{t("Theme")}</span>
        <select
          aria-label={t("Theme")}
          value={theme}
          onChange={(event) => onTheme(event.target.value as Settings["theme"])}
        >
          <option value="system">{t("System")}</option>
          <option value="light">{t("Light")}</option>
          <option value="dark">{t("Dark")}</option>
        </select>
      </label>
      <label className={fieldClassName}>
        <span>{t("Language")}</span>
        <select
          aria-label={t("Language")}
          value={language}
          onChange={(event) =>
            onLanguage(event.target.value as Settings["language"])
          }
        >
          <option value="system">{t("System language")}</option>
          <option value="en">{t("English")}</option>
          <option value="zh-CN">{t("Simplified Chinese")}</option>
        </select>
      </label>
    </>
  );
}

export function TopbarPreferences(props: PreferenceProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = translate(props.locale, "Language and theme");

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !wrapper.current?.contains(event.target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="topbar-preferences" ref={wrapper}>
      <button
        className="icon preferences-toggle"
        type="button"
        ref={trigger}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <SlidersHorizontal size={20} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="preferences-panel"
          id={id}
          role="group"
          aria-label={title}
        >
          <PreferenceFields {...props} />
        </div>
      )}
    </div>
  );
}
