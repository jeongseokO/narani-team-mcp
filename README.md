# narani-team-mcp

Narani 앱 없이도, 팀이 공유하는 **`.narani` 협업 메모리**(컨셉 그래프 + 작업 로그)와 **코드 내비게이션**을 어떤 MCP 클라이언트에서나 쓰게 해주는 스탠드얼론 MCP 서버입니다.

앱 전체를 깔 필요 없이, 팀원이 자기 Claude·Codex·Gemini에 이 작은 서버만 연결하면 같은 `.narani/`를 읽고 씁니다. (git으로 동기화되는 그 폴더 그대로) 모든 처리는 로컬에서 일어나며 외부로 전송하지 않습니다.

## 노출 도구

도구 이름은 "동사_대상"이라, 에이전트가 무엇을 했는지 이름만 봐도 짐작됩니다. 모든 검색은 **매칭된 부분만** 돌려줘 토큰을 아낍니다.

**컨셉 그래프 (team)**
- `get_context` — 시작 시 맥락 한 번에(상위 컨셉 + 최근 작업 + 규칙)
- `search_concepts` — 키워드로 노드 검색(다중어 AND·관련도순·스니펫)
- `read_concept` — 노드 하나 전체 펼치기
- `list_concepts` — 그래프 개요(계층별 개수·제목)
- `save_concept` / `link_concepts` — 노드 생성·갱신 / 관계 잇기·끊기

**팀 작업 로그 (team)**
- `read_team_log` — 최근 작업 기록
- `search_team_log` — 누가/무엇을/어느 파일을 건드렸는지 검색(query·file·author·nodeId)
- `post_team_update` — 이번 작업 요약 남기기

**코드 내비게이션 (code · 순수 Node, 설치 0)**
- `find_symbol` — 함수·클래스·타입 위치 찾기
- `outline_file` — 한 파일의 구조(정의·import)
- `find_references` — 식별자 정의·참조 전부
- `list_code_files` — 인덱싱된 소스 파일 목록

`.narani/`(graph.json · feed/)와 소스 파일만 로컬에서 다룹니다. 그래프 엔진이나 앱 없이 동작합니다.
※ 터미널·SSH·OAuth·마켓 설치 같은 Electron 전용 기능은 애초에 MCP 도구가 아니라 포함되지 않습니다.

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
