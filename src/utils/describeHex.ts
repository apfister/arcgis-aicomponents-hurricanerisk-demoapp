import type Query from "@arcgis/core/rest/support/Query";
import type Graphic from "@arcgis/core/Graphic";
import type Point from "@arcgis/core/geometry/Point";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type { MapContext } from "./mapContext";
import { getSelection } from "../state/selection";
import { config, EMBEDDING_FIELDS } from "../config";

const EMBEDDING_SET = new Set(EMBEDDING_FIELDS);

/** GeoEnrichment/system fields that carry no demographic meaning for the user. */
const NOISE_FIELDS = new Set(
  [
    "enrich_fid",
    "enrich_field",
    "aggregationmethod",
    "populationtopolygonsizerating",
    "apportionmentconfidence",
    "hasdata",
    "sourcecountry",
    "objectid_1",
  ].map((n) => n.toLowerCase()),
);

/** Friendly short labels for known enrichment fields (falls back to alias). */
const METRIC_LABELS: Record<string, string> = {
  populationtotals_TOTPOP_CY: "Total Population",
  householdincome_MEDHINC_CY: "Median Household Income",
  householdtype_POP65PL20_P: "Population Ages 65+",
  ElectronicsInternet_MP19001a_B_P: "Home Internet Access",
  TapestryHouseholds_THHSNAME: "Dominant Tapestry Segment",
  AtRisk_ACSTOTHH: "Total Households",
};

/** Preferred display order; unknown fields are appended after these. */
const METRIC_ORDER = [
  "populationtotals_TOTPOP_CY",
  "householdincome_MEDHINC_CY",
  "householdtype_POP65PL20_P",
  "AtRisk_ACSTOTHH",
  "ElectronicsInternet_MP19001a_B_P",
  "TapestryHouseholds_THHSNAME",
];

/** Bounds for the "what do these areas have in common" comparison. */
const MIN_COMPARE_HEXES = 2;
const MAX_COMPARE_HEXES = 20;

/** Enrichment fields known to signal hurricane vulnerability (exact names). */
const VULNERABILITY_FIELDS = new Set<string>([
  "householdtype_POP65PL20_P", // share of residents 65+
  "householdincome_MEDHINC_CY", // low income reduces resilience
  "ElectronicsInternet_MP19001a_B_P", // low home internet slows alerts
]);

/**
 * Field/alias keywords that also mark a vulnerability factor when the exact
 * enrichment field name isn't known ahead of time (vehicle access, disability,
 * poverty). Matched case-insensitively against the field name and its alias.
 */
const VULNERABILITY_KEYWORDS = ["vehicle", "disab", "poverty"];

/** ArcGIS field types treated as numeric for min/max/avg aggregation. */
const NUMERIC_FIELD_TYPES = new Set([
  "small-integer",
  "integer",
  "single",
  "double",
  "long",
]);

/** A single formatted demographic metric for display. */
export interface HexMetric {
  field: string;
  label: string;
  value: string;
}

/** Formatted demographics for one hex bin. */
export interface HexDemographics {
  id: string | number | null;
  metrics: HexMetric[];
}

/**
 * Queries the demographics layer for the selected hex bins and returns their
 * attributes as formatted, display-ready metrics plus a short diagnostic about
 * how the join was performed. Empty when nothing is selected or no demographics
 * layer is configured.
 */
export async function fetchHexDemographics(
  ctx: MapContext,
  objectIds: number[] = getSelection(),
): Promise<{ hexes: HexDemographics[]; diagnostic: string }> {
  const demo = ctx.demographicsLayer;
  if (!demo || objectIds.length === 0) {
    return { hexes: [], diagnostic: "no demographics layer or no selection" };
  }

  const { features, diagnostic } = await queryDemographics(ctx, demo, objectIds);
  const fieldIndex = new Map(
    (demo.fields ?? []).map((f) => [f.name, f] as const),
  );

  const hexes = features.map((feat) => {
    const attrs = feat.attributes as Record<string, unknown>;
    const metrics = Object.keys(attrs)
      .filter((name) => isReportableField(name, demo))
      .filter((name) => !isIdentifierValue(attrs[name]))
      .sort(byPreferredOrder)
      .map((name) => {
        const field = fieldIndex.get(name);
        return {
          field: name,
          label: METRIC_LABELS[name] ?? field?.alias ?? name,
          value: formatValue(attrs[name], name, field?.alias ?? undefined),
        };
      });
    const idField = config.hexKeyField || demo.objectIdField;
    return { id: (attrs[idField] as string | number) ?? null, metrics };
  });
  return { hexes, diagnostic };
}

/**
 * Summarizes the risk/demographic attributes of the currently selected hex
 * bins as a human-readable string for the assistant to relay.
 */
export async function describeSelectedHexes(ctx: MapContext): Promise<string> {
  const ids = getSelection();
  if (ids.length === 0) {
    return "No hex bins are selected. Click one or more hex bins on the map first, then ask again.";
  }
  if (!ctx.demographicsLayer) {
    return (
      "No demographics layer is available. Publish a demographics hex layer to the " +
      "web map and set VITE_DEMOGRAPHICS_LAYER_TITLE (and VITE_HEX_KEY_FIELD if the " +
      "layers are joined by a field other than ObjectID). " +
      `Feature layers found in this map: ${ctx.layerInfo}.`
    );
  }

  const { hexes, diagnostic } = await fetchHexDemographics(ctx, ids);
  console.log("[demographics] join diagnostic:", diagnostic);
  if (hexes.length === 0) {
    return `No demographics were found for the selected hex bins (${diagnostic}).`;
  }

  return hexes
    .map((hex, index) => {
      const label =
        hexes.length > 1 ? `Hex bin ${index + 1}` : "Selected hex bin";
      const lines = hex.metrics.map((m) => `  ${m.label}: ${m.value}`);
      return `${label}:\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/**
 * Compares the selected hex bins and summarizes what they have in common —
 * shared vulnerability factors first, then other shared context — as ranges and
 * averages the assistant narrates. Requires at least two selected hexes and
 * compares at most MAX_COMPARE_HEXES to bound the per-hex join queries.
 */
export async function summarizeHexCommonalities(
  ctx: MapContext,
): Promise<string> {
  const all = getSelection();
  if (all.length < MIN_COMPARE_HEXES) {
    return (
      "Select at least two hex bins to compare. Click two or more hex bins on the " +
      "map, then ask what they have in common."
    );
  }
  if (!ctx.demographicsLayer) {
    return (
      "No demographics layer is available. Publish a demographics hex layer to the " +
      "web map and set VITE_DEMOGRAPHICS_LAYER_TITLE (and VITE_HEX_KEY_FIELD if the " +
      "layers are joined by a field other than ObjectID). " +
      `Feature layers found in this map: ${ctx.layerInfo}.`
    );
  }

  const ids = all.slice(0, MAX_COMPARE_HEXES);
  const truncated = all.length > MAX_COMPARE_HEXES;
  const demo = ctx.demographicsLayer;

  const { features, diagnostic } = await queryDemographics(ctx, demo, ids);
  console.log("[commonalities] join diagnostic:", diagnostic);
  if (features.length < MIN_COMPARE_HEXES) {
    return `Could not compare the selected hex bins — only ${features.length} matched the demographics layer (${diagnostic}).`;
  }

  const fieldIndex = new Map(
    (demo.fields ?? []).map((f) => [f.name, f] as const),
  );

  // Reportable field names present across the matched hexes.
  const fieldNames = new Set<string>();
  for (const feat of features) {
    for (const name of Object.keys(feat.attributes as Record<string, unknown>)) {
      if (isReportableField(name, demo)) fieldNames.add(name);
    }
  }

  const vulnerability: string[] = [];
  const other: string[] = [];

  for (const name of [...fieldNames].sort(byPreferredOrder)) {
    const field = fieldIndex.get(name);
    const alias = field?.alias ?? undefined;
    const label = METRIC_LABELS[name] ?? alias ?? name;
    const values = features
      .map((f) => (f.attributes as Record<string, unknown>)[name])
      .filter((v) => v !== null && v !== undefined && v !== "")
      .filter((v) => !isIdentifierValue(v));
    if (values.length === 0) continue;

    const numeric =
      field != null &&
      NUMERIC_FIELD_TYPES.has(field.type) &&
      values.every((v) => typeof v === "number");

    let line: string;
    if (numeric) {
      const nums = values as number[];
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const fmt = (n: number) => formatValue(n, name, alias);
      const spread =
        min === max
          ? `all ${fmt(min)}`
          : `${fmt(min)}–${fmt(max)} (avg ${fmt(mean)})`;
      const coverage =
        nums.length < features.length
          ? ` [${nums.length}/${features.length} hexes have a value]`
          : "";
      line = `${label}: ${spread}${coverage}`;
    } else {
      const counts = new Map<string, number>();
      for (const v of values) {
        const key = String(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 1) {
        line = `${label}: all "${[...counts.keys()][0]}"`;
      } else {
        const parts = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([v, c]) => `"${v}" (${c})`);
        line = `${label}: ${parts.join(", ")}`;
      }
    }

    if (isVulnerabilityFactor(name, alias)) vulnerability.push(line);
    else other.push(line);
  }

  const header = `Comparing ${features.length} selected hex bins${
    truncated
      ? ` (of ${all.length} selected; showing the first ${MAX_COMPARE_HEXES})`
      : ""
  }.`;
  const sections: string[] = [header];
  if (vulnerability.length > 0) {
    sections.push(
      "Vulnerability factors across these hex bins:\n" +
        vulnerability.map((l) => `  ${l}`).join("\n"),
    );
  }
  if (other.length > 0) {
    sections.push(
      "Other demographics across these hex bins:\n" +
        other.map((l) => `  ${l}`).join("\n"),
    );
  }
  return sections.join("\n\n");
}

/**
 * Joins each selected embeddings hex to its coincident demographics hex by
 * geometry. Both hex layers tile the same space, so the centroid of a selected
 * hex falls inside exactly one demographics hex — a robust match that does not
 * depend on a shared key field.
 */
async function queryDemographics(
  ctx: MapContext,
  demo: FeatureLayer,
  selectedIds: number[],
): Promise<{ features: Graphic[]; diagnostic: string }> {
  const geomResult = await ctx.hexLayer.queryFeatures({
    objectIds: selectedIds,
    outFields: [ctx.hexLayer.objectIdField],
    returnGeometry: true,
  } as unknown as Query);

  const features: Graphic[] = [];
  let attempted = 0;
  for (const hex of geomResult.features) {
    const point = centroidOf(hex.geometry);
    if (!point) continue;
    attempted++;
    const match = await demo.queryFeatures({
      geometry: point,
      spatialRelationship: "intersects",
      outFields: ["*"],
      returnGeometry: false,
      num: 1,
    } as unknown as Query);
    if (match.features[0]) features.push(match.features[0]);
  }

  return {
    features,
    diagnostic: `spatial join by centroid; ${features.length}/${attempted} selected hexes matched`,
  };
}

/** Returns a point inside the geometry to use for the coincident-hex lookup. */
function centroidOf(geometry: Graphic["geometry"]): Point | null {
  if (!geometry) return null;
  if (geometry.type === "polygon") return geometry.centroid ?? null;
  if (geometry.type === "point") return geometry;
  return null;
}


/** Whether a field should be shown to the user (skips embeddings and system fields). */
export function isReportableField(name: string, layer: FeatureLayer): boolean {
  if (EMBEDDING_SET.has(name)) return false;
  if (name === layer.objectIdField) return false;
  const lower = name.toLowerCase();
  if (lower === "id") return false;
  if (config.hexKeyField && lower === config.hexKeyField.toLowerCase())
    return false;
  if (lower === "globalid" || lower.startsWith("shape")) return false;
  if (NOISE_FIELDS.has(lower)) return false;
  return true;
}

/** True when a value looks like an H3 / hex-grid index rather than a metric. */
function isIdentifierValue(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{15,16}$/i.test(value);
}

/** Whether a field signals hurricane vulnerability (by exact name or keyword). */
function isVulnerabilityFactor(name: string, alias?: string): boolean {
  if (VULNERABILITY_FIELDS.has(name)) return true;
  const hay = `${name} ${alias ?? ""}`.toLowerCase();
  return VULNERABILITY_KEYWORDS.some((k) => hay.includes(k));
}

/** Sorts field names by the preferred display order, unknowns last. */
function byPreferredOrder(a: string, b: string): number {
  const ia = METRIC_ORDER.indexOf(a);
  const ib = METRIC_ORDER.indexOf(b);
  const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
  const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
  return ra - rb;
}

/** Formats an attribute value based on the field name/alias heuristics. */
function formatValue(value: unknown, name: string, alias?: string): string {
  if (value === null || value === undefined || value === "") return "n/a";

  const hint = `${name} ${alias ?? ""}`.toLowerCase();
  if (typeof value === "number") {
    // Percent must win over currency: a "% below poverty" field's alias also
    // contains "income", which would otherwise be formatted as dollars.
    const isPercent =
      name.endsWith("_P") ||
      hint.includes("percent") ||
      hint.includes("%") ||
      hint.includes("poverty");
    if (isPercent) {
      return `${round(value, 1)}%`;
    }
    if (hint.includes("income") || hint.includes("medhinc")) {
      return `$${Math.round(value).toLocaleString()}`;
    }
    return Number.isInteger(value)
      ? value.toLocaleString()
      : round(value, 2).toLocaleString();
  }
  return String(value);
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
