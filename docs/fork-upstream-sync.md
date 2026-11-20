# Management Center fork upstream sync

The workflow proposes a draft pull request from an integration branch when
`router-for-me/Cli-Proxy-API-Management-Center:main` advances. It runs daily at
03:37 UTC and can also be started manually from this fork's `main`. Nothing runs
until the workflow is on the default branch and GitHub Actions is enabled.

- If the tips are already in sync, no branch or PR is created.
- If a merge conflicts or would change upstream workflow files, the job fails
  with a run summary. Resolve or review those changes on a separate branch.
- No incoming code is executed by the sync job. It tests the trusted sync
  script against local fixtures, then proposes a merge for human review.
- An open sync PR is left unchanged. After review, choose **Create a merge
  commit**, not squash or rebase, so future runs can recognize upstream
  ancestry. Never close a PR simply to keep it up to date; finish review
  first and let the next run pick up subsequent upstream commits.

The workflow uses only the repository's built-in `GITHUB_TOKEN`, scoped to
contents and pull requests in its one job. GitHub's repository policy may
block automatic PR creation. The integration branch and compare link in the
run summary let a maintainer create the draft manually. If GitHub requires
approval for the resulting PR CI, choose **Approve workflows to run** on the
PR before reviewing CI. Do not merge without reviewing the changes and CI.

This does not change the release process, create tags, or publish
`management.html`. The existing tag-triggered release process remains a
separate operation.
