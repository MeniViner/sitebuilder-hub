# SiteBuilder Hub final rollback and branch map

| Reference | Value |
| --- | --- |
| Pre-merge `main` | `5685903b64ccf709fb872522e4e71683b6af9eb7` |
| Safety branch | `backup/main-before-hub-simplification-finalization-2026-07-19` |
| Integration source | `codex/hub-simplification-hardening-integration` at `0c7ed6a1d15864419f716ac56a547454baa93a63` |
| Product stabilization source | `codex/hub-product-simplification-stabilization` at `368e841bc5162f1da20c2afeaa0f9530e0394389` |
| Included Mongo S0/S1 | `00fb922` |
| Excluded Mongo/S2 families | `39857a2` and `321d9f2` branches/worktrees |
| Release tag | `sitebuilder-hub-simplified-s0s1-rc1` (local only) |

`main` was fast-forwarded from the safety SHA to the approved integration source. The release tag identifies the final local RC packaging commit; its provenance is the integration SHA above. No source branch or worktree was deleted. The separate Builder hardening/data repository remains separate and is not absorbed by HUB.

## Rollback

Do not reset, clean, stash, overwrite, or delete pre-existing untracked files, the existing local development Mongo volume, source branches, or the active Mongo worktrees. To return local `main` to its pre-merge reference after review, first ensure the worktree is clean apart from the documented user-owned files, then move only the local branch pointer to `backup/main-before-hub-simplification-finalization-2026-07-19` using a reviewed Git operation. To preserve shared history instead, create a normal revert commit for the fast-forwarded commit range. Do not push either action without separate authorization.

Keep the safety branch, integration branch, stabilization branch, and release tag through staging sign-off. S2/no-go and production-evidence work remain independent and must not be merged by this RC process.
