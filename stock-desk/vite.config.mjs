import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Plain `vite` (not `netlify dev`) doesn't know about Netlify
      // Functions. This proxies /api/* to a locally-running Express
      // server instead -- run `npm run server` in another terminal.
      // If you use `netlify dev` (recommended, see README), it
      // handles /api/* itself via the redirect in netlify.toml and
      // this proxy is simply unused.
      "/api": "http://localhost:3001",
    },
  },
});
