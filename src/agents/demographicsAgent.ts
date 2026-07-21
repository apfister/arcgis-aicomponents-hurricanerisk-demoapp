import { z } from "zod";
import {
  createLLMAgent,
  createFunctionTool,
} from "@arcgis/ai-components/agent-utils/index.js";
import type { LLMAgent } from "@arcgis/ai-components/agent-utils/LLMAgent.js";
import type { MapContext } from "../utils/mapContext";
import {
  describeSelectedHexes,
  summarizeHexCommonalities,
} from "../utils/describeHex";

/**
 * Builds an agent specialized in narrating the demographic / risk profile of
 * the hex bins the user has selected on the map. It reads the real per-hex
 * attribute values (via the demographics layer) and lets the LLM summarize
 * them, rather than describing the layer schema.
 */
export async function createDemographicsAgent(
  ctx: MapContext,
): Promise<LLMAgent> {
  const describeTool = await createFunctionTool({
    name: "getSelectedHexDemographics",
    description:
      "Returns the actual demographic and hurricane-risk attribute values for the " +
      "hex bin(s) the user has selected on the map (total population, median household " +
      "income, share of population 65+, households, home internet access, dominant " +
      "Tapestry segment, and any other fields on the demographics layer). Call this " +
      "whenever the user asks about the 'demographics', 'demographic risk', 'risk " +
      "profile', 'who lives here', or 'tell me about this hex bin'. The result contains " +
      "the concrete values for the selected hex; summarize them for the user.",
    inputSchema: z.object({}),
    // "continue" so the LLM narrates the returned values instead of dumping them.
    resultMode: "continue",
    execute: async () => describeSelectedHexes(ctx),
  });

  const commonalitiesTool = await createFunctionTool({
    name: "getSelectedHexCommonalities",
    description:
      "Compares the multiple hex bins the user has selected and returns what they have " +
      "in common — shared hurricane-vulnerability factors (share of residents 65+, " +
      "households with no vehicle, households with a disability, poverty, low income, " +
      "limited home internet) plus other shared demographics — as ranges and averages " +
      "across the selection. Call this whenever the user asks what the selected areas " +
      "'have in common', what is 'shared', 'overlapping', or 'similar' about them, or " +
      "'what vulnerabilities do these areas share'. Requires two or more selected hex bins.",
    inputSchema: z.object({}),
    // "continue" so the LLM narrates the shared traits instead of dumping them.
    resultMode: "continue",
    execute: async () => summarizeHexCommonalities(ctx),
  });

  return createLLMAgent({
    name: "HexBinDemographics",
    description:
      "Explains the demographic and hurricane-risk profile of the hex bins the user " +
      "has selected on the map, using their real attribute values. Use for questions " +
      "like 'show me the demographic risk info for this hex bin', 'what are the " +
      "demographics here', or 'who lives in this area', and to compare multiple " +
      "selected areas for what they have in common (shared risk / overlapping " +
      "vulnerabilities).",
    modelTier: "fast",
    prompt:
      "You describe the people and hurricane-risk profile of 3000m hex bins on a map. " +
      "When the user asks about the demographics or risk profile of the selected hex bin, " +
      "call getSelectedHexDemographics to get the real attribute values, then write a " +
      "short, friendly summary in plain language. Group related facts (population and age, " +
      "income and poverty, households and vehicles, connectivity) and call out anything " +
      "that could raise hurricane vulnerability, such as a high share of residents 65+, " +
      "low income, no vehicle access, or limited home internet. Use the exact numbers from " +
      "the tool result and do not invent values. If the tool reports that nothing is " +
      "selected or no demographics are available, relay that message plainly. " +
      "When the user instead asks what the selected areas have in common, what they share, " +
      "what overlaps, or what vulnerabilities they share, call getSelectedHexCommonalities " +
      "and summarize the shared traits. Lead with the vulnerability factors, phrasing the " +
      "numeric overlaps naturally from the ranges in the tool result (for example 'all are " +
      "over 50% aged 65+' from a 52\u201360% range, or 'all have between 10 and 20 households " +
      "with no vehicle'). Then mention a few shared non-vulnerability traits for context. " +
      "Only call out a hex that breaks the pattern when it matters for hurricane risk. Use " +
      "the exact numbers from the tool result and do not invent values.",
    tools: [describeTool, commonalitiesTool],
  });
}
