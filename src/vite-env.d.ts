/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ArcGIS OAuth application (client) ID for user sign-in. */
  readonly VITE_ARCGIS_OAUTH_APP_ID: string;
  /** Portal URL. Defaults to https://www.arcgis.com. */
  readonly VITE_PORTAL_URL?: string;
  /** WebMap item ID to load (contains the hex-bin layer). */
  readonly VITE_WEBMAP_ITEM_ID: string;
  /** Title of the hex-bin FeatureLayer within the WebMap (optional; auto-detected by emb_0 field if omitted). */
  readonly VITE_HEX_LAYER_TITLE?: string;
  /** Title of the demographics hex FeatureLayer within the WebMap (optional). */
  readonly VITE_DEMOGRAPHICS_LAYER_TITLE?: string;
  /** Field shared by the embeddings and demographics layers used to join them. Empty = match on ObjectID. */
  readonly VITE_HEX_KEY_FIELD?: string;
  /** Base URL for the MCP hub. Defaults to /api/mcp (Vite proxy). */
  readonly VITE_MCP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
