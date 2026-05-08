import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-manifest",
      closeBundle() {
        const dist = resolve(ROOT, "dist");
        if (!existsSync(dist)) mkdirSync(dist, { recursive: true });
        for (const file of ["manifest.json", "thumbnail.png"]) {
          const src = resolve(ROOT, file);
          if (existsSync(src)) {
            copyFileSync(src, resolve(dist, file));
          }
        }
      },
    },
  ],
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
