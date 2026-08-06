/**
 * Application configuration derived from Vite environment variables.
 * Copy .env.local.example to .env.local and fill in the values.
 */
export const config = {
  oauthAppId: import.meta.env.VITE_ARCGIS_OAUTH_APP_ID,
  portalUrl: import.meta.env.VITE_PORTAL_URL || "https://www.arcgis.com",
  webMapItemId: import.meta.env.VITE_WEBMAP_ITEM_ID,
  hexLayerTitle: import.meta.env.VITE_HEX_LAYER_TITLE || "",
  demographicsLayerTitle: import.meta.env.VITE_DEMOGRAPHICS_LAYER_TITLE || "",
  hexKeyField: import.meta.env.VITE_HEX_KEY_FIELD || "",
  mcpEnabled: import.meta.env.VITE_ENABLE_MCP !== "false",
  mcpBaseUrl: import.meta.env.VITE_MCP_BASE_URL || "/api/mcp",
} as const;

/** Number of embedding dimensions (fields emb_0 .. emb_255). */
export const EMBEDDING_DIMS = 256;

/** Field names for the geodemographic embedding vector. */
export const EMBEDDING_FIELDS = Array.from(
  { length: EMBEDDING_DIMS },
  (_, i) => `emb_${i}`,
);

/**
 * Above this many candidate hex bins in the current extent, find-similar asks the
 * user to zoom in rather than fetching (nationwide = millions of hexes).
 */
export const MAX_CANDIDATE_HEXES = 5000;

/** Default cosine-similarity threshold for find-similar matches. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
