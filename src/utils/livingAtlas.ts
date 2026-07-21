import Layer from "@arcgis/core/layers/Layer.js";
import PortalItem from "@arcgis/core/portal/PortalItem.js";
import type { MapContext } from "./mapContext";

/** One askable Living Atlas layer in the curated catalog. */
export interface CatalogLayer {
  /** ArcGIS portal item ID (the live Living Atlas item). */
  id: string;
  /** Display title shown to the user. */
  title: string;
  /** Brief summary from the item's details page, shown to the user. */
  summary: string;
  /** Keyword tags used for plain-language matching. */
  keywords: string[];
  /** Optional caveat surfaced to the user (e.g. subscription requirement). */
  note?: string;
}

/**
 * The curated set of Living Atlas layers the assistant may search and add.
 * Each entry points at a live Esri-hosted item by portal item ID, so it keeps
 * the authored symbology and popups. This list is the ONLY thing the agent can
 * add — it can never invent an item ID.
 */
export const LIVING_ATLAS_CATALOG: CatalogLayer[] = [
  {
    id: "248e7b5827a34b248647afb012c58787",
    title: "Active Hurricanes, Cyclones and Typhoons",
    summary:
      "Live forecast positions, tracks, and error cones for active tropical cyclones worldwide, from NOAA/NHC.",
    keywords: [
      "active hurricanes",
      "hurricane",
      "hurricanes",
      "cyclone",
      "cyclones",
      "typhoon",
      "typhoons",
      "tropical storm",
      "forecast",
      "cone",
      "current storms",
      "live storms",
    ],
  },
  {
    id: "adfe292a67f8471a9d8230ef93294414",
    title: "Recent Hurricanes, Cyclones and Typhoons",
    summary:
      "Observed positions and tracks for tropical cyclones from the past several days.",
    keywords: [
      "recent hurricanes",
      "hurricane",
      "cyclone",
      "typhoon",
      "tropical storm",
      "recent storms",
      "past storms",
      "storm tracks",
    ],
  },
  {
    id: "a6134ae01aad44c499d12feec782b386",
    title: "USA Weather Watches and Warnings",
    summary:
      "Current National Weather Service watches, warnings, and advisories across the US.",
    keywords: [
      "weather warnings",
      "watches",
      "warnings",
      "advisories",
      "severe weather",
      "nws",
      "alerts",
      "storm warnings",
    ],
  },
  {
    id: "e109e8fd9c5a495c813b5cbaee9c7d9b",
    title: "USA Storm Reports",
    summary:
      "Recent NWS storm reports of tornadoes, hail, and damaging wind.",
    keywords: [
      "storm reports",
      "tornado",
      "hail",
      "wind",
      "severe weather",
      "storm damage",
    ],
  },
  {
    id: "33820e818ebc4661b01bcd47e5f2a57e",
    title: "National Weather Service Wind Forecast",
    summary:
      "National Digital Forecast Database wind speed and gust predictions.",
    keywords: [
      "wind forecast",
      "wind",
      "wind gust",
      "wind speed",
      "gust",
      "forecast",
    ],
  },
  {
    id: "0ec8512ad21e4bb987d7e848d14e7e24",
    title: "USA Structures",
    summary:
      "FEMA/USGS building footprints for structures across the United States.",
    keywords: [
      "structures",
      "buildings",
      "building footprints",
      "footprints",
      "infrastructure",
      "fema",
    ],
  },
  {
    id: "ff11eb5b930b4fabba15c47feb130de4",
    title: "World Traffic Service",
    summary:
      "Near real-time traffic speeds and reported incidents worldwide.",
    keywords: [
      "traffic",
      "congestion",
      "traffic incidents",
      "roads",
      "transportation",
      "real-time traffic",
    ],
    note: "Requires an ArcGIS organizational subscription to display.",
  },
  {
    id: "11955f1b47ec41a3af86650824e0c634",
    title: "USA Flood Hazard Areas",
    summary:
      "FEMA National Flood Hazard Layer showing floodplains and special flood hazard areas.",
    keywords: [
      "flood",
      "flooding",
      "flood hazard",
      "flood zones",
      "floodplain",
      "sfha",
      "flood insurance",
      "fema",
    ],
    note: "Requires an ArcGIS organizational subscription; display-only raster (not clickable features).",
  },
  {
    id: "d053e72aabfd4c5ab4139c3829c1e11c",
    title: "Historical Hurricane Tracks",
    summary:
      "Historical tropical cyclone tracks (lines) from NOAA IBTrACS, 1842 to present.",
    keywords: [
      "historical hurricanes",
      "hurricane tracks",
      "past hurricanes",
      "tropical cyclone",
      "typhoon",
      "noaa",
      "ibtracs",
      "storm tracks",
    ],
  },
  {
    id: "9da4eeb936544335a6db0cd7a8448a51",
    title: "National Risk Index (Census Tracts)",
    summary:
      "FEMA National Risk Index by census tract: 18 natural hazards, expected annual loss, and social vulnerability.",
    keywords: [
      "national risk index",
      "nri",
      "natural hazard risk",
      "risk index",
      "social vulnerability",
      "expected annual loss",
      "community resilience",
      "fema",
      "hazard risk",
    ],
  },
  {
    id: "e75412d18bdc469dbf89bf7e929475cc",
    title: "Tornado Tracks",
    summary: "NOAA tornado tracks across the US, 1950 to present.",
    keywords: [
      "tornado",
      "tornado tracks",
      "tornadoes",
      "severe weather",
      "noaa",
    ],
  },
  {
    id: "5b564bbefa2c482982de7f092dc4f9c9",
    title: "Recent Earthquakes (USGS)",
    summary:
      "USGS live feed of earthquakes from the past 30 days, styled by magnitude.",
    keywords: [
      "earthquake",
      "earthquakes",
      "recent earthquakes",
      "seismic",
      "shakemap",
      "usgs",
      "tremor",
    ],
  },
  {
    id: "79461a1ec0974301bde274177c7108bd",
    title: "Global Earthquake Archive",
    summary:
      "USGS archive of magnitude 4.0+ earthquakes worldwide since 1900.",
    keywords: [
      "earthquake",
      "earthquakes",
      "historical earthquakes",
      "earthquake archive",
      "seismic",
      "usgs",
    ],
  },
  {
    id: "8f5deec9956e4a8cb1f13dfd8c0232db",
    title: "Standardized Precipitation Index (Drought)",
    summary:
      "Standardized Precipitation Index showing recent drought and wet conditions.",
    keywords: [
      "drought",
      "precipitation",
      "spi",
      "standardized precipitation index",
      "dry conditions",
      "rainfall",
    ],
  },
];

const CATALOG_BY_ID = new Map(LIVING_ATLAS_CATALOG.map((c) => [c.id, c] as const));

/**
 * Resolves a catalog entry from a title the assistant offered the user. Matches
 * case-insensitively, exact first, then a unique substring match.
 */
export function findCatalogByTitle(title: string): CatalogLayer | undefined {
  const needle = title.toLowerCase().trim();
  const exact = LIVING_ATLAS_CATALOG.find(
    (c) => c.title.toLowerCase() === needle,
  );
  if (exact) return exact;
  const partial = LIVING_ATLAS_CATALOG.filter(
    (c) => c.title.toLowerCase().includes(needle) || needle.includes(c.title.toLowerCase()),
  );
  return partial.length === 1 ? partial[0] : undefined;
}

/**
 * Keyword-matches a plain-language request against the catalog. Returns the
 * best-scoring entries, or the whole catalog when nothing matches (so the agent
 * can offer what's available instead of dead-ending).
 */
export function searchCatalog(query: string): CatalogLayer[] {
  const q = query.toLowerCase().trim();
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);

  const scored = LIVING_ATLAS_CATALOG.map((entry) => {
    const haystack = [entry.title, ...entry.keywords].join(" ").toLowerCase();
    let score = 0;
    if (q && haystack.includes(q)) score += 2;
    for (const term of terms) if (haystack.includes(term)) score += 1;
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry);

  return scored.length > 0 ? scored : LIVING_ATLAS_CATALOG;
}

/** Finds a catalog layer already on the map (dedupe by portal item ID). */
function findLayerOnMap(ctx: MapContext, id: string) {
  return ctx.view.map?.layers.find((layer) => {
    const portalItem = (layer as unknown as { portalItem?: { id?: string } })
      .portalItem;
    return portalItem?.id === id;
  });
}

/** The outcome of an add request, as a message for the assistant to relay. */
export interface AddLayerResult {
  ok: boolean;
  message: string;
}

/**
 * Adds a catalog layer to the map as a live, session-only layer (cleared on
 * refresh, never persisted to the web map). Only IDs in the catalog can be
 * added; duplicates are ignored.
 */
export async function addCatalogLayer(
  ctx: MapContext,
  layerId: string,
): Promise<AddLayerResult> {
  const entry = CATALOG_BY_ID.get(layerId);
  if (!entry) {
    return {
      ok: false,
      message: `"${layerId}" is not in the Living Atlas catalog, so it can't be added.`,
    };
  }
  if (!ctx.view.map) {
    return { ok: false, message: "The map isn't ready yet. Try again in a moment." };
  }
  if (findLayerOnMap(ctx, entry.id)) {
    return { ok: true, message: `"${entry.title}" is already on the map.` };
  }

  try {
    const layer = await Layer.fromPortalItem({
      portalItem: new PortalItem({ id: entry.id }),
    });
    // Place the layer just below the hex embeddings layer (which must stay on
    // top so it remains selectable) but above the other operational layers.
    const map = ctx.view.map;
    const hexIndex = map.layers.indexOf(ctx.hexLayer);
    if (hexIndex >= 0) {
      map.add(layer, hexIndex);
    } else {
      map.add(layer);
    }
    const note = entry.note ? ` Note: ${entry.note}` : "";
    return { ok: true, message: `Added "${entry.title}" to the map.${note}` };
  } catch (err) {
    console.error("[living-atlas] add failed:", err);
    return {
      ok: false,
      message: `Couldn't add "${entry.title}" — it may require a subscription or be temporarily unavailable.`,
    };
  }
}
