import { useEffect, useRef, useState } from "react";
import { afterStartupIdle } from "./startup";

function requestActivation(
  worker: ServiceWorker,
): Promise<"accepted" | "other-clients" | "unsupported"> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish("unsupported"), 3000);
    const finish = (result: "accepted" | "other-clients" | "unsupported") => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(result);
    };
    channel.port1.onmessage = ({ data }) =>
      finish(
        data?.accepted
          ? "accepted"
          : data?.reason === "other-clients"
            ? "other-clients"
            : "unsupported",
      );
    try {
      worker.postMessage({ type: "LUMA_ACTIVATE_UPDATE" }, [channel.port2]);
    } catch {
      channel.port2.close();
      finish("unsupported");
    }
  });
}

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
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
            version,
          ) &&
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

export function useAppUpdate(
  notify: (message: string) => void,
  prepare: () => Promise<boolean>,
) {
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
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
    const apply = async (worker: ServiceWorker) => {
      observeWaiting(worker);
      setCheckState("available");
      setApplying(true);
      if (!(await prepare())) {
        setApplying(false);
        notify(
          "Update paused. Finish the current task and save your work, then try again.",
        );
        return;
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let onChange: () => void = () => {};
      const changed = new Promise<boolean>((resolve) => {
        onChange = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        navigator.serviceWorker.addEventListener("controllerchange", onChange, {
          once: true,
        });
        timeout = setTimeout(() => {
          navigator.serviceWorker.removeEventListener(
            "controllerchange",
            onChange,
          );
          resolve(false);
        }, 10000);
      });
      const result = await requestActivation(worker);
      if (result !== "accepted") {
        clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onChange,
        );
        setApplying(false);
        notify(
          result === "other-clients"
            ? "Update paused. Close other Luma Chat tabs and windows, then try again."
            : "This older update cannot be activated automatically. Close all Luma Chat tabs and windows, then reopen.",
        );
        return;
      }
      if (await changed) window.location.reload();
      else {
        setApplying(false);
        setCheckState("failed");
        notify("Could not activate the update. Try again later.");
      }
    };
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting && navigator.serviceWorker.controller) {
        await apply(registration.waiting);
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
      if (registration.waiting) await apply(registration.waiting);
      else {
        setCheckState("current");
        notify("Luma Chat is up to date.");
      }
    } catch {
      setApplying(false);
      setCheckState("failed");
      notify("Could not check for updates. Try again later.");
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  return {
    checking,
    applying,
    check,
    status,
    controlled,
    checkState,
    availableVersion,
  };
}
