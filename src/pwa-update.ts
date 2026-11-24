import { useEffect, useRef, useState } from "react";
import { afterStartupIdle } from "./startup";

const readyNotice =
  "An update is ready. Finish any reply, close all Luma Chat tabs and app windows, then reopen. You may need to unlock your key again.";

function waitForInstall(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const onState = () => {
      const state = worker.state;
      if (state === "parsed" || state === "installing") return;
      worker.removeEventListener("statechange", onState);
      resolve(state !== "redundant");
    };
    worker.addEventListener("statechange", onState);
    onState();
  });
}

export type WorkerStatus =
  | "unavailable"
  | "unregistered"
  | "registered"
  | "installing"
  | "waiting"
  | "controlled";
const supported = () => import.meta.env.PROD && "serviceWorker" in navigator;

// Let waiting workers activate naturally so open drafts and replies are safe.
export function useAppUpdate(notify: (message: string) => void) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<WorkerStatus>(() =>
    supported() ? "unregistered" : "unavailable",
  );
  const [controlled, setControlled] = useState(
    () => supported() && Boolean(navigator.serviceWorker.controller),
  );
  const inFlight = useRef(false);

  useEffect(() => {
    if (!supported()) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const announceReady = () => {
      if (disposed) return;
      const hasController = Boolean(navigator.serviceWorker.controller);
      setControlled(hasController);
      setStatus(
        registration?.waiting
          ? "waiting"
          : registration?.installing
            ? "installing"
            : hasController
              ? "controlled"
              : registration
                ? "registered"
                : "unregistered",
      );
      if (
        !inFlight.current &&
        registration?.waiting &&
        navigator.serviceWorker.controller
      )
        notify(readyNotice);
    };
    const onUpdate = () => {
      installing?.removeEventListener("statechange", announceReady);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", announceReady);
      announceReady();
    };
    const attach = async () => {
      const found = await navigator.serviceWorker
        .getRegistration()
        .catch(() => undefined);
      if (disposed) return;
      if (!found || found === registration) {
        announceReady();
        return;
      }
      registration?.removeEventListener("updatefound", onUpdate);
      registration = found;
      found.addEventListener("updatefound", onUpdate);
      onUpdate();
    };
    const cancel = afterStartupIdle(() => {
      void attach();
      window.addEventListener("luma:worker-registered", attach);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        announceReady,
      );
    });
    return () => {
      disposed = true;
      cancel();
      window.removeEventListener("luma:worker-registered", attach);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        announceReady,
      );
      registration?.removeEventListener("updatefound", onUpdate);
      installing?.removeEventListener("statechange", announceReady);
    };
  }, [notify]);

  const check = async () => {
    if (inFlight.current) return;
    if (!supported()) {
      notify("Update checks are unavailable in this build or browser.");
      return;
    }
    inFlight.current = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting && navigator.serviceWorker.controller) {
        notify(readyNotice);
        return;
      }
      if (!navigator.onLine) {
        notify("You are offline. Reconnect to check for updates.");
        return;
      }
      if (!registration || !navigator.serviceWorker.controller) {
        notify(
          "The app is still preparing offline support. Try again shortly.",
        );
        return;
      }
      setChecking(true);
      notify("Checking for updates…");
      if (!registration.installing) await registration.update();
      const installing = registration.installing;
      if (installing && !(await waitForInstall(installing)))
        throw new Error("Update installation failed");
      notify(registration.waiting ? readyNotice : "Luma Chat is up to date.");
    } catch {
      notify("Could not check for updates. Try again later.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  return { checking, check, status, controlled };
}
