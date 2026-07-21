import { useCallback, useEffect, useRef } from "react";
import type Graphic from "@arcgis/core/Graphic";
import HighlightOptions from "@arcgis/core/views/support/HighlightOptions.js";
import {
  resolveMapContext,
  type ArcgisMapElement,
  type MapContext,
} from "../utils/mapContext";
import { createFindSimilarAgent } from "../agents/findSimilarAgent";
import { createDemographicsAgent } from "../agents/demographicsAgent";
import { createLivingAtlasAgent } from "../agents/livingAtlasAgent";
import { createBookmarkAgent } from "../agents/bookmarkAgent";
import { createMcpAgent } from "../agents/mcpAgent";
import {
  getSelection,
  subscribeSelection,
  toggleSelection,
} from "../state/selection";

interface AssistantAgentElement extends HTMLElement {
  agent: unknown;
}

/** A handle returned by layerView.highlight(). */
type RemovableHandle = { remove(): void };

/** Name of the view highlight config used for selected hex bins. */
const SELECTION_HIGHLIGHT = "query-selection";

/**
 * Once the user is signed in and the map/assistant elements are mounted, this
 * hook resolves the map context, registers the find-similar custom agent on the
 * assistant, and wires map clicks to hex-bin selection + highlighting.
 */
export function useAssistantSetup(enabled: boolean) {
  const mapEl = useRef<ArcgisMapElement | null>(null);
  const assistantEl = useRef<HTMLElement | null>(null);
  const initialized = useRef(false);

  const setMapRef = useCallback((el: HTMLElement | null) => {
    mapEl.current = el as ArcgisMapElement | null;
  }, []);

  const setAssistantRef = useCallback((el: HTMLElement | null) => {
    assistantEl.current = el;
  }, []);

  useEffect(() => {
    if (!enabled || initialized.current) return;
    const map = mapEl.current;
    const assistant = assistantEl.current;
    if (!map || !assistant) return;

    initialized.current = true;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      // Built-in and MCP agents don't depend on the hex-bin layer, so attach
      // them first. This guarantees the assistant always has agents even if the
      // map context (find-similar) can't be resolved.
      cleanups.push(registerBuiltInAgents(assistant));
      cleanups.push(await registerMcpAgent(assistant));
      if (cancelled) return;

      let ctx: MapContext;
      try {
        ctx = await resolveMapContext(map);
      } catch (err) {
        console.error(
          "Find-similar setup failed (built-in + MCP agents still active):",
          err,
        );
        return;
      }
      if (cancelled) return;

      cleanups.push(wireSelection(ctx));
      cleanups.push(await registerFindSimilarAgent(assistant, ctx));
      cleanups.push(await registerDemographicsAgent(assistant, ctx));
      cleanups.push(await registerLivingAtlasAgent(assistant, ctx));
      cleanups.push(await registerBookmarkAgent(assistant, ctx));
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      initialized.current = false;
    };
  }, [enabled]);

  return { mapRef: setMapRef, assistantRef: setAssistantRef };
}

/** Toggles hex-bin selection on click and keeps a highlight in sync. */
function wireSelection(ctx: MapContext): () => void {
  // Select hex bins without opening a popup; the highlight outline below is the
  // visual feedback instead.
  const priorPopupEnabled = ctx.hexLayer.popupEnabled;
  ctx.hexLayer.popupEnabled = false;

  // A named highlight config must exist in the view before highlight() can use
  // it (SDK 5.x). Register the selection color once.
  const hasHighlight = ctx.view.highlights.some(
    (h) => h.name === SELECTION_HIGHLIGHT,
  );
  if (!hasHighlight) {
    ctx.view.highlights.add(
      new HighlightOptions({
        name: SELECTION_HIGHLIGHT,
        color: "#00c3ff",
        haloOpacity: 1,
        fillOpacity: 0.35,
      }),
    );
  }

  let selectionHighlight: RemovableHandle | null = null;

  const refreshHighlight = () => {
    selectionHighlight?.remove();
    const ids = getSelection();
    selectionHighlight = ids.length
      ? ctx.layerView.highlight(ids, { name: SELECTION_HIGHLIGHT })
      : null;
  };

  const clickHandle = ctx.view.on("click", async (event) => {
    const response = await ctx.view.hitTest(event, { include: ctx.hexLayer });
    const hit = response.results.find((r) => r.type === "graphic") as
      | { graphic: Graphic }
      | undefined;
    if (!hit) return;
    const oid = hit.graphic.attributes?.[ctx.objectIdField];
    if (typeof oid === "number") toggleSelection(oid);
  });

  const unsubscribe = subscribeSelection(refreshHighlight);

  return () => {
    clickHandle.remove();
    unsubscribe();
    selectionHighlight?.remove();
    ctx.hexLayer.popupEnabled = priorPopupEnabled;
  };
}

/** The built-in agents that ship with the assistant. */
const BUILT_IN_AGENTS = [
  "arcgis-assistant-navigation-agent",
  "arcgis-assistant-help-agent",
] as const;

/** Adds the built-in ArcGIS agents as children of the assistant. */
function registerBuiltInAgents(assistant: HTMLElement): () => void {
  const elements = BUILT_IN_AGENTS.map((tag) => {
    const el = document.createElement(tag);
    assistant.appendChild(el);
    return el;
  });
  return () => elements.forEach((el) => el.remove());
}

/** Creates and attaches the find-similar agent to the assistant. */
async function registerFindSimilarAgent(
  assistant: HTMLElement,
  ctx: MapContext,
): Promise<() => void> {
  const agent = await createFindSimilarAgent(ctx);
  const agentEl = document.createElement(
    "arcgis-assistant-agent",
  ) as AssistantAgentElement;
  agentEl.setAttribute("data-agent-id", "find-similar-hex-bins");
  agentEl.agent = agent.registration;
  assistant.appendChild(agentEl);

  return () => agentEl.remove();
}

/** Creates and attaches the demographics-profile agent to the assistant. */
async function registerDemographicsAgent(
  assistant: HTMLElement,
  ctx: MapContext,
): Promise<() => void> {
  const agent = await createDemographicsAgent(ctx);
  const agentEl = document.createElement(
    "arcgis-assistant-agent",
  ) as AssistantAgentElement;
  agentEl.setAttribute("data-agent-id", "hex-bin-demographics");
  agentEl.agent = agent.registration;
  assistant.appendChild(agentEl);

  return () => agentEl.remove();
}

/** Creates and attaches the Living Atlas layer-adding agent to the assistant. */
async function registerLivingAtlasAgent(
  assistant: HTMLElement,
  ctx: MapContext,
): Promise<() => void> {
  const agent = await createLivingAtlasAgent(ctx);
  const agentEl = document.createElement(
    "arcgis-assistant-agent",
  ) as AssistantAgentElement;
  agentEl.setAttribute("data-agent-id", "living-atlas-layers");
  agentEl.agent = agent.registration;
  assistant.appendChild(agentEl);

  return () => agentEl.remove();
}

/** Creates and attaches the navigate-to-bookmark agent to the assistant. */
async function registerBookmarkAgent(
  assistant: HTMLElement,
  ctx: MapContext,
): Promise<() => void> {
  const agent = await createBookmarkAgent(ctx);
  const agentEl = document.createElement(
    "arcgis-assistant-agent",
  ) as AssistantAgentElement;
  agentEl.setAttribute("data-agent-id", "navigate-to-bookmark");
  agentEl.agent = agent.registration;
  assistant.appendChild(agentEl);

  return () => agentEl.remove();
}

/** Creates and attaches the MCP passthrough agent to the assistant. */
async function registerMcpAgent(assistant: HTMLElement): Promise<() => void> {
  const agent = await createMcpAgent();
  const agentEl = document.createElement(
    "arcgis-assistant-agent",
  ) as AssistantAgentElement;
  agentEl.setAttribute("data-agent-id", "mcp-tools");
  agentEl.agent = agent.registration;
  assistant.appendChild(agentEl);

  return () => agentEl.remove();
}
