/* AUTO-GENERATED — 원본 src/agents/narani-tooldefs.js 에서 scripts/build-team-mcp.js 가 복사. 직접 수정 금지. */
'use strict';
/*
 * Narani 도구 정의(단일 출처) — Claude 인-프로세스(narani-mcp.js)와
 * Codex/Gemini stdio 서버(../mcp/narani-stdio.js), 그리고 스탠드얼론 팀 MCP 패키지가 공유한다.
 * 각 항목: { name, description, schema(zod shape), handler(args)->결과객체, write, group }.
 * 결과 객체는 각 어댑터가 {content:[{type:'text',text}]} 로 감싼다.
 *
 * 도구 이름은 "동사_대상" 으로 지어 사용자가 'Agent가 X 를 썼습니다'만 보고도 무슨 일을 했는지 짐작하게 했다.
 *
 * group:
 *   'team' — .narani 팀 협업(컨셉 그래프·팀 로그). graph.json/feed 만 있으면 앱 없이도 동작.
 *   'code' — 코드 내비게이션(심볼/정의/참조). 순수 Node(fs+정규식)라 앱 없이도 동작 → 스탠드얼론에도 포함.
 * opts.groups 로 묶음을 고른다(기본: 둘 다).
 */
const { z } = require('zod');
const T = require('./narani-tools');

// 서버 instructions — MCP 클라이언트가 세션에 주입한다(Skill 처럼 "항상 지킬 운영 규칙").
// .narani 가 git 으로 동기화돼야 팀 협업이 성립하므로, 시작=받기 / 끝=공유 를 습관화시킨다.
const INSTRUCTIONS = [
  'Narani 팀 협업 프로토콜 — 이 도구가 연결된 프로젝트에서는 사용자가 매번 시키지 않아도 다음을 스스로 지켜라:',
  '1) 작업 시작: 먼저 get_context 를 호출해 맥락과 팀 공유 상태(teamSync)를 확인한다.',
  '2) 시작 직후: sync_team(action:"pull") 로 팀원들의 최신 .narani 를 받아온다(혼자가 아니라 팀과 같은 지도를 본다).',
  '3) 읽을 때는 search_concepts→read_concept, search_team_log 로 필요한 부분만 본다(전체를 읽지 마라 — 토큰 절감). 코드 위치는 find_symbol/outline_file/find_references.',
  '4) 코드 구조를 만들거나 바꿨으면 save_concept / link_concepts 로 컨셉 그래프를 갱신한다.',
  '5) 작업이 끝나면 반드시 post_team_update 로 한 줄 요약(+건드린 파일·관련 노드)을 남기고, 곧바로 sync_team(action:"push") 로 .narani 를 팀에 공유한다.',
  '6) teamSync.ready 가 false 면 작업이 로컬에만 남는다 — 사용자에게 git 원격/토큰 설정을 안내하라.',
  '요약: 시작 = get_context + sync_team(pull) · 끝 = post_team_update + sync_team(push).',
].join('\n');

function toolDefs(dir, opts) {
  opts = opts || {};
  const groups = opts.groups || ['team', 'code'];
  const has = (g) => groups.indexOf(g) !== -1;
  const read = [];
  const write = [];

  if (has('team')) {
    read.push(
      { name: 'get_context', write: false, group: 'team',
        description: '작업을 시작하기 전 한 번에 맥락을 받는다 — 컨셉 그래프 상위 계층 + 최근 팀 작업 + 규칙. 가장 먼저 호출하라.',
        schema: {}, handler: () => T.orient(dir) },
      { name: 'search_concepts', write: false, group: 'team',
        description: '컨셉 그래프에서 키워드로 노드를 찾는다(여러 단어 = 모두 포함, 관련도순). 매칭된 부분만 짧게 돌려주니, 필요한 노드만 골라 read_concept 로 펼쳐라 — 그래프 전체를 읽지 마라(토큰 절감).',
        schema: {
          query: z.string().describe('검색어(공백으로 여러 단어). 제목·설명 전체에서 찾음'),
          layer: z.number().int().min(1).max(4).optional().describe('이 계층만'),
          limit: z.number().int().min(1).max(30).optional().describe('최대 결과 수(기본 12)'),
        }, handler: (a) => T.graphSearch(dir, a.query, a) },
      { name: 'read_concept', write: false, group: 'team',
        description: '노드 하나의 전체 내용(why/what/how/input/output + 부모·자식·관계)을 읽는다. search_concepts 로 찾은 id 만 펼쳐라.',
        schema: { id: z.string() }, handler: (a) => T.graphGetNode(dir, a.id) },
      { name: 'list_concepts', write: false, group: 'team',
        description: '컨셉 그래프 개요(계층별 개수 + 노드 제목 목록). layer 를 주면 그 계층만. 전체 지형을 빠르게 훑을 때.',
        schema: { layer: z.number().int().min(1).max(4).optional() }, handler: (a) => T.graphRead(dir, a) },
      { name: 'read_team_log', write: false, group: 'team',
        description: '팀원 에이전트들의 최근 작업 기록을 최신순으로 읽는다(요약·건드린 파일).',
        schema: { limit: z.number().int().min(1).max(50).optional() }, handler: (a) => T.feedRead(dir, a) },
      { name: 'search_team_log', write: false, group: 'team',
        description: '팀 작업 기록을 검색한다 — 누가 무엇을/어느 파일을 건드렸는지. 전체 로그를 읽지 말고 query·file·author·nodeId 로 좁혀라(토큰 절감). 매칭 부분만 돌려준다.',
        schema: {
          query: z.string().optional().describe('제목·요약·파일경로에서 찾을 단어들'),
          file: z.string().optional().describe('이 경로(일부)를 건드린 기록만'),
          author: z.string().optional().describe('이 작성자만'),
          nodeId: z.string().optional().describe('이 컨셉 노드와 연결된 기록만'),
          limit: z.number().int().min(1).max(30).optional().describe('최대 결과 수(기본 10)'),
        }, handler: (a) => T.feedSearch(dir, a) },
    );
    write.push(
      { name: 'save_concept', write: true, group: 'team',
        description: '컨셉 그래프 노드를 만들거나 갱신한다(스키마·히스토리 자동). 코드 구조를 만들거나 바꿨을 때 호출. layer 1=컨셉 2=도메인 3=컴포넌트 4=구현.',
        schema: {
          id: z.string().optional().describe('갱신할 기존 노드 id (없으면 새로 생성)'),
          layer: z.number().int().min(1).max(4),
          title: z.string(),
          parent: z.string().optional().describe('부모 노드 id (상위 계층)'),
          why: z.string().optional(), what: z.string().optional(), how: z.string().optional(),
          input: z.string().optional(), output: z.string().optional(),
        }, handler: (a) => T.graphUpsertNode(dir, a) },
      { name: 'link_concepts', write: true, group: 'team',
        description: '두 노드 사이 관계(엣지)를 잇거나 끊는다(의존·호출·데이터 흐름). remove:true 면 끊기.',
        schema: { from: z.string(), to: z.string(), label: z.string().optional(), remove: z.boolean().optional() },
        handler: (a) => T.graphLink(dir, a) },
      { name: 'post_team_update', write: true, group: 'team',
        description: '이번 작업 요약을 팀 로그에 남겨 다른 에이전트가 보게 한다. 작업이 끝나면 호출. 건드린 파일·관련 노드를 함께 적으면 나중에 search_team_log 로 잘 찾힌다. 남긴 뒤엔 sync_team(action:"push") 로 공유하라.',
        schema: { title: z.string(), summary: z.string().optional(), files: z.array(z.string()).optional(), nodeIds: z.array(z.string()).optional() },
        handler: (a) => T.feedWrite(dir, Object.assign({ author: 'agent' }, a)) },
      { name: 'sync_team', write: true, group: 'team',
        description: '.narani 팀 메모리를 git 으로 동기화한다 — 이걸 통해 팀원 에이전트와 실제로 소통이 일어난다. action:"pull"=팀원 최신 받기(작업 시작 시), "push"=내 .narani 변경만 커밋·푸시(post_team_update 직후), "both"=둘 다. 다른 코드 변경은 건드리지 않고 .narani 만 커밋한다.',
        schema: { action: z.enum(['pull', 'push', 'both']).optional().describe('기본 both'), message: z.string().optional().describe('push 커밋 메시지') },
        handler: (a) => T.gitSync(dir, a) },
    );
  }

  if (has('code') && T.codeSearch) {
    // ── 코드 내비게이션(설치 0·순수 Node) — 파일 통째 읽기/grep 전에 좁혀서 토큰 절감 ──
    read.push(
      { name: 'find_symbol', write: false, group: 'code',
        description: '함수·클래스·타입 등 심볼 이름을 프로젝트 전체에서 찾아 파일·줄·종류를 돌려준다. 코드를 찾을 땐 파일을 통째로 읽기 전에 먼저 호출하라(토큰 절감).',
        schema: { query: z.string().describe('심볼 이름 또는 일부'), exact: z.boolean().optional().describe('정확히 일치만'), limit: z.number().int().min(1).max(60).optional() },
        handler: (a) => T.codeSearch(dir, a.query, a) },
      { name: 'outline_file', write: false, group: 'code',
        description: '한 파일의 구조(정의된 함수·클래스·메서드·타입 + import)를 줄 번호와 함께 돌려준다. 파일 전체를 읽지 않고 어디에 무엇이 있는지 파악할 때.',
        schema: { file: z.string().describe('프로젝트 루트 기준 상대경로(접미 일치도 허용)') },
        handler: (a) => T.codeOutline(dir, a.file) },
      { name: 'find_references', write: false, group: 'code',
        description: '식별자(함수/변수 이름)가 정의·참조되는 모든 위치를 파일·줄·코드와 함께 찾는다(영향 범위 파악). def=true 가 정의 위치.',
        schema: { symbol: z.string().describe('식별자 단어 하나'), limit: z.number().int().min(1).max(120).optional() },
        handler: (a) => T.codeRefs(dir, a.symbol, a) },
      { name: 'list_code_files', write: false, group: 'code',
        description: '인덱싱된 소스 파일 목록(언어·심볼 수). query 로 경로 부분 일치 필터. 프로젝트 코드 지형을 빠르게 훑을 때.',
        schema: { query: z.string().optional().describe('경로에 포함된 문자열'), limit: z.number().int().min(1).max(200).optional() },
        handler: (a) => T.codeFiles(dir, a) },
    );
  }

  return opts.canWrite === false ? read : read.concat(write);
}

module.exports = { toolDefs, INSTRUCTIONS };
