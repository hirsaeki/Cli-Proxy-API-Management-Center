# Publish a Management Center fork release from GitHub

After the workflow is on the fork's `main`, open **Actions → Publish Management
Center fork → Run workflow** in the fork. Select `main`, enter an unused tag in
`vX.Y.Z-fork.N` form (for example, `v1.28.3-fork.1`), and select **Run workflow**.
No local clone or personal access token is needed.

The run verifies and builds the exact selected commit, then publishes the same
`management.html` as a stable, latest GitHub Release. Do not start the workflow
unless you intend to publish: a CPA instance configured to use this fork may
pick up the newly published asset automatically. The existing tag-push release
workflow remains unchanged.

An existing tag or release (including a draft) is an error. If publishing fails
after tag creation, first inspect that tag and any draft release. Do not retry
with the same tag or move/delete it automatically. After confirming that
nothing was published, use a new unused tag, or complete the existing draft
manually only after verifying the asset and the tagged commit.
