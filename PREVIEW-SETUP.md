# Pull-request preview setup

The source repo publishes PR builds to a separate GitHub Pages repository so preview changes cannot replace the production `dey.ci` site.

## One-time setup

1. Create a public repository named `ReubeyWynne/kingslop-preview` and initialise it with a `main` branch.
2. In that repo, enable **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. Point `preview.dey.ci` at the Pages host in DNS (CNAME to `ReubeyWynne.github.io`). The workflow writes `CNAME` with `preview.dey.ci` on every deploy.
4. Create a fine-grained GitHub personal access token scoped **only** to `ReubeyWynne/kingslop-preview`, with **Contents: Read and write**. No other repository permissions are required.
5. In `ReubeyWynne/kingslop`, add that token as an Actions repository secret named `PREVIEW_DEPLOY_TOKEN`.
6. Merge the workflow PR. The next same-repository pull request will build automatically and publish to `https://preview.dey.ci/pr-N/`.

## Behaviour

- PR code is built in a job that does **not** receive `PREVIEW_DEPLOY_TOKEN`.
- Only the resulting static `_site` artifact is handed to the deployment job.
- Each PR owns one directory (`pr-N/`) in the preview repo, so updating one preview does not replace another.
- Preview HTML receives `noindex,nofollow` and the preview host carries `.nojekyll`.
- The workflow creates or updates one bot comment on the PR with its preview URL.
- Closing or merging the PR removes its directory and updates the bot comment.
- Fork PRs are intentionally skipped because they must not receive cross-repository deployment credentials.

## Preview URL model

A production path such as:

`https://dey.ci/bear-hunt/`

becomes, for PR 12:

`https://preview.dey.ci/pr-12/bear-hunt/`

The site mostly uses relative asset and navigation paths, so the complete built tree can live below the PR prefix without rewriting those links. During the preview build, Jekyll's `site.url` is set to the PR-prefixed preview URL so canonical/hreflang URLs also point at the preview build.
