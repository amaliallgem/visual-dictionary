# Visual Dictionary of Infrastructure

A searchable visual dictionary that helps researchers recognise energy infrastructure and other common features in satellite imagery.

- **80 infrastructure types** in 10 categories. They cover every kind of site in Global Energy Monitor's asset trackers (coal, oil and gas, LNG, power, heavy industry and more), plus related features such as railways, jetties and ships.
- Each type is a **dictionary entry**: a definition, other names, a "how to recognise it" list, and links to the GEM trackers that cover it.
- Each **example** is a real location shown on **live Esri World Imagery** (Leaflet). **No imagery is stored or redistributed.**
- **90 examples across 34 types**, mostly drawn from GEM tracker data. Only operating sites whose location GEM records as *exact* were used, where the tracker records accuracy. Every one was checked on the imagery.
- A built-in **Add an example** page lets anyone propose new examples, with no coding needed.
- The app is a free, open-source **static website**, with no server or database. It's hosted on GitHub Pages.

## The app

| View | What it shows |
|---|---|
| **Browse** | Example cards, each with a live satellite "cover". Filter by category, country or GEM tracker, search, and sort. |
| **A–Z index** | Every type alphabetically, with a letter jump bar. Types without examples are greyed out, so gaps are visible. |
| **By category** | Types grouped by sector, each tile showing its cover example. |
| **Map** | All examples on one world map, coloured by category. |
| **Type page** | The dictionary entry, with a large interactive map of its cover example and every example below it. |
| **Example page** | A full interactive map with scale bar, reset button and optional place labels; details; links to the GEM.wiki page, Google Maps, Google Earth and OpenStreetMap. |
| **+ Add** | Frame a site on the map, fill in a short form and submit it (see below). |

## Adding examples (no coding)

1. Open the app's **+ Add** page, or the **+ Add an example** link on any type page.
2. Paste coordinates, a Google Maps link or a place name, then pan and zoom until the feature fills the frame. The view is saved exactly as framed: centre and zoom.
3. Pick the type and fill in the title. Country and region fill in automatically.
4. Press **Submit on GitHub**. This opens a pre-filled GitHub issue; press *Create*. To add several sites, use **Add to my list** and submit them together.
5. A maintainer checks the location and adds the **`approved`** label. A GitHub Action then adds the rows to `data/catalog.csv`, checks them, redeploys the site and closes the issue.

People without a GitHub account can use **Download CSV** and email the file to a maintainer.

## How it's organised

```
data/
  categories.csv     sectors (id, name, colour, description)
  gem_trackers.csv   Global Energy Monitor trackers (id, name, url)
  taxonomy.csv       infrastructure types: the dictionary entries
  catalog.csv        example locations: one row per example
scripts/
  build.py           validates the CSVs and writes site/data/catalog.json (standard library only)
  ingest_issue.py    adds rows from an approved GitHub issue to catalog.csv
site/                the web app: index.html, app.js, style.css
.github/workflows/
  pages.yml          checks the data and publishes the site on every push to main
  add-example.yml    turns approved "new example" issues into catalog rows
```

## Quick start

```bash
python3 scripts/build.py
python3 -m http.server 8765 --directory site   # then open http://localhost:8765
```

## Imagery

All maps use one provider, **Esri World Imagery**, streamed at view time with Esri's credit line. An optional **Place labels** overlay (also Esri) can be switched on with the layer button.

- **Account:** The app uses Esri's public tile endpoint, which needs no account. Before heavy or public use, create a free **ArcGIS Location Platform** account, generate an API key restricted to basemaps, and paste it into `ESRI_API_KEY` at the top of `site/app.js`. The app then switches to Esri's keyed endpoint. Esri's terms of use apply either way.
- **Limits:** Esri has little detailed imagery over open sea, so offshore wind farms, platforms and FSRUs moored offshore may show as blank water. Imagery dates vary, so some sites show older or newer stages than GEM's status.

## Example data

Examples marked with a GEM ID come from Global Energy Monitor's public tracker map data (CC BY 4.0), retrieved November 2026:
- **Power plants:** from the Global Integrated Power Tracker map, using only units recorded with *exact* location accuracy.
- **Iron and steel, cement, iron ore mines:** from the tracker maps, *exact* locations only.
- **Coal mines, coal terminals, LNG terminals and chemical plants:** these map files don't record location accuracy, so each location was checked by eye on the imagery.

In each case the largest operating sites were chosen, with one per country.

## Licenses

Code: MIT. Data in `data/`: CC BY 4.0 (example locations from Global Energy Monitor, CC BY 4.0). Map imagery belongs to Esri and its providers and is not part of this repository.
