import { useEffect, useRef, useState } from "react";

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

// Let waiting workers activate naturally so open drafts and replies are safe.
export function useAppUpdate(notify: (message: string) => void) {
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const announceReady = () => {
      if (
        !disposed &&
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
      if (disposed || !found || found === registration) return;
      registration?.removeEventListener("updatefound", onUpdate);
      registration = found;
      found.addEventListener("updatefound", onUpdate);
      onUpdate();
    };
    void attach();
    window.addEventListener("luma:worker-registered", attach);
    return () => {
      disposed = true;
      window.removeEventListener("luma:worker-registered", attach);
      registration?.removeEventListener("updatefound", onUpdate);
      installing?.removeEventListener("statechange", announceReady);
    };
  }, [notify]);

  const check = async () => {
    if (inFlight.current) return;
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
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

  return { checking, check };
}
