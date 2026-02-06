import * as vscode from "vscode";
import { parsePackageJson, parsePnpmWorkspaceYaml } from "./parser";
import { getPackageMetaWithCache } from "./npm";
import { getUpdateSuggestion, UpdateSuggestion } from "./version";
import { updateDecorations, diagnosticCollection } from "./ui";
import { getPnpmCatalogs, findPackageJsons } from "./pnpm";
import { UpdateCodeActionProvider } from "./codeAction";

export async function activate(context: vscode.ExtensionContext) {
  console.log("package-check is now active");
  let checkTimeout: NodeJS.Timeout | undefined;

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      [
        { language: "json", pattern: "**/package.json" },
        { language: "yaml", pattern: "**/pnpm-workspace.yaml" },
      ],
      new UpdateCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  async function checkDocument(document: vscode.TextDocument) {
    const isPackageJson = document.fileName.endsWith("package.json");
    const isPnpmWorkspace = document.fileName.endsWith("pnpm-workspace.yaml");

    if (!isPackageJson && !isPnpmWorkspace) return;

    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document === document,
    );

    const deps = isPackageJson
      ? parsePackageJson(document)
      : parsePnpmWorkspaceYaml(document);
    const suggestions = new Map<string, UpdateSuggestion>();

    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri
      .fsPath;

    let catalogs: Record<string, any> = {};
    if (workspaceRoot && isPackageJson) {
      catalogs = await getPnpmCatalogs(workspaceRoot);
    }

    const promises = deps.map(async (dep) => {
      let version = dep.version;
      let effectiveVersion = version;

      if (isPackageJson && version.startsWith("catalog:")) {
        const catalogName = version.split(":")[1] || "default";
        effectiveVersion = catalogs[catalogName]?.[dep.name];
      }

      if (
        !effectiveVersion ||
        effectiveVersion.startsWith("workspace:") ||
        effectiveVersion.startsWith("file:") ||
        effectiveVersion.startsWith("link:")
      ) {
        return;
      }

      const meta = await getPackageMetaWithCache(dep.name);
      if (meta) {
        const suggestion = getUpdateSuggestion(
          effectiveVersion,
          meta.versions,
          meta.latest,
        );
        if (suggestion) {
          suggestions.set(dep.name, suggestion);
        }
      }
    });

    await Promise.all(promises);
    if (editor) {
      updateDecorations(editor, suggestions);
    } else {
      const diagnostics: vscode.Diagnostic[] = [];
      for (const dep of deps) {
        const suggestion = suggestions.get(dep.name);
        if (suggestion) {
          const diag = new vscode.Diagnostic(
            dep.range,
            `Update available for ${dep.name}: ${suggestion.current} -> ${suggestion.major || suggestion.minor || suggestion.patch}`,
            vscode.DiagnosticSeverity.Information,
          );
          diag.source = "package-check";
          diagnostics.push(diag);
        }
      }
      diagnosticCollection.set(document.uri, diagnostics);
    }
  }

  async function checkAllWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;
    for (const folder of folders) {
      const uris = await findPackageJsons(folder.uri.fsPath);
      for (const uri of uris) {
        try {
          // 只有当文档已经打开或者我们明确需要它时才使用 openTextDocument
          // 为了减少 "AST tracker" 报错，我们先尝试获取已打开的文档
          let doc = vscode.workspace.textDocuments.find(
            (d) => d.uri.toString() === uri.toString(),
          );
          if (!doc) {
            doc = await vscode.workspace.openTextDocument(uri);
          }
          await checkDocument(doc);
        } catch (e) {
          console.error(`Failed to check ${uri.fsPath}:`, e);
        }
      }
    }
  }

  function triggerCheck(document: vscode.TextDocument) {
    if (checkTimeout) clearTimeout(checkTimeout);
    checkTimeout = setTimeout(() => checkDocument(document), 500);
  }

  context.subscriptions.push(
    diagnosticCollection,
    vscode.workspace.onDidOpenTextDocument((doc) => checkDocument(doc)),
    vscode.workspace.onDidChangeTextDocument((event) =>
      triggerCheck(event.document),
    ),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) checkDocument(editor.document);
    }),
    vscode.commands.registerCommand("package-check.checkUpdates", () => {
      checkAllWorkspace();
    }),
  );

  // Start check all workspace
  checkAllWorkspace();
}

export function deactivate() {}
