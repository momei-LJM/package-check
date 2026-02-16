import * as vscode from "vscode";
import * as jsonc from "jsonc-parser/lib/esm/main.js";
import { parseDocument, isMap, isScalar, isSeq, LineCounter } from "yaml";

export interface DependencyInfo {
  name: string;
  version: string;
  range: vscode.Range;
  type:
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";
}

export function parsePackageJson(
  document: vscode.TextDocument,
): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const text = document.getText();
  const tree = jsonc.parseTree(text);
  if (!tree || !tree.children) return deps;

  const depTypes = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];

  for (const type of depTypes) {
    const section = jsonc.findNodeAtLocation(tree, [type]);
    if (section && section.children) {
      for (const entry of section.children) {
        if (
          entry.type === "property" &&
          entry.children &&
          entry.children.length === 2
        ) {
          const keyNode = entry.children[0];
          const valueNode = entry.children[1];
          if (valueNode.type === "string") {
            const name = keyNode.value;
            const version = valueNode.value;

            // 只定位到版本号字符串，避免范围过大导致灯泡位置偏移
            const range = new vscode.Range(
              document.positionAt(valueNode.offset),
              document.positionAt(valueNode.offset + valueNode.length),
            );

            deps.push({
              name,
              version,
              range,
              type: type as any,
            });
          }
        }
      }
    }
  }

  return deps;
}

export function parsePnpmWorkspaceYaml(
  document: vscode.TextDocument,
): DependencyInfo[] {
  const lineCounter = new LineCounter()
  const deps: DependencyInfo[] = [];
  const text = document.getText();
  const doc = parseDocument(text, { keepSourceTokens: true, lineCounter });
  if (!doc.contents || !isMap(doc.contents)) return deps;

  function processCatalogMap(map: any) {
    if (!isMap(map)) return;
    for (const pair of map.items) {
      try {
        if (isScalar(pair.key) && isScalar(pair.value)) {
          const name = String(pair.key.value);
          const version = String(pair.value.value);

          const offset = pair.value.srcToken?.offset
          const valueNode = pair.value;

          if (offset == null) {
            // 跳过无法解析的条目，确保其他包能正常解析
            console.warn(`Skipping catalog entry ${name}: unable to get offset`);
            continue;
          }

          if (valueNode.range) {
            const range = new vscode.Range(
              document.positionAt(offset),
              document.positionAt(offset + version.length),
            );
            // 精确只包裹版本号字符串（与 package.json 方式完全一致）
            deps.push({
              name,
              version,
              range,
              type: "dependencies",
            });
          }
        }
      } catch (error) {
        // 单个条目的解析失败不影响其他条目
        console.warn(`Failed to process catalog entry:`, error);
      }
    }
  }

  const catalog = doc.get("catalog");
  if (catalog) {
    processCatalogMap(catalog);
  }

  const catalogs = doc.get("catalogs");
  if (catalogs && isMap(catalogs)) {
    for (const catalogPair of catalogs.items) {
      processCatalogMap(catalogPair.value);
    }
  }

  return deps;
}
