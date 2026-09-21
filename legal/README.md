# legal/

The single source of truth for FAULT's player-facing legal documents.

**These are not lawyer-certified.** They were drafted to be accurate to what
the code actually does (checked against `server/src` and `mobile/lib` at the
time of writing) and reasonable for a small studio's first launch. Have a
qualified lawyer in your jurisdiction review them before relying on them, and
fill in every `[BRACKETED PLACEHOLDER]` — the governing law, the company's
registered address, the DMCA agent — before submitting to either store.

## Files

| File           | Served at          | In-app            |
| -------------- | ------------------ | ----------------- |
| `terms.md`     | `/legal/terms`     | `/legal?doc=terms`     |
| `privacy.md`   | `/legal/privacy`   | `/legal?doc=privacy`   |
| `dmca.md`      | `/legal/dmca`      | `/legal?doc=dmca`      |
| `community.md` | `/legal/community` | `/legal?doc=community` |
| `VERSION`      | —                  | —                 |

## Changing a document

1. Edit the `.md` file here. Nothing else.
2. If the change is material (anything a player would want to know before
   agreeing), bump `VERSION` to today's date. Every signed-in player whose
   recorded consent is older is shown the consent gate on their next launch.
3. Run `node tools/legal/sync.mjs` from the repo root. It regenerates
   `server/src/lib/legalText.ts` and `mobile/lib/legalText.ts`, which is how
   the same text — and the same `LEGAL_VERSION` — reaches both the server and
   the app without either reaching outside its own build context. The server
   test suite fails if the generated files drift from this folder.

Lines inside `<!-- -->` comments are stripped by the sync script and never
reach a player.
