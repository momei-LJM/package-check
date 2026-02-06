import * as vscode from "vscode";
import { parsePackageJson, parsePnpmWorkspaceYaml } from "./parser";
import { getUpdateSuggestion } from "./version";
import { getPackageMetaWithCache } from "./npm";

export class UpdateCodeActionProvider implements vscode.CodeActionProvider {
  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): Promise<vscode.CodeAction[]> {
    const isYaml =
      document.fileName.endsWith(".yaml") || document.fileName.endsWith(".yml");

    const deps = isYaml
      ? parsePnpmWorkspaceYaml(document)
      : parsePackageJson(document);

    const cursorLine = range.start.line;
    const dep = deps.find(
      (d) =>
        d.range.contains(range) ||
        d.range.intersection(range) ||
        d.range.start.line === cursorLine ||
        d.range.end.line === cursorLine,
    );
    if (!dep) return [];

    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri
      .fsPath;
    let version = dep.version;
    const isCatalog = !isYaml && version.startsWith("catalog:");
    if (isCatalog) return [];

    const meta = await getPackageMetaWithCache(dep.name);
    if (!meta) return [];

    const suggestion = getUpdateSuggestion(version, meta.versions, meta.latest);
    if (!suggestion) return [];

    const actions: vscode.CodeAction[] = [];

    if (suggestion.patch && suggestion.patch !== suggestion.current) {
      actions.push(
        this.createFix(
          document,
          dep.range,
          dep.name,
          suggestion.patch,
          "Patch",
        ),
      );
    }
    if (suggestion.minor && suggestion.minor !== suggestion.current) {
      actions.push(
        this.createFix(
          document,
          dep.range,
          dep.name,
          suggestion.minor,
          "Minor",
        ),
      );
    }
    if (suggestion.major && suggestion.major !== suggestion.current) {
      actions.push(
        this.createFix(
          document,
          dep.range,
          dep.name,
          suggestion.major,
          "Major",
        ),
      );
    }

    return actions;
  }

  private createFix(
    document: vscode.TextDocument,
    range: vscode.Range,
    name: string,
    newVersion: string,
    type: string,
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Update ${name} to ${newVersion} (${type})`,
      vscode.CodeActionKind.Empty,
    );
    const edit = new vscode.WorkspaceEdit();

    const text = document.getText(range);
    const firstChar = text[0];
    const lastChar = text[text.length - 1];

    // 如果版本号带引号（JSON 总是带引号，YAML 可能带），则替换引号内部的内容
    if (
      (firstChar === '"' && lastChar === '"') ||
      (firstChar === "'" && lastChar === "'")
    ) {
      const startPos = range.start.translate(0, 1);
      const endPos = range.end.translate(0, -1);
      edit.replace(
        document.uri,
        new vscode.Range(startPos, endPos),
        newVersion,
      );
    } else {
      // 否则直接替换整个范围
      edit.replace(document.uri, range, newVersion);
    }

    fix.edit = edit;
    fix.isPreferred = type !== "Major";
    return fix;
  }
}
