# Github Actions Overview

Only one workflow is enabled in this repository:

- **release-vsix.yml**: Builds the extension and publishes the `.vsix` to
  [GitHub Releases](https://github.com/ChambersXDU/overleaf-workshop-sysu/releases)
  when a version tag (`v*`) is pushed. Can also be run manually via
  *workflow_dispatch*.

Release procedure:

```bash
# bump "version" in package.json, update CHANGELOG.md, commit, then:
git tag v0.15.14
git push origin master --tags
```

There are intentionally no scheduled workflows and no per-push/per-PR builds.
