---
name: commit
description: Group staged/unstaged changes by concern and create separate, focused commits for each group. Use when the user says "commit", "commit based on concern", or wants to commit current changes.
---

# Commit by Concern

When the user asks to commit, follow this workflow:

## 1. Survey the changes

Run these in parallel:
- `git status` — see all modified/untracked files
- `git diff` — see unstaged changes
- `git diff --cached` — see already-staged changes
- `git log --oneline -5` — learn the commit message style of this repo

## 2. Group by concern

Analyze all changed files and mentally group them into logical units. Each group should represent **one coherent reason for change**. Common groups:

- **feat** — new feature or behavior
- **fix** — bug fix
- **refactor** — restructuring without behavior change
- **test** — adding or updating tests
- **chore** — deps, config, tooling, lock files
- **style** — formatting only

Files that always travel together (e.g. a new helper + its test, a component + its types) should be in the same commit. Lock files (`pnpm-lock.yaml`, `package-lock.json`) belong with the dependency change that caused them.

## 3. Commit each group separately

For each group:
1. `git add <specific files>` — stage only that group's files
2. Craft a concise commit message following the repo's convention:
   - Conventional Commits format: `type(scope): short description`
   - Body if needed to explain *why*, not *what*
3. Commit using a HEREDOC to preserve formatting:

```bash
git commit -m "$(cat <<'EOF'
type(scope): short description

Longer explanation if needed.
EOF
)"
```

## 4. Verify

After all commits, run `git log --oneline -<N>` (where N = number of commits made) to confirm each landed correctly.

## Rules

- Never use `git add -A` or `git add .` — always add specific files by name
- Never amend an existing commit — always create new ones
- Never skip hooks (`--no-verify`)
- Do not push unless the user explicitly asks
- If a file belongs to multiple concerns, put it in the commit where it has the most impact
- `.claude/settings.local.json` is personal config — skip it unless the user explicitly asks to include it
