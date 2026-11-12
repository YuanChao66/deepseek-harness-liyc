# Domain docs

How the engineering skills consume this repository's domain documentation.

## Before exploring, read these

- **`docs/glossary.md`** — the authoritative domain vocabulary, one canonical term per concept. `docs/glossary.zh.md` is its Chinese pair and `docs/glossary.i18n.yaml` records the pairing.
- **`.agents/notes/implemented/`** — active decision records: the why and what was given up. Read the notes that touch the area you are about to work in; `architecture/` holds cross-cutting decisions, `process/` holds workflow decisions.
- **`.agents/notes/archived/`** — frozen history. Read for provenance only; never treat an archived note as current authority.

There is no root `GLOSSARY.md` and no `docs/adr/`. New terminology goes into `docs/glossary.md` with its Chinese pair; new decisions become an Agent Note following `.agents/notes/README.md`.

## Use the glossary's vocabulary

When your output names a domain concept — an issue title, a refactor proposal, a hypothesis, a test name — use the term as defined in `docs/glossary.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need is missing, that is a signal: either you are inventing language the project does not use, or there is a real gap worth noting for `/domain-modeling`.

## Flag decision conflicts

If your output contradicts an implemented Agent Note, surface it rather than silently overriding it:

> _Contradicts `.agents/notes/implemented/architecture/2026-08-08-client-tool-presentation-ownership.md`, but worth reopening because…_