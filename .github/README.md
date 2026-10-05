# Checks and previews

Pull requests run **Site check**: JavaScript syntax, site-data JSON, troop allocation, and one Jekyll build. New commits cancel an older check for the same pull request. There is no duplicate check on pushes to `main`; GitHub Pages builds and deploys the merged site.

For layout or interaction changes, run **Visual preview** from the repository's Actions tab using **Run workflow** and select the branch to review. It builds once, installs Chromium once, and runs the Bear Hunt, Events, and remaining-page suites. The built site, screenshots, and reports are kept together in the `visual-preview` artifact for seven days.

Manual workflow dispatch becomes available after this workflow is merged into the default branch. The visual suites remain in `.dsh/` and can also run locally against `_site/` with Playwright installed.

GitHub Pages deployment is separate from these checks. A deployment queued before any job steps start is waiting for a GitHub-hosted runner; changing the PR checks does not release that queue.
