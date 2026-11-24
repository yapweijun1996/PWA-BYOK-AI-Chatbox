import {
  Database,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import type { Conversation } from "../types";
import { interpolate, translate } from "../i18n";
import type { Locale } from "../i18n";
type Props = {
  locale: Locale;
  open: boolean;
  collapsed: boolean;
  hiddenFromInput: boolean;
  active: string;
  chatView: boolean;
  query: string;
  chats: Conversation[];
  onQuery: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onChoose: (id: string) => void;
  onRename: (chat: Conversation) => void;
  onNavigate: (view: "providers" | "data" | "appearance") => void;
};
export function Sidebar({
  locale,
  open,
  collapsed,
  hiddenFromInput,
  active,
  chatView,
  query,
  chats,
  onQuery,
  onClose,
  onCreate,
  onChoose,
  onRename,
  onNavigate,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() - 7);
  const groups = [
    {
      label: "Today",
      chats: chats.filter((chat) => chat.updatedAt >= today.getTime()),
    },
    {
      label: "Previous 7 days",
      chats: chats.filter(
        (chat) =>
          chat.updatedAt < today.getTime() && chat.updatedAt >= week.getTime(),
      ),
    },
    {
      label: "Earlier",
      chats: chats.filter((chat) => chat.updatedAt < week.getTime()),
    },
  ];
  return (
    <aside
      id="chat-sidebar"
      className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
      inert={hiddenFromInput || undefined}
      aria-hidden={hiddenFromInput || undefined}
    >
      <div className="brand">
        <img
          className="brand-mark"
          src={`${import.meta.env.BASE_URL}icon.svg`}
          width={38}
          height={38}
          alt=""
        />
        <strong>{t("Luma Chat")}</strong>
        <button
          className="icon mobile close"
          aria-label={t("Close menu")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <button className="primary new-chat" onClick={onCreate}>
        <Plus size={19} />
        {t(" New chat")}
      </button>
      <label className="search">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("Search chats...")}
          aria-label={t("Search chats")}
        />
      </label>
      <div className="history">
        {chats.length === 0 && (
          <p className="muted small">{t("No conversations found.")}</p>
        )}
        {groups
          .filter((group) => group.chats.length)
          .map((group) => (
            <section key={group.label} aria-label={t(group.label)}>
              <div className="history-label">{t(group.label)}</div>
              {group.chats.map((chat) => (
                <div
                  className={`history-item ${chat.id === active && chatView ? "selected" : ""}`}
                  key={chat.id}
                >
                  <button
                    className="history-name"
                    onClick={() => onChoose(chat.id)}
                  >
                    <MessageCircle size={16} />
                    <span>
                      {chat.title === "New chat" ? t("New chat") : chat.title}
                    </span>
                  </button>
                  <button
                    className="icon more"
                    aria-label={interpolate(
                      t("Rename {name}"),
                      chat.title === "New chat" ? t("New chat") : chat.title,
                    )}
                    onClick={() => onRename(chat)}
                  >
                    ⋯
                  </button>
                </div>
              ))}
            </section>
          ))}
      </div>
      <div className="sidebar-bottom">
        <button className="nav" onClick={() => onNavigate("providers")}>
          <Settings size={19} />
          {t(" Settings")}
        </button>
        <button className="nav" onClick={() => onNavigate("data")}>
          <Database size={19} />
          {t(" Local data")}
        </button>
        <button className="nav" onClick={() => onNavigate("appearance")}>
          <Sun size={19} />
          {t(" Appearance")}
        </button>
      </div>
    </aside>
  );
}
