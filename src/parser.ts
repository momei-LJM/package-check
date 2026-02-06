import * as vscode from "vscode";
import * as jsonc from "jsonc-parser";
import { parseDocument, isMap, isScalar, isSeq } from "yaml";

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
  const deps: DependencyInfo[] = [];
  const text = document.getText();
  const doc = parseDocument(text);
  if (!doc.contents || !isMap(doc.contents)) return deps;

  function processCatalogMap(map: any) {
    if (!isMap(map)) return;
    for (const pair of map.items) {
      if (isScalar(pair.key) && isScalar(pair.value)) {
        const name = String(pair.key.value);
        const version = String(pair.value.value);
        // YAML ranges are [start, valueEnd, end]
        // valueNode might be pair.value
        const valueNode = pair.value as any;
        if (valueNode.range) {
          let [start, valueEnd] = valueNode.range;
          let pos = document.positionAt(start);

          // 如果定位到了上一行的行尾（换行符），则尝试定位到该偏移量之后第一个非空白字符
          const textAfter = document.getText().slice(start, start + 20);
          const firstNonWhitespaceMatch = textAfter.match(/\S/);
          if (
            firstNonWhitespaceMatch &&
            firstNonWhitespaceMatch.index !== undefined
          ) {
            pos = document.positionAt(start + firstNonWhitespaceMatch.index);
          }

          const lineNum = pos.line;
          const lineText = document.lineAt(lineNum).text;

          // 在该行中寻找版本号字符串，确保位置极其精确
          const versionStartInLine = lineText.indexOf(version);

          // debugger;
          if (versionStartInLine !== -1) {
            const r = new vscode.Range(
              new vscode.Position(lineNum, versionStartInLine),
              new vscode.Position(lineNum, versionStartInLine + version.length),
            );
            // 精确只包裹版本号字符串（与 package.json 方式完全一致）
            deps.push({
              name,
              version,
              range: r,
              type: "dependencies",
            });
          }
        }
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
