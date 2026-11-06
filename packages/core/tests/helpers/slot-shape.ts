import ts from "typescript";

/** The shape of a registry's slots: a line per member of each type they reach, and what is refused. */
export interface SlotShape {
  readonly lines: string[];
  readonly refused: string[];
}

/**
 * The shape of the slots `ServerCapabilities` names in `registry`, and of
 * every type under `home` they reach, however deep: a line for each type,
 * and one for each of its members. A type's members are a set, printed in
 * the order of their names, an inner type literal's too, so their order in
 * the source changes no line; the overloads of one name, and the call
 * signatures, keep the order they are written in on one line, as a call
 * resolves them in it. A class is read by the declared types of its public
 * members, which no body changes. A `typeof` or an `import()` type is
 * refused: the walk would read no further than its name.
 *
 * @param registry - The registry module
 * @param home - The folder whose types are walked into, named with either separator
 * @returns The lines, each type's own and then its members', by name, and the refusals
 * @example
 * ```ts
 * const { lines, refused } = slotShape("src/capabilities/registry.ts", "src");
 * ```
 */
export function slotShape(registry: string, home: string): SlotShape {
  const program = ts.createProgram([registry], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const root = program
    .getSourceFile(registry)
    ?.statements.find(
      (statement): statement is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(statement) && statement.name.text === "ServerCapabilities",
    );
  if (root === undefined) throw new Error(`${registry} declares no ServerCapabilities`);
  const seen = new Map<ts.Declaration, string>([[root, "ServerCapabilities"]]);
  const folder = comparable(home).replace(/\/?$/, "/");
  const refused: string[] = [];
  const visit = (node: ts.Node, name: string): void => {
    node.forEachChild(function walk(child) {
      if (ts.isTypeQueryNode(child) || ts.isImportTypeNode(child)) {
        refused.push(`${name} reads ${child.getText()}: write the slot's type out`);
        return;
      }
      if (ts.isTypeReferenceNode(child) || ts.isExpressionWithTypeArguments(child)) {
        const named = checker.getSymbolAtLocation(
          ts.isTypeReferenceNode(child) ? child.typeName : child.expression,
        );
        const symbol =
          named && named.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(named) : named;
        for (const decl of symbol?.declarations ?? []) {
          if (seen.has(decl) || !comparable(decl.getSourceFile().fileName).startsWith(folder)) {
            continue;
          }
          seen.set(decl, symbol?.name ?? "");
          for (const part of typedParts(decl)) visit(part, symbol?.name ?? "");
        }
      }
      child.forEachChild(walk);
    });
  };
  visit(root, "ServerCapabilities");
  const blocks = [...seen].map(([decl, name]) => linesOf(decl, name));
  blocks.sort(([a = ""], [b = ""]) => (a < b ? -1 : a > b ? 1 : 0));
  return { lines: blocks.flatMap(([head = "", ...members]) => [head, ...members.sort()]), refused };
}

/* A path as TypeScript writes a file's name — with forward slashes on every system — and in one
   case where the system's file names ignore case, so that a folder Node names with the system's
   own separator, a backslash on Windows, holds the files TypeScript names. */
function comparable(path: string): string {
  const forward = path.replaceAll("\\", "/");
  return ts.sys.useCaseSensitiveFileNames ? forward : forward.toLowerCase();
}

/* The parts of a declaration a type is written in: a class's heritage and members' types, not its bodies. */
function typedParts(decl: ts.Node): readonly ts.Node[] {
  if (!ts.isClassDeclaration(decl)) return [decl];
  return [
    ...(decl.heritageClauses ?? []),
    ...decl.members.flatMap((member) => [
      ...(ts.isPropertyDeclaration(member) && member.type ? [member.type] : []),
      ...(ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)
        ? [...member.parameters, ...(member.type ? [member.type] : [])]
        : []),
    ]),
  ];
}

const printer = ts.createPrinter({ removeComments: true });

function printed(node: ts.Node, file: ts.SourceFile): string {
  return printer.printNode(ts.EmitHint.Unspecified, node, file).replace(/\s+/g, " ").trim();
}

/* A member's name, or what it is when it has none: a call, a construct or an index signature. */
function keyOf(member: ts.Node, file: ts.SourceFile): string {
  const name = (member as { name?: ts.PropertyName }).name;
  return name === undefined ? `(${ts.SyntaxKind[member.kind]})` : printed(name, file);
}

/* A node with every type literal in it holding its members by name, one name's in their own order. */
function sortedLiterals<T extends ts.Node>(node: T, file: ts.SourceFile): T {
  const byName = (members: ts.NodeArray<ts.TypeElement>) =>
    members
      .map((member, at) => ({ member, at, key: keyOf(member, file) }))
      .sort((a, b) => (a.key === b.key ? a.at - b.at : a.key < b.key ? -1 : 1))
      .map(({ member }) => member);
  const sort: ts.TransformerFactory<T> = (context) => (top) => {
    const visit = (child: ts.Node): ts.Node => {
      const visited = ts.visitEachChild(child, visit, context);
      return ts.isTypeLiteralNode(visited)
        ? ts.factory.updateTypeLiteralNode(
            visited,
            ts.factory.createNodeArray(byName(visited.members)),
          )
        : visited;
    };
    return ts.visitNode(top, visit) as T;
  };
  return ts.transform(node, [sort]).transformed[0] ?? node;
}

/* One line for each name among a type's members: its overloads together, in their order. */
function memberLines(
  owner: string,
  members: readonly ts.Node[],
  text: (member: ts.Node) => string,
  file: ts.SourceFile,
): string[] {
  const named = new Map<string, string[]>();
  for (const member of members) {
    const key = member.kind === ts.SyntaxKind.Constructor ? "constructor" : keyOf(member, file);
    named.set(key, [...(named.get(key) ?? []), text(member)]);
  }
  return [...named].map(([key, texts]) => `${owner}.${key}: ${texts.join(" ")}`);
}

/* The lines of one declaration: what it is, then its members, or the whole of it where it has none. */
function linesOf(decl: ts.Declaration, name: string): string[] {
  const file = decl.getSourceFile();
  const print = (node: ts.Node) => printed(sortedLiterals(node, file), file);
  const typeParameters = (params?: ts.NodeArray<ts.TypeParameterDeclaration>) =>
    params ? `<${params.map(print).join(", ")}>` : "";
  const heritage = (clauses?: ts.NodeArray<ts.HeritageClause>) =>
    (clauses ?? []).map((clause) => ` ${print(clause)}`).join("");
  if (ts.isInterfaceDeclaration(decl)) {
    const head = `${name}: interface ${name}${typeParameters(decl.typeParameters)}${heritage(decl.heritageClauses)}`;
    return [head, ...memberLines(name, decl.members, print, file)];
  }
  if (ts.isTypeAliasDeclaration(decl) && ts.isTypeLiteralNode(decl.type)) {
    const head = `${name}: type ${name}${typeParameters(decl.typeParameters)}`;
    return [head, ...memberLines(name, decl.type.members, print, file)];
  }
  if (ts.isClassDeclaration(decl)) {
    const head = `${name}: class ${name}${typeParameters(decl.typeParameters)}${heritage(decl.heritageClauses)}`;
    const shown = decl.members.filter(
      (member) => (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Private) === 0,
    );
    return [head, ...memberLines(name, shown, (member) => classMember(member, print, file), file)];
  }
  return [`${name}: ${print(decl)}`];
}

/* A class's member by its declared types, which no body of a method changes. */
function classMember(
  member: ts.Node,
  print: (node: ts.Node) => string,
  file: ts.SourceFile,
): string {
  const typed = (node: { type?: ts.TypeNode | undefined }) =>
    node.type ? print(node.type) : "inferred";
  const key = member.kind === ts.SyntaxKind.Constructor ? "constructor" : keyOf(member, file);
  if (ts.isPropertyDeclaration(member)) return `${key}: ${typed(member)};`;
  if (!ts.isMethodDeclaration(member) && !ts.isConstructorDeclaration(member)) return `${key};`;
  const parameters = member.parameters.map(
    (parameter) => `${printed(parameter.name, file)}: ${typed(parameter)}`,
  );
  return `${key}(${parameters.join(", ")}): ${typed(member)};`;
}
