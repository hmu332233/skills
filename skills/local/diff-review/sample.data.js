window.REVIEW_DATA = {
  "title": "Diff Review 샘플",
  "summary": "수정, 신규, 삭제 파일과 한글·특수문자를 한 화면에서 확인하는 동작 검증용 데이터입니다.",
  "files": [
    {
      "path": "src/greeting.ts",
      "explanation": "인사말의 기본값과 출력 형식을 분리합니다.",
      "hunks": [
        {
          "note": "빈 이름은 한글 기본값으로 대체합니다.",
          "diff": "@@ -1,3 +1,4 @@\n export function greet(name: string) {\n-  return `Hello, ${name}!`;\n+  const displayName = name.trim() || \"친구\";\n+  return `안녕하세요, ${displayName}!`;\n }"
        },
        {
          "note": "문자열에 HTML처럼 보이는 특수문자가 있어도 텍스트로 표시되어야 합니다.",
          "diff": "@@ -8,2 +9,2 @@\n-export const hint = \"Enter a name\";\n+export const hint = \"이름을 입력하세요: <홍길동> & 친구\";"
        }
      ]
    },
    {
      "path": "src/constants.ts",
      "explanation": "신규 파일 표시를 확인합니다.",
      "diff": "--- /dev/null\n+++ b/src/constants.ts\n@@ -0,0 +1,2 @@\n+export const DEFAULT_NAME = \"친구\";\n+export const MAX_LENGTH = 40;"
    },
    {
      "path": "src/legacy.ts",
      "explanation": "삭제 파일 표시를 확인합니다.",
      "diff": "--- a/src/legacy.ts\n+++ /dev/null\n@@ -1,3 +0,0 @@\n-export function oldGreeting(name: string) {\n-  return \"Hi \" + name;\n-}"
    }
  ]
};
