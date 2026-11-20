#!/usr/bin/env bash
set -euo pipefail

: "${SYNC_REPOSITORY:?missing sync repository}" "${SYNC_UPSTREAM_URL:?missing upstream URL}"
base=main
prefix=automation/upstream-sync/

report() {
  printf '%s\n' "$1"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
    printf '%s\n\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

# Fetch the two moving tips explicitly; never fetch or publish release tags.
git fetch --no-tags origin "refs/heads/$base"
fork_sha="$(git rev-parse FETCH_HEAD)"
git fetch --no-tags "$SYNC_UPSTREAM_URL" "refs/heads/$base"
upstream_sha="$(git rev-parse FETCH_HEAD)"

if git merge-base --is-ancestor "$upstream_sha" "$fork_sha"; then
  report "Main already contains the upstream tip."
  exit 0
fi

# merge-tree has no working-tree checkout. No upstream code runs with a write token.
# Keep untrusted merge diagnostics out of GitHub workflow command processing.
if ! merged_tree="$(git merge-tree --write-tree --no-messages "$fork_sha" "$upstream_sha" 2>&1)"; then
  report "Automatic Git merge failed for fork $fork_sha and upstream $upstream_sha. Resolve on a separate branch; no branch or release was published."
  exit 1
fi
if ! git diff --quiet "$fork_sha" "$merged_tree" -- .github/workflows/; then
  report "Upstream would change workflow files. Review and sync manually; no branch or release was published."
  exit 1
fi

pulls_url="repos/$SYNC_REPOSITORY/pulls"
open="$(gh api --paginate "$pulls_url?state=open&base=$base&per_page=100" --jq \
  '.[] | select(.head.repo.full_name == .base.repo.full_name) | select(.head.ref | startswith("automation/upstream-sync/")) | .html_url')"
if [[ -n "$open" ]]; then
  report "A sync PR is already open; leaving it unchanged."
  exit 0
fi

# Immutable branch for this pair. Never overwrite an open PR or force-push.
branch="$prefix${fork_sha:0:12}-${upstream_sha:0:12}"
ref="refs/heads/$branch"
owner="${SYNC_REPOSITORY%%/*}"
previous="$(gh api --paginate "$pulls_url?state=all&base=$base&head=$owner:$branch&per_page=100" --jq '.[].number')"
if [[ -n "$previous" ]]; then
  report "A PR already exists or was closed for this exact sync candidate."
  exit 0
fi

remote_tip="$(git ls-remote --heads origin "$ref")"
if [[ -n "$remote_tip" ]]; then
  # Reuse a candidate left by a prior PR-creation failure, only if identical.
  git fetch --no-tags origin "$ref"
  candidate="$(git rev-parse FETCH_HEAD)"
  if [[ "$(git show -s --format=%P "$candidate")" != "$fork_sha $upstream_sha" ||
        "$(git rev-parse "$candidate^{tree}")" != "$merged_tree" ]]; then
    report "The candidate branch exists but does not match the expected merge. No branch was overwritten."
    exit 1
  fi
else
  candidate="$(printf 'chore(sync): merge Management Center upstream\n' |
    git -c user.name='github-actions[bot]' \
        -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
        commit-tree "$merged_tree" -p "$fork_sha" -p "$upstream_sha")"
  current_main="$(git ls-remote --heads origin "refs/heads/$base")"
  if [[ "${current_main%%$'\t'*}" != "$fork_sha" ]]; then
    report "Main advanced during synchronization; retry on the next run."
    exit 0
  fi
  git push origin "$candidate:$ref"
fi

compare="https://github.com/$SYNC_REPOSITORY/compare/$base...${branch}?expand=1"
report "Prepared sync branch: $compare"
if ! gh pr create --repo "$SYNC_REPOSITORY" --base "$base" --head "$branch" --draft \
  --title "chore(sync): merge Management Center upstream ${upstream_sha:0:12}" \
  --body "Proposes upstream \`$upstream_sha\` on fork base \`$fork_sha\`. Review, approve the PR CI run if GitHub requires it, and use **Create a merge commit**, not squash or rebase, to retain upstream ancestry. No tag or release was created."; then
  report "Could not create the draft PR. Check the Actions PR-creation policy or open the draft manually from the compare link above."
  exit 1
fi
