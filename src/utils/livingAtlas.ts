import Layer from "@arcgis/core/layers/Layer.js";
import PortalItem from "@arcgis/core/portal/PortalItem.js";
import Portal from "@arcgis/core/portal/Portal.js";
import PortalQueryParams from "@arcgis/core/portal/PortalQueryParams.js";
import { config } from "../config";
import type { MapContext } from "./mapContext";

/**
 * The mappable operational-layer item types the search is restricted to. Web
 * maps, scenes, tools, notebooks, etc. are excluded so every offered layer can
 * actually be added to the 2D map via Layer.fromPortalItem.
 */
const MAPPABLE_TYPES = [
  "Feature Service",
  "Map Service",
  "Image Service",
  "Vector Tile Service",
] as const;

/** How many candidates a single search returns. */
const MAX_RESULTS = 6;

/**
 * One search hit offered to the user, referenced by its 1-based `handle`. The
 * handle — not the portal item ID — is what the add step takes, so item IDs
 * never reach the language model.
 */
export interface LivingAtlasCandidate {
  handle: number;
  title: string;
  snippet: string;
  type: string;
}

/** The outcome of a Living Atlas search. */
export interface LivingAtlasSearchResult {
  candidates: LivingAtlasCandidate[];
  total: number;
}

/** The outcome of an add request, as a message for the assistant to relay. */
export interface AddLayerResult {
  ok: boolean;
  message: string;
}

/**
 * The last search's hits, keyed by handle. This is the opaque-handle cache: the
 * search tool fills it and returns numbered candidates; the add tool resolves a
 * handle back to a real item ID here. Its lifetime is the agent/session.
 */
let lastResults = new Map<number, { id: string; title: string; type: string }>();

let sharedPortal: Portal | null = null;
function getPortal(): Portal {
  if (!sharedPortal) {
    sharedPortal = new Portal({ url: config.portalUrl });
  }
  return sharedPortal;
}

/**
 * Searches the entire ArcGIS Living Atlas live for mappable layers matching a
 * plain-language request. Scoped to Living Atlas content
 * (`groupdesignations:livingatlas`, owner-independent) and to mappable layer
 * types, ordered by relevance. Caches the hits by handle for a later add.
 */
export async function searchLivingAtlas(
  query: string,
): Promise<LivingAtlasSearchResult> {
  const text = query.trim();
  const typeFilter = MAPPABLE_TYPES.map((t) => `type:"${t}"`).join(" OR ");
  const q = `${text} groupdesignations:livingatlas (${typeFilter})`;

  const portal = getPortal();
  await portal.load();
  // No sortField => relevance order (best text match first).
  const params = new PortalQueryParams({ query: q, num: MAX_RESULTS });
  const result = await portal.queryItems(params);

  lastResults = new Map();
  const candidates: LivingAtlasCandidate[] = [];
  for (const item of result.results) {
    if (!item.id) continue;
    const handle = candidates.length + 1;
    const title = item.title ?? "Untitled";
    const type = item.type ?? "";
    lastResults.set(handle, { id: item.id, title, type });
    candidates.push({ handle, title, snippet: item.snippet ?? "", type });
  }
  return { candidates, total: result.total };
}

/** Finds a layer already on the map (dedupe by portal item ID). */
function findLayerOnMap(ctx: MapContext, id: string) {
  return ctx.view.map?.layers.find((layer) => {
    const portalItem = (layer as unknown as { portalItem?: { id?: string } })
      .portalItem;
    return portalItem?.id === id;
  });
}

/**
 * Adds the candidate identified by `handle` (from the most recent search) to the
 * map as a live, session-only layer: cleared on refresh, never persisted. Placed
 * just below the hex embeddings layer so that stays on top and selectable.
 * Re-checks the item type and fails gracefully for subscription-only or
 * unavailable layers.
 */
export async function addLivingAtlasByHandle(
  ctx: MapContext,
  handle: number,
): Promise<AddLayerResult> {
  const entry = lastResults.get(handle);
  if (!entry) {
    return {
      ok: false,
      message: `There's no option #${handle} in the last search. Ask the user to pick one of the listed numbers.`,
    };
  }
  if (!(MAPPABLE_TYPES as readonly string[]).includes(entry.type)) {
    return {
      ok: false,
      message: `"${entry.title}" isn't a mappable layer, so it can't be added to the map.`,
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
    const map = ctx.view.map;
    const hexIndex = map.layers.indexOf(ctx.hexLayer);
    if (hexIndex >= 0) {
      map.add(layer, hexIndex);
    } else {
      map.add(layer);
    }
    return { ok: true, message: `Added "${entry.title}" to the map.` };
  } catch (err) {
    console.error("[living-atlas] add failed:", err);
    return {
      ok: false,
      message: `Couldn't add "${entry.title}" — it may require a subscription or be temporarily unavailable.`,
    };
  }
}
