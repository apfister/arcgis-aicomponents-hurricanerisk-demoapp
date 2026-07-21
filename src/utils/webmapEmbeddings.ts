import { getEmbeddings } from "@arcgis/ai-orchestrator";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import PortalItemResource from "@arcgis/core/portal/PortalItemResource.js";
import type PortalItem from "@arcgis/core/portal/PortalItem.js";
import type { ArcgisMapElement } from "./mapContext";

/** The resource name the arcgis-assistant reads web map embeddings from. */
const EMBEDDINGS_RESOURCE_PATH = "embeddings-v01.json";

// Schema constants required so the assistant accepts the generated file.
// (Mirrors @arcgis/ai-orchestrator's webmap embedding schema.)
const SCHEMA_VERSION = "0.1";
const MODEL_PROVIDER = "openai";
const MODEL = "text-embedding-ada-002";
const DIMENSIONS = 1536;
const LAYER_TEMPLATE = "Name: {name}\nTitle: {title}\nDescription: {description}";
const FIELD_TEMPLATE = "Name: {name}\nAlias: {alias}\nDescription: {description}";

interface EmbeddedField {
  name: string;
  alias: string;
  description: string;
  vector: number[];
}

interface EmbeddedLayer {
  id: string;
  name: string;
  title: string;
  description: string;
  vector: number[];
  fields: EmbeddedField[];
}

/**
 * Generates AI vector embeddings for the web map's layers/fields (the metadata
 * embeddings the built-in assistant agents require) and stores them as the
 * `embeddings-v01.json` item resource. Requires write access to the web map
 * item. If the resource already exists it is updated in place.
 *
 * Unlike `createWebmapEmbeddings`, this does NOT invoke an LLM to auto-generate
 * layer descriptions — that step chokes on the hex layer's 256 `emb_*` fields.
 * Field metadata is embedded directly in a single batched request, and every
 * field is included so the count matches the layer (the assistant validates
 * this on load).
 */
export async function generateWebmapEmbeddings(
  mapEl: ArcgisMapElement,
): Promise<void> {
  await mapEl.viewOnReady();
  const view = mapEl.view;
  await view.when();

  const map = view.map as unknown as {
    portalItem?: PortalItem;
    allLayers: { toArray(): unknown[] };
  } | null;
  if (!map) throw new Error("The map has not loaded yet.");
  const portalItem = map.portalItem;
  if (!portalItem) {
    throw new Error("The web map has no portal item to store embeddings on.");
  }
  await portalItem.load();

  const featureLayers = map.allLayers
    .toArray()
    .filter(
      (layer): layer is FeatureLayer =>
        (layer as FeatureLayer).type === "feature",
    );

  // Build every text to embed (layer text + each field text) in one flat list
  // so we can embed them all in a single batched request.
  const texts: string[] = [];
  const layers: EmbeddedLayer[] = [];
  for (const layer of featureLayers) {
    await layer.load();
    const title = layer.title ?? "";
    const description =
      layer.portalItem?.description ?? layer.portalItem?.snippet ?? "";

    texts.push(fill(LAYER_TEMPLATE, { name: title, title, description }));

    const fields: EmbeddedField[] = (layer.fields ?? []).map((f) => {
      const field: EmbeddedField = {
        name: f.name,
        alias: f.alias ?? f.name,
        description: "",
        vector: [],
      };
      texts.push(
        fill(FIELD_TEMPLATE, {
          name: field.name,
          alias: field.alias,
          description: field.description,
        }),
      );
      return field;
    });

    layers.push({
      id: layer.id,
      name: title,
      title,
      description,
      vector: [],
      fields,
    });
  }

  const vectors = await getEmbeddings(texts);

  // Assign vectors back in the same order they were pushed.
  let i = 0;
  for (const layer of layers) {
    layer.vector = vectors[i++];
    for (const field of layer.fields) {
      field.vector = vectors[i++];
    }
  }

  const embeddingsFile = {
    schemaVersion: SCHEMA_VERSION,
    modified: Date.now(),
    embeddings: {
      modelProvider: MODEL_PROVIDER,
      model: MODEL,
      dimensions: DIMENSIONS,
      templates: { layer: LAYER_TEMPLATE, field: FIELD_TEMPLATE },
    },
    layers,
  };

  await uploadResource(portalItem, embeddingsFile);
}

/** Fills a `{placeholder}` template from the given values. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (_m, key: string) => values[key] ?? "");
}

/** Writes the embeddings JSON as the item's `embeddings-v01.json` resource. */
async function uploadResource(
  portalItem: PortalItem,
  data: unknown,
): Promise<void> {
  const content = new Blob([JSON.stringify(data)], {
    type: "application/json",
  });

  const { resources } = await portalItem.fetchResources();
  const existing = resources.find(
    (r) => r.resource.path === EMBEDDINGS_RESOURCE_PATH,
  );

  if (existing) {
    await existing.resource.update(content);
    return;
  }

  const resource = new PortalItemResource({
    path: EMBEDDINGS_RESOURCE_PATH,
    portalItem,
  });
  await portalItem.addResource(resource, content);
}
