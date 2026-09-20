# Commit message conventions

Use Conventional Commits. Format:

    <type>(<scope>): <summary>

    <body>

## Subject line

- `type` is one of: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`, `ci`.
- `scope` is the area touched, from the folder: `server` (Express API in `demo/server`),
  `web` (React client in `demo/src`), `data` (JSON under `demo/server/data`), `scripts`
  (`scripts/`), `deps`, or `repo` for root config. Omit the scope if a change spans many.
- Imperative mood, lower-case, no trailing period, at most 72 characters.
  Good: `feat(server): add satiation penalty to match score`.
  Bad: `Added satiation penalty.` / `Updates`.
- If the branch name contains a Jira key (e.g. `MM-12`), prefix the summary with it:
  `feat(web): MM-12 add mood chips to feed`.

## Body

- Explain *why* and any behaviour change, not a list of files edited.
- Use short `-` bullets, one per distinct change; wrap at 72 characters.
- If tests were added or changed, say so in one bullet (e.g. `- 3 new match.test.js cases`).
- If a command in `README.md` changed, mention the README update.
- Skip the body entirely for trivial changes (typos, formatting, single-line fixes).

## Do not

- Do not mention Copilot, AI, or "generated" in the message.
- Do not restate the diff line by line.
- Do not use emoji.
