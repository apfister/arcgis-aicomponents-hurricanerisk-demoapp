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
| **Living Atlas**         | [livingAtlasAgent.ts](src/agents/livingAtlasAgent.ts)   | Searches the entire live ArcGIS Living Atlas by plain-language request and adds a chosen layer, with a confirm-before-add flow.                                                                                         |
| **Navigate to bookmark** | [bookmarkAgent.ts](src/agents/bookmarkAgent.ts)         | Flies the map to a saved bookmark by plain-language name.                                                                                                                                                               |
| **MCP passthrough**      | [mcpAgent.ts](src/agents/mcpAgent.ts)                   | Bridges the assistant to external tools served through the app's MCP hub.                                                                                                                                               |

Because custom agents can't be loaded from the CDN, they're registered
imperatively: create an `<arcgis-assistant-agent>` element, assign its
`.agent` to the agent's `registration`, and append it to the assistant.

### Note: Living Atlas agent workaround

The Living Atlas agent searches the **entire** ArcGIS Living Atlas live
([`searchLivingAtlas`](src/utils/livingAtlas.ts)) rather than a hardcoded list. It
scopes results to genuine Living Atlas content using the item field
`groupDesignations:livingatlas` — the owner-independent flag behind the "Living
Atlas" badge — plus a mappable-layer type filter, ordered by relevance.

The obvious add design — hand the LLM each result's **portal item ID** and let it
call an "add by ID" tool — leaks opaque 32-char IDs into the chat and invites the
model to hallucinate or mangle them. That risk is worse with live search, where
titles also collide (there are several items literally titled "Active Hurricanes,
Cyclones and Typhoons").

The workaround is an **opaque handle**: the search tool caches its hits and returns a
numbered list (`1, 2, 3…`) with title, summary, and type; the add tool takes a
**number**, which is resolved back to the real item ID from the cache
([`addLivingAtlasByHandle`](src/utils/livingAtlas.ts)) before the layer is added. The
model never sees or types an item ID, duplicate titles are disambiguated by number,
and ID hallucination is structurally impossible.

Added Living Atlas layers are **session-only**: they stream live from their host
servers and clear on refresh; nothing is copied into the app or persisted to the
web map. The add step re-checks the item type and fails gracefully for
subscription-only or unavailable layers.

> **Branches:** `main` runs the full live Living Atlas search described above. The
> [`ngs-demo-branch`](https://github.com/valdesrosier/arcgis-aicomponents-hurricanerisk-demoapp/tree/ngs-demo-branch)
> preserves the earlier demo version, whose Living Atlas agent adds from a small
> hand-curated catalog of vetted layers instead.

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
