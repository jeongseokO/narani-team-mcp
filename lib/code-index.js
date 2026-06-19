/* AUTO-GENERATED — 원본 src/agents/code-index.js 에서 scripts/build-team-mcp.js 가 복사. 직접 수정 금지. */
'use strict';
/*
 * 항상 켜지는 내장 코드 인덱스 — 외부 의존성/바이너리/DB 없음(순수 node fs+정규식).
 *
 * 목적(토큰 절감): 에이전트가 파일 전체를 읽거나 grep raw 출력을 컨텍스트에 쏟아붓는 대신,
 *   "심볼이 어디 정의됐고 어디서 쓰이는지"를 결정적 도구 호출 한 번으로 좁혀 받는다.
 *   → 그래프 노드의 what/how/input/output 을 채울 때 정확한 좌표를 싸게 얻음.
 *
 * tree-sitter/AST 가 아니라 언어별 경량 정규식이라 100% 정확하진 않지만,
 *   설치 0 · 항상 동작 · 충분히 유용 이라는 트레이드오프를 택했다(CodeGraph 의 핵심 아이디어를 자체 구현).
 *
 * 캐시: dir 별로 파일 mtime 기준 증분 갱신. 절대 throw 하지 않음.
 */
const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage',
  '.next', '.nuxt', '.cache', '.turbo', '.parcel-cache', 'vendor', 'venv', '.venv',
  '__pycache__', '.mypy_cache', '.pytest_cache', 'target', 'bin', 'obj',
  '.idea', '.vscode', '.narani', 'renderer', // renderer 는 sync 산출물이라 중복
]);
const MAX_FILES = 4000;        // 인덱싱 파일 수 상한
const MAX_FILE_BYTES = 512 * 1024; // 파일당 스캔 상한(대용량/생성물 방어)
const MAX_SCAN_MS = 4000;      // 1회 빌드 시간 상한(거대 레포 방어)

// 확장자 → 언어
const EXT_LANG = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'js',
  '.ts': 'ts', '.tsx': 'ts', '.mts': 'ts', '.cts': 'ts',
  '.py': 'py', '.pyi': 'py',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.java': 'java', '.kt': 'java', '.kts': 'java', '.cs': 'java', '.scala': 'java',
  '.c': 'c', '.h': 'c', '.cc': 'c', '.cpp': 'c', '.cxx': 'c', '.hpp': 'c',
  '.php': 'php', '.swift': 'swift',
};

function langOf(file) { return EXT_LANG[path.extname(file).toLowerCase()] || null; }

// ── 언어별 심볼 추출(라인 단위) ──────────────────────────────────────────────
const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'await', 'do', 'else', 'new', 'in', 'of', 'case', 'with']);

function symbolsFromLine(lang, line) {
  const out = [];
  const add = (kind, name) => { if (name && name.length <= 80) out.push({ kind, name }); };
  let m;
  if (lang === 'js' || lang === 'ts') {
    if ((m = /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line))) add('function', m[1]);
    if ((m = /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line))) add('class', m[1]);
    if (lang === 'ts') {
      if ((m = /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/.exec(line))) add('interface', m[1]);
      if ((m = /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/.exec(line))) add('type', m[1]);
      if ((m = /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/.exec(line))) add('enum', m[1]);
    }
    // const/let/var = (arrow|function) — 사실상 named function
    if ((m = /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*(?::[^={]+)?=>|[A-Za-z_$][\w$]*\s*=>)/.exec(line))) add('function', m[1]);
    // 클래스 메서드(들여쓰기 + name(...) {)
    if ((m = /^\s+(?:public\s+|private\s+|protected\s+|static\s+|async\s+|get\s+|set\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::[^={]+)?\{/.exec(line))) {
      if (!JS_KEYWORDS.has(m[1])) add('method', m[1]);
    }
  } else if (lang === 'py') {
    if ((m = /^\s*def\s+([A-Za-z_]\w*)/.exec(line))) add('function', m[1]);
    if ((m = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(line))) add('function', m[1]);
    if ((m = /^\s*class\s+([A-Za-z_]\w*)/.exec(line))) add('class', m[1]);
  } else if (lang === 'go') {
    if ((m = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/.exec(line))) add('function', m[1]);
    if ((m = /^type\s+([A-Za-z_]\w*)\s+/.exec(line))) add('type', m[1]);
  } else if (lang === 'rust') {
    if ((m = /\bfn\s+([A-Za-z_]\w*)/.exec(line))) add('function', m[1]);
    if ((m = /\b(?:struct|enum|trait)\s+([A-Za-z_]\w*)/.exec(line))) add('type', m[1]);
  } else if (lang === 'ruby') {
    if ((m = /^\s*def\s+([A-Za-z_][\w?!]*)/.exec(line))) add('function', m[1]);
    if ((m = /^\s*(?:class|module)\s+([A-Za-z_]\w*)/.exec(line))) add('class', m[1]);
  } else if (lang === 'java') {
    if ((m = /\b(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/.exec(line))) add('class', m[1]);
    if ((m = /^\s*(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+|synchronized\s+|override\s+|fun\s+)*[A-Za-z_][\w<>\[\].]*\s+([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/.exec(line))) {
      if (!JS_KEYWORDS.has(m[1])) add('method', m[1]);
    }
  } else if (lang === 'c') {
    if ((m = /^[A-Za-z_][\w\s\*]*\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/.exec(line))) {
      if (!JS_KEYWORDS.has(m[1])) add('function', m[1]);
    }
    if ((m = /\b(?:struct|enum|union)\s+([A-Za-z_]\w*)/.exec(line))) add('type', m[1]);
  } else if (lang === 'php') {
    if ((m = /\bfunction\s+([A-Za-z_]\w*)/.exec(line))) add('function', m[1]);
    if ((m = /\b(?:class|interface|trait)\s+([A-Za-z_]\w*)/.exec(line))) add('class', m[1]);
  } else if (lang === 'swift') {
    if ((m = /\bfunc\s+([A-Za-z_]\w*)/.exec(line))) add('function', m[1]);
    if ((m = /\b(?:class|struct|enum|protocol)\s+([A-Za-z_]\w*)/.exec(line))) add('type', m[1]);
  }
  return out;
}

function importsFromLine(lang, line) {
  const out = [];
  let m;
  if (lang === 'js' || lang === 'ts') {
    if ((m = /\bfrom\s+['"]([^'"]+)['"]/.exec(line))) out.push(m[1]);
    else if ((m = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/.exec(line))) out.push(m[1]);
    else if ((m = /\bimport\s+['"]([^'"]+)['"]/.exec(line))) out.push(m[1]);
  } else if (lang === 'py') {
    if ((m = /^\s*from\s+([\w.]+)\s+import\b/.exec(line))) out.push(m[1]);
    else if ((m = /^\s*import\s+([\w.]+)/.exec(line))) out.push(m[1]);
  } else if (lang === 'go') {
    if ((m = /^\s*"([^"]+)"/.exec(line))) out.push(m[1]); // import 블록 내 경로(근사)
  } else if (lang === 'java') {
    if ((m = /^\s*import\s+([\w.*]+)\s*;/.exec(line))) out.push(m[1]);
  }
  return out;
}

// ── 캐시 + 빌드 ──────────────────────────────────────────────────────────────
const CACHE = new Map(); // dir → { files: Map(rel → {mtime,size,lang,symbols:[{kind,name,line}],imports:[]}), builtAt }

function walk(root) {
  const found = [];
  const stack = [''];
  while (stack.length && found.length < MAX_FILES) {
    const rel = stack.pop();
    let entries;
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      const childRel = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        stack.push(childRel);
      } else if (e.isFile()) {
        if (langOf(e.name)) found.push(childRel);
        if (found.length >= MAX_FILES) break;
      }
    }
  }
  return found;
}

function parseFile(abs, lang) {
  let text;
  try {
    const st = fs.statSync(abs);
    if (st.size > MAX_FILE_BYTES) return { symbols: [], imports: [], truncated: true };
    text = fs.readFileSync(abs, 'utf8');
  } catch (_) { return { symbols: [], imports: [] }; }
  for (let bi = 0; bi < text.length && bi < 4096; bi++) { if (text.charCodeAt(bi) === 0) return { symbols: [], imports: [] }; } // 바이너리(NUL) 방어
  const lines = text.split('\n');
  const symbols = [];
  const imports = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;
    const syms = symbolsFromLine(lang, ln);
    for (const s of syms) symbols.push({ kind: s.kind, name: s.name, line: i + 1 });
    const imps = importsFromLine(lang, ln);
    for (const im of imps) if (imports.indexOf(im) === -1) imports.push(im);
  }
  return { symbols, imports };
}

function build(dir) {
  const prev = CACHE.get(dir);
  const files = new Map();
  const t0 = Date.now();
  const rels = walk(dir);
  for (const rel of rels) {
    if (Date.now() - t0 > MAX_SCAN_MS) break;
    const abs = path.join(dir, rel);
    let st;
    try { st = fs.statSync(abs); } catch (_) { continue; }
    const mtime = st.mtimeMs;
    const cached = prev && prev.files.get(rel);
    if (cached && cached.mtime === mtime && cached.size === st.size) { files.set(rel, cached); continue; }
    const lang = langOf(rel);
    const parsed = parseFile(abs, lang);
    files.set(rel, { mtime, size: st.size, lang, symbols: parsed.symbols, imports: parsed.imports });
  }
  const idx = { files, builtAt: Date.now() };
  CACHE.set(dir, idx);
  return idx;
}

// 최근 2초 내 빌드면 재사용(연속 도구 호출 토큰/IO 절감)
function getIndex(dir, force) {
  const cur = CACHE.get(dir);
  if (!force && cur && Date.now() - cur.builtAt < 2000) return cur;
  return build(dir);
}

// ── 공개 조회 함수 ────────────────────────────────────────────────────────────
function codeFiles(dir, opts) {
  opts = opts || {};
  const q = String(opts.query || '').toLowerCase().trim();
  const limit = Math.min(200, Math.max(1, parseInt(opts.limit, 10) || 60));
  const idx = getIndex(dir);
  const rows = [];
  for (const [rel, info] of idx.files) {
    if (q && rel.toLowerCase().indexOf(q) === -1) continue;
    rows.push({ file: rel, lang: info.lang, symbols: info.symbols.length });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  return { total: idx.files.size, shown: Math.min(rows.length, limit), files: rows.slice(0, limit) };
}

function codeOutline(dir, file) {
  const rel = String(file || '').replace(/^\.?\//, '');
  if (!rel) return { error: 'file 경로가 필요해요(프로젝트 루트 기준 상대경로)' };
  const idx = getIndex(dir);
  let info = idx.files.get(rel);
  if (!info) {
    // 접미 일치 허용(부분 경로로도 찾게)
    for (const [k, v] of idx.files) { if (k === rel || k.endsWith('/' + rel)) { info = v; file = k; break; } }
  }
  if (!info) return { error: '인덱스에 없는 파일: ' + rel };
  return {
    file: rel, lang: info.lang,
    symbols: info.symbols.map((s) => ({ kind: s.kind, name: s.name, line: s.line })),
    imports: info.imports.slice(0, 40),
  };
}

function codeSearch(dir, query, opts) {
  opts = opts || {};
  const q = String(query || '').toLowerCase().trim();
  if (!q) return { matches: [] };
  const limit = Math.min(60, Math.max(1, parseInt(opts.limit, 10) || 25));
  const exact = !!opts.exact;
  const idx = getIndex(dir);
  const matches = [];
  for (const [rel, info] of idx.files) {
    for (const s of info.symbols) {
      const name = s.name.toLowerCase();
      if (exact ? name === q : name.indexOf(q) !== -1) {
        matches.push({ name: s.name, kind: s.kind, file: rel, line: s.line });
        if (matches.length >= limit * 3) break;
      }
    }
    if (matches.length >= limit * 3) break;
  }
  // 정확 일치 → 접두 일치 → 부분 일치 순으로 우선
  matches.sort((a, b) => {
    const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
    const ar = an === q ? 0 : an.startsWith(q) ? 1 : 2;
    const br = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
    return ar - br || a.name.length - b.name.length;
  });
  return { matches: matches.slice(0, limit) };
}

function codeRefs(dir, symbol, opts) {
  opts = opts || {};
  const sym = String(symbol || '').trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(sym)) return { error: '식별자(단어) 하나를 주세요 — 예: graphRead' };
  const limit = Math.min(120, Math.max(1, parseInt(opts.limit, 10) || 40));
  const idx = getIndex(dir);
  const re = new RegExp('\\b' + sym.replace(/[$]/g, '\\$&') + '\\b');
  const defSet = new Set();
  for (const [rel, info] of idx.files) {
    for (const s of info.symbols) if (s.name === sym) defSet.add(rel + ':' + s.line);
  }
  const refs = [];
  let scanned = 0;
  for (const [rel, info] of idx.files) {
    if (refs.length >= limit) break;
    // 심볼 인덱스에 이 이름이 어디에도 안 보이고 import 도 아니면 굳이 파일 안 읽음? — refs 는 전체 텍스트 필요
    let text;
    try {
      const abs = path.join(dir, rel);
      const st = fs.statSync(abs);
      if (st.size > MAX_FILE_BYTES) continue;
      text = fs.readFileSync(abs, 'utf8');
      scanned++;
      if (scanned > MAX_FILES) break;
    } catch (_) { continue; }
    if (text.indexOf(sym) === -1) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        const isDef = defSet.has(rel + ':' + (i + 1));
        refs.push({ file: rel, line: i + 1, def: isDef, text: lines[i].trim().slice(0, 160) });
        if (refs.length >= limit) break;
      }
    }
  }
  return { symbol: sym, defs: refs.filter((r) => r.def).length, count: refs.length, refs };
}

module.exports = {
  codeFiles, codeOutline, codeSearch, codeRefs,
  // 테스트/내부용
  _symbolsFromLine: symbolsFromLine, _langOf: langOf, _build: build, _IGNORE_DIRS: IGNORE_DIRS,
};
