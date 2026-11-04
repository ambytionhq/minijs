# claude instructions

make sure you read the handoff documents to pick up where the last session left off.

## releasing

CI (tests, site build, desktop check) does not run on plain pushes to main. It runs on pull requests, by hand (`gh workflow run CI`), and as the first job of the release workflow. Installers for all platforms build only when a `v*` tag is pushed. So testing happens locally (`npm test`, dev server in the browser) before a release.

When the user says to make a release, do all of this without asking for each step (confirm the version number if they did not give one; new features are a minor bump, fixes a patch bump):

1. Check `git status` is clean apart from what belongs in the release, and `npm test` passes.
2. Bump the version in every place, to the same number: root `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, and the lockfiles (`npm install --package-lock-only`; `Cargo.lock` if it changes). The release workflow only reads root `package.json` and fails if the tag differs, but keep them all in sync.
3. Commit the bump ("Release X.Y.Z") BEFORE tagging. Tagging first puts the tag on a commit with the old version and the release fails. Verify with `git show vX.Y.Z:package.json | grep version` after tagging.
4. `git tag vX.Y.Z && git push origin main vX.Y.Z`.
5. `gh run list --limit 3`, then `gh run watch <Release desktop app run id>`. It builds a draft, publishes only after all four updater targets are signed, then checks `latest.json`. Report the result and the release URL.
6. If it fails: fix the cause, delete the bad tag (`git push origin :refs/tags/vX.Y.Z && git tag -d vX.Y.Z`), delete any draft release (`gh release delete vX.Y.Z --yes`), commit the fix, and re-tag. Never leave a tag that points at a broken commit.
7. Add a handoff entry.
