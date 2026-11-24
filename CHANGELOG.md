# Changelog

Newest entries first.

## 2026-11-24 · main
Started this changelog and added CLAUDE.md, which asks for an entry here with every change. Entries below were filled in from the earlier commit history.
- Files: `CHANGELOG.md`, `CLAUDE.md`

## 2026-11-19 · main
Added Hassi Messaoud (onshore oil and gas field) from approved submission #2, committed automatically by the approval workflow.
- Files: `data/catalog.csv`

## 2026-11-19 · main
Fixed approvals made close together failing: the approval workflow now starts from the latest `main` and retries the save if `main` changes underneath it. Failure comments now say whether the submission or the save failed.
- Files: `.github/workflows/add-example.yml`

## 2026-11-19 · main
Added Galkynysh (onshore oil and gas field) from approved submission #1, committed automatically by the approval workflow.
- Files: `data/catalog.csv`

## 2026-11-18 · main
First version of the visual dictionary: a static web app with live Esri satellite maps, 80 infrastructure types in 10 categories, 90 example locations drawn mostly from Global Energy Monitor data, an "Add an example" page, and workflows to publish the site and add approved submissions.
- Files: `site/`, `data/`, `scripts/`, `.github/workflows/`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`
