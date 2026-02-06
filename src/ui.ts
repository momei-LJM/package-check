import * as vscode from "vscode";
import {
  DependencyInfo,
  parsePackageJson,
  parsePnpmWorkspaceYaml,
} from "./parser";
import { UpdateSuggestion } from "./version";

const decorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 2em",
    color: "#019eff",
  },
});

export const diagnosticCollection =
  vscode.languages.createDiagnosticCollection("package-check");

export function updateDecorations(
  editor: vscode.TextEditor,
  suggestions: Map<string, UpdateSuggestion>,
) {
  const decorations: vscode.DecorationOptions[] = [];
  const diagnostics: vscode.Diagnostic[] = [];

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
      let severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Hint;

      if (suggestion.major && suggestion.major !== suggestion.current) {
        contentText = `\u2197 ${suggestion.major}`;
        severity = vscode.DiagnosticSeverity.Information;
      } else if (suggestion.minor && suggestion.minor !== suggestion.current) {
        contentText = `\u2197 ${suggestion.minor}`;
        severity = vscode.DiagnosticSeverity.Information;
      } else if (suggestion.patch && suggestion.patch !== suggestion.current) {
        contentText = `\u2197 ${suggestion.patch}`;
        severity = vscode.DiagnosticSeverity.Information;
      }

      if (contentText) {
        decorations.push({
          range: dep.range,
          renderOptions: {
            after: {
              contentText: contentText,
            },
          },
          hoverMessage: new vscode.MarkdownString(
            `**Update available for ${dep.name}**\n\n` +
            (suggestion.patch ? `- Patch: ${suggestion.patch}\n` : "") +
            (suggestion.minor ? `- Minor: ${suggestion.minor}\n` : "") +
            (suggestion.major ? `- Major: ${suggestion.major}\n` : ""),
          ),
        });

        const diag = new vscode.Diagnostic(
          dep.range,
          `[hover]:Update available for ${dep.name}: ${suggestion.current} -> ${suggestion.major || suggestion.minor || suggestion.patch}`,
          severity,
        );
        diag.source = "package-check";
        diagnostics.push(diag);
      }
    }
  }

  editor.setDecorations(decorationType, decorations);
  diagnosticCollection.set(editor.document.uri, diagnostics);
}

export function clearDecorations(editor: vscode.TextEditor) {
  editor.setDecorations(decorationType, []);
  diagnosticCollection.delete(editor.document.uri);
}
