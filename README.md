# minung-skills

이 저장소의 `skills/` 디렉토리에 있는 스킬을 다른 위치에 심볼릭 링크로 등록해 주는 CLI입니다.

등록 대상은 두 가지입니다.

- **root/global**: `~/.agents/skills/<skill-name>`
- **project/local**: `현재 작업 디렉토리/.agents/skills/<skill-name>`

## 설치

이 CLI는 현재 저장소의 `skills/` 디렉토리를 기준으로 동작하므로, 저장소를 로컬에 둔 상태에서 `npm link`로 연결해 사용하는 방식을 권장합니다.

```sh
npm install
npm run build
npm link
```

설치 후 어느 디렉토리에서든 다음 명령을 사용할 수 있습니다.

```sh
minung-skills --help
```

## 사용법

```sh
minung-skills <command> [options]
```

### 등록 가능한 스킬 확인

```sh
minung-skills available
```

현재 저장소의 `skills/` 아래에서 `SKILL.md`를 가진 스킬 목록을 출력합니다.

예:

```sh
cmux-cli
execute-plan
kaku-cli
plan
```

### 등록된 스킬 확인

```sh
minung-skills list
minung-skills list --root
minung-skills list --project
```

- `list`: root와 project 등록 상태를 모두 출력합니다.
- `list --root`: `~/.agents/skills`만 확인합니다.
- `list --project`: 현재 디렉토리의 `.agents/skills`만 확인합니다.

상태 표시는 다음과 같습니다.

| 표시 | 의미 |
| --- | --- |
| `✓` | 이 저장소의 스킬을 가리키는 정상 심볼릭 링크 |
| `✗ broken` | 대상이 사라진 깨진 심볼릭 링크 |
| `⚠ external` | 이 저장소 밖을 가리키는 심볼릭 링크 |
| `⚠ not-symlink` | 심볼릭 링크가 아닌 일반 파일 또는 디렉토리 |

### 스킬 등록

```sh
minung-skills add <name> --root
minung-skills add <name> --project
```

`--root` 또는 `--project` 중 하나를 반드시 지정해야 합니다.

예:

```sh
minung-skills add plan --project
minung-skills add execute-plan --root
```

위 명령은 각각 다음 위치에 심볼릭 링크를 만듭니다.

- `./.agents/skills/plan`
- `~/.agents/skills/execute-plan`

이미 같은 이름의 항목이 있으면 덮어쓰지 않고 실패합니다. 교체하려면 기존 파일 또는 링크를 직접 삭제한 뒤 다시 실행하세요.

## 예시

프로젝트 디렉토리에서 `plan` 스킬을 local로 등록하는 예시입니다.

```sh
cd ~/my-project
minung-skills add plan --project
minung-skills list --project
```

출력 예:

```sh
[project] /Users/you/my-project/.agents/skills
  plan  [✓]
```

## 주의사항

- 심볼릭 링크는 이 저장소의 절대 경로를 가리킵니다. 저장소 위치를 옮기면 기존 링크가 깨질 수 있으니 다시 등록하세요.
- 삭제 명령은 아직 없습니다. 필요하면 직접 삭제하세요.
  - root: `rm ~/.agents/skills/<name>`
  - project: `rm .agents/skills/<name>`
- Windows 환경은 지원 대상으로 보지 않습니다.
