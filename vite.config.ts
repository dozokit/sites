import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  // A temporary cloudflared tunnel, to try chat apps (Claude, ChatGPT) against this machine.
  server: { port: 5192, allowedHosts: [".trycloudflare.com"] },
});
