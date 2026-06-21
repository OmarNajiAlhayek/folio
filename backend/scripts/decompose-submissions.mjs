import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, '../src/submissions/submissions.service.ts');
const outDir = join(__dirname, '../src/submissions');
const src = readFileSync(srcPath, 'utf8');

const classStart = src.indexOf('export class SubmissionsService');
const bodyStart = src.indexOf('constructor(', classStart);
const bodyEnd = src.lastIndexOf('\n}');
const body = src.slice(bodyStart, bodyEnd);

const CONST_BLOCK = src.slice(
  src.indexOf('const EDITOR_TRANSITIONS'),
  src.indexOf('@Injectable()'),
);

function extractMethod(name, opts = {}) {
  const { isPrivate = false, isStatic = false } = opts;
  const lines = body.split('\n');
  let start = -1;
  let depth = 0;
  let inMethod = false;
  const nameRe = new RegExp(
    `^  (?:private |public )?(?:static readonly |async )?${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inMethod && nameRe.test(line)) {
      start = i;
      inMethod = true;
      depth = 0;
    }
    if (inMethod) {
      for (const ch of line) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth === 0 && start < i) {
        return lines.slice(start, i + 1).join('\n');
      }
    }
  }
  throw new Error(`Method not found: ${name}`);
}

function extractConst(name) {
  const re = new RegExp(`const ${name}[\\s\\S]*?};`, 'm');
  const m = CONST_BLOCK.match(re);
  if (!m) throw new Error(`Const not found: ${name}`);
  return m[0];
}

function replaceAll(str, replacements) {
  let out = str;
  for (const [from, to] of replacements) {
    out = out.split(from).join(to);
  }
  return out;
}

function makeService({
  filename,
  className,
  imports,
  constructorDeps,
  methods,
  constants = [],
  extraClassBody = '',
  implements = '',
}) {
  const blocks = methods.map((m) => {
    if (typeof m === 'string') return extractMethod(m);
    return extractMethod(m.name, m);
  });
  let code = blocks.join('\n\n');
  code = replaceAll(code, [
    ['SubmissionsService.ABSTRACT_MAX_WORDS', `${className}.ABSTRACT_MAX_WORDS`],
    ['SubmissionsService[\'toPublicationListItem\']', `${className}['toPublicationListItem']`],
    ["SubmissionsService['toPublicationListItem']", `${className}['toPublicationListItem']`],
  ]);
  const consts = constants.map(extractConst).join('\n\n');
  const impl = implements ? ` implements ${implements}` : '';
  const file = `${imports}

${consts ? consts + '\n\n' : ''}@Injectable()
export class ${className}${impl} {
  private readonly logger = new Logger(${className}.name);

${constructorDeps}

${extraClassBody}${code}
}
`;
  writeFileSync(join(outDir, filename), file, 'utf8');
  console.log('Wrote', filename);
}

// We'll build files manually in follow-up - this script validates extraction
const test = extractMethod('hasPerm', { isPrivate: true });
console.log('hasPerm lines:', test.split('\n').length);
