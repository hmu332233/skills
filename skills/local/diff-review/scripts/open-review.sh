#!/bin/bash
# 사용법: open-review.sh <review.data.js 절대경로>
# 에이전트는 data.js만 생성하고 이 스크립트를 호출한다. 뷰어를 여는 방법은
# 전부 이 스크립트의 책임이라, 여는 방식이 바뀌어도 에이전트 워크플로우는 그대로다.
set -euo pipefail

data_path="${1:?사용법: open-review.sh <review.data.js 절대경로>}"
case "$data_path" in
	/*) ;;
	*)
		echo "data.js는 절대경로여야 합니다: $data_path" >&2
		exit 1
		;;
esac
if [ ! -f "$data_path" ]; then
	echo "파일이 없습니다: $data_path" >&2
	exit 1
fi

skill_dir="$(cd "$(dirname "$0")/.." && pwd)"
viewer="$skill_dir/viewer.html"

# 공백·한글 경로에 안전하도록 뷰어 경로와 data 값을 모두 URL 인코딩한다.
viewer_url=$(node -e '
	const [viewer, data] = process.argv.slice(1);
	const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
	process.stdout.write(`file://${encodePath(viewer)}?data=${encodeURIComponent(data)}`);
' "$viewer" "$data_path")

# macOS `open`은 LaunchServices가 file URL을 파일 경로로 정규화하면서 쿼리를
# 제거한다(-a로 브라우저를 지정해도 동일). 그래서 쿼리 없는 런처를 임시로 만들어
# 열고, 쿼리 붙은 뷰어 URL로의 이동은 브라우저 내부 네비게이션에 맡긴다.
# location.replace는 런처를 히스토리에 남기지 않는다(뒤로가기 루프 방지).
launcher="$(mktemp -d /tmp/diff-review-launch.XXXXXX)/launch.html"
cat > "$launcher" <<HTML
<!doctype html>
<meta charset="utf-8">
<script>location.replace("$viewer_url");</script>
HTML

open "$launcher"
echo "뷰어 열림: $viewer_url"
