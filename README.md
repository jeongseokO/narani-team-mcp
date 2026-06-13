# narani-team-mcp

Narani 앱 없이도, 팀이 공유하는 **`.narani` 협업 메모리**(컨셉 그래프 + 작업 피드)를 어떤 MCP 클라이언트에서나 쓰게 해주는 스탠드얼론 MCP 서버입니다.

앱 전체를 깔 필요 없이, 팀원이 자기 Claude·Codex·Gemini에 이 작은 서버만 연결하면 같은 `.narani/`를 읽고 씁니다. (git으로 동기화되는 그 폴더 그대로)

## 노출 도구 (team 전용)

읽기 — `orient` · `graph_search` · `graph_get_node` · `graph_read` · `feed_read`
쓰기 — `graph_upsert_node` · `graph_link` · `feed_write`

모두 프로젝트의 `.narani/`(graph.json · feed/)만 다룹니다. 그래프 엔진이나 앱 없이 동작합니다.
※ 앱 성격의 코드 인덱스(`code_*`)는 **의도적으로 빠져 있습니다** — 이 패키지는 팀 협업 도구만 담습니다.

## 설치 — 터미널 한 줄 (권장)

Node.js 18+ 만 있으면 됩니다. 다운로드·압축해제 없이 `npx` 가 공개 repo 에서 바로 받아 실행합니다.

```bash
# Claude
claude mcp add narani-team -- npx -y github:jeongseokO/narani-team-mcp
# Codex
codex mcp add narani-team -- npx -y github:jeongseokO/narani-team-mcp
# Gemini
gemini mcp add narani-team npx -y github:jeongseokO/narani-team-mcp
```

대상 프로젝트 폴더는 클라이언트가 실행되는 폴더(cwd)가 기본입니다. 명시하려면 `NARANI_PROJECT_DIR` 환경변수를 주세요.
읽기 전용으로만 쓰려면 `NARANI_CAN_WRITE=0`.

## 직접 실행 (로컬 체크아웃)

```bash
npm install        # @modelcontextprotocol/sdk, zod 만 받음
node server.js     # stdio MCP 서버
```

## 배포(메인테이너용) — 공개 repo 로 올리기

`npx github:` 가 동작하려면 이 패키지가 **공개 GitHub repo 루트**에 있어야 합니다.

```bash
# Narani 앱 repo 에서 패키지를 최신 소스로 조립
npm run build:team-mcp           # packages/narani-team-mcp/lib/ 갱신
# 이 폴더(packages/narani-team-mcp) 내용을 공개 repo 루트로 push
cd packages/narani-team-mcp
git init && git add . && git commit -m "narani-team-mcp"
git branch -M main
git remote add origin https://github.com/jeongseokO/narani-team-mcp.git
git push -u origin main
```

> `lib/` 는 빌드 산출물이지만 `npx github:` 설치에 필요하므로 **반드시 커밋**합니다(이 repo 에서는 `.gitignore` 에 넣지 마세요).

## 읽기 전용으로 쓰기

쓰기 도구를 빼고 읽기만 노출하려면 `NARANI_CAN_WRITE=0` 을 환경변수로 주세요.

## 라이선스

MIT
