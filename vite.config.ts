import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      // The browser runs in a Durable Object (a free plan request gets 10 ms of CPU, too little for it).
      // Declared here, not in wrangler.jsonc, because the Update button keeps the owner's wrangler.jsonc.
      config: (c) =>
        c.durable_objects.bindings.some((b) => b.name === "SHOTS")
          ? undefined
          : { durable_objects: { bindings: [{ name: "SHOTS", class_name: "Browser" }] }, migrations: [{ tag: "v1", new_sqlite_classes: ["Browser"] }] },
    }),
  ],
  // A temporary cloudflared tunnel, to try chat apps (Claude, ChatGPT) against this machine.
  server: { port: 5192, allowedHosts: [".trycloudflare.com"] },
});
