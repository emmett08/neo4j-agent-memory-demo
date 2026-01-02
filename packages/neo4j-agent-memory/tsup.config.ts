import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    target: "es2022",
  },
  {
    entry: ["src/index.ts"],
    format: ["cjs"],
    dts: false,
    target: "es2022",
    esbuildOptions(options) {
      options.banner = {
        js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;",
      };
      options.define = {
        ...options.define,
        "import.meta.url": "__importMetaUrl",
      };
    },
  },
]);
