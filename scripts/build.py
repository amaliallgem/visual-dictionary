#!/usr/bin/env python3
"""Build the visual dictionary data file.

Validates the CSVs in data/ and writes site/data/catalog.json, which the web
app reads. No images are stored: every example is a location (lat, lon, zoom)
that the app shows on live satellite basemaps.

Usage:
    python3 scripts/build.py

Needs only the Python standard library (3.8+).
"""
import csv
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT_JSON = ROOT / "site" / "data" / "catalog.json"

STATUSES = {"published", "draft"}
YES = {"yes", "y", "true", "1"}
NO = {"no", "n", "false", "0", ""}
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_ZOOM = 15

CATALOG_REQUIRED = ["id", "title", "infra_type", "latitude", "longitude", "country", "status"]


class Errors(list):
    def add(self, where, msg):
        self.append("{}: {}".format(where, msg))


def split_list(value):
    return [v.strip() for v in (value or "").split(";") if v.strip()]


def read_csv(name, required, errors):
    """Return a list of (line_number, row) with whitespace stripped."""
    path = DATA / name
    if not path.exists():
        errors.add(name, "file not found")
        return []
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = [c for c in required if c not in (reader.fieldnames or [])]
        if missing:
            errors.add(name, "missing columns: " + ", ".join(missing))
            return []
        rows = []
        for row in reader:
            clean = {k.strip(): (v or "").strip() for k, v in row.items() if k}
            if any(clean.values()):
                rows.append((reader.line_num, clean))
        return rows


def unique_slug(value, seen, field, where, errors):
    if not SLUG.match(value):
        errors.add(where, "{} '{}' must be lowercase-with-hyphens".format(field, value))
    if value in seen:
        errors.add(where, "duplicate {} '{}'".format(field, value))
    seen.add(value)


def load_trackers(errors):
    trackers, seen = [], set()
    for line, r in read_csv("gem_trackers.csv", ["tracker_id", "name", "url"], errors):
        where = "gem_trackers.csv line {}".format(line)
        unique_slug(r["tracker_id"], seen, "tracker_id", where, errors)
        trackers.append({"id": r["tracker_id"], "name": r["name"], "url": r["url"]})
    return trackers


def load_categories(errors):
    cats, seen = [], set()
    for line, r in read_csv("categories.csv", ["category_id", "name", "color"], errors):
        where = "categories.csv line {}".format(line)
        unique_slug(r["category_id"], seen, "category_id", where, errors)
        if not HEX.match(r["color"]):
            errors.add(where, "color '{}' must look like #1a2b3c".format(r["color"]))
        cats.append({"id": r["category_id"], "name": r["name"], "color": r["color"],
                     "description": r.get("description", "")})
    return cats


def load_types(category_ids, tracker_ids, errors):
    types, seen = [], set()
    for line, r in read_csv("taxonomy.csv", ["type_id", "name", "category"], errors):
        where = "taxonomy.csv line {} ({})".format(line, r["type_id"])
        unique_slug(r["type_id"], seen, "type_id", where, errors)
        if r["category"] not in category_ids:
            errors.add(where, "unknown category '{}' (see categories.csv)".format(r["category"]))
        trackers = split_list(r.get("gem_trackers"))
        for t in trackers:
            if t not in tracker_ids:
                errors.add(where, "unknown GEM tracker '{}' (see gem_trackers.csv)".format(t))
        types.append({
            "id": r["type_id"],
            "name": r["name"],
            "category": r["category"],
            "gem_trackers": trackers,
            "also_called": split_list(r.get("also_called")),
            "description": r.get("description", ""),
            "visual_cues": split_list(r.get("visual_cues")),
        })
    return types


def number(value, lo, hi, name, where, errors, cast=float):
    try:
        n = cast(value)
    except ValueError:
        errors.add(where, "{} '{}' is not a valid number".format(name, value))
        return None
    if not lo <= n <= hi:
        errors.add(where, "{} {} is outside {}..{}".format(name, n, lo, hi))
        return None
    return n


def load_examples(type_ids, errors):
    examples, seen = [], set()
    for line, r in read_csv("catalog.csv", CATALOG_REQUIRED, errors):
        where = "catalog.csv line {} ({})".format(line, r.get("id") or "no id")
        for col in CATALOG_REQUIRED:
            if not r.get(col):
                errors.add(where, "'{}' is required".format(col))
        if r["id"]:
            unique_slug(r["id"], seen, "id", where, errors)
        if r["infra_type"] and r["infra_type"] not in type_ids:
            errors.add(where, "unknown infra_type '{}' (add it to taxonomy.csv first)".format(r["infra_type"]))
        status = r["status"].lower()
        if status and status not in STATUSES:
            errors.add(where, "status must be 'published' or 'draft'")
        cover = r.get("cover", "").lower()
        if cover not in YES | NO:
            errors.add(where, "cover must be yes or blank")
        lat = number(r["latitude"], -90, 90, "latitude", where, errors) if r["latitude"] else None
        lon = number(r["longitude"], -180, 180, "longitude", where, errors) if r["longitude"] else None
        zoom = DEFAULT_ZOOM
        if r.get("zoom"):
            zoom = number(r["zoom"], 3, 19, "zoom", where, errors, cast=int)
        if r.get("reference_url") and not r["reference_url"].startswith(("http://", "https://")):
            errors.add(where, "reference_url must start with http:// or https://")
        if status != "published":
            continue
        examples.append({
            "id": r["id"],
            "title": r["title"],
            "type": r["infra_type"],
            "lat": lat,
            "lon": lon,
            "zoom": zoom,
            "country": r["country"],
            "region": r.get("region", ""),
            "facility_name": r.get("facility_name", ""),
            "gem_id": r.get("gem_id", ""),
            "reference_url": r.get("reference_url", ""),
            "description": r.get("description", ""),
            "cover": cover in YES,
            "contributor": r.get("contributor", ""),
            "tags": split_list(r.get("tags")),
        })
    return examples


def main():
    errors = Errors()
    trackers = load_trackers(errors)
    categories = load_categories(errors)
    types = load_types({c["id"] for c in categories}, {t["id"] for t in trackers}, errors)
    examples = load_examples({t["id"] for t in types}, errors)

    # One cover per type: the row marked cover = yes, else the first example.
    by_type = {}
    for e in examples:
        by_type.setdefault(e["type"], []).append(e)
    for type_id, items in by_type.items():
        covers = [e for e in items if e["cover"]]
        if len(covers) > 1:
            errors.add("catalog.csv", "type '{}' has {} rows with cover = yes; keep one".format(
                type_id, len(covers)))
    if errors:
        print("Found {} problem(s):".format(len(errors)))
        for e in errors:
            print("  - " + e)
        return 1

    type_name = {t["id"]: t["name"] for t in types}
    for t in types:
        items = by_type.get(t["id"], [])
        t["count"] = len(items)
        cover = next((e for e in items if e["cover"]), items[0] if items else None)
        t["cover"] = cover["id"] if cover else None

    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "gem_trackers": trackers,
        "categories": categories,
        "types": sorted(types, key=lambda t: t["name"].lower()),
        "examples": sorted(examples, key=lambda e: (type_name[e["type"]].lower(), e["title"].lower())),
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    covered = sum(1 for t in types if t["count"])
    print("OK: {} categories, {} types ({} with examples), {} examples. Wrote {}".format(
        len(categories), len(types), covered, len(examples), OUT_JSON.relative_to(ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
