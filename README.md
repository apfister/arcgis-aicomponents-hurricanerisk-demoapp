# Florida Hurricane Risk Explorer

A conversational hurricane-risk map. You talk to it in plain English — "find areas
like this one," "what's the risk here," "add active hurricanes," "zoom to Pine
Island" — and it finds similar neighborhoods, explains their demographics, drops in
live map layers, and moves the map for you. No GIS skills needed.

It's built on the [ArcGIS Maps SDK for JavaScript](https://developers.arcgis.com/javascript/)
and the beta [ArcGIS AI components](https://developers.arcgis.com/javascript/latest/references/ai-components/),
with a set of custom, client-side agents that read from and draw directly on the live map.

## Disclaimer

Most of this app has been vibe coded with various coding agents. Review the code,
configuration, and deployment choices before using it beyond demos or internal
experimentation.

## Getting started

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Copy `.env.local.example` to `.env.local` (or edit `.env.local`) and fill in your
   values. At minimum you need an ArcGIS OAuth app ID and a web map item ID:
   - Register an app at <https://developers.arcgis.com> and add
     `http://localhost:5173` as a redirect URI.
   - The web map must contain the 3000 m hex-bin layer with `emb_0`…`emb_255`
     geodemographic embedding fields.
3. Start the dev server (keep it on port `5173` — the OAuth redirect is registered
   there):
   ```powershell
   npm run dev
   ```
4. (Optional) Start the MCP hub in a second terminal to enable MCP tools:
   ```powershell
   npm run hub
   ```

## AI components

The chat experience is the native `<arcgis-assistant>` web component from
[`@arcgis/ai-components`](https://developers.arcgis.com/javascript/latest/references/ai-components/)
(currently **beta**). The assistant renders the chat UI and hosts _agents_ as
slotted child elements, pointed at the map via `reference-element`.

Agents come in two flavors:

### Included (pre-built) agents

These ship with `@arcgis/ai-components` and are added by dropping their element
inside the assistant. They're available from the CDN and need no custom code:

- **Navigation agent** (`<arcgis-assistant-navigation-agent>`) — general map
  navigation.
- **Help agent** (`<arcgis-assistant-help-agent>`) — answers questions about using
  the assistant.

### Custom agents

These are authored in this repo and registered with the assistant at runtime. They
require the npm build path (not available via CDN) and run **client-side**, so they
can read from and draw on the live map. Each is created with `createLLMAgent` /
`createFunctionTool` from `@arcgis/ai-components/agent-utils` and attached in
[`src/hooks/useAssistantSetup.ts`](src/hooks/useAssistantSetup.ts):

| Agent                    | File                                                    | What it does                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Find-similar**         | [findSimilarAgent.ts](src/agents/findSimilarAgent.ts)   | From selected hex bins, builds a mean query vector, scores every hex bin in the current extent by cosine similarity, and highlights the closest matches. A client-side reimplementation of ArcGIS Pro's _Find Similar_. |
| **Demographics**         | [demographicsAgent.ts](src/agents/demographicsAgent.ts) | Describes a selected hex bin's human-readable risk and vulnerability factors, and what a selection has in common.                                                                                                       |
| **Living Atlas**         | [livingAtlasAgent.ts](src/agents/livingAtlasAgent.ts)   | Adds live Living Atlas layers from a curated catalog by plain-language request, with a confirm-before-add flow.                                                                                                         |
| **Navigate to bookmark** | [bookmarkAgent.ts](src/agents/bookmarkAgent.ts)         | Flies the map to a saved bookmark by plain-language name.                                                                                                                                                               |
| **MCP passthrough**      | [mcpAgent.ts](src/agents/mcpAgent.ts)                   | Bridges the assistant to external tools served through the app's MCP hub.                                                                                                                                               |

Because custom agents can't be loaded from the CDN, they're registered
imperatively: create an `<arcgis-assistant-agent>` element, assign its
`.agent` to the agent's `registration`, and append it to the assistant.

### Note: Living Atlas agent workaround

The Living Atlas agent adds layers from a curated
[catalog](src/utils/livingAtlas.ts) of ArcGIS **portal item IDs**. The obvious
design — hand the LLM the item IDs and let it call an "add by ID" tool — leaks
those opaque IDs into the chat and invites the model to hallucinate or mangle them.

The workaround: the agent never sees item IDs. Its `searchLivingAtlasLayers` tool
returns only human-readable **titles and summaries**, and its `addLivingAtlasLayer`
tool takes an exact **layer title**, which is resolved back to a portal item ID in
code ([`findCatalogByTitle`](src/utils/livingAtlas.ts)) before the layer is added.
The agent's prompt also forbids surfacing internal IDs. This keeps the model
constrained to the curated catalog — it can't invent an item ID or add anything
outside the list — and keeps the conversation clean.

Added Living Atlas layers are **session-only**: they stream live from Esri's
servers and clear on refresh; nothing is copied into the app or persisted to the
web map.

## Configuration

All configuration is via `.env.local`:

| Variable                        | Purpose                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `VITE_ARCGIS_OAUTH_APP_ID`      | ArcGIS OAuth application (client) ID.                                               |
| `VITE_PORTAL_URL`               | Portal URL (default ArcGIS Online).                                                 |
| `VITE_WEBMAP_ITEM_ID`           | Web map item ID holding the hex-bin embedding layer.                                |
| `VITE_HEX_LAYER_TITLE`          | Optional exact title of the hex-bin layer (else first layer with an `emb_0` field). |
| `VITE_DEMOGRAPHICS_LAYER_TITLE` | Optional title of the hex layer with human-readable demographic fields.             |
| `VITE_HEX_KEY_FIELD`            | Optional field joining the two hex layers (else ObjectID).                          |
| `VITE_MCP_BASE_URL`             | MCP hub base URL (served through the Vite dev proxy).                               |

## Tech stack

React 19 + Vite + TypeScript, the ArcGIS Maps SDK for JavaScript (`@arcgis/core`),
the beta `@arcgis/ai-components` assistant, and an Express/Node MCP hub.
