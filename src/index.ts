import * as vscode from "vscode";
import { parsePackageJson, parsePnpmWorkspaceYaml } from "./parser";
import { getPackageMetaWithCache } from "./npm";
import { getUpdateSuggestion, UpdateSuggestion } from "./version";
import { updateDecorations, diagnosticCollection } from "./ui";
import { getPnpmCatalogs } from "./pnpm";
import { UpdateCodeActionProvider } from "./codeAction";

export async function activate(context: vscode.ExtensionContext) {
  console.log("package-check is now active");
  let checkTimeout: NodeJS.Timeout | undefined;

  type WorkspaceConfig = {
    hasPnpmWorkspaceYaml: boolean;
  };

  const workspaceConfigCache = new Map<string, WorkspaceConfig>();

  async function detectWorkspaceConfig(
    folder: vscode.WorkspaceFolder,
  ): Promise<WorkspaceConfig> {
    const pnpmWorkspace = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, "**/pnpm-workspace.yaml"),
      "**/node_modules/**",
      1,
    );
    return {
      hasPnpmWorkspaceYaml: pnpmWorkspace.length > 0,
    };
  }

  async function refreshWorkspaceConfigs() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;
    await Promise.all(
      folders.map(async (folder) => {
        const config = await detectWorkspaceConfig(folder);
        workspaceConfigCache.set(folder.uri.toString(), config);
      }),
    );
  }

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

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspaceRoot = workspaceFolder?.uri.fsPath;

    let catalogs: Record<string, any> = {};
    if (workspaceRoot && isPackageJson && workspaceFolder) {
      const config = workspaceConfigCache.get(
        workspaceFolder.uri.toString(),
      );
      if (config?.hasPnpmWorkspaceYaml) {
        catalogs = await getPnpmCatalogs(workspaceRoot);
      }
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
          if (isPackageJson && version.startsWith("catalog:")) {
            suggestion.catalog = version.split(":")[1] || "default";
          }
          suggestions.set(dep.name, suggestion);
        }
      }
    });

    await Promise.all(promises);
    if (!editor) { return }
    updateDecorations(editor, suggestions);
  }

  async function checkOpenDocuments() {
    const docs = new Set<vscode.TextDocument>();
    for (const doc of vscode.workspace.textDocuments) {
      docs.add(doc);
    }
    for (const editor of vscode.window.visibleTextEditors) {
      docs.add(editor.document);
    }
    await Promise.all(Array.from(docs).map((doc) => checkDocument(doc)));
  }

  function triggerCheck(document: vscode.TextDocument) {
    if (checkTimeout) clearTimeout(checkTimeout);
    checkTimeout = setTimeout(() => checkDocument(document), 100);
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
      checkOpenDocuments();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshWorkspaceConfigs();
    }),
  );

  await refreshWorkspaceConfigs();
  checkOpenDocuments();
}

export function deactivate() { }
