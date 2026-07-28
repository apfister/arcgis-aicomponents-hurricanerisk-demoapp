import { z } from "zod";
import {
  createLLMAgent,
  createFunctionTool,
} from "@arcgis/ai-components/agent-utils/index.js";
import type { LLMAgent } from "@arcgis/ai-components/agent-utils/LLMAgent.js";
import type { MapContext } from "../utils/mapContext";
import {
  searchLivingAtlas,
  addLivingAtlasByHandle,
  type LivingAtlasSearchResult,
} from "../utils/livingAtlas";

/** Formats search hits as a numbered list for the assistant to relay. */
function formatCandidates(res: LivingAtlasSearchResult): string {
  if (res.candidates.length === 0) {
    return "No Living Atlas layers matched that. Ask the user to try different words.";
  }
  const lines = res.candidates.map((c) => {
    const snippet = c.snippet ? ` — ${c.snippet}` : "";
    return `${c.handle}. ${c.title} (${c.type})${snippet}`;
  });
  const more =
    res.total > res.candidates.length
      ? `\n(${res.total} total matches — refine the request to narrow it down.)`
      : "";
  return `Found these Living Atlas layers:\n${lines.join("\n")}${more}`;
}

/**
 * Builds the client-side "Living Atlas" agent. The user asks in plain language
 * for live map data (e.g. "add flood zones"); the agent searches the entire
 * ArcGIS Living Atlas live, offers the top matches by relevance as a numbered
 * list, and — only after the user picks one — adds it to the map as a
 * session-only layer that clears on refresh. Users choose by number, so item
 * IDs never reach the model.
 */
export async function createLivingAtlasAgent(
  ctx: MapContext,
): Promise<LLMAgent> {
  const searchTool = await createFunctionTool({
    name: "searchLivingAtlas",
    description:
      "Searches the entire ArcGIS Living Atlas live for mappable layers matching a " +
      "plain-language request (for example 'flooding', 'wildfire risk', 'traffic', " +
      "'population density', or 'sea surface temperature'). Returns a numbered list of " +
      "matching layers with a short summary and type. Call this whenever the user asks to " +
      "add, show, find, or overlay map data. This does NOT add anything to the map — it only " +
      "finds candidates to offer the user.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("The user's plain-language description of the data they want."),
    }),
    resultMode: "continue",
    execute: async ({ query }) => formatCandidates(await searchLivingAtlas(query)),
  });

  const addTool = await createFunctionTool({
    name: "addLivingAtlasLayer",
    description:
      "Adds ONE Living Atlas layer to the map by its list number from the most recent " +
      "searchLivingAtlas results. Only call this AFTER the user has picked a specific " +
      "numbered layer. Never invent a number or add one the user hasn't chosen. The layer " +
      "is session-only and disappears on refresh.",
    inputSchema: z.object({
      choice: z
        .number()
        .int()
        .describe("The list number of the layer to add, from searchLivingAtlas."),
    }),
    resultMode: "terminal",
    execute: async ({ choice }) => {
      const result = await addLivingAtlasByHandle(ctx, choice);
      return result.message;
    },
  });

  return createLLMAgent({
    name: "LivingAtlasSearch",
    description:
      "Searches the entire live ArcGIS Living Atlas and adds a chosen layer to the map, " +
      "by plain-language request. Use for questions like 'add flood zones', 'show me wildfire " +
      "risk', 'find a traffic layer', or 'overlay population density'.",
    modelTier: "fast",
    prompt:
      "You help users add live layers from the entire ArcGIS Living Atlas to a hurricane-risk map. " +
      "When the user asks to add, show, find, or overlay data, call searchLivingAtlas with their request. " +
      "Relay the numbered results to the user by title, summary, and type. " +
      "Never show or mention internal item IDs — refer to layers only by their list number and title. " +
      "Ask the user which number they want. " +
      "Never add a layer until the user has picked a specific number. " +
      "Once they pick, call addLivingAtlasLayer with that number and report the result. " +
      "If nothing matches, tell the user and suggest different words. " +
      "Added layers are temporary and disappear when the app is refreshed.",
    tools: [searchTool, addTool],
  });
}
