import { z } from "zod";
import {
  createLLMAgent,
  createFunctionTool,
} from "@arcgis/ai-components/agent-utils/index.js";
import type { LLMAgent } from "@arcgis/ai-components/agent-utils/LLMAgent.js";
import type { MapContext } from "../utils/mapContext";
import { runFindSimilar, clearMatchEffect } from "../utils/findSimilar";
import { clearSelection } from "../state/selection";
import { DEFAULT_SIMILARITY_THRESHOLD } from "../config";

/**
 * Builds the client-side "find similar hex bins" agent. The user selects one or
 * more hex bins on the map, then asks the assistant to find similar ones; the
 * agent scores hex bins in the current extent by cosine similarity of their
 * geodemographic embeddings and highlights the matches.
 */
export async function createFindSimilarAgent(
  ctx: MapContext,
): Promise<LLMAgent> {
  const findSimilarTool = await createFunctionTool({
    name: "findSimilarHexBins",
    description:
      "Finds hex bins similar to the ones the user has selected on the map. " +
      "Scores every hex bin in the current map extent by cosine similarity of its " +
      "geodemographic embedding to the selected hex bins, and highlights matches at " +
      "or above a similarity threshold. Call this when the user asks to 'find similar', " +
      "'find lookalikes', or 'show hex bins like this'. If the user gives a similarity " +
      "percentage (for example 'at least 85% similar'), pass it as threshold=0.85.",
    inputSchema: z.object({
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          `Cosine-similarity cutoff between 0 and 1. Defaults to ${DEFAULT_SIMILARITY_THRESHOLD}.`,
        ),
    }),
    resultMode: "terminal",
    execute: async ({ threshold }) => {
      const result = await runFindSimilar(ctx, { threshold });
      return result.message;
    },
  });

  const clearTool = await createFunctionTool({
    name: "clearSimilarHighlight",
    description:
      "Clears the find-similar highlight from the map and deselects all hex bins. " +
      "Call this when the user asks to 'clear', 'reset', or 'remove the highlight'.",
    inputSchema: z.object({}),
    resultMode: "terminal",
    execute: async () => {
      clearMatchEffect(ctx);
      clearSelection();
      return "Cleared the find-similar highlight and deselected all hex bins.";
    },
  });

  return createLLMAgent({
    name: "FindSimilarHexBins",
    description:
      "Finds and highlights hex bins whose geodemographic profile is similar to the " +
      "hex bins the user has selected on the map. Use for questions like 'find similar " +
      "areas', 'show me lookalike hex bins', or 'clear the highlight'.",
    modelTier: "fast",
    prompt:
      "You help users explore a hurricane-risk map made of 3000m hex bins. " +
      "Each hex bin has a 256-dimension geodemographic embedding. " +
      "When the user asks to find similar hex bins, call findSimilarHexBins. " +
      "If they specify a similarity percentage or threshold, convert it to a 0-1 number " +
      "and pass it as the threshold argument; otherwise omit it to use the default. " +
      "When the user asks to clear or reset, call clearSimilarHighlight. " +
      "Always report the tool's result message back to the user.",
    tools: [findSimilarTool, clearTool],
  });
}
