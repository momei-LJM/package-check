import * as vscode from "vscode";
import * as path from "path";
import { parseDocument, isMap, isScalar, isSeq } from "yaml";

export interface PnpmCatalog {
  [name: string]: string;
}

export async function getPnpmCatalogs(
  workspaceRoot: string,
): Promise<Record<string, PnpmCatalog>> {
  const yamlUri = vscode.Uri.file(
    path.join(workspaceRoot, "pnpm-workspace.yaml"),
  );
  try {
    const bytes = await vscode.workspace.fs.readFile(yamlUri);
    const content = Buffer.from(bytes).toString("utf8");
    const doc = parseDocument(content);
    if (!doc.contents || !isMap(doc.contents)) return {};

    const catalogs: Record<string, PnpmCatalog> = {};

    function extract(map: any, name: string) {
      if (!isMap(map)) return;
      catalogs[name] = {};
      for (const pair of map.items) {
        if (isScalar(pair.key) && isScalar(pair.value)) {
          catalogs[name][String(pair.key.value)] = String(pair.value.value);
        }
      }
    }

    const catalog = doc.get("catalog");
    if (catalog) extract(catalog, "default");

    const catalogsNode = doc.get("catalogs");
    if (catalogsNode && isMap(catalogsNode)) {
      for (const pair of catalogsNode.items) {
        if (isScalar(pair.key)) {
          extract(pair.value, String(pair.key.value));
        }
      }
    }

    return catalogs;
  } catch (e) {
    return {};
  }
}

export async function findPackageJsons(
  workspaceRoot: string,
): Promise<vscode.Uri[]> {
  const yamlUri = vscode.Uri.file(
    path.join(workspaceRoot, "pnpm-workspace.yaml"),
  );
  try {
    const bytes = await vscode.workspace.fs.readFile(yamlUri);
    const content = Buffer.from(bytes).toString("utf8");
    const doc = parseDocument(content);
    if (!doc.contents || !isMap(doc.contents)) {
      return [vscode.Uri.file(path.join(workspaceRoot, "package.json"))];
    }

    const packages = doc.get("packages");
    if (!isSeq(packages)) {
      return [vscode.Uri.file(path.join(workspaceRoot, "package.json"))];
    }

    const globs = packages.items
      .map((item) => (isScalar(item) ? String(item.value) : null))
      .filter(Boolean) as string[];

    const results: vscode.Uri[] = [];
    for (const glob of globs) {
      if (glob.startsWith("!")) continue;

      const cleanGlob = glob.endsWith("/")
        ? `${glob}package.json`
        : `${glob}/package.json`;
      const pattern = new vscode.RelativePattern(workspaceRoot, cleanGlob);
      const found = await vscode.workspace.findFiles(
        pattern,
        "**/node_modules/**",
      );
      results.push(...found);
    }

    // 如果没有找到任何子包，至少返回根目录的
    if (results.length === 0) {
      results.push(vscode.Uri.file(path.join(workspaceRoot, "package.json")));
    }
    return results;
  } catch (e) {
    const rootPkg = vscode.Uri.file(path.join(workspaceRoot, "package.json"));
    return [rootPkg];
  }
}
