/* AUTO-GENERATED — 원본 src/agents/narani-tools.js 에서 scripts/build-team-mcp.js 가 복사. 직접 수정 금지. */
'use strict';
/*
 * Narani MCP 도구의 결정적 구현 — 프로젝트의 .narani/ 팀 메모리(컨셉 그래프 + 피드)를
 * 에이전트가 매번 스키마·절차를 재학습하지 않고 도구 호출 한 번으로 읽고/쓰게 한다.
 * 앱(main의 graph:* / team:feed-*)과 "완전히 같은 파일 레이아웃"을 쓰므로 화면과 호환된다.
 *   - .narani/graph.json (+ .narani/history/graph-<ts>.json 스냅샷, 최근 30개)
 *   - .narani/feed/<ts>-<author>-<rand>.json (엔트리=파일 1개, 머지 충돌 없음)
 * DOM 없음 · 절대 throw 하지 않음(깨진 입력은 고쳐서 받아들임).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CG = require('./concept-graph');
const teamFeed = require('./team-feed');
// 코드 인덱스는 선택적 — 스탠드얼론 '팀 MCP' 빌드에는 빠져 있어도 팀(.narani) 도구는 동작해야 한다.
let codeIndex = null;
try { codeIndex = require('./code-index'); } catch (_) { codeIndex = null; }

const GRAPH_HIST_CAP = 30;

// ── 심링크/경계 가드 (CWE-59/22) — 악성 프로젝트가 .narani 항목을 심링크로 만들어
//    작업 폴더 밖 파일을 읽거나 덮어쓰지 못하게 한다. lstat 으로 링크 자체를 검사. ──
function lstatSafe(p) { try { return fs.lstatSync(p); } catch (_) { return null; } }
function isLink(p) { const s = lstatSafe(p); return !!(s && s.isSymbolicLink()); }
// .narani 기준 경로가 안전한가: 자기 자신과 모든 상위 구성요소(.narani 이하)가 심링크가 아니어야 함.
function safeUnder(base, target) {
  if (isLink(base)) return false;
  let cur = target;
  while (cur && cur.length >= base.length && cur !== base) {
    if (isLink(cur)) return false;
    const next = path.dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  return !isLink(base);
}

function graphPaths(dir) {
  const base = path.join(dir, '.narani');
  return { base, file: path.join(base, 'graph.json'), hist: path.join(base, 'history') };
}
function snapshot(p, content) {
  try {
    fs.mkdirSync(p.hist, { recursive: true });
    const files = fs.readdirSync(p.hist).filter((f) => /^graph-\d+\.json$/.test(f)).sort();
    const last = files.length ? fs.readFileSync(path.join(p.hist, files[files.length - 1]), 'utf8') : null;
    if (last === content) return;
    fs.writeFileSync(path.join(p.hist, 'graph-' + Date.now() + '.json'), content);
    const all = fs.readdirSync(p.hist).filter((f) => /^graph-\d+\.json$/.test(f)).sort();
    while (all.length > GRAPH_HIST_CAP) { try { fs.unlinkSync(path.join(p.hist, all.shift())); } catch (_) { break; } }
  } catch (_) {}
}
function readGraph(dir) {
  const p = graphPaths(dir);
  if (!safeUnder(p.base, p.file) || isLink(p.file)) return CG.empty(); // 심링크면 추종 거부
  if (!fs.existsSync(p.file)) return CG.empty();
  try { return CG.validate(JSON.parse(fs.readFileSync(p.file, 'utf8'))); }
  catch (_) { return CG.empty(); }
}
function writeGraph(dir, doc) {
  const p = graphPaths(dir);
  if (isLink(p.base) || isLink(p.file) || isLink(p.hist)) throw new Error('.narani 항목이 심링크라 쓰기를 거부했어요(보안)');
  fs.mkdirSync(p.base, { recursive: true });
  if (fs.existsSync(p.file)) snapshot(p, fs.readFileSync(p.file, 'utf8'));
  fs.writeFileSync(p.file, JSON.stringify(CG.validate(doc), null, 2));
}

function nodeBrief(n) {
  return { id: n.id, layer: n.layer, title: n.title, what: (n.what || n.why || '').replace(/\s+/g, ' ').slice(0, 90) };
}
// 매칭 위치 주변만 잘라 보여준다 — 전체 필드를 토해내지 않아 토큰을 아낀다.
function snippet(text, terms, len) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  len = len || 90;
  const low = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = low.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; }
  if (at === -1) return text.slice(0, len) + (text.length > len ? '…' : '');
  const start = Math.max(0, at - 24);
  const end = Math.min(text.length, start + len);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/* ---- 읽기 ---- */
function graphRead(dir, opts) {
  opts = opts || {};
  const doc = readGraph(dir);
  let nodes = doc.nodes;
  if (opts.layer) nodes = nodes.filter((n) => n.layer === opts.layer);
  return {
    layers: doc.layers,
    counts: [1, 2, 3, 4].map((L) => doc.nodes.filter((n) => n.layer === L).length),
    nodes: nodes.map(nodeBrief),
    edges: doc.edges.length,
  };
}
// 토큰 절감형 검색: 다중어(AND) 매칭 + 필드 가중 랭킹 + 매칭 스니펫만 반환.
// 에이전트가 결과를 보고 딱 필요한 노드만 read_concept 로 펼치게 한다(전체 그래프를 읽지 않음).
const SEARCH_FIELDS = [['title', 6], ['what', 3], ['why', 3], ['how', 2], ['input', 1], ['output', 1]];
function graphSearch(dir, query, opts) {
  opts = opts || {};
  const terms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const limit = Math.min(30, Math.max(1, parseInt(opts.limit, 10) || 12));
  const doc = readGraph(dir);
  if (!terms.length) return { count: 0, matches: [] };
  const scored = [];
  for (const n of doc.nodes) {
    if (opts.layer && n.layer !== opts.layer) continue;
    const allText = (n.title + ' ' + n.why + ' ' + n.what + ' ' + n.how + ' ' + n.input + ' ' + n.output).toLowerCase();
    if (!terms.every((t) => allText.includes(t))) continue; // 모든 검색어가 어딘가엔 있어야(정밀도)
    let score = 0, bestField = '';
    for (const [f, w] of SEARCH_FIELDS) {
      const val = String(n[f] || '').toLowerCase();
      if (!val) continue;
      let hits = 0;
      for (const t of terms) if (val.includes(t)) hits++;
      if (hits) { score += w * hits; if (!bestField) bestField = f; }
    }
    scored.push({ n, score, field: bestField || 'title' });
  }
  scored.sort((a, b) => b.score - a.score || a.n.layer - b.n.layer);
  return {
    count: scored.length,
    matches: scored.slice(0, limit).map((s) => ({
      id: s.n.id, layer: s.n.layer, title: s.n.title,
      match: s.field + ': ' + snippet(s.n[s.field], terms, 90),
    })),
  };
}
function graphGetNode(dir, id) {
  const doc = readGraph(dir);
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return { error: '노드 없음: ' + id };
  return {
    id: n.id, layer: n.layer, title: n.title, parent: n.parent,
    why: n.why, what: n.what, how: n.how, input: n.input, output: n.output,
    children: doc.nodes.filter((c) => c.parent === id).map((c) => ({ id: c.id, title: c.title })),
    edges: doc.edges.filter((e) => e.from === id || e.to === id).map((e) => ({ from: e.from, to: e.to, label: e.label || '' })),
    updatedBy: n.updatedBy, updatedAt: n.updatedAt,
  };
}

/* ---- 쓰기 ---- */
function slugId(title) {
  const base = String(title || 'node').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'node';
  return base;
}
function graphUpsertNode(dir, input) {
  input = input || {};
  const doc = readGraph(dir);
  const title = String(input.title || '').trim();
  if (!title && !input.id) return { error: 'title 또는 id 가 필요해요' };
  let n = input.id ? doc.nodes.find((x) => x.id === input.id) : null;
  const created = !n;
  if (!n) {
    let id = input.id || slugId(title);
    if (doc.nodes.some((x) => x.id === id)) id = id + '-' + Date.now().toString(36).slice(-4);
    n = { id, layer: 1, parent: null, title: title, why: '', what: '', how: '', input: '', output: '' };
    doc.nodes.push(n);
  }
  if (input.layer != null) n.layer = Math.min(4, Math.max(1, parseInt(input.layer, 10) || n.layer));
  if (title) n.title = title.slice(0, 120);
  if (input.parent !== undefined) n.parent = input.parent ? String(input.parent) : null;
  ['why', 'what', 'how', 'input', 'output'].forEach((f) => { if (input[f] !== undefined) n[f] = String(input[f] || ''); });
  n.updatedBy = 'agent'; n.updatedAt = Date.now();
  try { writeGraph(dir, doc); } catch (err) { return { error: err.message }; }
  return { ok: true, created, node: nodeBrief(n) };
}
function graphLink(dir, input) {
  input = input || {};
  const doc = readGraph(dir);
  const from = String(input.from || ''), to = String(input.to || '');
  if (!from || !to) return { error: 'from, to 가 필요해요' };
  if (!doc.nodes.some((n) => n.id === from) || !doc.nodes.some((n) => n.id === to)) return { error: '존재하지 않는 노드 id' };
  doc.edges = doc.edges.filter((e) => !(e.from === from && e.to === to)); // 중복/기존 제거
  if (!input.remove) doc.edges.push({ from, to, label: String(input.label || '').slice(0, 60) });
  try { writeGraph(dir, doc); } catch (err) { return { error: err.message }; }
  return { ok: true, removed: !!input.remove, edges: doc.edges.length };
}

/* ---- 피드 ---- */
function feedDir(dir) { return path.join(dir, '.narani', 'feed'); }
function feedRead(dir, opts) {
  opts = opts || {};
  const limit = Math.min(50, Math.max(1, parseInt(opts.limit, 10) || 8));
  const fd = feedDir(dir);
  if (isLink(path.join(dir, '.narani')) || isLink(fd)) return { entries: [] }; // 심링크 디렉터리 거부
  let files = [];
  try { files = fs.readdirSync(fd).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, limit); }
  catch (_) { return { entries: [] }; }
  const entries = files.map((f) => { try { const fp = path.join(fd, f); if (isLink(fp)) return null; return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return null; } })
    .map(teamFeed.validateEntry).filter(Boolean)
    .map((e) => ({ ts: e.ts, author: e.author, title: e.title, summary: e.summary.slice(0, 200), files: e.files }));
  return { entries };
}
// 피드는 "엔트리=파일 1개"라 흔적이 많다 — 전부 읽지 말고 검색으로 딱 맞는 것만.
// query(제목·요약·파일경로) · file(건드린 경로) · author · nodeId 로 거른다. 최신순, 매칭 스니펫만 반환.
function feedSearch(dir, opts) {
  opts = opts || {};
  const terms = String(opts.query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const fileFilter = String(opts.file || '').toLowerCase();
  const authorFilter = String(opts.author || '').toLowerCase();
  const nodeFilter = String(opts.nodeId || '');
  const limit = Math.min(30, Math.max(1, parseInt(opts.limit, 10) || 10));
  const fd = feedDir(dir);
  if (isLink(path.join(dir, '.narani')) || isLink(fd)) return { count: 0, matches: [] };
  let files = [];
  try { files = fs.readdirSync(fd).filter((f) => f.endsWith('.json')).sort().reverse(); }
  catch (_) { return { count: 0, matches: [] }; }
  const matches = [];
  for (const f of files) {
    let e;
    try { const fp = path.join(fd, f); if (isLink(fp)) continue; e = teamFeed.validateEntry(JSON.parse(fs.readFileSync(fp, 'utf8'))); }
    catch (_) { continue; }
    if (!e) continue;
    if (authorFilter && e.author.toLowerCase().indexOf(authorFilter) === -1) continue;
    if (nodeFilter && (e.nodeIds || []).indexOf(nodeFilter) === -1) continue;
    if (fileFilter && !(e.files || []).some((x) => String(x).toLowerCase().indexOf(fileFilter) !== -1)) continue;
    const hay = (e.title + ' ' + e.summary + ' ' + (e.files || []).join(' ')).toLowerCase();
    if (terms.length && !terms.every((t) => hay.indexOf(t) !== -1)) continue;
    matches.push({
      date: new Date(e.ts).toISOString().slice(0, 10), author: e.author, title: e.title,
      match: snippet(e.summary, terms, 120), files: (e.files || []).slice(0, 5), nodeIds: (e.nodeIds || []).slice(0, 5),
    });
    if (matches.length >= limit) break; // 최신순으로 충분히 모으면 멈춤(효율)
  }
  return { count: matches.length, matches };
}
function feedWrite(dir, input) {
  input = input || {};
  const entry = teamFeed.validateEntry({
    ts: Date.now(), author: input.author || 'agent', provider: input.provider || '',
    title: input.title, summary: input.summary || '', mode: input.mode || 'normal',
    files: input.files || [], nodeIds: input.nodeIds || [],
  });
  if (!entry) return { error: 'title 이 필요해요' };
  const fd = feedDir(dir);
  if (isLink(path.join(dir, '.narani')) || isLink(fd)) return { error: '.narani/feed 가 심링크라 쓰기를 거부했어요(보안)' };
  try {
    fs.mkdirSync(fd, { recursive: true });
    const fp = path.join(fd, teamFeed.entryFileName(entry));
    if (isLink(fp)) return { error: '피드 항목이 심링크예요(보안)' };
    fs.writeFileSync(fp, JSON.stringify(entry, null, 2));
    return { ok: true, id: entry.id };
  } catch (err) { return { error: err.message }; }
}

/* ---- 코드 인덱스(항상 켜짐, 설치 0): 토큰 절감용 결정적 구조 조회 ---- */
function codeFiles(dir, opts) { return codeIndex.codeFiles(dir, opts); }
function codeOutline(dir, file) { return codeIndex.codeOutline(dir, file); }
function codeSearch(dir, query, opts) { return codeIndex.codeSearch(dir, query, opts); }
function codeRefs(dir, symbol, opts) { return codeIndex.codeRefs(dir, symbol, opts); }

/* ---- 팀 공유(git) 준비 상태 — 서브프로세스 없이 .git/config 만 읽어 판단 ----
   .narani 는 git 으로 동기화돼야 팀원에게 전달된다. 원격/토큰이 없으면 작업이 로컬에만 남으므로
   get_context 가 이 상태를 알려주고, 안 되어 있으면 에이전트가 사용자에게 설정을 안내한다. */
function findGitDir(start) {
  let cur = start;
  for (let i = 0; i < 40; i++) {
    const g = path.join(cur, '.git');
    try {
      const st = fs.lstatSync(g);
      if (st.isDirectory()) return g;
      if (st.isFile()) { // worktree/submodule: "gitdir: <path>"
        const m = /gitdir:\s*(.+)\s*/.exec(fs.readFileSync(g, 'utf8'));
        if (m) return path.resolve(cur, m[1].trim());
      }
    } catch (_) {}
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}
function parseOriginUrl(gitDir) {
  try {
    const cfg = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
    // [remote "origin"] ... url = ...  (origin 우선, 없으면 첫 remote)
    const re = /\[remote\s+"([^"]+)"\][^\[]*?url\s*=\s*([^\n]+)/g;
    let m, first = null, origin = null;
    while ((m = re.exec(cfg))) { const u = m[2].trim(); if (!first) first = u; if (m[1] === 'origin') origin = u; }
    return origin || first || null;
  } catch (_) { return null; }
}
function teamSyncStatus(dir) {
  const hasToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT);
  const gitDir = findGitDir(dir);
  if (!gitDir) {
    return { ready: false, gitRepo: false, remote: null, hasToken,
      hint: '이 폴더가 git 저장소가 아니에요. 지금 작업은 로컬 .narani 에만 저장되고 팀원에게 전달되지 않아요. 사용자에게 안내하세요: `git init` → 팀 공용 원격 연결(`git remote add origin <팀 repo>`) → `.narani/` 커밋·푸시.' };
  }
  const remote = parseOriginUrl(gitDir);
  if (!remote) {
    return { ready: false, gitRepo: true, remote: null, hasToken,
      hint: '원격(remote)이 없어 팀원과 공유되지 않아요. 사용자에게 안내하세요: `git remote add origin <팀 repo>` 후 `.narani/` 를 push.' };
  }
  const isHttpsGitHub = /^https:\/\/github\.com\//i.test(remote);
  if (isHttpsGitHub && !hasToken) {
    return { ready: true, gitRepo: true, remote, hasToken: false, needsAuth: true,
      hint: '원격은 연결됐지만 비공개 repo 라면 push 에 인증이 필요해요. 사용자에게 안내하세요: `GITHUB_TOKEN`(또는 `GH_TOKEN`) 환경변수에 GitHub PAT 를 넣거나, SSH 원격(`git@github.com:...`)으로 바꾸세요.' };
  }
  return { ready: true, gitRepo: true, remote, hasToken,
    hint: '팀 공유 준비됨. 작업이 끝나면 .narani/ 를 커밋·push 하면 팀원이 받아요.' };
}

/* ---- 팀 동기화: .narani 를 git 으로 pull/push (에이전트가 git 명령을 직접 안 짜도 되게) ----
   서버가 git 을 직접 실행한다. 절대 throw 하지 않고 결과를 요약해 돌려준다.
   push 는 "공유는 .narani 만" 원칙대로 .narani 경로만 스테이지·커밋한다(다른 작업 변경은 안 건드림). */
function runGit(dir, args, timeout) {
  try { return { ok: true, out: String(execFileSync('git', args, { cwd: dir, timeout: timeout || 20000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '').trim() }; }
  catch (e) { return { ok: false, out: String(e.stdout || '').trim(), err: String(e.stderr || e.message || '').trim() }; }
}
function gitSync(dir, opts) {
  opts = opts || {};
  const action = ['pull', 'push', 'both'].indexOf(opts.action) !== -1 ? opts.action : 'both';
  const sync = teamSyncStatus(dir);
  if (!sync.gitRepo) return { ok: false, error: 'git 저장소가 아니에요 — 팀 공유가 설정되지 않았어요', hint: sync.hint };
  if (!sync.remote) return { ok: false, error: '원격(remote)이 없어요 — 팀 공유가 설정되지 않았어요', hint: sync.hint };
  const res = { ok: true, action, remote: sync.remote };
  if (action === 'pull' || action === 'both') {
    runGit(dir, ['fetch', '--quiet']);
    const p = runGit(dir, ['pull', '--no-edit', '--no-rebase']);
    res.pulled = p.ok;
    res.pull = (p.ok ? (p.out || '최신 상태') : (p.err || p.out)).slice(0, 500);
    if (!p.ok && /no tracking|no upstream|couldn't find remote/i.test(res.pull)) res.pullHint = '업스트림이 설정 안 됐어요 — `git push -u origin <branch>` 로 한 번 연결하세요.';
  }
  if (action === 'push' || action === 'both') {
    runGit(dir, ['add', '--', '.narani']);
    const staged = runGit(dir, ['diff', '--cached', '--name-only', '--', '.narani']);
    if (staged.ok && staged.out) {
      const msg = (opts.message && String(opts.message).slice(0, 200)) || 'narani: 공유 메모리 갱신';
      const c = runGit(dir, ['commit', '-m', msg, '--', '.narani']);
      const pu = runGit(dir, ['push']);
      res.committed = c.ok; res.pushed = pu.ok;
      res.push = (pu.ok ? '푸시 완료 — 팀원이 받을 수 있어요' : (pu.err || pu.out)).slice(0, 500);
      if (pu.ok) res.note = '.narani 변경을 커밋·푸시했어요.';
      else {
        res.note = '.narani 변경은 로컬에 커밋됐어요(작업 안 잃음). 아래 안내대로 한 번 연결하면 다음부터 자동 푸시돼요.';
        if (/no upstream|set-upstream|does not match|no configured push destination|HEAD:/i.test(res.push)) res.pushHint = '현재 브랜치와 업스트림이 연결/일치하지 않아요 — `git push -u origin <현재 브랜치>` 로 한 번 맞추세요.';
        else if (/Authentication|403|Permission|could not read|denied/i.test(res.push)) res.pushHint = '인증 실패 — GITHUB_TOKEN/GH_TOKEN(PAT) 또는 SSH 키를 설정하세요.';
      }
    } else {
      res.pushed = false; res.push = '.narani 에 커밋할 변경이 없어요(공유할 새 작업 없음).';
    }
  }
  return res;
}

/* ---- 오리엔테이션: 한 번 호출로 맥락 장착 ---- */
function readDoc(dir, file) {
  const base = path.join(dir, '.narani');
  const fp = path.join(base, file);
  if (isLink(base) || isLink(fp)) return null; // 심링크 추종 거부
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) { return null; }
}
function orient(dir) {
  const doc = readGraph(dir);
  const concepts = doc.nodes.filter((n) => n.layer === 1).map((n) => ({
    id: n.id, title: n.title, what: (n.what || n.why || '').replace(/\s+/g, ' ').slice(0, 120),
    children: doc.nodes.filter((c) => c.parent === n.id).map((c) => c.title).slice(0, 8),
  }));
  const rules = readDoc(dir, 'rules.json');
  const teamSync = teamSyncStatus(dir);
  return {
    graph: { layers: doc.layers, nodeCount: doc.nodes.length, concepts },
    recentWork: feedRead(dir, { limit: 6 }).entries,
    rules: rules || null,
    teamSync, // 팀 공유(git) 준비 상태 — ready:false 면 사용자에게 설정을 안내하라
    hint: (teamSync.ready ? '' : '⚠ 팀 공유 미설정: ' + teamSync.hint + ' ')
      + (doc.nodes.length ? '필요한 노드만 search_concepts 로 찾아 read_concept 로 펼치세요(전체를 읽지 마세요). 팀 흔적은 search_team_log 로 검색하세요. 구조를 바꾸면 save_concept/link_concepts, 작업이 끝나면 post_team_update 로 기록하세요. 코드 위치는 find_symbol/outline_file/find_references 로 좁혀 보세요(파일 통째 읽기 전에).'
      : '아직 컨셉 그래프가 비어 있어요 — list_code_files/outline_file 로 코드 구조를 파악한 뒤 save_concept 로 4계층(컨셉→도메인→컴포넌트→구현) 지도를 만드세요.'),
  };
}

module.exports = {
  graphPaths, readGraph, writeGraph,
  graphRead, graphSearch, graphGetNode, graphUpsertNode, graphLink,
  feedRead, feedSearch, feedWrite, orient, teamSyncStatus, gitSync,
  codeFiles, codeOutline, codeSearch, codeRefs,
};
