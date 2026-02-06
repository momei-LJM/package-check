import * as vscode from "vscode";
import {
  parsePackageJson,
  parsePnpmWorkspaceYaml,
} from "./parser";
import { UpdateSuggestion } from "./version";

const decorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 2em",
  },
});

export const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("package-check");

export function updateDecorations(
  editor: vscode.TextEditor,
  suggestions: Map<string, UpdateSuggestion>,
) {
  const config = vscode.workspace.getConfiguration("editor");
  const fontSize = config.get<number>("fontSize") || 12;
  const tagFontSize = `${Math.max(fontSize - 2, 10)}px`;

  const decorations: vscode.DecorationOptions[] = [];
  const isYaml =
    editor.document.fileName.endsWith(".yaml") ||
    editor.document.fileName.endsWith(".yml");
  const deps = isYaml
    ? parsePnpmWorkspaceYaml(editor.document)
    : parsePackageJson(editor.document);

  for (const dep of deps) {
    const suggestion = suggestions.get(dep.name);
    if (suggestion) {
      let contentText = "";
      let color = "";
      let backgroundColor = "";
      let isCatalog = !!suggestion.catalog;
      let arrow = isCatalog ? "" : "\u2197 ";

      if (suggestion.major) {
        contentText = `${arrow}${suggestion.major}`;
        color = "#ef4444"; // Tailwind red-500
        backgroundColor = "rgba(239, 68, 68, 0.15)";
      } else if (suggestion.minor) {
        contentText = `${arrow}${suggestion.minor}`;
        color = "#f97316"; // Tailwind orange-500
        backgroundColor = "rgba(249, 115, 22, 0.15)";
      } else if (suggestion.patch) {
        contentText = `${arrow}${suggestion.patch}`;
        color = "#22c55e"; // Tailwind green-500
        backgroundColor = "rgba(34, 197, 94, 0.15)";
      }

      if (contentText) {
        if (isCatalog) {
          // Catalog 展示设计：两个独立的 Tag
          decorations.push({
            range: dep.range,
            renderOptions: {
              after: {
                contentText: `catalog:${suggestion.catalog}`,
                backgroundColor: "rgba(107, 114, 128, 0.1)", // gray-500 alpha
                color: "#6b7280", // gray-500
                margin: "0 0.5em 0 2em",
                padding: "0px 6px",
                borderRadius: "4px",
                fontWeight: "600",
                fontSize: tagFontSize,
              },
            } as any,
          });

          decorations.push({
            range: dep.range,
            renderOptions: {
              after: {
                contentText: contentText,
                backgroundColor: backgroundColor,
                color: color,
                margin: "0 0 0 0.2em",
                padding: "0px 6px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: tagFontSize,
              } as any,
            },
            hoverMessage: new vscode.MarkdownString(
              `**Update available (via Catalog) for ${dep.name}**\n\n` +
              `**Catalog Group:** ${suggestion.catalog}\n\n` +
              (suggestion.patch ? `- Patch: ${suggestion.patch}\n` : "") +
              (suggestion.minor ? `- Minor: ${suggestion.minor}\n` : "") +
              (suggestion.major ? `- Major: ${suggestion.major}\n` : ""),
            ),
          });
        } else {
          decorations.push({
            range: dep.range,
            renderOptions: {
              after: {
                contentText: contentText,
                backgroundColor: backgroundColor,
                color: color,
                margin: "0 0 0 2em",
                padding: "0px 6px",
                borderRadius: "4px",
                fontWeight: "bold",
                fontSize: tagFontSize,
              } as any,
            },
            hoverMessage: new vscode.MarkdownString(
              `**Update available for ${dep.name}**\n\n` +
              (suggestion.patch ? `- Patch: ${suggestion.patch}\n` : "") +
              (suggestion.minor ? `- Minor: ${suggestion.minor}\n` : "") +
              (suggestion.major ? `- Major: ${suggestion.major}\n` : ""),
            ),
          });
        }
      }
    }
  }

  editor.setDecorations(decorationType, decorations);
}

export function clearDecorations(editor: vscode.TextEditor) {
  editor.setDecorations(decorationType, []);
  diagnosticCollection.delete(editor.document.uri);
}
