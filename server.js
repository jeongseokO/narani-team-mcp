#!/usr/bin/env node
'use strict';
/*
 * Narani Team MCP — 스탠드얼론 stdio 서버.
 * Narani 앱 없이, 어떤 MCP 클라이언트(Claude·Codex·Gemini 등)에서나 .narani 팀 협업 도구를 쓴다.
 *
 * 노출 도구 — 앱 없이 동작하는 것 전부:
 *   team(.narani 협업): get_context · search_concepts · read_concept · list_concepts
 *     · read_team_log · search_team_log · save_concept · link_concepts · post_team_update
 *   code(코드 내비게이션, 순수 Node): find_symbol · outline_file · find_references · list_code_files
 *   → team 은 .narani/(graph.json·feed/), code 는 소스 파일만 로컬에서 읽고 쓴다. 외부 전송 없음.
 *   → Electron/앱 전용 기능(터미널·SSH·OAuth·마켓 설치 등)은 애초에 MCP 도구가 아니라 포함되지 않는다.
 *
 * 대상 프로젝트 폴더: NARANI_PROJECT_DIR 환경변수 → 없으면 process.cwd().
 * 쓰기 비활성: NARANI_CAN_WRITE=0 (기본은 허용 — 클라이언트 승인 모드가 위험 작업을 게이트).
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { toolDefs } = require('./lib/narani-tooldefs');

function out(obj) { return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] }; }

async function main() {
  const dir = process.env.NARANI_PROJECT_DIR || process.cwd();
  const canWrite = process.env.NARANI_CAN_WRITE !== '0';
  const server = new McpServer({ name: 'narani-team', version: require('./package.json').version });
  for (const d of toolDefs(dir, { canWrite, groups: ['team', 'code'] })) {
    server.tool(d.name, d.description, d.schema, async (args) => out(await d.handler(args)));
  }
  await server.connect(new StdioServerTransport());
}

main().catch((e) => { process.stderr.write('[narani-team-mcp] ' + (e && e.message || e) + '\n'); process.exit(1); });
