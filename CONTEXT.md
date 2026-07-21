# Hurricane Risk — Agentic Mapping App

An ArcGIS-based web app where users explore hurricane-risk map data through
natural-language conversation, backed by ArcGIS AI agents and custom tooling.

## Language

### AI components

**Assistant component**:
The native `<arcgis-assistant>` web component (from `@arcgis/ai-components`, beta)
that renders the chat UI and hosts agents as slotted child elements. Points at a
map via `reference-element`.
_Avoid_: chatbot, AI widget, assistant AI component

**Pre-built agent**:
An ArcGIS-authored agent that ships with `@arcgis/ai-components` and is added by
dropping its element inside the Assistant (navigation, data-exploration, help).
Usable from the CDN.
_Avoid_: built-in agent, stock agent

**Custom agent**:
An agent we author in code and register with the Assistant. Requires the npm
build path (not available via CDN). Runs client-side, so it can read from and
draw on the live map.
_Avoid_: our agent, user agent

**Find-similar agent**:
The custom agent that mirrors ArcGIS Pro's “Find Similar” client-side: from one or
more selected hex bins it builds a mean query vector, scores every hex bin in the
current map extent by cosine similarity, and highlights those at or above a
threshold.
_Avoid_: recommendation agent, lookalike agent

**Living Atlas agent**:
The custom agent that lets users add curated live Living Atlas layers to the map by
plain-language request, with a confirm-before-add flow. It searches only the
**layer catalog**, presents the matching candidates, asks which to add, and adds the
chosen one after the user confirms.
_Avoid_: add-layer agent, map agent

**Navigate to bookmark agent**:
The custom agent that flies the map to a saved **bookmark** by plain-language name.
It matches the request against the web map's bookmarks (case-insensitive, exact then
unique-substring) and, on a single clean match, animates the view to that bookmark's
viewpoint with no confirmation; on no or multiple matches it offers the available
bookmark names and asks which one.
_Avoid_: navigation agent, zoom agent, go-to agent

### MCP

**MCP hub**:
A separate app-owned Node process that aggregates one or more MCP servers behind
a single endpoint the custom agent calls over HTTP. Not part of the ArcGIS
component.
_Avoid_: MCP host, MCP proxy, tool server

**MCP server**:
An individual Model Context Protocol server (stdio or HTTP) exposing tools, reached
through the MCP hub.
_Avoid_: tool provider

### Domain

**Geodemographic embedding**:
An Esri-provided 256-dimensional numeric vector attached to each feature, stored
as attribute fields `emb_0`…`emb_255` (a packed `Embedding Blob` field also
exists but is not used). The similarity signal for the find-similar agent.
_Avoid_: demographic score, segment code

**Find similar**:
Ranking hex bins by cosine similarity of their geodemographic embeddings to a
**mean query vector** (averaged from one or more selected hex bins), scoped to the
**current map extent**, keeping those at or above a **similarity threshold**.
Computed client-side over the `emb_*` fields — a faithful reimplementation of the
ArcGIS Pro Find Similar pane, not a feature-service `where`/spatial query.
_Avoid_: similarity-and-threshold, lookalike search

**Query feature**:
A hex bin the user selects as the reference for a find-similar run. Multiple query
features are averaged into one mean query vector.
_Avoid_: seed feature, target

**Hex bin**:
A 3000 m hexagonal cell; the unit of the nationwide hurricane-risk layer and the
thing find-similar scores and highlights.
_Avoid_: cell, tile, bin

**Vulnerability factor**:
A demographic attribute that can raise a hex bin's hurricane vulnerability — e.g.
a high share of residents 65+, households with no vehicle, households with a member
who has a disability, poverty, or limited home internet. The assistant already calls
these out for a single hex bin.
_Avoid_: risk field, vulnerability metric

**Shared vulnerability profile**:
The **vulnerability factors** that a set of selected **hex bins** have in common,
expressed as a shared threshold or range across the whole set ("all over 50% aged
65+", "all have 10–20 households with no vehicle"). Produced when the user asks what
the selected areas have in common; the answer to a commonality question, distinct
from the per-hex demographic summary.
_Avoid_: commonality, overlap, shared demographics

**Living Atlas layer**:
A live, Esri-hosted layer from ArcGIS Living Atlas that a user can ask to add to the
map, referenced by its ArcGIS **portal item ID** (so it keeps Esri's authored
symbology and popups). The features stream from Esri's servers — never copied into
this app.
_Avoid_: basemap, dataset, atlas layer

**Layer catalog**:
The curated in-app list of askable **Living Atlas layers**. Each entry has a portal
item ID, a display title, and keyword tags. It is the only set the **Living Atlas
agent** can search or add from — the agent can never invent an item ID or add
anything outside the catalog.
_Avoid_: allowlist, registry, layer list

**Session layer**:
A **Living Atlas layer** added at runtime that exists only until page refresh and
never persists to the underlying web map. It is display-only: not selectable and not
queryable by the assistant.
_Avoid_: temporary layer, overlay, ephemeral layer

**Bookmark**:
A named, saved map viewpoint authored in the web map (a name plus a viewpoint:
center, scale, and rotation). The set of bookmarks is what the **Navigate to bookmark
agent** can fly the map to.
_Avoid_: favorite, saved location, waypoint
