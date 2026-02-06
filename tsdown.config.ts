import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["cjs"],
  clean: true,
  dts: false,
  external: ["vscode"],
  // noExternal: ["fast-npm-meta", "jsonc-parser", "semver", "yaml"],
});
