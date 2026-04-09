import ts from "typescript";

export interface SourceAstAnalysis {
  sourceFile: ts.SourceFile;
  parseErrors: string[];
  importSpecifiers: string[];
  exportedNames: Set<string>;
}

export interface ExtensionBootstrapAnalysis {
  hasEnsureProtocolFabricCall: boolean;
  hasEnsureProtocolAgentProjectionCall: boolean;
  hasEnsureProtocolAgentProjectionOnSessionStart: boolean;
  hasRegisterProtocolNodeCall: boolean;
  hasSessionStartRegistration: boolean;
  hasSessionShutdownUnregister: boolean;
}

export function analyzeSourceAst(filePath: string, source: string): SourceAstAnalysis {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const importSpecifiers: string[] = [];
  const exportedNames = new Set<string>();
  const parseDiagnostics = ts.transpileModule(source, {
    fileName: filePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).diagnostics ?? [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      importSpecifiers.push(node.moduleSpecifier.text);
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      importSpecifiers.push(node.moduleSpecifier.text);
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exportedNames.add((element.name ?? element.propertyName)?.text ?? element.name.text);
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && hasExportModifier(node) && node.name) {
      exportedNames.add(node.name.text);
    }

    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exportedNames.add(declaration.name.text);
        }
      }
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [firstArgument] = node.arguments;
      if (firstArgument && ts.isStringLiteral(firstArgument)) {
        importSpecifiers.push(firstArgument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    sourceFile,
    parseErrors: parseDiagnostics.map((diagnostic: ts.Diagnostic) => flattenDiagnosticMessage(diagnostic.messageText)),
    importSpecifiers,
    exportedNames,
  };
}

export function analyzeExtensionBootstrap(sourceFile: ts.SourceFile): ExtensionBootstrapAnalysis {
  let hasEnsureProtocolFabricCall = false;
  let hasEnsureProtocolAgentProjectionCall = false;
  let hasEnsureProtocolAgentProjectionOnSessionStart = false;
  let hasRegisterProtocolNodeCall = false;
  let hasSessionStartRegistration = false;
  let hasSessionShutdownUnregister = false;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expressionName = getCallExpressionName(node.expression);
      if (expressionName === "ensureProtocolFabric") {
        hasEnsureProtocolFabricCall = true;
      }
      if (expressionName === "ensureProtocolAgentProjection") {
        hasEnsureProtocolAgentProjectionCall = true;
      }
      if (expressionName === "registerProtocolNode") {
        hasRegisterProtocolNodeCall = true;
      }

      if (isPiEventRegistration(node, "session_start")) {
        if (callbackContainsCall(node.arguments[1], "registerProtocolNode")) {
          hasSessionStartRegistration = true;
        }
        if (callbackContainsCall(node.arguments[1], "ensureProtocolAgentProjection")) {
          hasEnsureProtocolAgentProjectionOnSessionStart = true;
        }
      }

      if (
        isPiEventRegistration(node, "session_shutdown") &&
        callbackContainsPropertyCall(node.arguments[1], "unregisterNode")
      ) {
        hasSessionShutdownUnregister = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    hasEnsureProtocolFabricCall,
    hasEnsureProtocolAgentProjectionCall,
    hasEnsureProtocolAgentProjectionOnSessionStart,
    hasRegisterProtocolNodeCall,
    hasSessionStartRegistration,
    hasSessionShutdownUnregister,
  };
}

export function getPackageName(packageJson: unknown): string | undefined {
  if (!packageJson || typeof packageJson !== "object" || Array.isArray(packageJson)) {
    return undefined;
  }

  const name = (packageJson as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

export function isForbiddenCertifiedNodeImport(specifier: string, ownPackageName?: string): boolean {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("node:")) {
    return false;
  }

  if (specifier === "@kyvernitria/pi-protocol-sdk") {
    return false;
  }

  if (specifier.startsWith("@mariozechner/pi-")) {
    return false;
  }

  if (ownPackageName && specifier === ownPackageName) {
    return false;
  }

  return /^pi-[a-z0-9-]+$/.test(specifier) || /^@[^/]+\/pi-[a-z0-9-]+$/.test(specifier);
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return (modifiers ?? []).some((modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function flattenDiagnosticMessage(messageText: string | ts.DiagnosticMessageChain): string {
  if (typeof messageText === "string") return messageText;
  const nextMessage = messageText.next?.[0];
  return nextMessage
    ? `${messageText.messageText} ${flattenDiagnosticMessage(nextMessage)}`
    : messageText.messageText;
}

function getCallExpressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
}

function isPiEventRegistration(node: ts.CallExpression, eventName: string): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "on" &&
    node.arguments.length >= 2 &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === eventName
  );
}

function callbackContainsCall(callback: ts.Expression | undefined, callName: string): boolean {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && getCallExpressionName(node.expression) === callName) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(callback.body);
  return found;
}

function callbackContainsPropertyCall(callback: ts.Expression | undefined, propertyName: string): boolean {
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false;
  }

  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === propertyName
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(callback.body);
  return found;
}
