#!/usr/bin/env python3
"""Append example rows from a GitHub issue to data/catalog.csv.

Used by .github/workflows/add-example.yml when a maintainer adds the
`approved` label to an issue created from the app's "Add an example" page.

Reads the issue body (env ISSUE_BODY), takes the first ```csv block, checks
the header, gives each row a free id if its id is already taken, and appends
the rows, and adds an entry at the top of CHANGELOG.md (env ISSUE_NUMBER and
BRANCH name the issue and branch). Prints a short Markdown report and writes it to $GITHUB_OUTPUT as
`report`. Exits 1 if nothing could be added.
"""
import csv
import datetime
import io
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "catalog.csv"
CHANGELOG = ROOT / "CHANGELOG.md"


def add_changelog_entry(added):
    """Insert an entry at the top of CHANGELOG.md (below its header)."""
    if not CHANGELOG.exists():
        return
    number = os.environ.get("ISSUE_NUMBER", "").strip()
    branch = os.environ.get("BRANCH", "").strip() or "main"
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    type_names = {}
    taxonomy = ROOT / "data" / "taxonomy.csv"
    if taxonomy.exists():
        with taxonomy.open(newline="", encoding="utf-8") as f:
            type_names = {t["type_id"]: t["name"] for t in csv.DictReader(f)}
    def type_label(type_id):
        name = type_names.get(type_id, type_id.replace("-", " "))
        # Lowercase the first letter unless it's an acronym (LNG, FSRU…).
        return name if name[:2].isupper() else name[:1].lower() + name[1:]
    names = ", ".join("{} ({})".format(r["title"], type_label(r["infra_type"])) for r in added)
    source = "approved submission #{}".format(number) if number else "an approved submission"
    entry = (
        "## {} · {}\n"
        "Added {} from {}, committed automatically by the approval workflow.\n"
        "- Files: `data/catalog.csv`, `CHANGELOG.md`\n\n"
    ).format(today, branch, names, source)
    text = CHANGELOG.read_text(encoding="utf-8")
    i = text.find("\n## ")
    text = text + "\n" + entry if i == -1 else text[: i + 1] + entry + text[i + 1:]
    CHANGELOG.write_text(text, encoding="utf-8")


def output(report):
    print(report)
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("report<<EOF_REPORT\n{}\nEOF_REPORT\n".format(report))


def main():
    body = os.environ.get("ISSUE_BODY", "")
    m = re.search(r"```csv\s*\n(.*?)```", body, re.S)
    if not m:
        output("No ```csv block found in the issue, so nothing was added.")
        return 1

    with CATALOG.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        existing = list(reader)
    taken = {r["id"] for r in existing}

    incoming = list(csv.DictReader(io.StringIO(m.group(1).strip() + "\n")))
    if not incoming:
        output("The ```csv block has no rows, so nothing was added.")
        return 1
    unknown = set(incoming[0].keys()) - set(columns)
    if unknown:
        output("Unknown columns in the submission: {}. Nothing was added.".format(", ".join(sorted(unknown))))
        return 1

    added = []
    for r in incoming:
        row = {c: (r.get(c) or "").strip() for c in columns}
        row["status"] = row["status"] or "published"
        # Give the row a free id: <infra_type>-<next number>.
        if not row["id"] or row["id"] in taken:
            prefix = row["infra_type"] + "-"
            nums = [int(i[len(prefix):]) for i in taken if i.startswith(prefix) and i[len(prefix):].isdigit()]
            row["id"] = prefix + str(max(nums + [0]) + 1).zfill(4)
        taken.add(row["id"])
        added.append(row)

    with CATALOG.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        for row in added:
            w.writerow(row)

    add_changelog_entry(added)

    lines = ["Added {} example(s) to `data/catalog.csv`:".format(len(added))]
    lines += ["- `{}`: {} ({})".format(r["id"], r["title"], r["infra_type"]) for r in added]
    output("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
