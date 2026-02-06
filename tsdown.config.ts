import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["cjs"],
  clean: true,
  dts: false,
  external: ["vscode"],
  noExternal: ["fast-npm-meta", "semver", "yaml", /^jsonc-parser/],
});
