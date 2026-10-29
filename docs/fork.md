# Fork

This repository is Sergei Dyshel's personal fork of [getpaseo/paseo](https://github.com/getpaseo/paseo). `origin` is the fork, `upstream` is getpaseo. This doc owns the branch shape, the rebase procedure, and the "Fork changes" section of `README.md`. The README itself says nothing about being a fork; that is for agents and contributors, who read this doc and `CLAUDE.md`.

## Branch shape

`main` is the latest upstream stable release tag plus a stack of fork commits. It is rebased onto each new release, never merged, so `git log vX.Y.Z..main` is always exactly the fork. After a rebase, `origin/main` is force-pushed.

Fork commits are one of two kinds:

- **Own** — authored here.
- **Cherry-picked** — taken from `upstream/main` or an open upstream PR ahead of a release. Always `git cherry-pick -x` so the message records the source SHA; that line is how the next rebase knows what to drop and how the README bullet finds its PR link.

Commits that only touch docs, tests, formatting, or refactors are fine on the stack but do not get a README bullet.

## Rebasing onto a new release

The base tag is not written down anywhere; it changes with every rebase, and a copy would drift. Read it from git: `git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' main`. Fork commits are never tagged, so the nearest stable tag reachable from `main` is the base.

1. `git fetch upstream --tags`.
2. Pick the new base: `git tag --sort=-creatordate | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1`. Stable tags only; betas are not a base.
3. `git rebase --onto vNEW vOLD main`. Git drops cherry-picks whose patch now matches a commit in the new base. A cherry-pick upstream merged with changes survives; find those with `git cherry -v upstream/main main vNEW` (`-` means upstream has an equivalent) and drop them with `git rebase -i`.
4. Resolve conflicts. If `package-lock.json` changed, run `npm install`; the first install after a `patches/` change can fail, see [docs/development.md](development.md). Then `npm run typecheck` and `npm run lint`. The pre-commit hook typechecks each commit, so the stack must compile commit by commit, not only at the tip.
5. Remove README bullets whose commits were dropped. A cherry-pick that upstream released leaves the list; it is upstream now.
6. `git push --force-with-lease origin main`.

## The "Fork changes" section

A `## Fork changes` heading between `<!-- fork-changes:start -->` and `<!-- fork-changes:end -->`, placed after the README's HTML preamble (logo, badges, hero images) and before upstream's first paragraph. Nothing of upstream's lives inside the markers, so a rebase conflicts there only when upstream edits the lines on either side.

Three `###` groups, in this order:

| Group                           | What goes in it                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Features**                    | Behaviour a user of the app, daemon, or CLI sees.                                                                                                       |
| **Development**                 | What a contributor runs: npm scripts, build variants, tooling and typecheck changes.                                                                    |
| **Cherry-picked from upstream** | Every cherry-pick, whichever kind it is. Listed separately because these leave the list once the base release includes them; the other two groups stay. |

- One bullet per change. Commits with the same purpose share one bullet; two-way title sync is two commits and one bullet.
- Write what the user sees, not the mechanism. "Double-click a tab to rename it", not "add `isDoubleClickPress` helper".
- One line each. Name the command, menu item, or label the user will look for, in backticks or quotes.
- Cherry-picked bullets end with a link to the upstream PR. Find it from the `(cherry picked from commit …)` line: `gh pr list --repo getpaseo/paseo --search <sha> --state all`.
- No upstream version numbers, dates, commit hashes, or author names. The version changes with every rebase and would be wrong within weeks.
- No prose about the fork, its maintenance, or this doc. The README is for people using the software.

Update the section in the same commit as the change it describes. A feature commit without its bullet is incomplete, the same way a feature commit without its test is.

Verify before a rebase or a push with `git log --oneline $(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' main)..main`. Every `feat` or behaviour-changing `fix` has a bullet; every bullet has a commit.
