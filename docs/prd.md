# Scriptorium: Product Requirements

Version: 1.0 · Updated: 2026-10-11 · Status: Approved

## 1. Overview
Scriptorium is a private fiction-writing workspace that carries a work from first spark to submission-ready manuscript, with opt-in AI help grounded in the writer's own story. It is for writers of novels, short fiction and serials, and runs as a single instance hosted by the dev. Most of the writing pipeline already exists; this PRD sets out what "the entire app working" means (MVP 1), then the next layer of depth and a toggleable game-style UI (MVP 2).

## 2. Problem
Fiction writers lose the thread of a long project: ideas, characters, structure and drafts are scattered across documents, notes apps and spreadsheets, and generic AI tools don't know their story. Scriptorium is one private workspace that keeps all of it together, with AI that is opt-in and grounded in the writer's own material (codex, outline, earlier chapters) rather than replacing their voice.

Today the app covers drafting, scenes, version history, idea capture, a codex, a story map, AI assistance and export. Several features were built recently and haven't been verified in production with a real AI key, and a few pieces a writer needs to finish and safeguard a book are missing: plot threads, a daily goal, manuscript-format export, a writer-run backup, and a way to turn AI off entirely.

## 3. Users and personas
**Novelist (primary).** Writes a multi-chapter novel over months. Goal: get a full draft written, revised and exported without losing track of characters, subplots or earlier text. Pain points: continuity across a long book, dropped subplots, fear of breaking a draft while revising, losing momentum between sessions. Uses Scriptorium on a desktop browser in regular writing sessions. This persona breaks ties when priorities conflict.

**Short/serial writer.** Writes short stories, novellas or web-serial episodes: many small works, exported often. Goal: start, finish and export pieces quickly. Pain points: setup overhead per work, getting clean exports.

**AI-skeptic writer.** Wants the writing tools without any AI. Goal: a complete, pleasant writing app with no AI key and no AI controls in sight. Pain points: AI buttons that fail or nag without a key.

The dev also operates the single instance (deploys, admin user management). That is an operator role, not a persona this PRD designs for.

## 4. Goals and success metrics
| ID | Goal | Metric | Target |
|---|---|---|---|
| G-1 | Every feature works end to end | Each MVP 1 requirement verified in production with a real AI key; known broken flows | 100% verified; 0 known broken flows at MVP 1 exit |
| G-2 | Zero data loss | Words lost through autosave, history, restore or backup failures | 0 incidents; every restore and backup round-trip check passes |
| G-3 | A whole novel can be written in it | The dev drafts, revises and exports a full-length work entirely in Scriptorium after MVP 1 | One complete novel; friction found becomes backlog cards |

## 5. Scope
### In scope
- **MVP 1, the entire app working:** verify every existing feature in production with a real AI key and fix what breaks (including the known chapter double-fetch); plot threads; a daily word goal; manuscript-format export; writer-run backup (per work and whole account, with history, plus a reminder); an AI on/off switch; CI that runs the tests and blocks deploys on failure.
- **MVP 2:** game mode v1 (toggle, Librarium, Study); responsive phone/tablet layout; import and restore from a backup; project targets, deadlines, streaks and session goals; Map structure tools (drag to reorder, editable frameworks, tension inference); Codex depth (unknown-name detection, appearances, relationships, timeline, AI continuity check); writing-flow tools (distraction-free mode, inline comments and TK markers, "what next" help, linked Codex names); removal of the flat-file storage leftovers.
- **Later:** Kindle-ready EPUB with front matter; chapter-range export; game-mode scenes beyond v1 and the servo-skull AI face; replacing the contentEditable editor with TipTap/ProseMirror.

### Out of scope (Won't, this time)
- **Collaboration** (co-authors, sharing a work, real-time editing, beta-reader comments): Scriptorium is a single-author tool; each writer's works stay private to them.
- **Native apps and offline-first sync:** Scriptorium is a web app; mobile reach comes from the responsive layout in MVP 2.
- **Support for third parties self-hosting it:** the repo is public, but only the dev operates an instance; no setup guides or features for other hosts are planned.

## 6. Functional requirements
Existing features (FR-1 to FR-12) are already built. For MVP 1 each is accepted when it has been exercised end to end in production with a real AI key where AI is involved, and every defect found is fixed or carded.

### Accounts and administration
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-1 | Writers register and recover access with an emailed one-time code, sign in with a passkey, manage their passkeys, and stay signed in for the session lifetime | Must | MVP 1 | Register, recover, sign in, add/remove passkey and sign out all work in production |
| FR-2 | The operator (admin) lists and deletes users | Must | MVP 1 | Admin sees verified users; deleting a user removes their data; non-admins get no access |

### Writing
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-3 | Shelves: a grid of the writer's works and a new-work wizard (title, genre, POV, tone, protagonist, premise, optional AI opening hooks) | Must | MVP 1 | A work created through the wizard opens in the Main Room with its opening hook as Chapter 1 when chosen |
| FR-4 | Editor: rich-text chapters with a chapter list, autosave, and chapter and total word counts | Must | MVP 1 | Formatting survives reload; counts match the text; autosave happens without the writer acting |
| FR-5 | Scenes: scene breaks with cards (title, POV, location, status, summary), a Scenes tab, and reordering and moving scenes between chapters | Must | MVP 1 | Breaks and cards survive save, reload, restore and export |
| FR-6 | Version history: automatic and named chapter snapshots, whole-work milestones, a compare view and safe restore | Must | MVP 1 | Restoring keeps a snapshot of the text it replaces; compare shows word-level changes |
| FR-7 | Catch: a capture overlay from anywhere, a per-chapter Catch tab, insert at the cursor, and turning a catch into a Codex entry or Map note | Must | MVP 1 | A catch tagged to a chapter appears first in that chapter's tab and can be inserted or converted |
| FR-8 | Codex: characters, places and world rules, consistency flags on save, AI audit and AI suggestions per entry | Must | MVP 1 | A name mismatch raises a visible flag; audit and suggestions return results with a real key |
| FR-9 | Map: tension curve, beats, acts, chapter notes, scene tick marks and a POV filter | Must | MVP 1 | Values set on the Map show after reload; POV filter narrows scenes |
| FR-10 | Quill AI: Rekindler, hooks, pacing, Polish review (accept/reject per sentence, chapter or selection) and editorial review, all grounded in the story context and showing what context was used | Must | MVP 1 | Each action returns a usable result with a real key and shows its "Context used" line |
| FR-11 | Export a work as PDF, EPUB or DOCX in a reading layout, with the author's name, scene breaks and an optional outline and notes | Must | MVP 1 | Files open without errors in common readers and keep paragraphs and scene breaks |
| FR-12 | Each writer sets their own AI provider, API key, model and generation parameters | Must | MVP 1 | Settings persist per user and are used by every AI action |
| FR-13 | Switching chapters loads the chapter once and never resets text the writer has typed | Must | MVP 1 | Typing immediately after a chapter switch is never lost or overwritten |

### Structure: plot threads
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-14 | The writer creates, edits and deletes named plot threads with a colour, description and status (open or resolved) | Must | MVP 1 | Threads persist per work; deleting one removes its tags |
| FR-15 | The writer marks which scenes or chapters advance a thread | Must | MVP 1 | Tags can be set and cleared where scenes and chapters are edited, and survive scene moves |
| FR-16 | The Map shows one lane per thread across the book, highlighting long gaps where a thread goes untouched and threads still open at the end | Must | MVP 1 | A thread untouched for a long stretch is visibly marked; open threads after the last chapter are listed |
| FR-17 | Threads touched by the current scene or chapter are part of the AI story context | Must | MVP 1 | "Context used" lists the threads included |

### Progress
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-18 | The writer sets a daily word goal and sees today's progress toward it while writing | Must | MVP 1 | Progress updates as they write and resets each day in the writer's timezone |
| FR-27 | The writer sets a total word target and optional deadline for a work and sees a projected finish date and the words per day needed | Should | MVP 2 | Projection updates from actual writing history |
| FR-28 | A calendar of words written per day with the current and longest streak | Should | MVP 2 | Days with writing are marked; streaks count consecutive days |
| FR-29 | The writer sets a goal for the current sitting (words or minutes) and gets a gentle cue on reaching it | Should | MVP 2 | Cue appears once when the goal is met; never blocks writing |

### Export and backup
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-19 | Export DOCX and PDF in standard manuscript format (12 pt serif or monospace, double-spaced, 1-inch margins, indented paragraphs, `#` scene breaks, chapters on new pages) with a title page (author, contact block, title, rounded word count) and a running header (surname / TITLE / page) after the first page, offered alongside the reading layout | Must | MVP 1 | Output matches the format checklist; the reading layout still exports as before |
| FR-20 | The writer downloads a backup of one work as a single archive holding all its data (chapters as HTML and Markdown, scenes, Codex, Map, catches, plot threads, work settings, snapshots and milestones) and a machine-readable manifest | Must | MVP 1 | Archive contents match the work; the manifest is versioned so MVP 2 import can read it |
| FR-21 | The writer downloads a backup of every work they own in one action | Must | MVP 1 | Contains one complete work backup per owned work |
| FR-22 | The writer is reminded to back up a work they haven't backed up for a while | Must | MVP 1 | Reminder appears after the threshold and clears after a backup |
| FR-26 | The writer restores a work from a backup archive, as a new work or replacing an existing one | Should | MVP 2 | A backup from FR-20 round-trips to an identical work |
| FR-42 | Kindle-ready EPUB with front matter (title page, copyright, dedication, table of contents) | Could | Later | Passes common EPUB validation |
| FR-43 | Export a chosen range of chapters | Could | Later | Only the selected chapters appear |

### AI control
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-23 | A setting turns AI features on or off; AI is off until the writer sets a key, and when off every AI control is hidden while all other features keep working | Must | MVP 1 | With AI off no AI button, panel or prompt is visible anywhere and no request reaches a provider |

### Map and structure tools
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-30 | Drag to reorder chapters and scenes on the Map | Should | MVP 2 | New order persists and matches the Main Room |
| FR-31 | Editable story frameworks: pick Save the Cat, Hero's Journey or Kishōtenketsu, or define custom beats | Should | MVP 2 | The beat row follows the chosen framework |
| FR-32 | Suggest tension scores from the chapter text | Should | MVP 2 | The writer can accept or override each suggestion |

### Codex depth
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-33 | Find capitalised names in the text that aren't in the Codex and offer to add them | Should | MVP 2 | Adding one creates an entry; dismissing hides it |
| FR-34 | Each Codex entry lists the chapters it appears in | Should | MVP 2 | Counts include aliases |
| FR-35 | Record relationships between characters | Should | MVP 2 | Relationships show on both characters |
| FR-36 | Record timeline facts (when events happen) | Should | MVP 2 | Facts are listed in story order |
| FR-37 | An AI continuity check of a chapter against the Codex that creates real flags | Should | MVP 2 | Flags appear alongside consistency flags |

### Writing flow
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-38 | Distraction-free / typewriter mode | Should | MVP 2 | Hides all chrome; Esc returns |
| FR-39 | Inline comments and `TK` markers in the text, with a list to jump between them | Should | MVP 2 | Markers are excluded from manuscript export |
| FR-40 | "I'm stuck / what next": the AI offers three possible directions, not prose | Should | MVP 2 | Returns three distinct directions grounded in the story context |
| FR-41 | Codex names in the text link to their entries | Should | MVP 2 | Clicking a name opens the entry |

### Interface
| ID | Requirement | Priority | Release | Acceptance notes |
|---|---|---|---|---|
| FR-24 | Game mode v1: a switch between the classic UI and an illustrated gothic UI, with the Librarium (Shelves) and the Study (Main Room) as scenes; other rooms render their classic page inside the game frame | Should | MVP 2 | The writer can switch modes at any time; writing uses the same editor in both |
| FR-25 | Responsive layout so every room is usable on phones and tablets | Should | MVP 2 | All rooms usable at 390 px wide without horizontal scrolling |
| FR-44 | Game-mode scenes for Map, Codex, Catch and Settings, and the servo-skull as the face of the AI assistant | Could | Later | Each room has its own scene |

## 7. Non-functional requirements
| ID | Category | Requirement | Priority | Release |
|---|---|---|---|---|
| NFR-1 | Data safety | Autosave loses at most about 5 seconds of typing; a save never overwrites newer text; restore always snapshots the current text first; a nightly server-side database dump is kept | Must | MVP 1 |
| NFR-2 | Privacy and security | Every work-scoped request checks the work belongs to the signed-in writer; AI keys are never logged or sent back to the browser in full; text goes to an AI provider only when the writer starts an AI action | Must | MVP 1 |
| NFR-3 | Performance | The editor stays responsive on a 150,000-word work; switching chapters takes under 1 second; AI actions show progress and end cleanly within 100 seconds | Must | MVP 1 |
| NFR-4 | Quality | Server and client test suites run in CI on every push and pull request, and a failure blocks the deploy; new features ship with tests | Must | MVP 1 |
| NFR-5 | Platforms | Current Chrome, Edge, Firefox and Safari on desktop at 1024 px or wider | Must | MVP 1 |
| NFR-6 | Accessibility | Every action works from the keyboard with visible focus; text meets WCAG AA contrast on the dark theme | Must | MVP 1 |
| NFR-7 | Reliability | With AI off, no screen errors, goes blank or waits on an AI provider | Must | MVP 1 |
| NFR-8 | Accessibility | Respect the operating system's reduced-motion setting (animations become instant fades) | Should | MVP 2 |

## 8. Constraints and dependencies
- **Stack (kept):** React 18 + Vite client; Express (ESM) + MongoDB/Mongoose server; plain CSS; passkey + email one-time-code auth; AI through the writer's own Anthropic or OpenAI key; pdfkit, nodepub and docx for export. Tests use Node's built-in runner (`node --test`), with `linkedom` as the client DOM. No linter.
- **Hosting:** one instance, operated by the dev, on a droplet behind a Cloudflare Tunnel with a shared MongoDB. A push to `main` builds images and deploys. nginx and the tunnel allow requests up to 100 seconds.
- **External services:** Mailgun for code emails; AI provider APIs and their rate limits, billed to each writer's key.
- **Game-mode art:** painted backdrops are sourced by the dev; a CSS fallback scene renders until they exist.
- **Known technical limits:** EPUB builds must run one at a time and need a cover image (nodepub). Chapter text is sanitized HTML with scene markers; replacing the editor model (TipTap) is deferred to Later.
- **Technical clean-up:** remove the flat-file storage leftovers (`clean-data.sh`, `server/data/`) in MVP 2.
- **Process:** one developer (the dev); work follows the repo playbook's gates with TDD; no deadline or budget cap.

## 9. Release plan
### MVP 1
The entire app working. FR-1 to FR-23 and NFR-1 to NFR-7. Exit when G-1 is met.
### MVP 2
FR-24 to FR-41 and NFR-8.
### Later
FR-42 to FR-44, and the TipTap editor migration.

## 10. Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Production verification finds more broken features than expected and swallows MVP 1 | Medium | High | Each verification story has a time limit; each defect found becomes its own bug card |
| AI cost and rate limits on the dev's key during verification and summary generation | Medium | Medium | Verify on a small test work first; summaries are generated only when needed |
| Whole-account backups with history become large and slow | Medium | Medium | Measure on a large work; size and streaming decided in the backup story's Gate 3 |
| The contentEditable editor strains as more features build on chapter HTML (scenes, threads, comments, TK markers) | Medium | High | Each feature keeps markers compatible with the sanitizer; revisit TipTap if defects cluster |
| Game-mode art isn't ready when MVP 2 work starts | Medium | Low | The CSS fallback scene must look acceptable on its own |

## 11. Open questions
- **Q-1.** Do plot threads attach to scenes only, or to chapters too? Owner: plot-thread data model story, Gate 3. Blocks: FR-14, FR-15.
- **Q-2.** Is the daily word goal set per writer or per work? Owner: daily-goal story, Gate 3. Blocks: FR-18.
- **Q-3.** What backup archive format and manifest version will MVP 2 import rely on? Owner: per-work backup story, Gate 3. Blocks: FR-20, FR-26.
- **Q-4.** Is the backup reminder in-app only, or also by email, and after how many days? Owner: backup reminder story, Gate 3. Blocks: FR-22.
- **Q-5.** Does the nightly database dump already run on the droplet, and how long is it kept? Owner: the dev. Blocks: closing NFR-1.

## 12. Changelog
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-11 | Initial PRD |
