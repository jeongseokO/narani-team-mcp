#!/usr/bin/env node
'use strict';
/*
 * Narani Team MCP — 스탠드얼론 stdio 서버.
 * Narani 앱 없이, 어떤 MCP 클라이언트(Claude·Codex·Gemini 등)에서나 .narani 팀 협업 도구를 쓴다.
 *
 * 노출 도구(group:'team' 만): orient · graph_search · graph_get_node · graph_read · feed_read
 *   · graph_upsert_node · graph_link · feed_write
 *   → 모두 프로젝트의 .narani/ (graph.json · feed/) 만 읽고 쓴다. 앱/그래프 엔진 없이도 동작.
 *   → 앱 성격의 코드 인덱스(code_*) 는 포함하지 않는다.
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
  for (const d of toolDefs(dir, { canWrite, groups: ['team'] })) {
    server.tool(d.name, d.description, d.schema, async (args) => out(await d.handler(args)));
  }
  await server.connect(new StdioServerTransport());
}

main().catch((e) => { process.stderr.write('[narani-team-mcp] ' + (e && e.message || e) + '\n'); process.exit(1); });
