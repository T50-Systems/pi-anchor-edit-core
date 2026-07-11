# Release and recovery

## Preconditions

A release is built only from a reviewed commit already merged to protected `main`. Before proposing a tag:

1. move the release notes from `[Unreleased]` to a level-two section whose heading exactly matches the `package.json` version (for example, `## 0.2.0` or `## [0.2.0]`);
2. run `npm ci`, `npm run check`, `npm run test:coverage`, `npm audit --audit-level=high`, and `npm run verify:package`;
3. confirm the required Ubuntu, Windows, macOS, and Node 24 compatibility checks passed on the merge commit; and
4. create an annotated `vX.Y.Z` tag that exactly matches the package version, then push that new tag once.

The tag workflow repeats validation, extracts notes from the matching changelog section, creates the npm-format tarball from the tagged commit, retains it as a workflow artifact, and creates one GitHub release with that tarball attached. It does not publish to the npm registry.

## Immutable tags and releases

Never move, force-push, delete, or reuse a released tag. The workflow refuses to overwrite an existing GitHub release. If a tag was created from the wrong commit but has not been pushed, delete the local tag and recreate it. Once pushed, treat the tag as immutable and prepare a new patch version instead.

## Recovery

- **Validation fails before release creation:** correct the source through a new reviewed pull request, increment the package version, add a matching changelog section, and create a new tag.
- **Artifact upload fails:** rerun the failed workflow job for the same immutable commit only if no GitHub release was created. If state is uncertain, inspect the Actions run and `gh release view vX.Y.Z` before retrying.
- **Release creation fails after artifact upload:** do not rewrite the tag. Correct permissions or transient service problems and rerun against the same tagged commit after confirming no release exists.
- **A defective release is already public:** preserve the release and tag as evidence, mark the release notes as affected if necessary, and ship a corrected patch version. Do not silently replace its attached tarball.

Emergency changes follow the same pull-request and validation path. Administrators must not bypass required checks; an urgent correction is a narrowly scoped reviewed pull request followed by a new immutable patch release.
