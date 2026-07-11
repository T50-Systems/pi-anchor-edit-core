# Main branch protection policy

Repository administrators should configure `main` with all of the following controls:

- require a pull request before merging, including administrators;
- require at least one approving review and dismissal of stale approvals after new commits;
- require conversation resolution and branches to be up to date before merge;
- require these exact stable CI contexts:
  - `ubuntu-latest / Node 22`
  - `windows-latest / Node 22`
  - `macos-latest / Node 22`
  - `ubuntu-latest / Node 24`
- prohibit force pushes and branch deletion; and
- apply enforcement to administrators.

A failing or missing required check blocks merge. After changing workflow job names, first observe the new contexts on a pull request, then update protection in a reviewed administrative change so protection never silently points at nonexistent checks.

## Read-only verification

Administrators can inspect the effective configuration without changing it:

```bash
gh api repos/T50-Systems/pi-anchor-edit-core/branches/main/protection \
  --jq '{required_status_checks,required_pull_request_reviews,enforce_admins,allow_force_pushes,allow_deletions}'
```

Verification passes only when pull-request reviews are non-null, `strict` is true, required contexts are non-empty and exactly match the supported CI jobs, `enforce_admins.enabled` is true, and force-push/deletion flags are false.

## Emergency and release procedure

Urgency does not authorize a direct push or skipped validation. Prepare a narrowly scoped branch, obtain the required review, run every required check, and merge the up-to-date pull request. Releases are created from the validated `main` commit under [`RELEASING.md`](RELEASING.md). If GitHub Actions is unavailable, wait for service recovery or document an explicit owner-approved temporary ruleset change in a public audit trail; restore and verify the policy before any further merge. Never move an existing release tag.
