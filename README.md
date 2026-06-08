# minung-skills

이 저장소의 `skills/` 카탈로그에 있는 스킬을 agent-visible skills 디렉토리에 심볼릭 링크로 등록하는 CLI입니다.

## Source Skill Catalog

원본 스킬은 `skills/` 아래에서 관리합니다.

```txt
skills/
  local/
    <skill>/
      SKILL.md
  imported/
    <skill>/
      SKILL.md
      provenance.json
  deprecated/
    <skill>/
      SKILL.md
```

- `skills/local`: 직접 만들어서 관리하는 스킬
- `skills/imported`: 외부에서 가져온 스킬
- `skills/deprecated`: 보관용 스킬. CLI discovery와 등록 UI에서 제외됩니다.

`skills/imported/<skill>/provenance.json`은 imported skill의 canonical provenance입니다.

## Registration Targets

등록 대상은 flat 구조를 유지합니다.

- root/global: `~/.agents/skills/<skill-name>`
- project/local: `현재 작업 디렉토리/.agents/skills/<skill-name>`
- root/global + Claude: `~/.claude/skills/<skill-name>`
- project/local + Claude: `현재 작업 디렉토리/.claude/skills/<skill-name>`

등록은 파일 복사가 아니라 source skill directory를 가리키는 symlink 생성입니다.

## 설치

```sh
npm install
npm run build
npm link
```

설치 후 어느 디렉토리에서든 실행할 수 있습니다.

```sh
minung-skills
```

## Interactive UI

기본 실행은 interactive registration UI를 엽니다.

```sh
minung-skills
```

흐름:

```txt
1. 등록 대상 선택
2. Local / Imported 그룹에서 스킬 multi-select
3. 확인 후 symlink 등록
```

대상이 이미 같은 이름의 항목을 가지고 있으면 선택할 수 없고 상태가 표시됩니다.

| 상태 | 의미 |
| --- | --- |
| `registered` | 이 저장소의 현재 source skill을 가리키는 정상 symlink |
| `broken` | symlink가 가리키는 대상이 사라짐 |
| `external` | symlink가 이 저장소의 expected source skill이 아닌 다른 위치를 가리킴 |
| `not-symlink` | 같은 이름의 일반 파일 또는 디렉토리가 있음 |

CLI는 `external`, `not-symlink` 항목을 자동 수정하지 않습니다. `broken` symlink는 interactive UI에서 확인 후 정리할 수 있고, `clean` 명령으로도 정리할 수 있습니다.

## Non-interactive Commands

스크립트와 fallback 용도로 명령형 인터페이스도 유지합니다.

```sh
minung-skills available
```

등록 가능한 source skill을 카테고리별로 출력합니다. `deprecated`는 출력하지 않습니다.

```sh
minung-skills list
minung-skills list --root
minung-skills list --project
minung-skills list --project --claude
```

등록 대상의 현재 상태를 inspect합니다.

```sh
minung-skills add <name...> --root
minung-skills add <name...> --project
minung-skills add <name...> --project --claude
```

예:

```sh
minung-skills add kaku-cli --project
minung-skills add imported/grill-me --project --claude
```

스킬 이름은 보통 `<skill-name>`만 쓰면 됩니다. 같은 이름이 여러 카테고리에 존재하면 `<category>/<skill-name>` 형식을 사용합니다.

이름 없이 `add`를 실행하면 등록 대상은 옵션으로 고정하고 스킬 선택은 UI로 진행합니다.

```sh
minung-skills add --project
minung-skills add --root --claude
```

Broken symlink만 정리하려면 `clean`을 사용합니다.

```sh
minung-skills clean --root
minung-skills clean --project
minung-skills clean --root --claude
minung-skills clean --project --yes
```

`clean`은 삭제 전에 broken symlink 목록을 보여주고, 정리 후 실제 삭제된 항목을 다시 출력합니다. `--yes`를 쓰면 확인 질문만 건너뜁니다.

## 주의사항

- symlink는 이 저장소의 절대 경로를 가리킵니다. 저장소 위치를 옮기거나 source skill 경로를 바꾸면 기존 링크가 `broken`이 될 수 있습니다.
- 같은 이름의 대상 항목이 이미 있으면 덮어쓰지 않습니다.
- Windows 환경은 지원 대상으로 보지 않습니다.
