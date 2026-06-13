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
const CG = require('./concept-graph');
const teamFeed = require('./team-feed');
// 코드 인덱스는 선택적 — 스탠드얼론 '팀 MCP' 빌드에는 빠져 있어도 팀(.narani) 도구는 동작해야 한다.
let codeIndex = null;
try { codeIndex = require('./code-index'); } catch (_) { codeIndex = null; }

const GRAPH_HIST_CAP = 30;
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
  if (!fs.existsSync(p.file)) return CG.empty();
  try { return CG.validate(JSON.parse(fs.readFileSync(p.file, 'utf8'))); }
  catch (_) { return CG.empty(); }
}
function writeGraph(dir, doc) {
  const p = graphPaths(dir);
  fs.mkdirSync(p.base, { recursive: true });
  if (fs.existsSync(p.file)) snapshot(p, fs.readFileSync(p.file, 'utf8'));
  fs.writeFileSync(p.file, JSON.stringify(CG.validate(doc), null, 2));
}

function nodeBrief(n) {
  return { id: n.id, layer: n.layer, title: n.title, what: (n.what || n.why || '').replace(/\s+/g, ' ').slice(0, 90) };
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
function graphSearch(dir, query) {
  const q = String(query || '').toLowerCase().trim();
  const doc = readGraph(dir);
  if (!q) return { matches: [] };
  const hit = doc.nodes.filter((n) =>
    (n.title + ' ' + n.why + ' ' + n.what + ' ' + n.how + ' ' + n.input + ' ' + n.output).toLowerCase().includes(q));
  return { matches: hit.slice(0, 20).map(nodeBrief) };
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
  writeGraph(dir, doc);
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
  writeGraph(dir, doc);
  return { ok: true, removed: !!input.remove, edges: doc.edges.length };
}

/* ---- 피드 ---- */
function feedDir(dir) { return path.join(dir, '.narani', 'feed'); }
function feedRead(dir, opts) {
  opts = opts || {};
  const limit = Math.min(50, Math.max(1, parseInt(opts.limit, 10) || 8));
  let files = [];
  try { files = fs.readdirSync(feedDir(dir)).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, limit); }
  catch (_) { return { entries: [] }; }
  const entries = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(feedDir(dir), f), 'utf8')); } catch (_) { return null; } })
    .map(teamFeed.validateEntry).filter(Boolean)
    .map((e) => ({ ts: e.ts, author: e.author, title: e.title, summary: e.summary.slice(0, 200), files: e.files }));
  return { entries };
}
function feedWrite(dir, input) {
  input = input || {};
  const entry = teamFeed.validateEntry({
    ts: Date.now(), author: input.author || 'agent', provider: input.provider || '',
    title: input.title, summary: input.summary || '', mode: input.mode || 'normal',
    files: input.files || [], nodeIds: input.nodeIds || [],
  });
  if (!entry) return { error: 'title 이 필요해요' };
  try {
    fs.mkdirSync(feedDir(dir), { recursive: true });
    fs.writeFileSync(path.join(feedDir(dir), teamFeed.entryFileName(entry)), JSON.stringify(entry, null, 2));
    return { ok: true, id: entry.id };
  } catch (err) { return { error: err.message }; }
}

/* ---- 코드 인덱스(항상 켜짐, 설치 0): 토큰 절감용 결정적 구조 조회 ---- */
function codeFiles(dir, opts) { return codeIndex.codeFiles(dir, opts); }
function codeOutline(dir, file) { return codeIndex.codeOutline(dir, file); }
function codeSearch(dir, query, opts) { return codeIndex.codeSearch(dir, query, opts); }
function codeRefs(dir, symbol, opts) { return codeIndex.codeRefs(dir, symbol, opts); }

/* ---- 오리엔테이션: 한 번 호출로 맥락 장착 ---- */
function readDoc(dir, file) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, '.narani', file), 'utf8')); } catch (_) { return null; }
}
function orient(dir) {
  const doc = readGraph(dir);
  const concepts = doc.nodes.filter((n) => n.layer === 1).map((n) => ({
    id: n.id, title: n.title, what: (n.what || n.why || '').replace(/\s+/g, ' ').slice(0, 120),
    children: doc.nodes.filter((c) => c.parent === n.id).map((c) => c.title).slice(0, 8),
  }));
  const rules = readDoc(dir, 'rules.json');
  return {
    graph: { layers: doc.layers, nodeCount: doc.nodes.length, concepts },
    recentWork: feedRead(dir, { limit: 6 }).entries,
    rules: rules || null,
    hint: doc.nodes.length ? '구조를 바꾸면 graph_upsert_node/graph_link 로, 작업이 끝나면 feed_write 로 기록하세요. 코드 위치는 code_search/code_outline/code_refs 로 좁혀 보세요(파일 통째 읽기 전에).'
      : '아직 컨셉 그래프가 비어 있어요 — code_files/code_outline 로 코드 구조를 파악한 뒤 graph_upsert_node 로 4계층(컨셉→도메인→컴포넌트→구현) 지도를 만드세요.',
  };
}

module.exports = {
  graphPaths, readGraph, writeGraph,
  graphRead, graphSearch, graphGetNode, graphUpsertNode, graphLink,
  feedRead, feedWrite, orient,
  codeFiles, codeOutline, codeSearch, codeRefs,
};
