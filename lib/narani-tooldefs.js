/* AUTO-GENERATED — 원본 src/agents/narani-tooldefs.js 에서 scripts/build-team-mcp.js 가 복사. 직접 수정 금지. */
'use strict';
/*
 * Narani 도구 정의(단일 출처) — Claude 인-프로세스(narani-mcp.js)와
 * Codex/Gemini stdio 서버(../mcp/narani-stdio.js), 그리고 스탠드얼론 팀 MCP 패키지가 공유한다.
 * 각 항목: { name, description, schema(zod shape), handler(args)->결과객체, write, group }.
 * 결과 객체는 각 어댑터가 {content:[{type:'text',text}]} 로 감싼다.
 *
 * group:
 *   'team' — .narani 팀 협업 도구(컨셉 그래프·피드·오리엔트). graph.json 만 있으면 앱 없이도 동작.
 *   'code' — 코드 인덱스(심볼/참조). 코드 디렉터리만 있으면 동작하지만 Narani 앱 기능에 가깝다.
 * opts.groups 로 묶음을 고른다(기본: 둘 다). 스탠드얼론 팀 MCP 는 groups:['team'] 만 노출.
 */
const { z } = require('zod');
const T = require('./narani-tools');

function toolDefs(dir, opts) {
  opts = opts || {};
  const groups = opts.groups || ['team', 'code'];
  const has = (g) => groups.indexOf(g) !== -1;
  const read = [];
  const write = [];

  if (has('team')) {
    read.push(
      { name: 'orient', write: false, group: 'team',
        description: '이 프로젝트의 맥락을 한 번에 받기 — 컨셉 그래프 상위 계층 + 최근 팀 작업 + 규칙. 작업 시작 전에 먼저 호출하라.',
        schema: {}, handler: () => T.orient(dir) },
      { name: 'graph_search', write: false, group: 'team',
        description: '컨셉 그래프에서 키워드로 노드를 검색한다.',
        schema: { query: z.string().describe('검색어 (제목·설명에서 찾음)') }, handler: (a) => T.graphSearch(dir, a.query) },
      { name: 'graph_get_node', write: false, group: 'team',
        description: '노드 하나의 상세(why/what/how/input/output + 부모/자식/관계)를 읽는다.',
        schema: { id: z.string() }, handler: (a) => T.graphGetNode(dir, a.id) },
      { name: 'graph_read', write: false, group: 'team',
        description: '컨셉 그래프 요약(계층별 개수 + 노드 목록). layer 를 주면 그 계층만.',
        schema: { layer: z.number().int().min(1).max(4).optional() }, handler: (a) => T.graphRead(dir, a) },
      { name: 'feed_read', write: false, group: 'team',
        description: '팀원 에이전트들의 최근 작업 기록을 읽는다.',
        schema: { limit: z.number().int().min(1).max(50).optional() }, handler: (a) => T.feedRead(dir, a) },
    );
    write.push(
      { name: 'graph_upsert_node', write: true, group: 'team',
        description: '컨셉 그래프 노드를 생성하거나 갱신한다(스키마·히스토리 자동). 코드 구조를 만들거나 바꿨을 때 호출. layer 1=컨셉 2=도메인 3=컴포넌트 4=구현.',
        schema: {
          id: z.string().optional().describe('갱신할 기존 노드 id (없으면 새로 생성)'),
          layer: z.number().int().min(1).max(4),
          title: z.string(),
          parent: z.string().optional().describe('부모 노드 id (상위 계층)'),
          why: z.string().optional(), what: z.string().optional(), how: z.string().optional(),
          input: z.string().optional(), output: z.string().optional(),
        }, handler: (a) => T.graphUpsertNode(dir, a) },
      { name: 'graph_link', write: true, group: 'team',
        description: '두 노드 사이 관계(엣지)를 추가하거나 삭제한다(의존·호출·데이터 흐름).',
        schema: { from: z.string(), to: z.string(), label: z.string().optional(), remove: z.boolean().optional() },
        handler: (a) => T.graphLink(dir, a) },
      { name: 'feed_write', write: true, group: 'team',
        description: '이번 작업 요약을 팀 피드에 기록해 팀원 에이전트가 보게 한다. 작업이 끝나면 호출.',
        schema: { title: z.string(), summary: z.string().optional(), files: z.array(z.string()).optional(), nodeIds: z.array(z.string()).optional() },
        handler: (a) => T.feedWrite(dir, Object.assign({ author: 'agent' }, a)) },
    );
  }

  if (has('code') && T.codeSearch) {
    // ── 코드 인덱스(설치 0) — 파일 통째 읽기/grep 전에 좁혀서 토큰 절감. 스탠드얼론 팀 MCP 에는 포함 안 함 ──
    read.push(
      { name: 'code_search', write: false, group: 'code',
        description: '함수·클래스·타입 등 심볼 이름을 프로젝트 전체에서 찾아 파일·줄·종류를 돌려준다. 코드를 찾을 때 파일을 통째로 읽기 전에 먼저 호출하라(토큰 절감).',
        schema: { query: z.string().describe('심볼 이름 또는 일부'), exact: z.boolean().optional().describe('정확히 일치만'), limit: z.number().int().min(1).max(60).optional() },
        handler: (a) => T.codeSearch(dir, a.query, a) },
      { name: 'code_outline', write: false, group: 'code',
        description: '한 파일의 구조(정의된 함수·클래스·메서드·타입 + import)를 줄 번호와 함께 돌려준다. 파일 전체를 읽지 않고 어디에 무엇이 있는지 파악할 때.',
        schema: { file: z.string().describe('프로젝트 루트 기준 상대경로(접미 일치도 허용)') },
        handler: (a) => T.codeOutline(dir, a.file) },
      { name: 'code_refs', write: false, group: 'code',
        description: '식별자(함수/변수 이름)가 정의·참조되는 모든 위치를 파일·줄·코드와 함께 찾는다(영향 범위 파악). def=true 가 정의 위치.',
        schema: { symbol: z.string().describe('식별자 단어 하나'), limit: z.number().int().min(1).max(120).optional() },
        handler: (a) => T.codeRefs(dir, a.symbol, a) },
      { name: 'code_files', write: false, group: 'code',
        description: '인덱싱된 소스 파일 목록(언어·심볼 수). query 로 경로 부분 일치 필터. 프로젝트 코드 지형을 빠르게 훑을 때.',
        schema: { query: z.string().optional().describe('경로에 포함된 문자열'), limit: z.number().int().min(1).max(200).optional() },
        handler: (a) => T.codeFiles(dir, a) },
    );
  }

  return opts.canWrite === false ? read : read.concat(write);
}

module.exports = { toolDefs };
