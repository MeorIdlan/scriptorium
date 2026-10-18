# scriptorium playbook

playbook-template: v4
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
Each gate pass is recorded as a card comment `[gate:<n>] <summary>` (`<n>` = `0`–`6`, `verify`, `merged`, `closed`), posted only for approvals the dev actually gave. A new session resumes from the latest tag, checked against the branch, files and checklist. After each approval in Gates 3–5 and every few completed tasks, sync the card (`/task-sync` when available).

### 0. Freshness
A SessionStart hook fetches origin and reports branch state. Read that report before anything else. If it's missing or the fetch failed, run `git fetch --prune origin` yourself and tell the dev the hook needs (re)setup.
**Pass:** origin fetched this session; you know how `main` and the current branch stand.

### 1. Discovery (read-only)
Read the card (description, comments, and every checklist: `Subtasks`, `Acceptance`, any `Implementation`); scan the board for related or duplicate cards; look for branches and PRs containing the card shortlink (`git branch -a --list "*<shortlink>*"`, `gh pr list --state all --search "<shortlink>"`) and other branches touching the same area; read the project's notes; explore the affected code.
Present a **discovery summary**: what the task is, the card's subtasks and acceptance criteria word for word (numbered `S1…`, `A1…`), related work, risks/blockers, and the proposed **track**:
- **Bounded**: well-scoped change to an existing flow. Design and plan in chat, no files.
- **Architectural**: new subsystem, restructure, or changed interfaces. Spec and plan files.
When in doubt, architectural.
**Pass:** dev confirms the summary and track. Then move the card to `In Progress` and comment the track. If the card's acceptance criteria are only in its description, copy them verbatim into an `Acceptance` checklist. Blocked, duplicate or already-done cards stop here unmoved.

### 2. Workspace
Offer **git worktree (strongly recommended)** or a plain branch. If a branch for this card already exists, offer to resume it. Create the workspace immediately from fresh `origin/main` and do all further work inside it. Comment the branch and workspace path on the card.
**Pass:** workspace exists, is clean, and you are working inside it.

### 3. Design (superpowers `brainstorming`)
Ask the dev questions one at a time, propose approaches with a recommendation; build on discovery rather than re-asking. Bounded: short design in chat. Architectural: sectioned design, then the spec file, committed. Hidden complexity upgrades bounded → architectural (stop and say so); never downgrade.
**Pass:** dev explicitly approves the design (bounded) or the written spec (architectural). Comment `Design approved` (+ spec path) on the card.

### 4. Plan (superpowers `writing-plans`)
Bounded: short numbered plan in chat. Architectural: the plan file, committed.
The plan covers the card: each task names the subtasks it delivers (`→ S2`), every subtask is delivered by at least one task, and every acceptance criterion names the test or check that proves it. Anything not covered is shown to the dev as a proposed descope.
**Pass:** dev explicitly approves the plan. Then add an `Implementation` checklist to the card, one item per plan task with its subtask links, and comment the plan path and task count. Plan changes later need the dev's approval and a matching checklist update.

### 5. Implementation
Ask the dev for the execution method and recommend one: **subagents** (`subagent-driven-development`) for 3+ mostly independent tasks; **inline** (`executing-plans`) for bounded work, short plans, or tightly coupled tasks. Both modes follow `docs/agent-workflow.md` (agent roles, dispatch rules, review).
While building: TDD per task; logical commits in the workspace; tick an `Implementation` item only once its task is verified, and tick a subtask as soon as all the items linked to it are ticked; bugs go through `systematic-debugging`. Comment on the card every few tasks (`Tasks 3/8, subtasks 2/4 done; next: …`), on blockers (`Blocked: <what>, need <decision>`) and on scope changes (dev approves first). Record gotchas in the notes as they're found.
**Pass:** dev chose the method; all plan tasks done and ticked; every subtask ticked or descoped with the dev's OK.

### Pre-finalize: verify and review
1. `verification-before-completion`: run the full test suite and linter; read the real output. Failures get fixed, not reported as done.
2. `requesting-code-review` against the spec/plan; handle findings with `receiving-code-review`; re-verify after fixes.
3. Walk the acceptance criteria: tick each one with its evidence (test name, command output, CI run). Criteria that can only be checked after merge are marked as such, not ticked.
**Pass:** tests and lint clean with evidence, no open findings, every acceptance criterion ticked, descoped or marked after-merge. Comment results, review summary and criteria evidence on the card.

### 6. Finalize (superpowers `finishing-a-development-branch`)
Offer: open a PR (draft), merge locally into `main`, keep the branch, or discard (typed confirmation). Pushing, marking ready, merging and deleting remote branches each need the dev's yes.
The card follows the outcome:
| Outcome | Card |
|---|---|
| PR opened | → `Review`, PR attached, summary comment (tests, files, PR URL, what to check) |
| Merged | check after-merge criteria; ask; on the dev's yes → `Done` |
| Kept | stays `In Progress`, comment why and what's left |
| Discarded | ask: back to `To Do`/`Backlog`, or leave |
Then a notes pass (durable decisions, gotchas, follow-ups, card and PR links; show the dev before committing) and report: card, PR URL, CI status, what to check.

### After merge
Check and tick any after-merge acceptance criteria; a card goes to `Done` only with every criterion ticked or descoped. Offer to remove the worktree and delete the local branch; do it on the dev's yes (keep the worktree while a PR is open). Review fixes go on the same branch, re-verified. Leftover work becomes a new `Backlog` card (dev approves) or a notes follow-up.

## Scaling down
- Quick question or one-line fix: skip the gates.
- No card: ask whether to create one; if not, run Gates 0, 2–6 without tracker steps.
