import { useEffect, useState } from "react";

// A waiting worker is never forced into control: existing tabs may hold drafts
// or be streaming. Reopening after closing all tabs lets the browser activate it.
export function useAppUpdate(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const onState = () => {
      if (
        !disposed &&
        installing?.state === "installed" &&
        navigator.serviceWorker.controller
      )
        setReady(true);
    };
    const onUpdate = () => {
      installing?.removeEventListener("statechange", onState);
      installing = registration?.installing || null;
      installing?.addEventListener("statechange", onState);
    };
    const attach = async () => {
      const found = await navigator.serviceWorker.getRegistration();
      if (disposed || !found || found === registration) return;
      registration?.removeEventListener("updatefound", onUpdate);
      registration = found;
      if (found.waiting && navigator.serviceWorker.controller) setReady(true);
      found.addEventListener("updatefound", onUpdate);
      if (found.installing) onUpdate();
    };
    void attach();
    window.addEventListener("luma:worker-registered", attach);
    return () => {
      disposed = true;
      window.removeEventListener("luma:worker-registered", attach);
      registration?.removeEventListener("updatefound", onUpdate);
      installing?.removeEventListener("statechange", onState);
    };
  }, []);
  return ready;
}
