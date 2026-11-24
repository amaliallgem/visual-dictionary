# Notes for Claude

## Change log
After every change you make to this repo, add an entry at the top of CHANGELOG.md with:
- Date and branch
- What changed and why (1–3 lines, plain language)
- Files affected
Include the CHANGELOG.md update in the same commit as the change.

## Project basics
- Static site in `site/` (no build step). Data lives in the CSVs in `data/`; run `python3 scripts/build.py` after editing them to validate and regenerate `site/data/catalog.json`.
- Preview locally: `python3 -m http.server 8765 --directory site`.
- Approved example submissions are committed to `main` by GitHub Actions, so `git pull` before making changes.
