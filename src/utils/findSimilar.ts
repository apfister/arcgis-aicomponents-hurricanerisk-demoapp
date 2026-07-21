import FeatureEffect from "@arcgis/core/layers/support/FeatureEffect";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import type Query from "@arcgis/core/rest/support/Query";
import type { MapContext } from "./mapContext";
import {
  EMBEDDING_FIELDS,
  MAX_CANDIDATE_HEXES,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../config";
import { getSelection } from "../state/selection";

export interface FindSimilarResult {
  status: "ok" | "no-selection" | "too-many" | "no-matches";
  queryCount: number;
  candidateCount: number;
  matchedCount: number;
  threshold: number;
  message: string;
}

/** Extracts the 256-dim embedding vector from a feature's attributes. */
function embeddingOf(attributes: Record<string, unknown>): number[] {
  return EMBEDDING_FIELDS.map((f) => {
    const v = Number(attributes[f]);
    return Number.isFinite(v) ? v : 0;
  });
}

/** Element-wise mean of one or more equal-length vectors. */
function meanVector(vectors: number[][]): number[] {
  const dims = vectors[0].length;
  const sum = new Array<number>(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) sum[i] += v[i];
  }
  return sum.map((s) => s / vectors.length);
}

/** Cosine similarity between two equal-length vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Mirrors ArcGIS Pro "Find Similar" client-side:
 * builds a mean query vector from the selected hex bins, scores every hex bin in
 * the current map extent by cosine similarity, and highlights those at or above
 * the threshold.
 */
export async function runFindSimilar(
  ctx: MapContext,
  options: { threshold?: number } = {},
): Promise<FindSimilarResult> {
  const threshold = clampThreshold(
    options.threshold ?? DEFAULT_SIMILARITY_THRESHOLD,
  );
  const selectedIds = getSelection();

  if (selectedIds.length === 0) {
    return {
      status: "no-selection",
      queryCount: 0,
      candidateCount: 0,
      matchedCount: 0,
      threshold,
      message:
        "Select one or more hex bins on the map first (click them), then ask me to find similar ones.",
    };
  }

  const { hexLayer, view, objectIdField } = ctx;

  // 1. Mean query vector from the selected hex bins.
  const selectionSet = await hexLayer.queryFeatures({
    objectIds: selectedIds,
    outFields: EMBEDDING_FIELDS,
    returnGeometry: false,
  } as Query);
  const queryVectors = selectionSet.features.map((f) =>
    embeddingOf(f.attributes),
  );
  if (queryVectors.length === 0) {
    return {
      status: "no-selection",
      queryCount: 0,
      candidateCount: 0,
      matchedCount: 0,
      threshold,
      message: "The selected hex bins could not be read. Try selecting again.",
    };
  }
  const queryVector = meanVector(queryVectors);

  // 2. Scale guard: too many candidate hexes in view -> ask the user to zoom in.
  const extentQuery = {
    geometry: view.extent,
    spatialRelationship: "intersects",
  } as Query;
  const candidateCount = await hexLayer.queryFeatureCount(extentQuery);
  if (candidateCount > MAX_CANDIDATE_HEXES) {
    clearMatchEffect(ctx);
    return {
      status: "too-many",
      queryCount: queryVectors.length,
      candidateCount,
      matchedCount: 0,
      threshold,
      message: `There are ${candidateCount.toLocaleString()} hex bins in the current view, which is too many to compare (limit ${MAX_CANDIDATE_HEXES.toLocaleString()}). Zoom in and ask again.`,
    };
  }

  // 3. Score every candidate in the current extent.
  const candidateSet = await hexLayer.queryFeatures({
    geometry: view.extent,
    spatialRelationship: "intersects",
    outFields: [objectIdField, ...EMBEDDING_FIELDS],
    returnGeometry: false,
    num: MAX_CANDIDATE_HEXES,
  } as Query);

  const selectedSet = new Set(selectedIds);
  const matches: number[] = [];
  for (const feature of candidateSet.features) {
    const oid = feature.attributes[objectIdField] as number;
    if (selectedSet.has(oid)) continue; // don't match the query hexes to themselves
    const similarity = cosineSimilarity(queryVector, embeddingOf(feature.attributes));
    if (similarity >= threshold) matches.push(oid);
  }

  // 4. Highlight the matches (and dim everything else).
  if (matches.length === 0) {
    clearMatchEffect(ctx);
    return {
      status: "no-matches",
      queryCount: queryVectors.length,
      candidateCount,
      matchedCount: 0,
      threshold,
      message: `No hex bins in the current view scored at or above ${threshold.toFixed(2)} similarity. Try lowering the threshold or selecting a different hex bin.`,
    };
  }

  await applyMatchEffect(ctx, matches);
  return {
    status: "ok",
    queryCount: queryVectors.length,
    candidateCount,
    matchedCount: matches.length,
    threshold,
    message: `Highlighted ${matches.length} hex bin${matches.length === 1 ? "" : "s"} in the current view with at least ${threshold.toFixed(2)} cosine similarity to your ${queryVectors.length} selected hex bin${queryVectors.length === 1 ? "" : "s"}.`,
  };
}

async function applyMatchEffect(
  ctx: MapContext,
  matchedIds: number[],
): Promise<void> {
  // Dim everything else and give matches a modest glow. The bold outline below
  // is the primary signal; the glow just helps it lift off dark imagery.
  ctx.layerView.featureEffect = new FeatureEffect({
    filter: { objectIds: matchedIds },
    includedEffect: "drop-shadow(0 0 5px #00ffd5) brightness(1.12) saturate(180%)",
    excludedEffect: "opacity(0.1) grayscale(85%)",
  });

  // Redraw the matched hex bins on an overlay with a bold bright-teal outline so
  // the actual hex boundary changes, not just a soft glow around it.
  await drawMatchOutlines(ctx, matchedIds);
}

/** Overlay layer holding the bold outlines of the current matches. */
let outlineLayer: GraphicsLayer | null = null;

/** The bright-teal outline drawn over each matched hex bin. */
const MATCH_SYMBOL = new SimpleFillSymbol({
  color: [0, 255, 213, 0.12],
  outline: { color: [0, 255, 213, 1], width: 2.5 },
});

/** Ensures the overlay layer exists on the map (hidden from the layer list). */
function ensureOutlineLayer(ctx: MapContext): GraphicsLayer {
  if (!outlineLayer) {
    outlineLayer = new GraphicsLayer({
      title: "Find-similar matches",
      listMode: "hide",
    });
  }
  if (ctx.view.map && !ctx.view.map.layers.includes(outlineLayer)) {
    ctx.view.map.add(outlineLayer);
  }
  return outlineLayer;
}

/** Queries the matched hex geometries and draws bold outlines over them. */
async function drawMatchOutlines(
  ctx: MapContext,
  matchedIds: number[],
): Promise<void> {
  const layer = ensureOutlineLayer(ctx);
  layer.removeAll();
  const { features } = await ctx.hexLayer.queryFeatures({
    objectIds: matchedIds,
    returnGeometry: true,
    outFields: [ctx.objectIdField],
  } as Query);
  layer.addMany(
    features
      .filter((f) => f.geometry)
      .map((f) => new Graphic({ geometry: f.geometry, symbol: MATCH_SYMBOL })),
  );
}

/** Removes any active find-similar highlight effect. */
export function clearMatchEffect(ctx: MapContext): void {
  ctx.layerView.featureEffect = null;
  outlineLayer?.removeAll();
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIMILARITY_THRESHOLD;
  return Math.min(1, Math.max(0, value));
}
