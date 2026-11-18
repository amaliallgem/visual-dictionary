/* Visual Dictionary – a dependency-free single-page app (plus Leaflet for maps).
 * No imagery is stored: every example is a location shown on live Esri imagery.
 * Reads data/catalog.json (written by scripts/build.py) and renders:
 *   #/               browse all examples (cards with live satellite covers)
 *   #/index          A–Z dictionary index of infrastructure types
 *   #/categories     types grouped by category
 *   #/map            every example on one world map
 *   #/type/<id>      one dictionary entry: definition, visual cues, live map, examples
 *   #/example/<id>   one example: full interactive map and details
 *   #/add            add a new example: frame it on the map, fill in details, submit
 *   #/about          how to use and contribute
 */
(function () {
  "use strict";

  // ---------- settings ----------
  // GitHub repository that receives new examples submitted from the #/add page.
  const REPO = "amaliallgem/visual-dictionary";

  // Imagery: one provider, Esri World Imagery, streamed at view time and shown
  // with Esri's credit line. Nothing is downloaded or redistributed.
  // Optional: paste a free ArcGIS Location Platform API key to use Esri's keyed
  // endpoint (recommended before heavy or public use). Leave "" for the public one.
  const ESRI_API_KEY = "";
  const ESRI_BASE = ESRI_API_KEY
    ? "https://ibasemaps-api.arcgis.com/arcgis/rest/services/"
    : "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const KEY_QS = ESRI_API_KEY ? "?token=" + ESRI_API_KEY : "";
  const IMAGERY = {
    url: ESRI_BASE + "World_Imagery/MapServer/tile/{z}/{y}/{x}" + KEY_QS,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    short: "© Esri, Maxar",
  };
  const LABELS_URL = ESRI_BASE + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" + KEY_QS;

  // Column order of data/catalog.csv (used by the #/add page).
  const CSV_COLUMNS = ["id", "title", "infra_type", "latitude", "longitude", "zoom", "country", "region",
    "facility_name", "gem_id", "reference_url", "description", "cover", "contributor", "tags", "status"];

  const state = {
    data: null,
    typeById: {},
    catById: {},
    exById: {},
    trackerById: {},
    query: "",
    cats: new Set(),
    country: "",
    tracker: "",
    sort: "type",
    filtersOpen: !window.matchMedia("(max-width: 860px)").matches,
    labels: false,
  };
  try { state.labels = localStorage.getItem("vd-labels") === "1"; } catch (e) { /* ignore */ }

  const main = document.getElementById("main");
  const search = document.getElementById("search");
  let maps = [];
  let observer = null;
  let cleanup = [];

  // ---------- helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const norm = (s) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l").replace(/ø/g, "o").replace(/đ/g, "d").replace(/ß/g, "ss").replace(/æ/g, "ae");
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  function imageryLayer(short) {
    return L.tileLayer(IMAGERY.url, { maxZoom: 19, maxNativeZoom: 19, attribution: short ? IMAGERY.short : IMAGERY.attribution });
  }
  function labelsLayer() {
    return L.tileLayer(LABELS_URL, { maxZoom: 19, pane: "overlayPane" });
  }
  // Satellite + an optional "Place labels" overlay that remembers its setting.
  function addImagery(m) {
    imageryLayer(false).addTo(m);
    const labels = labelsLayer();
    if (state.labels) labels.addTo(m);
    L.control.layers(null, { "Place labels": labels }, { position: "topright" }).addTo(m);
    m.on("overlayadd", () => { state.labels = true; store.set("vd-labels", "1"); });
    m.on("overlayremove", () => { state.labels = false; store.set("vd-labels", "0"); });
  }

  // linked=false when the chip sits inside another link (nested <a> is invalid HTML).
  function catChip(catId, linked = true) {
    const c = state.catById[catId];
    if (!c) return "";
    const inner = `<span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}`;
    return linked
      ? `<a class="chip" href="#/categories#cat-${esc(c.id)}">${inner}</a>`
      : `<span class="chip">${inner}</span>`;
  }

  function trackerLinks(type) {
    return type.gem_trackers.map((id) => {
      const t = state.trackerById[id];
      return t ? `<a class="tracker" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)} ↗</a>` : "";
    }).join("");
  }

  function typeText(t) {
    const c = state.catById[t.category] || {};
    const trackers = t.gem_trackers.map((id) => (state.trackerById[id] || {}).name).join(" ");
    return norm([t.name, t.id, c.name, t.also_called.join(" "), t.description, t.visual_cues.join(" "), trackers].join(" "));
  }
  function exampleText(ex) {
    const t = state.typeById[ex.type] || {};
    const c = state.catById[t.category] || {};
    return norm([
      ex.title, ex.facility_name, ex.country, ex.region, ex.description,
      ex.tags.join(" "), ex.gem_id, t.name, (t.also_called || []).join(" "), c.name,
    ].join(" "));
  }
  function matches(text, query) {
    return norm(query).split(/\s+/).filter(Boolean).every((w) => text.includes(w));
  }

  // A cover is a small, non-interactive live map, created only when it
  // scrolls into view so long lists stay fast.
  function coverHTML(ex, zoomOffset) {
    if (!ex) return `<div class="no-cover">No example yet</div>`;
    return `<div class="cover" data-lat="${ex.lat}" data-lon="${ex.lon}" data-zoom="${ex.zoom + (zoomOffset || 0)}" aria-label="Satellite view of ${esc(ex.title)}"></div>`;
  }

  function mountCovers() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);
        const m = L.map(el, {
          zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false,
          doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false,
        }).setView([+el.dataset.lat, +el.dataset.lon], +el.dataset.zoom);
        m.attributionControl.setPrefix(false);
        imageryLayer(true).addTo(m);
        maps.push(m);
      });
    }, { rootMargin: "200px" });
    main.querySelectorAll(".cover").forEach((el) => observer.observe(el));
  }

  function cardHTML(ex) {
    const t = state.typeById[ex.type];
    const c = state.catById[t.category];
    const place = [ex.region, ex.country].filter(Boolean).join(", ");
    return `<a class="card" href="#/example/${esc(ex.id)}">
      <div class="thumb">${coverHTML(ex, -1)}</div>
      <div class="card-body">
        <div class="card-type"><span class="dot" style="background:${esc(c.color)}"></span>${esc(t.name)}</div>
        <div class="card-title">${esc(ex.title)}</div>
        <div class="card-meta">${esc(place)}</div>
      </div>
    </a>`;
  }

  function cuesHTML(t, title) {
    const c = state.catById[t.category];
    return `<div class="cues" style="border-left-color:${esc(c.color)}">
      <h3>${esc(title || "How to recognise it")}</h3>
      <ul>${t.visual_cues.map((q) => `<li>${esc(q.replace(/\.$/, ""))}</li>`).join("")}</ul>
    </div>`;
  }

  // A full interactive map.
  function bigMap(el, ex, color) {
    const m = L.map(el, { scrollWheelZoom: false }).setView([ex.lat, ex.lon], ex.zoom);
    addImagery(m);
    L.control.scale({ imperial: false }).addTo(m);
    L.circleMarker([ex.lat, ex.lon], { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 })
      .addTo(m).bindTooltip(esc(ex.title));
    // Let people scroll the page past the map; zoom with the buttons, or click first.
    m.once("click", () => m.scrollWheelZoom.enable());
    const reset = L.control({ position: "topleft" });
    reset.onAdd = () => {
      const a = L.DomUtil.create("a", "leaflet-bar reset-view");
      a.href = "#"; a.title = "Back to the example view"; a.innerHTML = "⌖";
      L.DomEvent.on(a, "click", (e) => { L.DomEvent.preventDefault(e); m.setView([ex.lat, ex.lon], ex.zoom); });
      return a;
    };
    reset.addTo(m);
    maps.push(m);
    return m;
  }

  function externalLinks(ex) {
    const { lat, lon } = ex;
    return `<a href="https://www.google.com/maps/@${lat},${lon},${Math.max(300, 40000000 / Math.pow(2, ex.zoom)).toFixed(0)}m/data=!3m1!1e3" target="_blank" rel="noopener">Google Maps satellite ↗</a>
      <a href="https://earth.google.com/web/@${lat},${lon},0a,${Math.round(60000000 / Math.pow(2, ex.zoom))}d,35y,0h,0t,0r" target="_blank" rel="noopener">Google Earth ↗</a>
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${ex.zoom}/${lat}/${lon}" target="_blank" rel="noopener">OpenStreetMap ↗</a>
      ${ex.reference_url ? `<a href="${esc(ex.reference_url)}" target="_blank" rel="noopener">${/gem\.wiki/.test(ex.reference_url) ? "GEM.wiki page" : "Reference"} ↗</a>` : ""}`;
  }

  // ---------- views ----------
  function viewBrowse() {
    const d = state.data;
    const countries = [...new Set(d.examples.map((e) => e.country).filter(Boolean))].sort();
    const catCount = {};
    d.examples.forEach((e) => {
      const cat = state.typeById[e.type].category;
      catCount[cat] = (catCount[cat] || 0) + 1;
    });

    let list = d.examples.filter((ex) => {
      const t = state.typeById[ex.type];
      if (state.cats.size && !state.cats.has(t.category)) return false;
      if (state.country && ex.country !== state.country) return false;
      if (state.tracker && !t.gem_trackers.includes(state.tracker)) return false;
      if (state.query && !matches(exampleText(ex), state.query)) return false;
      return true;
    });
    if (state.sort === "title") list = list.slice().sort((a, b) => a.title.localeCompare(b.title));
    else if (state.sort === "country") list = list.slice().sort((a, b) => a.country.localeCompare(b.country) || a.title.localeCompare(b.title));

    const active = state.cats.size || state.country || state.tracker;
    main.innerHTML = `
      <h1>Infrastructure from above</h1>
      <p class="lede">A visual dictionary to help researchers recognise energy infrastructure and other features in satellite imagery. Each example is a live satellite view of a real site.</p>
      <div class="browse">
        <details class="filters" ${state.filtersOpen ? "open" : ""}>
          <summary>Filters${active ? " (active)" : ""}</summary>
          <h3>Category</h3>
          ${d.categories.map((c) => `
            <label><input type="checkbox" data-cat="${esc(c.id)}" ${state.cats.has(c.id) ? "checked" : ""}>
              <span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}
              <span class="count">${catCount[c.id] || 0}</span></label>`).join("")}
          <h3>Country</h3>
          <select id="f-country"><option value="">All countries</option>
            ${countries.map((c) => `<option ${c === state.country ? "selected" : ""}>${esc(c)}</option>`).join("")}
          </select>
          <h3>GEM tracker</h3>
          <select id="f-tracker"><option value="">Any</option>
            ${d.gem_trackers.map((t) => `<option value="${esc(t.id)}" ${t.id === state.tracker ? "selected" : ""}>${esc(t.name.replace(/^Global /, ""))}</option>`).join("")}
          </select>
          <button id="f-clear" type="button">Clear filters</button>
        </details>
        <section>
          <div class="result-bar">
            <span>${plural(list.length, "example")}${state.query ? ` matching “${esc(state.query)}”` : ""}</span>
            <label>Sort <select id="f-sort">
              <option value="type" ${state.sort === "type" ? "selected" : ""}>Type (A–Z)</option>
              <option value="title" ${state.sort === "title" ? "selected" : ""}>Name (A–Z)</option>
              <option value="country" ${state.sort === "country" ? "selected" : ""}>Country</option>
            </select></label>
          </div>
          ${list.length ? `<div class="grid">${list.map(cardHTML).join("")}</div>`
            : `<p class="empty">No examples match. The <a href="#/index">A–Z index</a> lists every type, including types without examples yet.</p>`}
        </section>
      </div>`;

    main.querySelector("details.filters").addEventListener("toggle", (e) => { state.filtersOpen = e.target.open; });
    main.querySelectorAll("[data-cat]").forEach((el) =>
      el.addEventListener("change", () => {
        el.checked ? state.cats.add(el.dataset.cat) : state.cats.delete(el.dataset.cat);
        render();
      }));
    main.querySelector("#f-country").addEventListener("change", (e) => { state.country = e.target.value; render(); });
    main.querySelector("#f-tracker").addEventListener("change", (e) => { state.tracker = e.target.value; render(); });
    main.querySelector("#f-sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
    main.querySelector("#f-clear").addEventListener("click", () => {
      state.cats.clear(); state.country = ""; state.tracker = ""; state.query = ""; search.value = "";
      render();
    });
    mountCovers();
  }

  function viewIndex() {
    const types = state.data.types.filter((t) => !state.query || matches(typeText(t), state.query));
    const groups = {};
    types.forEach((t) => {
      const k = norm(t.name).charAt(0).toUpperCase();
      (groups[k] = groups[k] || []).push(t);
    });
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const withEx = state.data.types.filter((t) => t.count > 0).length;

    main.innerHTML = `
      <h1>A–Z index</h1>
      <p class="lede">${plural(state.data.types.length, "infrastructure type")}, ${withEx} with examples so far. Greyed entries still need an example location. <a href="#/add">Add one</a>.</p>
      <nav class="letters" aria-label="Jump to letter">
        ${letters.map((x) => groups[x] ? `<a href="#/index" data-jump="${x}">${x}</a>` : `<span>${x}</span>`).join("")}
      </nav>
      ${types.length ? "" : `<p class="empty">No types match “${esc(state.query)}”.</p>`}
      ${Object.keys(groups).sort().map((x) => `
        <section class="letter-group" id="letter-${x}">
          <h2>${x}</h2>
          ${groups[x].map((t) => {
            const cover = t.cover ? state.exById[t.cover] : null;
            return `<a class="entry ${t.count ? "" : "empty-type"}" href="#/type/${esc(t.id)}">
              <div class="entry-thumb">${cover ? coverHTML(cover, -2) : ""}</div>
              <div>
                <div class="entry-name">${esc(t.name)}</div>
                <div class="entry-sub">${catChip(t.category, false)} ${t.also_called.length ? "· also: " + esc(t.also_called.join(", ")) : ""}</div>
              </div>
              <div class="entry-count">${t.count ? plural(t.count, "example") : "No examples yet"}</div>
            </a>`;
          }).join("")}
        </section>`).join("")}`;

    main.querySelectorAll("[data-jump]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("letter-" + a.dataset.jump).scrollIntoView();
      }));
    mountCovers();
  }

  function viewCategories() {
    const d = state.data;
    main.innerHTML = `
      <h1>By category</h1>
      <p class="lede">Infrastructure types grouped by sector. Each tile opens the dictionary entry.</p>
      ${d.categories.map((c) => {
        const types = d.types.filter((t) => t.category === c.id && (!state.query || matches(typeText(t), state.query)));
        if (!types.length) return "";
        return `<section class="cat-section" id="cat-${esc(c.id)}">
          <div class="cat-head" style="border-color:${esc(c.color)}">
            <h2>${esc(c.name)}</h2><p>${esc(c.description)}</p>
          </div>
          <div class="type-tiles">
            ${types.map((t) => `<a class="type-tile ${t.count ? "" : "empty-type"}" href="#/type/${esc(t.id)}">
                <div class="thumb">${coverHTML(t.cover ? state.exById[t.cover] : null, -1)}</div>
                <div class="label">${esc(t.name)}<small>${t.count ? plural(t.count, "example") : "Needs an example"}</small></div>
              </a>`).join("")}
          </div>
        </section>`;
      }).join("")}`;
    const anchor = location.hash.split("#")[2];
    if (anchor) {
      const el = document.getElementById(anchor);
      if (el) el.scrollIntoView();
    }
    mountCovers();
  }

  function viewType(id) {
    const t = state.typeById[id];
    if (!t) return notFound();
    const c = state.catById[t.category];
    const examples = state.data.examples.filter((e) => e.type === id);
    const cover = t.cover ? state.exById[t.cover] : null;
    main.innerHTML = `
      <div class="crumbs"><a href="#/index">A–Z index</a> › <a href="#/categories#cat-${esc(c.id)}">${esc(c.name)}</a></div>
      <h1>${esc(t.name)}</h1>
      <div class="detail">
        <div>
          ${cover
            ? `<div id="bigmap" class="bigmap"></div>
               <p class="map-caption">Example: <a href="#/example/${esc(cover.id)}">${esc(cover.title)}</a>, ${esc(cover.country)}. Drag and zoom to explore.</p>`
            : `<div class="bigmap no-cover"><span>No example location yet. <a href="#/add?type=${esc(t.id)}">Add one</a>.</span></div>`}
        </div>
        <div>
          <p>${catChip(t.category)}</p>
          <p>${esc(t.description)}</p>
          ${t.also_called.length ? `<p class="entry-sub">Also called: ${esc(t.also_called.join(", "))}</p>` : ""}
          ${cuesHTML(t)}
          ${t.gem_trackers.length ? `<div class="trackers"><h3>Tracked by Global Energy Monitor</h3>${trackerLinks(t)}</div>` : ""}
        </div>
      </div>
      <h2>Examples (${examples.length}) <a class="add-link" href="#/add?type=${esc(t.id)}">+ Add an example</a></h2>
      ${examples.length ? `<div class="grid">${examples.map(cardHTML).join("")}</div>` : `<p class="empty">No examples yet.</p>`}`;
    if (cover) bigMap(document.getElementById("bigmap"), cover, c.color);
    mountCovers();
  }

  function viewExample(id) {
    const ex = state.exById[id];
    if (!ex) return notFound();
    const t = state.typeById[ex.type];
    const c = state.catById[t.category];
    const others = state.data.examples.filter((e) => e.type === ex.type && e.id !== ex.id);
    const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : "");
    main.innerHTML = `
      <div class="crumbs"><a href="#/">Browse</a> › <a href="#/type/${esc(t.id)}">${esc(t.name)}</a></div>
      <h1>${esc(ex.title)}</h1>
      <div class="detail">
        <div>
          <div id="bigmap" class="bigmap"></div>
          <p class="map-caption">Live Esri imagery. Imagery dates vary by place. Turn on place labels with the layer button.</p>
        </div>
        <div>
          <p><a href="#/type/${esc(t.id)}"><strong>${esc(t.name)}</strong></a> ${catChip(t.category)}</p>
          ${ex.description ? `<p>${esc(ex.description)}</p>` : ""}
          <dl class="meta">
            ${row("Facility", esc(ex.facility_name))}
            ${row("Location", esc([ex.region, ex.country].filter(Boolean).join(", ")))}
            ${row("Coordinates", `<button class="copy" data-copy="${ex.lat}, ${ex.lon}" title="Copy">${ex.lat.toFixed(5)}, ${ex.lon.toFixed(5)}</button>`)}
            ${row("GEM ID", esc(ex.gem_id))}
            ${row("Tags", esc(ex.tags.join(", ")))}
            ${row("Contributor", esc(ex.contributor))}
          </dl>
          <div class="links">${externalLinks(ex)}</div>
          ${t.gem_trackers.length ? `<div class="trackers"><h3>Tracked by Global Energy Monitor</h3>${trackerLinks(t)}</div>` : ""}
        </div>
      </div>
      <div style="margin-top:24px">${cuesHTML(t, "How to recognise a " + t.name.toLowerCase())}</div>
      ${others.length ? `<h2>More ${esc(t.name.toLowerCase())} examples</h2><div class="grid">${others.map(cardHTML).join("")}</div>` : ""}`;
    bigMap(document.getElementById("bigmap"), ex, c.color);
    wireCopy();
    mountCovers();
  }

  function wireCopy() {
    main.querySelectorAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(b.dataset.copy).then(() => {
          b.classList.add("copied");
          setTimeout(() => b.classList.remove("copied"), 1200);
        });
      }));
  }

  function viewMap() {
    const d = state.data;
    const list = d.examples.filter((ex) => !state.query || matches(exampleText(ex), state.query));
    main.innerHTML = `
      <h1>Map of examples</h1>
      <p class="lede">${plural(list.length, "example")}, coloured by category. Click a point to open it.</p>
      <div id="worldmap" class="worldmap"></div>
      <div class="legend">${d.categories.map((c) => `<span><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span>`).join("")}</div>`;
    const m = L.map("worldmap", { worldCopyJump: true }).setView([25, 10], 2);
    addImagery(m);
    const pts = list.map((ex) => {
      const t = state.typeById[ex.type];
      const c = state.catById[t.category];
      return L.circleMarker([ex.lat, ex.lon], { radius: 6, color: "#fff", weight: 1.5, fillColor: c.color, fillOpacity: 0.95 })
        .addTo(m)
        .bindTooltip(`<strong>${esc(ex.title)}</strong><br>${esc(t.name)}`)
        .on("click", () => { location.hash = "#/example/" + ex.id; });
    });
    if (pts.length) m.fitBounds(L.featureGroup(pts).getBounds().pad(0.1), { maxZoom: 6 });
    maps.push(m);
  }

  // ---------- add an example ----------
  // Parses "lat, lon", "lat lon", or a Google Maps / Google Earth / OSM URL.
  function parseLocation(text) {
    const s = String(text || "").trim();
    let m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/); // Google Maps @lat,lon,zoomz
    if (m) return { lat: +m[1], lon: +m[2], zoom: m[3] ? Math.round(+m[3]) : null };
    m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/); // Google place URL
    if (m) return { lat: +m[1], lon: +m[2], zoom: null };
    m = s.match(/map=(\d+)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/); // OpenStreetMap
    if (m) return { lat: +m[2], lon: +m[3], zoom: +m[1] };
    m = s.match(/^\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?\s*$/); // "lat, lon"
    if (m) return { lat: +m[1], lon: +m[2], zoom: null };
    return null;
  }

  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function nextId(typeId) {
    let max = 0;
    const re = new RegExp("^" + typeId + "-(\\d+)$");
    state.data.examples.forEach((e) => { const m = e.id.match(re); if (m) max = Math.max(max, +m[1]); });
    JSON.parse(store.get("vd-draft-list", "[]")).forEach((r) => { const m = String(r.id).match(re); if (m) max = Math.max(max, +m[1]); });
    return typeId + "-" + String(max + 1).padStart(4, "0");
  }

  function viewAdd() {
    const d = state.data;
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const preType = params.get("type") || "";
    const list = () => JSON.parse(store.get("vd-draft-list", "[]"));
    const typeOptions = d.categories.map((c) => `<optgroup label="${esc(c.name)}">${
      d.types.filter((t) => t.category === c.id).sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => `<option value="${esc(t.id)}" ${t.id === preType ? "selected" : ""}>${esc(t.name)}</option>`).join("")
    }</optgroup>`).join("");

    main.innerHTML = `
      <h1>Add an example</h1>
      <p class="lede">Frame the site in the crosshair, choose its type, fill in the details, then submit it. A maintainer reviews each submission before it appears.</p>
      <div class="add-layout">
        <div>
          <form id="goto" class="goto">
            <input id="loc" type="text" placeholder="Paste coordinates (29.743, -93.870), a Google Maps link, or a place name" autocomplete="off">
            <button type="submit">Go</button>
          </form>
          <p id="goto-msg" class="hint"></p>
          <div class="add-map-wrap">
            <div id="addmap" class="bigmap"></div>
            <div class="crosshair" aria-hidden="true"></div>
          </div>
          <p class="map-caption"><strong>The saved view is exactly what's inside the map:</strong> centre and zoom. Pan and zoom until the feature fills the frame. Click to recentre.</p>
          <p class="readout">Centre <span id="ro-latlon"></span> · zoom <span id="ro-zoom"></span></p>
        </div>
        <form id="addform" class="add-form" autocomplete="off">
          <label>Infrastructure type *
            <select name="infra_type" required><option value="">Choose a type…</option>${typeOptions}</select></label>
          <div id="type-hint" class="hint"></div>
          <label>Title *<input name="title" required placeholder="e.g. Sabine Pass LNG"></label>
          <div class="two">
            <label>Country *<input name="country" required></label>
            <label>Region / state<input name="region"></label>
          </div>
          <label>Facility name<input name="facility_name" placeholder="Official name, if any"></label>
          <div class="two">
            <label>GEM ID<input name="gem_id" placeholder="e.g. G100000109409"></label>
            <label>Reference URL<input name="reference_url" type="url" placeholder="https://www.gem.wiki/…"></label>
          </div>
          <label>What to notice<textarea name="description" rows="3" placeholder="What does this example show? Which features are visible?"></textarea></label>
          <div class="two">
            <label>Tags<input name="tags" placeholder="coastal; under construction"></label>
            <label>Your name or handle<input name="contributor"></label>
          </div>
          <label class="check"><input type="checkbox" name="cover"> Use as the cover image for this type</label>
          <div class="row-preview"><span>Catalog row</span><code id="csvrow"></code></div>
          <div class="add-actions">
            <button type="button" id="btn-submit" class="primary">Submit on GitHub</button>
            <button type="button" id="btn-list">Add to my list</button>
            <button type="button" id="btn-copy">Copy row</button>
          </div>
          <p id="add-msg" class="hint"></p>
        </form>
      </div>
      <section id="mylist"></section>`;

    const form = main.querySelector("#addform");
    const f = (name) => form.elements[name];
    f("contributor").value = store.get("vd-contributor", "");
    const start = parseLocation(params.get("at") || "") || { lat: 25, lon: 10, zoom: 2 };
    const m = L.map("addmap", { scrollWheelZoom: true }).setView([start.lat, start.lon], start.zoom || 15);
    addImagery(m);
    L.control.scale({ imperial: false }).addTo(m);
    maps.push(m);
    m.on("click", (e) => m.panTo(e.latlng));

    const touched = new Set();
    form.addEventListener("input", (e) => { touched.add(e.target.name); update(); });
    f("infra_type").addEventListener("change", () => {
      const t = state.typeById[f("infra_type").value];
      main.querySelector("#type-hint").innerHTML = t
        ? `<strong>Look for:</strong> ${esc(t.visual_cues.slice(0, 4).join("; "))}… <a href="#/type/${esc(t.id)}" target="_blank">full entry</a>`
        : "";
      update();
    });

    function view() {
      const c = m.getCenter().wrap();
      return { lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), zoom: m.getZoom() };
    }
    function row() {
      const v = view();
      const type = f("infra_type").value;
      return {
        id: type ? nextId(type) : "",
        title: f("title").value.trim(),
        infra_type: type,
        latitude: v.lat, longitude: v.lon, zoom: v.zoom,
        country: f("country").value.trim(),
        region: f("region").value.trim(),
        facility_name: f("facility_name").value.trim(),
        gem_id: f("gem_id").value.trim(),
        reference_url: f("reference_url").value.trim(),
        description: f("description").value.trim().replace(/\s+/g, " "),
        cover: f("cover").checked ? "yes" : "",
        contributor: f("contributor").value.trim(),
        tags: f("tags").value.trim(),
        status: "published",
      };
    }
    function toCsv(r) { return CSV_COLUMNS.map((k) => csvCell(r[k])).join(","); }
    function update() {
      const v = view();
      main.querySelector("#ro-latlon").textContent = v.lat.toFixed(5) + ", " + v.lon.toFixed(5);
      main.querySelector("#ro-zoom").textContent = v.zoom;
      main.querySelector("#csvrow").textContent = toCsv(row());
    }
    function problems(r) {
      const p = [];
      if (!r.infra_type) p.push("choose a type");
      if (!r.title) p.push("add a title");
      if (!r.country) p.push("add a country");
      if (r.zoom < 12) p.push("zoom in further (at least zoom 12) so the feature is visible");
      return p;
    }
    function say(msg, ok) {
      const el = main.querySelector("#add-msg");
      el.textContent = msg;
      el.className = "hint " + (ok ? "ok" : "warn");
    }

    // Fill country and region from OpenStreetMap once the view settles,
    // unless the user has typed in those fields.
    let geoTimer = null;
    m.on("moveend", () => {
      update();
      clearTimeout(geoTimer);
      if (m.getZoom() < 8 || (touched.has("country") && touched.has("region"))) return;
      geoTimer = setTimeout(() => {
        const v = view();
        fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=en&lat=${v.lat}&lon=${v.lon}`)
          .then((r) => r.json())
          .then((j) => {
            const a = (j && j.address) || {};
            if (!touched.has("country") && a.country) f("country").value = a.country;
            if (!touched.has("region")) f("region").value = a.state || a.region || a.province || a.county || "";
            update();
          })
          .catch(() => { /* offline or rate-limited: fields stay editable */ });
      }, 900);
    });
    cleanup.push(() => clearTimeout(geoTimer));

    main.querySelector("#goto").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = main.querySelector("#loc").value;
      const msg = main.querySelector("#goto-msg");
      const p = parseLocation(text);
      if (p) {
        if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) { msg.textContent = "Those coordinates are out of range."; return; }
        m.setView([p.lat, p.lon], p.zoom || Math.max(m.getZoom(), 15));
        msg.textContent = "";
        return;
      }
      if (!text.trim()) return;
      msg.textContent = "Searching…";
      fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(text)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!j.length) { msg.textContent = "No place found. Try coordinates instead."; return; }
          m.setView([+j[0].lat, +j[0].lon], 15);
          msg.textContent = "Found: " + j[0].display_name + " (search by OpenStreetMap Nominatim)";
        })
        .catch(() => { msg.textContent = "Search is unavailable. Paste coordinates instead."; });
    });

    main.querySelector("#btn-copy").addEventListener("click", () => {
      const r = row();
      const p = problems(r);
      if (p.length) return say("Before copying: " + p.join(", ") + ".");
      navigator.clipboard.writeText(toCsv(r)).then(() => say("Copied. Paste it as a new line at the end of data/catalog.csv.", true));
    });

    main.querySelector("#btn-list").addEventListener("click", () => {
      const r = row();
      const p = problems(r);
      if (p.length) return say("Before adding: " + p.join(", ") + ".");
      const l = list(); l.push(r); store.set("vd-draft-list", JSON.stringify(l));
      store.set("vd-contributor", r.contributor);
      say(`Added “${r.title}” to your list. Frame the next one, or submit the whole list below.`, true);
      ["title", "facility_name", "gem_id", "reference_url", "description", "tags"].forEach((n) => (f(n).value = ""));
      f("cover").checked = false;
      update(); renderList();
    });

    main.querySelector("#btn-submit").addEventListener("click", () => {
      const r = row();
      const p = problems(r);
      if (p.length) return say("Before submitting: " + p.join(", ") + ".");
      store.set("vd-contributor", r.contributor);
      openIssue([r]);
    });

    function openIssue(rows) {
      const title = rows.length === 1 ? `New example: ${rows[0].title}` : `New examples: ${rows.length} locations`;
      const body = [
        "Submitted from the visual dictionary's **Add an example** page.",
        "",
        rows.map((r) => `- **${r.title}**: ${(state.typeById[r.infra_type] || {}).name || r.infra_type}, ${r.country} (${r.latitude}, ${r.longitude}, zoom ${r.zoom})`).join("\n"),
        "",
        "A maintainer reviews these locations, then adds the `approved` label to add them to the catalog automatically.",
        "",
        "```csv",
        CSV_COLUMNS.join(","),
        rows.map(toCsv).join("\n"),
        "```",
      ].join("\n");
      const url = `https://github.com/${REPO}/issues/new?labels=new-example&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener");
      say("GitHub opened in a new tab. Check the issue and press “Create” to send it.", true);
    }

    function renderList() {
      const l = list();
      const el = main.querySelector("#mylist");
      if (!l.length) { el.innerHTML = ""; return; }
      el.innerHTML = `
        <h2>My list (${l.length})</h2>
        <p class="hint">Saved in this browser only. Submit them together or download them as CSV.</p>
        <table class="list-table"><thead><tr><th>Title</th><th>Type</th><th>Location</th><th></th></tr></thead><tbody>
        ${l.map((r, i) => `<tr><td>${esc(r.title)}</td><td>${esc((state.typeById[r.infra_type] || {}).name || r.infra_type)}</td>
          <td><a href="#/add?type=${esc(r.infra_type)}&at=${r.latitude},${r.longitude}" data-goto="${i}">${r.latitude}, ${r.longitude} (z${r.zoom})</a></td>
          <td><button type="button" data-del="${i}" title="Remove">✕</button></td></tr>`).join("")}
        </tbody></table>
        <div class="add-actions">
          <button type="button" id="list-submit" class="primary">Submit all on GitHub</button>
          <button type="button" id="list-csv">Download CSV</button>
          <button type="button" id="list-clear">Clear list</button>
        </div>`;
      el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
        const x = list(); x.splice(+b.dataset.del, 1); store.set("vd-draft-list", JSON.stringify(x)); renderList();
      }));
      el.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        const r = list()[+a.dataset.goto];
        m.setView([r.latitude, r.longitude], r.zoom);
      }));
      el.querySelector("#list-submit").addEventListener("click", () => openIssue(list()));
      el.querySelector("#list-csv").addEventListener("click", () => {
        const blob = new Blob([CSV_COLUMNS.join(",") + "\n" + list().map(toCsv).join("\n") + "\n"], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "new-examples.csv"; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      el.querySelector("#list-clear").addEventListener("click", () => {
        if (confirm("Remove all examples from your list?")) { store.set("vd-draft-list", "[]"); renderList(); }
      });
    }
    f("infra_type").dispatchEvent(new Event("change")); // show cues for a preselected type
    renderList();
  }

  function viewAbout() {
    const d = state.data;
    main.innerHTML = `<div class="prose">
      <h1>About</h1>
      <p>This visual dictionary helps researchers recognise energy infrastructure and other common features in satellite imagery. It covers ${plural(d.types.length, "infrastructure type")} in ${d.categories.length} categories, with ${plural(d.examples.length, "example location")} so far.</p>
      <p>The types include every kind of site covered by Global Energy Monitor's asset trackers, plus related features such as railways, jetties and ships. Example locations come from GEM tracker data, using only sites whose location GEM records as exact.</p>
      <h2>How to use it</h2>
      <ul>
        <li><strong>Browse</strong> shows every example as a card. Filter by category, country or GEM tracker, or use the search box.</li>
        <li><strong>A–Z index</strong> lists every infrastructure type alphabetically, including types that still need examples.</li>
        <li><strong>By category</strong> groups types by sector.</li>
        <li><strong>Map</strong> shows all examples on one world map.</li>
        <li>Each <strong>type page</strong> explains what to look for and shows a live satellite map of an example. Each <strong>example page</strong> has a full interactive map, a scale bar and links to view the site in other tools.</li>
        <li><strong>Add</strong> lets anyone propose a new example: frame it on the map, fill in the details and submit it for review.</li>
      </ul>
      <h2>Imagery</h2>
      <p>No images are stored in this project. Maps stream <strong>Esri World Imagery</strong> live, with Esri's credit line on every map: ${IMAGERY.attribution}. Imagery dates and resolution vary by place, and Esri has little detailed imagery over open sea.</p>
      <h2>Data</h2>
      <p>Example locations and facility names marked with a GEM ID come from <a href="https://globalenergymonitor.org" target="_blank" rel="noopener">Global Energy Monitor</a> trackers (CC BY 4.0). Place-name search and country auto-fill on the Add page use <a href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap Nominatim</a>.</p>
      <p class="entry-sub">Data built ${esc(d.generated)}.</p>
    </div>`;
  }

  function notFound() {
    main.innerHTML = `<h1>Not found</h1><p class="empty">That page doesn't exist. <a href="#/">Back to browse</a>.</p>`;
  }

  // ---------- router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("#")[0].split("?")[0].split("/");
    return { view: parts[0] || "browse", id: decodeURIComponent(parts[1] || "") };
  }

  function render() {
    if (observer) { observer.disconnect(); observer = null; }
    cleanup.forEach((fn) => fn());
    cleanup = [];
    maps.forEach((m) => m.remove());
    maps = [];
    const r = route();
    document.querySelectorAll(".tabs a").forEach((a) => {
      const v = a.dataset.view;
      a.classList.toggle("active", v === r.view || (v === "index" && r.view === "type") || (v === "browse" && r.view === "example"));
    });
    switch (r.view) {
      case "browse": viewBrowse(); break;
      case "index": viewIndex(); break;
      case "categories": viewCategories(); break;
      case "map": viewMap(); break;
      case "type": viewType(r.id); break;
      case "example": viewExample(r.id); break;
      case "add": viewAdd(); break;
      case "about": viewAbout(); break;
      default: notFound();
    }
  }

  let lastHash = null;
  window.addEventListener("hashchange", () => {
    const base = location.hash.split("#").slice(0, 2).join("#");
    const changedPage = base !== lastHash;
    lastHash = base;
    render();
    if (changedPage && !location.hash.split("#")[2]) window.scrollTo(0, 0);
  });

  search.addEventListener("input", () => {
    state.query = search.value.trim();
    const v = route().view;
    if (v === "type" || v === "example" || v === "about" || v === "add") location.hash = "#/";
    else render();
  });

  fetch("data/catalog.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      state.data = data;
      data.types.forEach((t) => (state.typeById[t.id] = t));
      data.categories.forEach((c) => (state.catById[c.id] = c));
      data.examples.forEach((e) => (state.exById[e.id] = e));
      data.gem_trackers.forEach((t) => (state.trackerById[t.id] = t));
      document.getElementById("generated").textContent = "· Updated " + data.generated.slice(0, 10);
      lastHash = location.hash.split("#").slice(0, 2).join("#");
      render();
    })
    .catch(() => {
      main.innerHTML = `<h1>No data yet</h1><p class="empty">Couldn't load <code>data/catalog.json</code>. Run <code>python3 scripts/build.py</code> and serve the <code>site/</code> folder.</p>`;
    });
})();
