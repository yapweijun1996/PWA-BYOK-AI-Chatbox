import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { translate, type Locale } from "../i18n";
import { RichMessage } from "./RichMessage";
import "../reasoning.css";

export function Reasoning({
  text,
  streaming,
  inProgress,
  locale,
  onNotice,
}: {
  text: string;
  streaming: boolean;
  inProgress: boolean;
  locale: Locale;
  onNotice: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const t = (text: string) => translate(locale, text);
  const tail = Array.from(text.trimEnd().slice(-1024).replace(/\s+/g, " ")).slice(-160).join("");
  return (
    <details
      className="reasoning"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-label={inProgress ? `${t("Reasoning")} · ${t("Response in progress")}` : t("Reasoning")}
      >
        <ChevronRight className="reasoning-chevron" size={16} aria-hidden="true" />
        <span className="reasoning-label">{t("Reasoning")}</span>
        {inProgress && (
          <span className="reasoning-progress" aria-hidden="true">
            {t("Generating")}
            <span className="reasoning-dots"><span>.</span><span>.</span><span>.</span></span>
          </span>
        )}
        {tail && (
          <span className="reasoning-preview" aria-hidden="true"><bdi dir="auto">{tail}</bdi></span>
        )}
      </summary>
      <RichMessage
        text={text}
        streaming={streaming}
        locale={locale}
        onNotice={onNotice}
      />
    </details>
  );
}
