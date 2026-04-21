import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const CLIENT_PORT = env.CLIENT_PORT || "3000";
  const API_URL = env.API_URL;
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@repo/ui": path.resolve(__dirname, "../../packages/ui/src"),
      },
    },
    server: {
      port: parseInt(CLIENT_PORT, 10),
    },
    define: {
      "import.meta.env.API_URL": JSON.stringify(API_URL),
    },
  };
});
