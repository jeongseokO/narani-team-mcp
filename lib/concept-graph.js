/* AUTO-GENERATED — 원본 js/concept-graph.js 에서 scripts/build-team-mcp.js 가 복사. 직접 수정 금지. */
/*
 * 컨셉 그래프 — 4계층 지식 그래프의 순수 로직 (UMD)
 * ---------------------------------------------------
 * 데이터는 프로젝트의 .narani/graph.json 에 저장된다 (Agent가 기입, 팀 공유).
 * 스키마:
 *   { version: 1,
 *     layers: ["컨셉","도메인","컴포넌트","구현"],          // 계층 이름 (1..4)
 *     nodes:  [{ id, layer(1..4), parent, title,
 *                why, what, how, input, output,
 *                updatedBy, updatedAt }],
 *     edges:  [{ from, to, label? }] }                      // 방향 화살표
 *
 * 이 모듈은 DOM 없이: 검증(validate) · 가시성(visibleIds) · 레이아웃(layout) ·
 * 엣지 재타게팅(접힌 노드로 집계) · 계층 펼치기 집합 계산을 담당한다.
 * 절대 throw 하지 않는다 — 깨진 입력은 고쳐서 받아들인다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NaraniConceptGraph = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_LAYERS = ['컨셉', '도메인', '컴포넌트', '구현'];
  var FIELDS = ['why', 'what', 'how', 'input', 'output'];

  function empty() {
    return { version: 1, layers: DEFAULT_LAYERS.slice(), nodes: [], edges: [] };
  }

  /* 관대한 정규화 — 깨진 문서도 쓸 수 있는 형태로 만든다 */
  function validate(doc) {
    var d = (doc && typeof doc === 'object') ? doc : {};
    var out = empty();
    if (Array.isArray(d.layers)) {
      for (var i = 0; i < 4; i++) if (typeof d.layers[i] === 'string' && d.layers[i].trim()) out.layers[i] = d.layers[i].trim();
    }
    var seen = {};
    (Array.isArray(d.nodes) ? d.nodes : []).forEach(function (n) {
      if (!n || typeof n !== 'object') return;
      var id = String(n.id || '').trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      var node = {
        id: id,
        layer: Math.min(4, Math.max(1, parseInt(n.layer, 10) || 1)),
        parent: n.parent != null ? String(n.parent) : null,
        title: String(n.title || id).slice(0, 120),
        updatedBy: String(n.updatedBy || ''),
        updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : null,
      };
      FIELDS.forEach(function (f) { node[f] = String(n[f] || ''); });
      out.nodes.push(node);
    });
    // 부모가 없거나(고아) 자기 자신이면 끊는다 · 1계층은 부모 없음
    out.nodes.forEach(function (n) {
      if (n.layer === 1) { n.parent = null; return; }
      if (!n.parent || n.parent === n.id || !seen[n.parent]) n.parent = null;
    });
    var dedupe = {};
    (Array.isArray(d.edges) ? d.edges : []).forEach(function (e) {
      if (!e || !seen[String(e.from)] || !seen[String(e.to)]) return;
      var from = String(e.from), to = String(e.to);
      if (from === to) return;
      var k = from + '\x1f' + to;
      if (dedupe[k]) return;
      dedupe[k] = true;
      out.edges.push({ from: from, to: to, label: String(e.label || '').slice(0, 60) });
    });
    return out;
  }

  function childrenOf(doc, id) {
    return doc.nodes.filter(function (n) { return n.parent === id; });
  }

  /* 보이는 노드: 1계층은 항상, 그 외엔 조상이 전부 펼쳐져 있어야 */
  function visibleIds(doc, expanded) {
    var byId = {};
    doc.nodes.forEach(function (n) { byId[n.id] = n; });
    var vis = {};
    doc.nodes.forEach(function (n) {
      var cur = n, ok = true, guard = 0;
      while (cur.parent && guard++ < 10) {
        if (!expanded.has(cur.parent)) { ok = false; break; }
        cur = byId[cur.parent];
        if (!cur) { ok = false; break; }
      }
      // 부모 없는 노드는 자신의 계층과 무관하게 루트로 취급 (고아 방어)
      if (ok) vis[n.id] = true;
    });
    return vis;
  }

  /* 접힌 노드로 향한 엣지를 가장 가까운 보이는 조상으로 집계 */
  function visibleAncestor(byId, vis, id) {
    var cur = byId[id], guard = 0;
    while (cur && !vis[cur.id] && guard++ < 10) cur = cur.parent ? byId[cur.parent] : null;
    return cur && vis[cur.id] ? cur.id : null;
  }

  /* 좌→우 계층 트리 레이아웃.
     반환: { nodes: [{...node, x, y, hasChildren, collapsed}], edges: [{from,to,n,label}], width, height } */
  function layout(doc, expanded, opts) {
    var o = Object.assign({ colW: 252, nodeW: 196, nodeH: 58, vGap: 16, pad: 28 }, opts || {});
    var vis = visibleIds(doc, expanded);
    var byId = {};
    doc.nodes.forEach(function (n) { byId[n.id] = n; });

    var slotH = o.nodeH + o.vGap;
    var cursor = 0;
    var placed = {};

    function place(n) {
      var kids = doc.nodes.filter(function (c) { return c.parent === n.id && vis[c.id]; });
      if (!kids.length) {
        placed[n.id] = cursor; cursor += 1;
      } else {
        var ys = kids.map(function (k) { place(k); return placed[k.id]; });
        placed[n.id] = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
      }
    }
    var roots = doc.nodes.filter(function (n) { return vis[n.id] && !n.parent; });
    roots.forEach(place);

    var outNodes = [];
    var maxLayer = 1;
    doc.nodes.forEach(function (n) {
      if (!vis[n.id] || placed[n.id] === undefined) return;
      maxLayer = Math.max(maxLayer, n.layer);
      var kidsAll = doc.nodes.filter(function (c) { return c.parent === n.id; });
      outNodes.push(Object.assign({}, n, {
        x: o.pad + (n.layer - 1) * o.colW,
        y: o.pad + placed[n.id] * slotH,
        hasChildren: kidsAll.length > 0,
        childCount: kidsAll.length,
        collapsed: kidsAll.length > 0 && !expanded.has(n.id),
      }));
    });

    var outVis = {};
    outNodes.forEach(function (n) { outVis[n.id] = true; });
    var agg = {};
    doc.edges.forEach(function (e) {
      var f = visibleAncestor(byId, outVis, e.from);
      var t = visibleAncestor(byId, outVis, e.to);
      if (!f || !t || f === t) return;
      var k = f + '\x1f' + t;
      if (!agg[k]) agg[k] = { from: f, to: t, n: 0, label: e.label || '' };
      agg[k].n++;
      if (e.label && !agg[k].label) agg[k].label = e.label;
    });
    var outEdges = Object.keys(agg).map(function (k) { return agg[k]; });

    // 같은 계층 엣지는 노드 오른쪽으로 보우(bow)를 그린다. 그 보우가 최우측 열에서
    // SVG 경계에 잘리지 않도록, 그리고 다음 열 카드 영역으로 넘치지 않도록 오른쪽에 여유를 둔다.
    var sameBowReserve = Math.max(0, o.colW - o.nodeW); // 열 간격(=보우가 머무는 영역) 만큼 확보
    return {
      nodes: outNodes,
      edges: outEdges,
      nodeW: o.nodeW, nodeH: o.nodeH, colW: o.colW,
      width: o.pad * 2 + (maxLayer - 1) * o.colW + o.nodeW + sameBowReserve,
      height: Math.max(o.pad * 2 + cursor * slotH, 200),
    };
  }

  /* 엣지 라우팅 — 스파게티 방지:
     · 노드별 출발/도착 지점을 세로로 분산 (모두 한가운데로 꽂히지 않게)
     · 같은 계층끼리는 오른쪽 수직 보우(레인 오프셋)로 — 노드 위를 가로지르지 않음
     · 역방향(왼쪽으로 가는) 엣지는 별도 표시(점선용 kind) */
  function routeEdges(L) {
    var by = {};
    L.nodes.forEach(function (n) { by[n.id] = n; });
    var outN = {}, inN = {};
    L.edges.forEach(function (e) { outN[e.from] = (outN[e.from] || 0) + 1; inN[e.to] = (inN[e.to] || 0) + 1; });
    var outI = {}, inI = {};
    function slot(idx, total) {
      if (total <= 1) return 0;
      var span = Math.min(L.nodeH - 22, (total - 1) * 11);
      return -span / 2 + (span / (total - 1)) * idx;
    }
    return L.edges.map(function (e) {
      var a = by[e.from], b = by[e.to];
      if (!a || !b) return null;
      var oi = outI[e.from] || 0; outI[e.from] = oi + 1;
      var ii = inI[e.to] || 0; inI[e.to] = ii + 1;
      var y1 = a.y + L.nodeH / 2 + slot(oi, outN[e.from]);
      var y2 = b.y + L.nodeH / 2 + slot(ii, inN[e.to]);
      if (a.x === b.x) {
        // 보우는 노드 오른쪽 '열 간격' 안에서만 돌게 제한한다 — 옆 계층 카드(L3 등)에 가려/잘려 보이던 문제 방지.
        var gap = (L.colW || (L.nodeW + 56)) - L.nodeW;
        var maxBow = Math.max(16, gap - 12);
        var bow = Math.min(maxBow, 26 + Math.min(54, Math.abs(y2 - y1) * 0.12) + (oi % 3) * 9);
        return { kind: 'same', x1: a.x + L.nodeW, y1: y1, x2: b.x + L.nodeW, y2: y2, bow: bow, from: e.from, to: e.to, n: e.n, label: e.label };
      }
      if (b.x > a.x) return { kind: 'fwd', x1: a.x + L.nodeW, y1: y1, x2: b.x, y2: y2, from: e.from, to: e.to, n: e.n, label: e.label };
      return { kind: 'back', x1: a.x, y1: y1, x2: b.x + L.nodeW, y2: y2, from: e.from, to: e.to, n: e.n, label: e.label };
    }).filter(Boolean);
  }

  /* L계층까지 전부 펼치기 — layer < L 인 모든 (자식 있는) 노드 id 집합 */
  function expandForLayer(doc, L) {
    var s = new Set();
    doc.nodes.forEach(function (n) {
      if (n.layer < L && doc.nodes.some(function (c) { return c.parent === n.id; })) s.add(n.id);
    });
    return s;
  }

  return {
    DEFAULT_LAYERS: DEFAULT_LAYERS, FIELDS: FIELDS,
    empty: empty, validate: validate, childrenOf: childrenOf,
    visibleIds: visibleIds, layout: layout, expandForLayer: expandForLayer, routeEdges: routeEdges,
  };
});
