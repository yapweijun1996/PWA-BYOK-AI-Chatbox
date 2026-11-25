import { mergeSettings, recoverMessage } from "./data-contracts";
import { resolveConfig } from "./request-config";
import { resolveLanguage, translate } from "./i18n";
import { storage, StorageBlockedError } from "./storage";
import { applyTheme, rememberTheme } from "./theme";
import type { Conversation, Settings } from "./types";

const prefix = "luma:startup:";
const readyEvent = `${prefix}ready`;
const transitions = {
  loading: ["restoring", "entry-failed"],
  "entry-failed": [],
  restoring: ["mounting", "failed"],
  mounting: ["verifying", "failed"],
  verifying: ["revealing", "failed"],
  revealing: ["ready"],
  ready: [],
  failed: ["restoring"],
} as const;

type Phase = keyof typeof transitions;
export function canTransition(from: Phase, to: Phase): boolean {
  return (transitions[from] as readonly Phase[]).includes(to);
}

export function restoreConversations(
  conversations: Conversation[],
  savedActive: unknown,
) {
  const threads = conversations
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map(recoverMessage),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const active =
    typeof savedActive === "string" &&
    threads.some(({ id }) => id === savedActive)
      ? savedActive
      : (threads.find(({ archived }) => !archived)?.id ?? "");
  return { threads, active };
}

export type InitialAppState = ReturnType<typeof restoreConversations> & {
  settings: Settings;
};
type Mount = (
  initial: InitialAppState,
  onCommit: () => void,
  onError: (error: unknown) => void,
) => () => void;

class StartupFailure extends Error {
  constructor(readonly code: "assets" | "timeout" | "ui") {
    super(code);
  }
}

async function waitForStyles(signal: AbortSignal) {
  const styles = document.querySelectorAll<HTMLLinkElement>(
    "link[data-startup-style]",
  );
  return Promise.all(
    Array.from(styles, (link) => {
      if (link.dataset.startupStyle === "failed")
        throw new StartupFailure("assets");
      if (link.media === "all") return;
      return new Promise<void>((resolve, reject) => {
        link.addEventListener("load", () => resolve(), { once: true, signal });
        link.addEventListener(
          "error",
          () => reject(new StartupFailure("assets")),
          { once: true, signal },
        );
      });
    }),
  );
}

function nextFrame(signal: AbortSignal) {
  if (document.hidden) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const onVisibility = () => {
      if (document.hidden) finish();
    };
    const frame = requestAnimationFrame(finish);
    document.addEventListener("visibilitychange", onVisibility);
    signal.addEventListener("abort", finish, { once: true });
  });
}

function verify(host: HTMLElement, initial: InitialAppState) {
  const app = host.querySelector<HTMLElement>(".app");
  const conversation = app?.querySelector<HTMLElement>(".conversation");
  const composer =
    app?.querySelector<HTMLTextAreaElement>(".composer textarea");
  const activeChat = initial.threads.find(({ id }) => id === initial.active);
  const model = resolveConfig(initial.settings, activeChat?.configOverride)
    .config.model;
  if (
    !app ||
    conversation?.dataset.conversationId !== initial.active ||
    !composer ||
    app.getBoundingClientRect().height <= 0 ||
    composer.getBoundingClientRect().height <= 0 ||
    getComputedStyle(app).getPropertyValue("--app-layout-ready").trim() !==
      "1" ||
    composer.disabled === Boolean(activeChat) ||
    composer.value !== (activeChat?.draft || "").replace(/\r\n?/g, "\n") ||
    app.querySelector<HTMLButtonElement>(".topbar .model-pill")?.dataset.modelId !== model
  )
    throw new StartupFailure("ui");
}

export function startApplication(host: HTMLElement, mount: Mount) {
  const html = document.documentElement;
  if (html.dataset.startup !== "loading") return;
  const splash = document.getElementById("startup-splash")!;
  const status = document.getElementById("startup-status")!;
  const recovery = document.getElementById("startup-recovery")!;
  const detail = document.getElementById("startup-error")!;
  const retry = document.querySelector<HTMLButtonElement>("#startup-retry")!;
  const budget = Number(html.dataset.startupTimeout);
  const state: { phase: Phase } = { phase: "loading" };
  let locale = resolveLanguage("system", navigator.language);
  let attempt = 0;
  let reload = false;
  const transition = (phase: Phase) => {
    if (!canTransition(state.phase, phase))
      throw new Error("Invalid startup transition");
    state.phase = phase;
    html.dataset.startup = phase;
  };

  function reveal(
    mark: (step: string) => string,
    measure: (label: string, start: string, end: string) => void,
  ) {
    const complete = () => {
      if (state.phase !== "revealing") return;
      window.clearTimeout(fallback);
      splash.remove();
      host.inert = false;
      host.removeAttribute("aria-hidden");
      transition("ready");
      const ready = mark("ready");
      measure("splash-fade", "reveal", "ready");
      performance.measure(`${prefix}interactive`, { start: 0, end: ready });
      window.dispatchEvent(new Event(readyEvent));
    };
    const fallback = window.setTimeout(complete, 240);
    splash.setAttribute("aria-hidden", "true");
    mark("reveal");
    transition("revealing");
    if (
      document.hidden ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      complete();
    else
      splash.addEventListener("transitionend", (event) => {
        if (event.target === splash && event.propertyName === "opacity")
          complete();
      });
  }

  const run = async () => {
    transition("restoring");
    delete html.dataset.startupError;
    recovery.hidden = true;
    status.hidden = false;
    status.textContent = translate(locale, "Starting Luma Chat…");
    const attemptPrefix = `${prefix}attempt-${++attempt}:`;
    const mark = (step: string) => {
      const name = attemptPrefix + step;
      performance.mark(name);
      return name;
    };
    const measure = (label: string, start: string, end: string) => {
      performance.measure(
        attemptPrefix + label,
        attemptPrefix + start,
        attemptPrefix + end,
      );
    };
    const start =
      attempt === 1
        ? performance.getEntriesByName(`${prefix}shell`)[0]?.startTime
        : undefined;
    const deadline = (start ?? performance.now()) + budget;
    const abort = new AbortController();
    const timeout = new StartupFailure("timeout");
    const timer = window.setTimeout(
      () => abort.abort(timeout),
      Math.max(0, deadline - performance.now()),
    );
    const cancelled = new Promise<never>((_, reject) => {
      abort.signal.addEventListener(
        "abort",
        () => reject(abort.signal.reason),
        { once: true },
      );
    });
    let unmount: (() => void) | undefined;
    try {
      mark("restore-start");
      const restored = storage
        .restore(abort.signal, () => {
          mark("database-open");
          measure("database", "restore-start", "database-open");
        })
        .then((saved) => {
          const initial = {
            ...restoreConversations(saved.conversations, saved.active),
            settings: mergeSettings(saved.settings),
          };
          mark("state-restored");
          measure("restore", "restore-start", "state-restored");
          return initial;
        });
      const styled = waitForStyles(abort.signal).then(() => {
        mark("styles-ready");
        measure("styles", "restore-start", "styles-ready");
      });
      const [initial] = await Promise.race([
        Promise.all([restored, styled]),
        cancelled,
      ]);
      const { settings } = initial;
      locale = resolveLanguage(settings.language, navigator.language);
      html.lang = locale;
      applyTheme(settings.theme);
      rememberTheme(settings.theme);
      transition("mounting");
      mark("mount-start");
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          unmount = mount(initial, resolve, reject);
        }),
        cancelled,
      ]);
      mark("mounted");
      measure("mount", "mount-start", "mounted");
      transition("verifying");
      await nextFrame(abort.signal);
      const math = host.querySelector(".katex");
      if (math && document.fonts) {
        math.getBoundingClientRect();
        await Promise.race([document.fonts.ready, cancelled]);
      }
      abort.signal.throwIfAborted();
      if (performance.now() >= deadline) throw timeout;
      verify(host, initial);
      mark("verified");
      measure("verify", "mounted", "verified");
      reveal(mark, measure);
    } catch (error) {
      abort.abort(error);
      unmount?.();
      const code =
        error instanceof StartupFailure
          ? error.code
          : error instanceof StorageBlockedError
            ? "blocked"
            : state.phase === "restoring"
              ? "storage"
              : "ui";
      transition("failed");
      mark("failed");
      html.dataset.startupError = code;
      const messages = {
        assets:
          "Could not load the app styles. Check your connection and retry.",
        timeout:
          "Startup took too long. If another Luma Chat window is open, close it and retry.",
        blocked:
          "Local storage is blocked by another window. Close other Luma Chat windows and retry.",
        storage:
          "Could not open your local data. Check that browser storage is allowed and retry. Your data was not cleared.",
        ui: "The app could not display its initial screen. Reload to retry. Your data was not cleared.",
      };
      detail.textContent = translate(locale, messages[code]);
      reload = code === "assets" || code === "ui";
      retry.textContent = translate(locale, reload ? "Reload app" : "Retry");
      status.hidden = true;
      recovery.hidden = false;
      if (!document.hidden) retry.focus({ preventScroll: true });
    } finally {
      window.clearTimeout(timer);
    }
  };

  retry.addEventListener("click", () => {
    if (state.phase !== "failed") return;
    if (reload) location.reload();
    else void run();
  });
  performance.mark(`${prefix}entry`);
  window.dispatchEvent(new Event(`${prefix}entry`));
  void run();
}

export function afterStartupIdle(task: () => void): () => void {
  let cancel = () => {};
  function schedule() {
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(task, { timeout: 1500 });
      cancel = () => window.cancelIdleCallback(idle);
    } else {
      const timer = window.setTimeout(task, 0);
      cancel = () => window.clearTimeout(timer);
    }
  }
  if (document.documentElement.dataset.startup === "ready") schedule();
  else window.addEventListener(readyEvent, schedule, { once: true });
  return () => {
    window.removeEventListener(readyEvent, schedule);
    cancel();
  };
}
