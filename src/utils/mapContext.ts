import type MapView from "@arcgis/core/views/MapView";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView";
import { config } from "../config";
import { isReportableField } from "./describeHex";

/** The arcgis-map custom element, once its view is ready. */
export interface ArcgisMapElement extends HTMLElement {
  viewOnReady(): Promise<void>;
  readonly view: MapView;
  readonly ready: boolean;
}

/** Resolved map objects needed by the find-similar agent. */
export interface MapContext {
  view: MapView;
  hexLayer: FeatureLayer;
  layerView: FeatureLayerView;
  objectIdField: string;
  /** Optional layer holding human-readable risk/demographic fields, joined by a shared key. */
  demographicsLayer: FeatureLayer | null;
  /** Human-readable inventory of the map's feature layers, for diagnostics. */
  layerInfo: string;
}

/**
 * Waits for the map view to be ready, locates the hex-bin FeatureLayer
 * (by configured title, else the first layer with an emb_0 field), and
 * resolves its layer view.
 */
export async function resolveMapContext(
  mapEl: ArcgisMapElement,
): Promise<MapContext> {
  await mapEl.viewOnReady();
  const view = mapEl.view;
  await view.when();

  const hexLayer = await findHexLayer(view);
  if (!hexLayer) {
    throw new Error(
      "Could not find a hex-bin layer with an 'emb_0' field in this map.",
    );
  }

  const layerView = (await view.whenLayerView(hexLayer)) as FeatureLayerView;
  const demographicsLayer = await findDemographicsLayer(view, hexLayer);
  const layerInfo = await describeFeatureLayers(view, hexLayer, demographicsLayer);
  return {
    view,
    hexLayer,
    layerView,
    objectIdField: hexLayer.objectIdField,
    demographicsLayer,
    layerInfo,
  };
}

/** Returns the map's FeatureLayers as an array. */
function getFeatureLayers(view: MapView): FeatureLayer[] {
  if (!view.map) return [];
  return (
    view.map.allLayers.filter((layer) => layer.type === "feature") as unknown as {
      toArray(): FeatureLayer[];
    }
  ).toArray();
}

/** Builds a diagnostic string of the map's feature layers and their roles. */
async function describeFeatureLayers(
  view: MapView,
  hexLayer: FeatureLayer,
  demographicsLayer: FeatureLayer | null,
): Promise<string> {
  const layers = getFeatureLayers(view);
  await Promise.all(layers.map((l) => l.load().catch(() => undefined)));
  const parts = layers.map((l) => {
    const role =
      l === hexLayer
        ? "embeddings"
        : l === demographicsLayer
          ? "demographics"
          : "other";
    return `"${l.title}" [${role}, ${countDemographicFields(l)} demographic fields]`;
  });
  return parts.join("; ") || "(no feature layers)";
}

async function findHexLayer(view: MapView): Promise<FeatureLayer | null> {
  if (!view.map) return null;
  const candidates = view.map.allLayers.filter(
    (layer) => layer.type === "feature",
  ) as unknown as { toArray(): FeatureLayer[] };

  const featureLayers = candidates.toArray();

  // Prefer an exact title match when configured.
  const byTitle = config.hexLayerTitle
    ? featureLayers.find((l) => l.title === config.hexLayerTitle)
    : undefined;
  if (byTitle) {
    await byTitle.load();
    return byTitle;
  }

  for (const layer of featureLayers) {
    await layer.load();
    if (layer.fields?.some((f) => f.name === "emb_0")) {
      return layer;
    }
  }
  return null;
}

/**
 * Locates the demographics hex layer within the web map. Prefers the configured
 * title (case-insensitive / partial match), but always falls back to "the other
 * feature layer that actually carries the most demographic fields" — so it works
 * even when the title env var is unset or the layer title differs. Returns null
 * only when no other feature layer has demographic attributes.
 */
async function findDemographicsLayer(
  view: MapView,
  hexLayer: FeatureLayer,
): Promise<FeatureLayer | null> {
  if (!view.map) return null;
  const others = getFeatureLayers(view).filter((l) => l !== hexLayer);
  if (others.length === 0) return null;

  const norm = (t?: string | null) => (t ?? "").trim().toLowerCase();
  const wanted = norm(config.demographicsLayerTitle);

  // 1. Prefer a configured title match (exact, then partial either direction).
  if (wanted) {
    const byTitle =
      others.find((l) => norm(l.title) === wanted) ??
      others.find(
        (l) => norm(l.title).includes(wanted) || wanted.includes(norm(l.title)),
      );
    if (byTitle) {
      await byTitle.load();
      return byTitle;
    }
  }

  // 2. Fallback: the feature layer (other than the embeddings layer) with the
  //    most demographic fields.
  let best: FeatureLayer | undefined;
  let bestCount = 0;
  for (const l of others) {
    await l.load();
    const count = countDemographicFields(l);
    if (count > bestCount) {
      bestCount = count;
      best = l;
    }
  }
  if (best && bestCount >= 1) return best;

  const present =
    others.map((l) => l.title).join(", ") || "(no other feature layers)";
  console.warn(
    `No demographics layer found in this web map (item ${config.webMapItemId}). ` +
      `Other feature layers present: ${present}.`,
  );
  return null;
}

/** Counts a layer's fields that would be shown as demographics (non-embedding, non-system). */
function countDemographicFields(layer: FeatureLayer): number {
  return (layer.fields ?? []).filter((f) => isReportableField(f.name, layer))
    .length;
}
