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

function readWorkerVersion(worker: ServiceWorker): Promise<string | undefined> {
  if (typeof MessageChannel === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let done = false;
    const finish = (version?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      channel.port1.close();
      resolve(version);
    };
    const timer = setTimeout(() => finish(), 1200);
    channel.port1.onmessage = ({ data }) => {
      const version = data?.version;
      finish(
        typeof version === "string" &&
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) &&
          version.length <= 64
          ? version
          : undefined,
      );
    };
    try {
      worker.postMessage({ type: "LUMA_GET_VERSION" }, [channel.port2]);
    } catch {
      channel.port2.close();
      finish();
    }
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
  const [checkState, setCheckState] = useState<
    | "idle"
    | "checking"
    | "current"
    | "available"
    | "failed"
    | "offline"
    | "preparing"
    | "unavailable"
  >("idle");
  const [status, setStatus] = useState<WorkerStatus>(() =>
    supported() ? "unregistered" : "unavailable",
  );
  const [controlled, setControlled] = useState(
    () => supported() && Boolean(navigator.serviceWorker.controller),
  );
  const inFlight = useRef(false);
  const waitingWorker = useRef<ServiceWorker | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string>();
  const observeWaiting = (worker: ServiceWorker | null) => {
    if (waitingWorker.current === worker) return;
    waitingWorker.current = worker;
    setAvailableVersion(undefined);
    if (worker)
      void readWorkerVersion(worker).then(
        (version) => {
          if (waitingWorker.current === worker) setAvailableVersion(version);
        },
        () => {
          if (waitingWorker.current === worker) setAvailableVersion(undefined);
        },
      );
  };

  useEffect(() => {
    if (!supported()) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const announceReady = () => {
      if (disposed) return;
      observeWaiting(registration?.waiting ?? null);
      if (!registration?.waiting)
        setCheckState((previous) =>
          previous === "available" ? "idle" : previous,
        );
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
      waitingWorker.current = null;
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
      setCheckState("unavailable");
      notify("Update checks are unavailable in this build or browser.");
      return;
    }
    inFlight.current = true;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting && navigator.serviceWorker.controller) {
        observeWaiting(registration.waiting);
        setCheckState("available");
        notify(readyNotice);
        return;
      }
      if (!navigator.onLine) {
        setCheckState("offline");
        notify("You are offline. Reconnect to check for updates.");
        return;
      }
      if (!registration || !navigator.serviceWorker.controller) {
        setCheckState("preparing");
        notify(
          "The app is still preparing offline support. Try again shortly.",
        );
        return;
      }
      setChecking(true);
      setCheckState("checking");
      notify("Checking for updates…");
      if (!registration.installing) await registration.update();
      const installing = registration.installing;
      if (installing && !(await waitForInstall(installing)))
        throw new Error("Update installation failed");
      observeWaiting(registration.waiting);
      setCheckState(registration.waiting ? "available" : "current");
      notify(registration.waiting ? readyNotice : "Luma Chat is up to date.");
    } catch {
      setCheckState("failed");
      notify("Could not check for updates. Try again later.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  return { checking, check, status, controlled, checkState, availableVersion };
}
