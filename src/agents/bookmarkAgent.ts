import { z } from "zod";
import {
  createLLMAgent,
  createFunctionTool,
} from "@arcgis/ai-components/agent-utils/index.js";
import type { LLMAgent } from "@arcgis/ai-components/agent-utils/LLMAgent.js";
import type WebMap from "@arcgis/core/WebMap";
import type Bookmark from "@arcgis/core/webmap/Bookmark.js";
import type { MapContext } from "../utils/mapContext";

/** Resolves a bookmark by name: exact match first, then a unique substring match. */
function resolveBookmark(
  bookmarks: Bookmark[],
  name: string,
): { match?: Bookmark; ambiguous?: string[] } {
  const needle = name.toLowerCase().trim();
  const exact = bookmarks.find((b) => b.name?.toLowerCase() === needle);
  if (exact) return { match: exact };

  const partial = bookmarks.filter((b) =>
    b.name?.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return { match: partial[0] };
  if (partial.length > 1) return { ambiguous: partial.map((b) => b.name) };
  return {};
}

/**
 * Builds the client-side "Navigate to bookmark" agent. The user asks in plain
 * language to zoom to a saved place (for example "zoom to Pine Island Bridge");
 * the agent matches the request against the web map's bookmarks and flies the
 * view to the matched bookmark's saved viewpoint. Bookmarks are snapshotted once
 * at startup from the loaded web map.
 */
export async function createBookmarkAgent(ctx: MapContext): Promise<LLMAgent> {
  const webMap = ctx.view.map as unknown as WebMap;
  const bookmarks = webMap.bookmarks?.toArray() ?? [];
  const bookmarkNames = bookmarks.map((b) => b.name).join(", ");

  const zoomTool = await createFunctionTool({
    name: "zoomToBookmark",
    description:
      "Flies the map to a saved bookmark by name. Call this when the user asks to " +
      "'zoom to', 'go to', 'take me to', or 'navigate to' a named place that is one of " +
      "their bookmarks. Pass the place name the user said as bookmarkName.",
    inputSchema: z.object({
      bookmarkName: z
        .string()
        .describe("The bookmark name the user wants to zoom to."),
    }),
    resultMode: "terminal",
    execute: async ({ bookmarkName }) => {
      if (bookmarks.length === 0) {
        return "This map has no bookmarks to zoom to.";
      }
      const { match, ambiguous } = resolveBookmark(bookmarks, bookmarkName);
      if (ambiguous) {
        return `Several bookmarks match "${bookmarkName}": ${ambiguous.join(", ")}. Which one?`;
      }
      if (!match) {
        return `I don't see a bookmark for "${bookmarkName}". Available bookmarks: ${bookmarkNames}.`;
      }
      if (!match.viewpoint) {
        return `The bookmark "${match.name}" has no saved viewpoint, so I can't zoom to it.`;
      }
      try {
        await ctx.view.goTo(match.viewpoint);
      } catch {
        // A rejected/interrupted goTo (e.g. the user moved the map mid-animation)
        // is non-fatal; the navigation intent was still honored.
      }
      return `Zoomed to "${match.name}".`;
    },
  });

  return createLLMAgent({
    name: "NavigateToBookmark",
    description:
      "Flies the map to a saved bookmark by plain-language name. Use for requests like " +
      "'zoom to Pine Island Bridge', 'go to downtown', or 'take me to the marina'.",
    modelTier: "fast",
    prompt:
      "You help users navigate a hurricane-risk map by zooming to their saved bookmarks. " +
      "When the user asks to zoom, go, or navigate to a named place, call zoomToBookmark " +
      "with the name they said. Zoom immediately on a clear match \u2014 do not ask for " +
      "confirmation first. If the tool reports the bookmark is ambiguous or missing, relay " +
      "the available bookmark names and ask the user which one they mean, then call the tool " +
      "again with that name. Always report the tool's result message back to the user.",
    tools: [zoomTool],
  });
}
