import * as vscode from "vscode";
import * as path from "path";
import { parseDocument, isMap, isScalar } from "yaml";

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
