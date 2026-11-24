# Summary: building the Visual Dictionary

How this repository and its app were planned and built, in one Claude Code conversation that ran 18–24 November 2026.

## Goal

A free, open-source reference that helps researchers recognise energy infrastructure, and related features such as railways, jetties, tankers and transmission lines, in satellite imagery. It should be searchable through an A–Z index and by sector, and each example should be linked to metadata about its location and infrastructure type.

## Result

- **Live site:** published from this repository with GitHub Pages.
- **Repository:** this one, public on GitHub.
- **80 infrastructure types** in 10 categories, with definitions, other names, a "how to recognise it" list, and links to the Global Energy Monitor (GEM) trackers that cover each type.
- **92 example locations across 35 types**, shown on live Esri World Imagery. 90 came from the initial build, mostly GEM data, and 2 from approved submissions.
- **Views:** Browse (cards with live satellite covers and filters), A–Z index, By category, world Map, a page per type, a page per example, and an **Add** page for proposing new examples.
- **Workflows:** one publishes the site on every push; the other turns approved GitHub issues into catalog rows and logs them in the changelog.

## How the design changed

The project went through three designs. Each change came from a question about what can be shared publicly.

### 1. Stored images (first version)
- **Plan:** An image database. Snapshots from mixed sources are normalised to 1024×1024 px (plus 400 px thumbnails) by a Python script, metadata lives in one CSV, and the result is a public static site on GitHub Pages.
- **Licensing:** Each image recorded its source, license and a `shareable` flag. The decision was to include **only shareable images**, so non-shareable rows were dropped from the app and their processed copies deleted.
- **Problem:** That narrowed the usable sources a lot. The open ones (Sentinel-2, Landsat) are too coarse for small objects, and the sharp ones (Google, Esri, Maxar) can't be redistributed.

### 2. Live maps instead of images
- **Question:** Would the app be shareable if images were removed and the cards used embedded Leaflet maps instead?
- **Answer:** Yes. Streaming map tiles at view time, with the provider's credit shown, is the standard way to show imagery you aren't allowed to redistribute. The image pipeline (Pillow, `images/`, placeholders) was removed.
- **New design:** Each example is now just **latitude, longitude and zoom**. Each type has a "cover" example shown as a small live map on cards and tiles. Type and example pages have full interactive maps.
- **Taxonomy:** Revised against GEM's 18 asset trackers (checked on GEM's website), growing from 48 to 86 types, each tagged with the trackers that cover it.
- **Basemaps at this stage:** Esri World Imagery, Sentinel-2 cloudless (EOX) and OpenStreetMap.

### 3. GEM data, Esri only, and a way to add examples
- **Esri only:** Sentinel-2 was too blurry for this purpose, so maps now use Esri World Imagery alone, plus an optional Esri place-labels layer. It works without an account. Before heavy public use, add a free ArcGIS Location Platform API key to `ESRI_API_KEY` in `site/app.js`.
- **GEM examples:** GEM.wiki pages were suggested as a source but are behind a Cloudflare bot check, so they couldn't be read automatically. Instead, the examples came from the public data files behind GEM's tracker maps:
  - **Power plants:** from the integrated power map, using only units recorded with *exact* location accuracy.
  - **Iron and steel, cement, iron ore mines:** exact locations only.
  - **Coal mines, coal terminals, LNG terminals, chemicals:** these files don't record accuracy, so each location was checked by eye.
  - **Selection:** The largest operating sites, one per country, four candidates per type. All 132 candidates were checked on the imagery and 83 kept. Rejections included points on a town or headquarters, blurry or pre-construction imagery, and offshore sites, where Esri shows only blank water.
- **Add page:** Paste coordinates, a Google Maps link or a place name, frame the site in the crosshair, choose the type, and fill in a short form; country and region fill automatically. **Submit on GitHub** opens a pre-filled issue. You can also collect several sites in a list or download them as CSV.
- **Approval workflow:** When a maintainer adds the `approved` label, a GitHub Action adds the rows to `data/catalog.csv`, validates them, commits, redeploys the site and closes the issue.

## Later changes
- **Common features removed:** The cooling tower, stack, condenser, sphere and water-intake types were removed for now, leaving 80 types in 10 categories.
- **Published:** The repo was made public, GitHub Pages turned on (built by GitHub Actions), and the `new-example` and `approved` labels created.
- **First approvals and a bug:** Two issues (Galkynysh, Hassi Messaoud) were approved seconds apart. The second failed because the first had already updated `main`. The workflow now starts from the latest `main`, retries if needed, and says in its failure comment whether the submission or the save failed. Hassi Messaoud was then re-approved successfully.
- **Changelog:** `CLAUDE.md` holds the rule that every change gets an entry at the top of `CHANGELOG.md`, in the same commit. Approved submissions now write their own entry automatically.
- **Who can approve:** For now only the repo owner can approve. Others can be given the **Triage** role under Settings → Collaborators.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Hosting | Static site on GitHub Pages | Free, no server or database, easy to fork |
| Imagery | Live Esri World Imagery, no stored images | Sharp, and shareable when streamed with credit; nothing to license or redistribute |
| Data format | CSV files in `data/` | Editable in any spreadsheet; validated by `scripts/build.py` |
| Example source | GEM tracker data, exact locations | Reliable coordinates and IDs, with links to GEM.wiki |
| Contributions | Add page → GitHub issue → `approved` label | No coding needed, and a maintainer reviews every example |

## Known limits and next steps
- **45 of 80 types have no examples yet**, mostly types GEM doesn't track (jetties, railways, substations, pipelines, ships), plus offshore types that Esri can't show.
- **Esri API key:** add one before promoting the site widely.
- **GitHub Actions versions:** the workflows use action versions that run on Node 20, which GitHub is phasing out; update them when convenient.
- **Moving to GEM's organisation:** worth doing early if planned, because the site's URL will change.
