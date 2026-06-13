/* AUTO-GENERATED — 원본 src/team-feed.js 에서 scripts/build-team-mcp.js 가 복사. 직접 수정 금지. */
'use strict';
/*
 * 팀 Agent 피드 — 순수 로직 (main 프로세스에서 사용, 테스트 대상)
 * ----------------------------------------------------------------
 * 설계: .narani/feed/ 아래 "엔트리 = 파일 1개" (append-only).
 *  - 파일 단위라 git 머지 충돌이 구조적으로 없다 (같은 파일을 두 명이 고칠 일이 없음)
 *  - 팀원 엔트리는 pull 없이 origin 에서 직접 읽는다 (git show) → 작업 트리 안전 + 실시간성
 *  - 내 엔트리는 실행이 끝날 때 앱이 자동 기록 → "Agent 간 작업물 소통"이 사람 노력 없이 쌓인다
 */
const FEED_CAP = 200; // 화면에 들고 갈 최대 엔트리

function validateEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const ts = typeof e.ts === 'number' ? e.ts : null;
  const title = String(e.title || '').trim();
  if (!ts || !title) return null;
  return {
    id: String(e.id || ts + '-' + title).slice(0, 120),
    ts,
    author: String(e.author || '익명').slice(0, 60),
    provider: String(e.provider || '').slice(0, 20),
    title: title.slice(0, 160),
    summary: String(e.summary || '').slice(0, 1200),
    mode: String(e.mode || 'normal').slice(0, 20),
    files: Array.isArray(e.files) ? e.files.slice(0, 30).map(String) : [],
    nodeIds: Array.isArray(e.nodeIds) ? e.nodeIds.slice(0, 20).map(String) : [],
  };
}

function entryFileName(entry) {
  const slug = String(entry.author || 'anon').toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'anon';
  return entry.ts + '-' + slug + '-' + Math.random().toString(36).slice(2, 6) + '.json';
}

/* 로컬 + 원격 엔트리 병합 — id 중복 제거(로컬 우선), 최신순, 원격 출처 표시 */
function mergeFeed(localList, remoteList) {
  const out = [];
  const seen = new Set();
  (localList || []).forEach((e) => {
    const v = validateEntry(e);
    if (v && !seen.has(v.id)) { seen.add(v.id); out.push(Object.assign(v, { origin: false })); }
  });
  (remoteList || []).forEach((e) => {
    const v = validateEntry(e);
    if (v && !seen.has(v.id)) { seen.add(v.id); out.push(Object.assign(v, { origin: true })); }
  });
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, FEED_CAP);
}

/* `git rev-list --left-right --count HEAD...@{u}` 출력("2\t5") → {ahead, behind} */
function parseAheadBehind(out) {
  const m = String(out || '').trim().match(/^(\d+)\s+(\d+)$/);
  return m ? { ahead: +m[1], behind: +m[2] } : { ahead: 0, behind: 0 };
}

module.exports = { validateEntry, entryFileName, mergeFeed, parseAheadBehind, FEED_CAP };
