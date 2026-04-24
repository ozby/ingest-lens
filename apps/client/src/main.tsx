import { installChunkLoadRecovery } from "@webpresso/agent-kit/vite";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Production HTML should be served with Cache-Control: no-cache so stale-tab
// reloads can pick up the latest asset graph after a deploy.
installChunkLoadRecovery();

createRoot(document.getElementById("root")!).render(<App />);
