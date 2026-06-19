import * as Handlebars from 'handlebars';

const BLOCK_HELPERS = new Set([
  'if',
  'unless',
  'each',
  'with',
  'lookup',
  'log',
]);

const PARTIALS = new Set(['folio-email-layout', 'folio-email-button']);

const DATA_VARIABLES = new Set([
  '@root',
  '@partial-block',
  '@index',
  '@key',
  '@first',
  '@last',
  'this',
]);

type PathExpression = {
  type: 'PathExpression';
  parts: Array<string | { type: string }>;
  original?: string;
  data?: boolean;
};

type AstNode = {
  type: string;
  path?: PathExpression;
  params?: AstNode[];
  hash?: { pairs?: Array<{ value: AstNode }> };
  name?: PathExpression;
  program?: { body: AstNode[] };
  inverse?: { body: AstNode[] };
  body?: AstNode[];
  value?: AstNode;
  parts?: Array<string | { type: string }>;
};

function isDataPath(path: PathExpression): boolean {
  if (path.data === true) return true;
  const original = path.original?.trim();
  if (original?.startsWith('@')) return true;
  const root = path.parts[0];
  return typeof root === 'string' && root.startsWith('@');
}

function pathRoot(path: PathExpression): string | null {
  if (isDataPath(path)) return null;
  if (!path.parts.length) return null;
  const root = path.parts[0];
  if (typeof root !== 'string') return null;
  return root;
}

function addPath(vars: Set<string>, path: PathExpression): void {
  const root = pathRoot(path);
  if (!root || DATA_VARIABLES.has(root) || BLOCK_HELPERS.has(root)) return;
  vars.add(root);
}

function walkHash(vars: Set<string>, hash: AstNode['hash']): void {
  if (!hash?.pairs) return;
  for (const pair of hash.pairs) {
    if (pair.value.type === 'PathExpression') {
      addPath(vars, pair.value as unknown as PathExpression);
    }
  }
}

function walkParams(vars: Set<string>, params: AstNode[] | undefined): void {
  if (!params) return;
  for (const param of params) {
    if (param.type === 'PathExpression' && param.parts) {
      addPath(vars, param as unknown as PathExpression);
    }
  }
}

function walkNode(vars: Set<string>, node: AstNode): void {
  switch (node.type) {
    case 'MustacheStatement':
      if (node.path) addPath(vars, node.path);
      walkParams(vars, node.params);
      walkHash(vars, node.hash);
      break;
    case 'BlockStatement':
      if (node.path) {
        const helper = pathRoot(node.path);
        if (helper && !BLOCK_HELPERS.has(helper)) {
          addPath(vars, node.path);
        }
      }
      walkParams(vars, node.params);
      walkHash(vars, node.hash);
      if (node.program?.body) {
        for (const child of node.program.body) walkNode(vars, child);
      }
      if (node.inverse?.body) {
        for (const child of node.inverse.body) walkNode(vars, child);
      }
      break;
    case 'PartialStatement':
      if (node.name) {
        const partial = pathRoot(node.name);
        if (partial && !PARTIALS.has(partial)) {
          addPath(vars, node.name);
        }
      }
      walkHash(vars, node.hash);
      break;
    case 'PartialBlockStatement':
      if (node.name) {
        const partial = pathRoot(node.name);
        if (partial && !PARTIALS.has(partial)) {
          addPath(vars, node.name);
        }
      }
      walkHash(vars, node.hash);
      if (node.program?.body) {
        for (const child of node.program.body) walkNode(vars, child);
      }
      break;
    case 'Program':
      if (node.body) {
        for (const child of node.body) walkNode(vars, child);
      }
      break;
    default:
      break;
  }
}

/** Collects root-level template context variable names referenced in a template. */
export function collectHandlebarsVariables(template: string): Set<string> {
  const vars = new Set<string>();
  const ast = Handlebars.parse(template) as unknown as AstNode;
  walkNode(vars, ast);
  return vars;
}

export function findUnknownHandlebarsVariables(
  template: string,
  allowed: Iterable<string>,
): string[] {
  const allowedSet = new Set(allowed);
  const unknown: string[] = [];
  for (const name of collectHandlebarsVariables(template)) {
    if (!allowedSet.has(name)) unknown.push(name);
  }
  return unknown.sort();
}
