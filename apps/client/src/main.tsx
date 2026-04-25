import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Recover from a vite:preloadError caused by a stale lazy chunk after a deploy.
// Reload exactly once per session, tracked in sessionStorage, so a permanent
// chunk-graph mismatch cannot loop. Production HTML must be served with
// Cache-Control: no-cache so the next document fetch picks up the latest
// asset graph.
const PRELOAD_RECOVERY_KEY = "vite-preload-error-reloaded";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault?.();
  try {
    if (window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) === "1") return;
    window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, "1");
  } catch {
    // Private mode / denied storage falls through to the reload anyway.
  }
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
