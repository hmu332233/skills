---
name: diff-review
disable-model-invocation: true
description: 명시적으로 /diff-review를 호출했을 때 코드 변경을 적용하기 전에 제안 내용을 로컬 HTML diff 뷰어로 보여준다. 사용자가 실제 파일 수정 전 diff와 설명을 검토하려는 경우에만 사용한다.
---

# Diff Review

코드를 수정하기 전에 검토용 `data.js`만 만들고, 이 디렉터리의 고정 `viewer.html`로 연다. 데이터는 커뮤니케이션 산출물이며 적용 가능한 패치가 아니다.

## 워크플로우

1. 대상 파일을 읽고 제안할 변경을 확정하되 실제 파일은 수정하지 않는다.
2. 아래 스키마의 `data.js`를 세션 임시 디렉터리에 작성한다. 프로젝트에 남겨야 한다는 요청이 없으면 `/tmp/diff-review-<review-name>.data.js`를 사용한다.
3. `node --check <data.js 절대경로>`로 JavaScript 문법을 검사한다.
4. 이 `SKILL.md`와 같은 디렉터리의 `scripts/open-review.sh`에 data.js 절대경로를 넘겨 실행한다. 뷰어를 여는 방법(URL 인코딩, macOS `open`의 쿼리 제거 우회)은 전부 스크립트 책임이므로 URL·런처를 직접 만들거나 `open`을 직접 호출하지 않는다.

   ```text
   bash <skill-dir>/scripts/open-review.sh /tmp/diff-review-<review-name>.data.js
   ```

5. 사용자에게 뷰어를 열었다고 알리고 승인 또는 수정 요청을 기다린다. 명시적 승인 전에는 제안 변경을 적용하지 않는다.

Chrome 또는 Safari를 기본 브라우저로 사용한다. Firefox는 뷰어 디렉터리 밖의 로컬 스크립트를 차단할 수 있다. HTTP 서버로 뷰어를 서빙하지 않는다 — 뷰어가 데이터를 `file://` script로 로드하므로 http 페이지에서는 브라우저가 차단한다. 뷰어는 diff2html과 highlight.js 테마를 CDN(jsdelivr)에서 로드하므로 네트워크 연결이 필요하다. diff 영역은 페이지 테마와 무관하게 항상 One Dark Pro Darker 표면과 Atom One Dark 구문 팔레트의 다크모드로 렌더링된다.

## 데이터 스키마

`data.js`는 JSON 파일이 아니라 다음 전역 할당을 포함한 JavaScript 파일이다. 모든 사용자 제공 문자열은 JSON 문자열 직렬화 방식으로 이스케이프한다.

```js
window.REVIEW_DATA = {
  title: "로그인 검증 변경 제안",
  summary: "적용 전에 검토할 전체 변경 요약입니다.",
  files: [
    {
      path: "src/auth/login.ts",
      explanation: "파일 전체 설명은 선택입니다.",
      diff: "--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -1,2 +1,3 @@\n ..."
    }
  ]
};
```

필드:

- `title` (필수 문자열): 리뷰 제목.
- `summary` (선택 문자열): 전체 변경 요약. Markdown이 아닌 일반 텍스트로 작성한다.
- `files` (필수 배열): 한 개 이상의 파일 변경.
- `files[].path` (필수 문자열): 표시할 파일 경로.
- `files[].explanation` (선택 문자열): 파일 단위 설명.
- `files[].diff` (조건부 문자열): 파일 전체 diff. `hunks`가 없을 때 필수다.
- `files[].hunks` (조건부 배열): 헝크마다 설명이 필요할 때 `diff` 대신 사용한다.
- `files[].hunks[].note` (선택 문자열): 헝크 설명.
- `files[].hunks[].diff` (필수 문자열): `@@`로 시작하는 헝크 또는 파일 헤더를 포함한 diff.

`diff`와 `hunks`를 한 파일에 함께 넣지 않는다. 설명할 가치가 없으면 `summary`, `explanation`, `note`를 생략한다.

## Diff 규칙

- 느슨한 unified diff를 작성한다. 보기 전용이므로 헝크 라인 번호와 개수는 대략적이어도 된다.
- 파일 전체 diff에는 `--- a/<path>`, `+++ b/<path>`, `@@ ... @@` 헤더를 반드시 넣는다.
- `hunks[].diff`가 `@@`로 시작하면 뷰어가 `path`에서 일반 파일 헤더를 만든다. 신규/삭제 파일 헝크는 `/dev/null` 헤더가 필요하므로 전체 파일 헤더를 직접 포함한다.
- 신규 파일은 `--- /dev/null`, 삭제 파일은 `+++ /dev/null`을 사용한다.
- 여러 파일을 하나의 `diff` 문자열에 합치지 않는다. 파일마다 `files` 항목을 만든다.
- 실제 적용은 승인 후 평소의 파일 편집 도구로 수행한다. `data.js`를 `git apply`에 전달하지 않는다.

## 검증

- 데이터 문법: `node --check <data.js>`가 성공해야 한다.
- 여는 경로: `scripts/open-review.sh <skill-dir>/sample.data.js`가 뷰어를 데이터와 함께 띄워야 한다.
- 뷰어: 제목, 요약, 모든 파일과 diff가 보이고 브라우저 콘솔 오류가 없어야 한다.
- 레이아웃: 데스크톱에서는 diff가 왼쪽, 파일·헝크 설명이 오른쪽에 같은 행으로 보여야 한다. 좁은 화면에서는 diff 다음에 설명이 쌓여야 한다.
- 오버플로: 긴 코드 줄은 diff 영역 안에서만 가로 스크롤되고 페이지 전체에는 가로 스크롤이 생기지 않아야 한다.
- 테마: 편집기 배경은 One Dark Pro Darker의 `#23272e`, 구문색은 highlight.js Atom One Dark 공식 리터럴로 렌더링되어야 한다.
- 상호작용: side-by-side/line-by-line 전환, 코드 폰트 선택, 파일 접기/펼치기가 동작해야 한다. 코드 폰트의 기본값은 JetBrains Mono다.
- 뷰어 자체를 수정할 때는 `sample.data.js`로 수정·신규·삭제·한글 사례를 다시 확인한다.
