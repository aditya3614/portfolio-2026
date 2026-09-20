import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite doesn't know .glb by default — without this it tries to parse the
  // model as JavaScript instead of emitting it as a hashed asset URL.
  assetsInclude: ["**/*.glb"],
   server: {
    allowedHosts: ['levo-roselia-unfully.ngrok-free.dev']
  }
});