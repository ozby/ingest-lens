import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const CLIENT_PORT = process.env.CLIENT_PORT ?? env.CLIENT_PORT ?? "3000";
  const API_URL = process.env.API_URL ?? env.API_URL;
  const VITE_API_BASE_URL = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL ?? API_URL;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: parseInt(CLIENT_PORT, 10),
    },
    define: {
      "import.meta.env.API_URL": JSON.stringify(API_URL),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(VITE_API_BASE_URL),
    },
  };
});
