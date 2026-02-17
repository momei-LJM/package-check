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

// 生成版本更新信息的通用部分
function buildUpdateInfo(suggestion: UpdateSuggestion): string {
  const typeLabel = suggestion.type ? suggestion.type.toUpperCase() : "Update";
  return `${typeLabel}: ${suggestion.latest}`;
}

// 创建版本 tag 的辅助函数
interface CreateTagOptions {
  range: vscode.Range;
  text: string;
  bgColor: string;
  textColor: string;
  margin: string;
  fontWeight: string;
  fontSize: string;
  hoverMsg?: vscode.MarkdownString;
}

function createTag(options: CreateTagOptions): vscode.DecorationOptions {
  const { range, text, bgColor, textColor, margin, fontWeight, fontSize, hoverMsg } = options;
  const decoration: vscode.DecorationOptions = {
    range,
    renderOptions: {
      after: {
        contentText: text,
        backgroundColor: bgColor,
        color: textColor,
        margin,
        padding: "0px 6px",
        borderRadius: "4px",
        fontWeight,
        fontSize,
      } as any,
    },
  };
  if (hoverMsg) {
    decoration.hoverMessage = hoverMsg;
  }
  return decoration;
}

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
    if (!suggestion) continue;

    const isCatalog = !!suggestion.catalog;
    const arrow = isCatalog ? "" : "\u2197 ";
    const contentText = `${arrow}${suggestion.latest}`;

    // 根据类型决定颜色
    let color = "";
    let backgroundColor = "";
    if (suggestion.type === "major") {
      color = "#ef4444"; // Tailwind red-500
      backgroundColor = "rgba(239, 68, 68, 0.15)";
    } else if (suggestion.type === "minor") {
      color = "#f97316"; // Tailwind orange-500
      backgroundColor = "rgba(249, 115, 22, 0.15)";
    } else if (suggestion.type === "patch") {
      color = "#22c55e"; // Tailwind green-500
      backgroundColor = "rgba(34, 197, 94, 0.15)";
    }

    if (!contentText) continue;

    const updateInfo = buildUpdateInfo(suggestion);

    if (isCatalog) {
      // Catalog 展示设计：两个独立的 Tag
      decorations.push(
        createTag({
          range: dep.range,
          text: `catalog:${suggestion.catalog}`,
          bgColor: "rgba(107, 114, 128, 0.1)", // gray-500 alpha
          textColor: "#6b7280", // gray-500
          margin: "0 0.5em 0 2em",
          fontWeight: "600",
          fontSize: tagFontSize,
        }),
      );

      const hoverMsg = new vscode.MarkdownString(
        `**Update available (via Catalog) for ${dep.name}**\n\n` +
        `**Catalog Group:** ${suggestion.catalog}\n\n` +
        updateInfo,
      );
      decorations.push(
        createTag({
          range: dep.range,
          text: contentText,
          bgColor: backgroundColor,
          textColor: color,
          margin: "0 0 0 0.2em",
          fontWeight: "bold",
          fontSize: tagFontSize,
          hoverMsg,
        }),
      );
    } else {
      const hoverMsg = new vscode.MarkdownString(
        `**Update available for ${dep.name}**\n\n` + updateInfo,
      );
      decorations.push(
        createTag({
          range: dep.range,
          text: contentText,
          bgColor: backgroundColor,
          textColor: color,
          margin: "0 0 0 2em",
          fontWeight: "bold",
          fontSize: tagFontSize,
          hoverMsg,
        }),
      );
    }
  }

  editor.setDecorations(decorationType, decorations);
}
