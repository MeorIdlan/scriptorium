# scriptorium playbook

playbook-template: v1
Base branch: `main`
Required checks: none

How agents work on this repo. Every gate is a hard stop: don't start the next gate until its pass condition is met. "The dev" is the person directing the work. If `.claude/playbook.local.md` is loaded it adds the task tracker (Trello) and private-notes (vault) details; without it, skip the tracker and notes steps.

## Conventions
- **Branch**: `<type>/<card-shortlink>-<slug>` from fresh `origin/main`, e.g. `feat/aB3dE9fG-tenant-rate-limiting`. Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`. No card: `<type>/<slug>`.
- **Commits**: Conventional Commits, `type(scope): summary`, imperative, ≤72 chars. Body ends with `Trello: <card url>` when there is a card.
- **PRs**: draft by default, target `main`, title is a Conventional Commit summary, body links the card.
- **Design artifacts** (architectural track): spec at `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, plan at `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, both committed on the task branch.
- **TDD** always: failing test first, for every task.

## Gates

### 0. Freshness
A SessionStart hook fetches origin and reports branch state. Read that report before anything else. If it's missing or the fetch failed, run `git fetch --prune origin` yourself and tell the dev the hook needs (re)setup.
**Pass:** origin fetched this session; you know how `main` and the current branch stand.

### 1. Discovery (read-only)
Read the card (description, criteria, checklist, comments); scan the board for related or duplicate cards; look for branches and PRs containing the card shortlink (`git branch -a --list "*<shortlink>*"`, `gh pr list --state all --search "<shortlink>"`) and other branches touching the same area; read the project's notes; explore the affected code.
Present a **discovery summary**: what the task is, related work, risks/blockers, and the proposed **track**:
- **Bounded**: well-scoped change to an existing flow. Design and plan in chat, no files.
- **Architectural**: new subsystem, restructure, or changed interfaces. Spec and plan files.
When in doubt, architectural.
**Pass:** dev confirms the summary and track. Then move the card to `In Progress` and comment the track. Blocked, duplicate or already-done cards stop here unmoved.

### 2. Workspace
Offer **git worktree (strongly recommended)** or a plain branch. If a branch for this card already exists, offer to resume it. Create the workspace immediately from fresh `origin/main` and do all further work inside it. Comment the branch and workspace path on the card.
**Pass:** workspace exists, is clean, and you are working inside it.

### 3. Design (superpowers `brainstorming`)
Ask the dev questions one at a time, propose approaches with a recommendation; build on discovery rather than re-asking. Bounded: short design in chat. Architectural: sectioned design, then the spec file, committed. Hidden complexity upgrades bounded → architectural (stop and say so); never downgrade.
**Pass:** dev explicitly approves the design (bounded) or the written spec (architectural). Comment `Design approved` (+ spec path) on the card.

### 4. Plan (superpowers `writing-plans`)
Bounded: short numbered plan in chat. Architectural: the plan file, committed.
**Pass:** dev explicitly approves the plan. Then add an `Implementation` checklist to the card, one item per plan task, and comment the plan path and task count. Plan changes later need the dev's approval and a matching checklist update.

### 5. Implementation
Ask the dev for the execution method and recommend one: **subagents** (`subagent-driven-development`) for 3+ mostly independent tasks; **inline** (`executing-plans`) for bounded work, short plans, or tightly coupled tasks.
While building: TDD per task; logical commits in the workspace; tick a checklist item only once its task is verified; bugs go through `systematic-debugging`. Comment on the card every few tasks (`Tasks 3/8 done; next: …`), on blockers (`Blocked: <what>, need <decision>`) and on scope changes (dev approves first). Record gotchas in the notes as they're found.
**Pass:** dev chose the method; all plan tasks done and ticked.

### Pre-finalize: verify and review
1. `verification-before-completion`: run the full test suite and linter; read the real output. Failures get fixed, not reported as done.
2. `requesting-code-review` against the spec/plan; handle findings with `receiving-code-review`; re-verify after fixes.
**Pass:** tests and lint clean with evidence, no open findings. Comment results and review summary on the card.

### 6. Finalize (superpowers `finishing-a-development-branch`)
Offer: open a PR (draft), merge locally into `main`, keep the branch, or discard (typed confirmation). Pushing, marking ready, merging and deleting remote branches each need the dev's yes.
The card follows the outcome:
| Outcome | Card |
|---|---|
| PR opened | → `Review`, PR attached, summary comment (tests, files, PR URL, what to check) |
| Merged | ask; on the dev's yes → `Done` |
| Kept | stays `In Progress`, comment why and what's left |
| Discarded | ask: back to `To Do`/`Backlog`, or leave |
Then a notes pass (durable decisions, gotchas, follow-ups, card and PR links; show the dev before committing) and report: card, PR URL, CI status, what to check.

### After merge
Offer to remove the worktree and delete the local branch; do it on the dev's yes (keep the worktree while a PR is open). Review fixes go on the same branch, re-verified. Leftover work becomes a new `Backlog` card (dev approves) or a notes follow-up.

## Scaling down
- Quick question or one-line fix: skip the gates.
- No card: ask whether to create one; if not, run Gates 0, 2–6 without tracker steps.
