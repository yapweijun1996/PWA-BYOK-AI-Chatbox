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
          onChange={(event) => onLanguage(event.target.value as Settings["language"])}
        >
          <option value="system">{t("System language")}</option>
          <option value="en">{t("English")}</option>
          <option value="zh-CN">{t("Simplified Chinese")}</option>
          <option value="ms">{t("Malay")}</option>
        </select>
      </label>
    </>
  );
}
