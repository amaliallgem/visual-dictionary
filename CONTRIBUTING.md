# Contributing

All the content lives in four CSV files in `data/`. You can edit them in Excel, Numbers or Google Sheets; keep them as **CSV, UTF-8**.
After any change, run:

```bash
python3 scripts/build.py
python3 -m http.server 8765 --directory site   # preview at http://localhost:8765
```

The build lists every problem with its line number. Fix them and run it again.

## Adding an example: the easy way

Use the app's **+ Add** page. Frame the site in the crosshair, choose the type, fill in the form and press **Submit on GitHub**. See the README for the full flow, including how maintainers approve submissions with the `approved` label.

Before the first submission, a maintainer should create two labels in the repository: `new-example` (applied automatically to submissions) and `approved` (applied by a maintainer to accept one).

## Adding an example by hand

An example is a location where a type of infrastructure is clearly visible. No screenshot is needed: the app shows the location on live satellite maps.

1. Find a clear example on a satellite map. Prefer recent, cloud-free imagery where the defining features (see the type's "How to recognise it" list) are easy to see.
2. Note the **latitude and longitude of the centre** of the view (decimal degrees) and a **zoom level** (3–19) at which the feature fills the frame. Rough guide: 13 for large mines and solar parks, 14 for refineries and LNG terminals, 15–16 for power plants and substations, 17–18 for individual structures such as pylons or jetty heads.
3. Check it in the app (open `#/example/<id>` after building) and adjust if needed.
4. Add a row to `data/catalog.csv`:

| Column | Required | Notes |
|---|---|---|
| `id` | ✔ | Unique, lowercase-with-hyphens. Convention: `<infra_type>-<4 digits>`, e.g. `lng-export-terminal-0002`. Used in links, so don't change it later. |
| `title` | ✔ | Display name, e.g. "Sabine Pass LNG". |
| `infra_type` | ✔ | A `type_id` from `data/taxonomy.csv`. |
| `latitude`, `longitude` | ✔ | Decimal degrees (WGS84) of the view centre. |
| `zoom` | | Map zoom level, 3–19. Defaults to 15. |
| `country` | ✔ | Country name. |
| `region` | | State or province. |
| `facility_name` | | Official facility name, if any. |
| `gem_id` | | Global Energy Monitor tracker ID, if any. |
| `reference_url` | | A link to more information, e.g. the GEM.wiki page. |
| `description` | | What this example shows and what to notice. |
| `cover` | | `yes` to make this the type's cover example (one per type). Otherwise the first example is used. |
| `contributor` | | Your name or handle. |
| `tags` | | Separated by `;`, e.g. `coastal; under construction`. |
| `status` | ✔ | `published` or `draft` (drafts are checked but not shown). |

### Imagery gaps

- Esri World Imagery has little detail over open sea, so offshore features (offshore wind farms, platforms, FPSOs, SPM buoys) may show as blank water. Prefer examples close to the coast, where Esri usually has imagery.
- Imagery dates vary. A site may show construction stages or demolished units. Mention this in `description`.

## Adding or changing an infrastructure type

Add a row to `data/taxonomy.csv`:

- `type_id`: lowercase-with-hyphens, unique.
- `name`: the dictionary headword.
- `category`: a `category_id` from `data/categories.csv`.
- `gem_trackers`: `tracker_id`s from `data/gem_trackers.csv` that cover this type, separated by `;`. Leave blank if none.
- `also_called`: other names, separated by `;`.
- `description`: one or two sentences on what it is.
- `visual_cues`: what it looks like from above, as short phrases separated by `;`. These become the "How to recognise it" list.

New sectors go in `data/categories.csv` (with a colour). New GEM trackers go in `data/gem_trackers.csv`.
