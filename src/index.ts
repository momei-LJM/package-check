import * as vscode from "vscode";
import { parsePackageJson, parsePnpmWorkspaceYaml } from "./parser";
import {
  getPackageMetaWithCache,
  refreshPackageMeta,
  setGlobalState,
} from "./npm";
import { getUpdateSuggestion, UpdateSuggestion } from "./version";
import { updateDecorations } from "./ui";
import { getPnpmCatalogs } from "./pnpm";
import { UpdateCodeActionProvider } from "./codeAction";

export async function activate(context: vscode.ExtensionContext) {
  // 初始化全局状态（持久化缓存）
  setGlobalState(context.globalState);

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
      const config = workspaceConfigCache.get(workspaceFolder.uri.toString());
      if (config?.hasPnpmWorkspaceYaml) {
        catalogs = await getPnpmCatalogs(workspaceRoot);
      }
    }

    // 并发处理所有依赖，每处理完一个就立即更新显示
    const promises = deps.map((dep) => {
      let version = dep.version;
      let effectiveVersion = version;
      let packageNameToQuery = dep.name;

      // 处理 npm: 重定向 (如 packagea: "npm:packageb")
      if (version.startsWith("npm:")) {
        const redirectedPkg = version.slice(4);
        packageNameToQuery = redirectedPkg;
        effectiveVersion = redirectedPkg;
      }

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
        return Promise.resolve();
      }

      // 处理建议的函数
      const handleSuggestion = (meta: any) => {
        if (!meta) return;

        const suggestion = getUpdateSuggestion(effectiveVersion, meta.latest);
        if (suggestion && isPackageJson && dep.version.startsWith("catalog:")) {
          suggestion.catalog = dep.version.split(":")[1] || "default";
        }

        if (suggestion) {
          suggestions.set(dep.name, suggestion);
          if (editor) {
            updateDecorations(editor, suggestions);
          }
        }
      };

      // 1. 先用缓存快速显示（如果有缓存的话）
      return getPackageMetaWithCache(packageNameToQuery)
        .then((meta) => {
          // 立即显示缓存数据
          handleSuggestion(meta);

          // 2. 后台刷新最新数据
          return refreshPackageMeta(packageNameToQuery);
        })
        .then((meta) => {
          // 刷新后再次更新显示（如果有新数据）
          handleSuggestion(meta);
        })
        .catch((error) => {
          console.error(
            `Failed to fetch package ${packageNameToQuery}:`,
            error,
          );
        });
    });

    // 等待所有请求完成（即使有失败也不影响）
    return Promise.allSettled(promises);
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

export function deactivate() {}
