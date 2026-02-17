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

    let version = dep.version;
    const isCatalog = !isYaml && version.startsWith("catalog:");
    if (isCatalog) return [];

    const meta = await getPackageMetaWithCache(dep.name);
    if (!meta) return [];

    const suggestion = getUpdateSuggestion(version, meta.latest);
    if (!suggestion) return [];

    const actions: vscode.CodeAction[] = [];
    const latest = meta.latest;

    if (!latest) return [];

    // 三个选项：
    // 1. ^ - 锁定主版本号 (允许更新 minor 和 patch)
    // 2. ~ - 锁定主次版本号 (只允许更新 patch)
    // 3. 无符号 - 锁定全部版本号 (精确版本)

    // ^ 版本
    actions.push(
      this.createFix(
        document,
        dep.range,
        dep.name,
        `^${latest}`,
        "^ (lock major)",
      ),
    );

    // ~ 版本
    actions.push(
      this.createFix(
        document,
        dep.range,
        dep.name,
        `~${latest}`,
        "~ (lock minor)",
      ),
    );

    // 精确版本
    actions.push(
      this.createFix(document, dep.range, dep.name, latest, "exact"),
    );

    return actions;
  }

  private createFix(
    document: vscode.TextDocument,
    range: vscode.Range,
    name: string,
    newVersion: string,
    label: string,
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(
      `Update ${name} to ${newVersion} (${label})`,
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
    return fix;
  }
}
