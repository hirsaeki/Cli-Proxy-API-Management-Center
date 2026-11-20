#!/usr/bin/env bash
set -euo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/fork-upstream-sync.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export GIT_AUTHOR_NAME=fixture GIT_COMMITTER_NAME=fixture
export GIT_AUTHOR_EMAIL=fixture@example.invalid GIT_COMMITTER_EMAIL=fixture@example.invalid
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GH_LOG="$work/gh.log"
export PATH="$work/bin:$PATH"
export SYNC_REPOSITORY=fixture/panel
export SYNC_UPSTREAM_URL="$work/upstream.git"
unset GITHUB_STEP_SUMMARY
mkdir "$work/bin"
cat > "$work/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$GH_LOG"
case "$1:$2" in
  api:--paginate)
    case "$3" in
      *state=open*) if [[ "${MOCK_OPEN:-}" == yes ]]; then echo 'https://example.invalid/1'; fi ;;
      *state=all*) if [[ "${MOCK_CLOSED:-}" == yes ]]; then echo 1; fi ;;
      *) exit 3 ;;
    esac
    ;;
  pr:create)
    [[ "$*" == *" --draft "* ]]
    if [[ "${MOCK_FAIL_CREATE:-}" == yes ]]; then exit 4; fi
    echo 'https://example.invalid/1'
    ;;
  *) exit 3 ;;
esac
MOCK
chmod +x "$work/bin/gh"
git init -q --bare -b main "$work/upstream.git"
git init -q --bare -b main "$work/fork.git"
git init -q -b main "$work/source"
cd "$work/source"
printf 'base\n' > shared
git add shared
git commit -qm base
git push -q "$SYNC_UPSTREAM_URL" main
git remote add origin "$work/fork.git"
git push -q origin main
git checkout -qb fork
printf 'Global, US, EU\n' > fork-feature
git add fork-feature
git commit -qm fork-feature
git push -q origin HEAD:main
fork_sha="$(git rev-parse HEAD)"

run_sync() { bash "$script" > "$work/sync.log" 2>&1; }
one_candidate() {
  local refs
  refs="$(git ls-remote --heads origin 'refs/heads/automation/upstream-sync/*')"
  [[ "$(grep -c . <<< "$refs")" -eq 1 ]]
  printf '%s\n' "${refs%%$'\t'*}"
}

run_sync
grep -q 'already contains' "$work/sync.log"
[[ ! -e "$GH_LOG" ]]
git checkout -q main
printf 'upstream change\n' > upstream-feature
git add upstream-feature
git commit -qm upstream-feature
git push -q "$SYNC_UPSTREAM_URL" main
upstream_sha="$(git rev-parse HEAD)"
export MOCK_FAIL_CREATE=yes
if run_sync; then echo 'Expected PR creation failure'; exit 1; fi
grep -q 'Prepared sync branch:.*compare/main' "$work/sync.log"
grep -q 'Could not create' "$work/sync.log"
candidate="$(one_candidate)"
[[ "$(git show -s --format=%P "$candidate")" == "$fork_sha $upstream_sha" ]]
[[ "$(git show "$candidate:fork-feature")" == 'Global, US, EU' ]]
[[ "$(git show "$candidate:upstream-feature")" == 'upstream change' ]]
[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$fork_sha" ]]
[[ -z "$(git ls-remote --tags origin)" ]]

export MOCK_FAIL_CREATE=no
run_sync
[[ "$(one_candidate)" == "$candidate" ]]
[[ "$(grep -c '^pr create' "$GH_LOG")" -eq 2 ]]
export MOCK_OPEN=yes
run_sync
grep -q 'already open' "$work/sync.log"
export MOCK_OPEN=no MOCK_CLOSED=yes
run_sync
grep -q 'was closed' "$work/sync.log"
[[ "$(grep -c '^pr create' "$GH_LOG")" -eq 2 ]]

mkdir -p .github/workflows
printf 'name: test\n' > .github/workflows/new.yml
git add .github/workflows/new.yml
git commit -qm workflow
git push -q "$SYNC_UPSTREAM_URL" main
if run_sync; then echo 'Expected workflow-change rejection'; exit 1; fi
grep -q 'would change workflow files' "$work/sync.log"
[[ "$(one_candidate)" == "$candidate" ]]

git checkout -q fork
printf 'fork conflict\n' > shared
git commit -qam fork-conflict
git push -q origin HEAD:main
git checkout -q main
printf 'upstream conflict\n' > shared
git commit -qam upstream-conflict
git push -q "$SYNC_UPSTREAM_URL" main
if run_sync; then echo 'Expected merge conflict'; exit 1; fi
grep -q 'Automatic Git merge failed' "$work/sync.log"
[[ "$(one_candidate)" == "$candidate" ]]
echo 'upstream sync fixtures passed'
