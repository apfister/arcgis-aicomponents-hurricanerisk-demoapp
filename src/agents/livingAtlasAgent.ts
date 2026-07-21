import { z } from "zod";
import {
  createLLMAgent,
  createFunctionTool,
} from "@arcgis/ai-components/agent-utils/index.js";
import type { LLMAgent } from "@arcgis/ai-components/agent-utils/LLMAgent.js";
import type { MapContext } from "../utils/mapContext";
import {
  searchCatalog,
  addCatalogLayer,
  findCatalogByTitle,
} from "../utils/livingAtlas";

/** Formats catalog entries into a compact list for the assistant to relay. */
function formatCandidates(query: string): string {
  const matches = searchCatalog(query);
  const lines = matches.map((c) => {
    const note = c.note ? ` (${c.note})` : "";
    return `- ${c.title}: ${c.summary}${note}`;
  });
  return (
    `Found ${matches.length} Living Atlas layer(s) that may match "${query}":\n` +
    lines.join("\n")
  );
}

/**
 * Builds the client-side "Living Atlas" agent. The user asks in plain language
 * to add live map data (e.g. "add active hurricanes"); the agent searches a
 * curated catalog of Living Atlas layers, offers the matches, and — only after
 * the user confirms a specific layer — adds it to the map as a session-only
 * layer that clears on refresh.
 */
export async function createLivingAtlasAgent(
  ctx: MapContext,
): Promise<LLMAgent> {
  const searchTool = await createFunctionTool({
    name: "searchLivingAtlasLayers",
    description:
      "Searches the curated catalog of live ArcGIS Living Atlas layers for ones " +
      "matching a plain-language request (for example 'active hurricanes', 'flooding', " +
      "'earthquakes', or 'wind forecast'). Returns the matching layer titles and a brief " +
      "summary of each. Call this whenever the user asks to add, show, or overlay map data. " +
      "This does NOT add anything to the map — it only finds candidates to offer the user.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("The user's plain-language description of the data they want."),
    }),
    resultMode: "continue",
    execute: async ({ query }) => formatCandidates(query),
  });

  const addTool = await createFunctionTool({
    name: "addLivingAtlasLayer",
    description:
      "Adds ONE Living Atlas layer to the map by its exact catalog title. Only call this " +
      "AFTER the user has explicitly confirmed which specific layer they want, using a title " +
      "returned by searchLivingAtlasLayers. Never invent a layer or add one the user hasn't " +
      "confirmed. The layer is session-only and disappears on refresh.",
    inputSchema: z.object({
      layerTitle: z
        .string()
        .describe("The exact catalog title of the layer to add, from searchLivingAtlasLayers."),
    }),
    resultMode: "terminal",
    execute: async ({ layerTitle }) => {
      const entry = findCatalogByTitle(layerTitle);
      if (!entry) {
        return `"${layerTitle}" isn't a layer in the catalog. Ask the user to pick one of the listed layers.`;
      }
      const result = await addCatalogLayer(ctx, entry.id);
      return result.message;
    },
  });

  return createLLMAgent({
    name: "LivingAtlasLayers",
    description:
      "Adds live ArcGIS Living Atlas layers to the map from a curated catalog by " +
      "plain-language request. Use for questions like 'add the active hurricanes layer', " +
      "'show me flood zones', or 'overlay recent earthquakes'.",
    modelTier: "fast",
    prompt:
      "You help users add live ArcGIS Living Atlas layers to a hurricane-risk map. " +
      "You can ONLY add layers from the curated catalog — never any other data. " +
      "When the user asks to add, show, or overlay data, call searchLivingAtlasLayers with " +
      "their request. Tell the user which matching layer(s) you found by title and summary. " +
      "Never show or mention internal item IDs. " +
      "If more than one matches, ask which one they want. " +
      "Never add a layer until the user has explicitly confirmed the specific layer. " +
      "Once confirmed, call addLivingAtlasLayer with that layer's exact title and report the result. " +
      "If nothing matches, tell the user what layers are available and let them pick. " +
      "Added layers are temporary and disappear when the app is refreshed.",
    tools: [searchTool, addTool],
  });
}
