# @johto/card-data

Pokemon TCG card database for [@johto/cli](https://www.npmjs.com/package/@johto/cli).

Ships a prebuilt SQLite database of all Pokemon TCG cards. Also includes the deterministic JSON-to-SQLite rebuild pipeline for advanced users.

## Rebuild (advanced)

Requires Bun >= 1.3 on PATH:

```bash
johto-card-data-rebuild --source ./path/to/pokemon-tcg-data --out ./pokemon-data.sqlite3.db
```
