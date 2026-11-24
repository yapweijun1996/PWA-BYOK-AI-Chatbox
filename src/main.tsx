import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { afterStartupIdle, startApplication } from "./startup";

const host = document.getElementById("root")!;
startApplication(host, (initial, onCommit, onError) => {
  const root = createRoot(host, {
    onUncaughtError(error) {
      onError(error);
      console.error(error);
    },
  });
  root.render(
    <StrictMode>
      <App initial={initial} onInitialCommit={onCommit} />
    </StrictMode>,
  );
  return () => root.unmount();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  afterStartupIdle(() => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => window.dispatchEvent(new Event("luma:worker-registered")))
      .catch(() => {});
  });
}
