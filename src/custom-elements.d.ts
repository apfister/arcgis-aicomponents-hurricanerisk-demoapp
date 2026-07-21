import type React from "react";
import type { ArcgisMap } from "@arcgis/map-components/components/arcgis-map";

/**
 * Minimal JSX typings for the ArcGIS/Calcite web components we use directly.
 * The web components are the source of truth; these declarations just let TSX
 * accept the custom element tags and their attributes.
 */
type CustomElement<Props = Record<string, unknown>> = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement> & Props,
  HTMLElement
>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "arcgis-map": CustomElement<{
        "item-id"?: string;
        id?: string;
      }>;
      "arcgis-expand": CustomElement<{
        position?: string;
        group?: string;
        mode?: string;
        "expand-icon"?: string;
        "expand-tooltip"?: string;
      }>;
      "arcgis-search": CustomElement<{
        position?: string;
      }>;
      "arcgis-layer-list": CustomElement<{
        position?: string;
      }>;
      "arcgis-bookmarks": CustomElement<{
        position?: string;
      }>;
      "arcgis-zoom": CustomElement<{
        position?: string;
      }>;
      "arcgis-legend": CustomElement<{
        position?: string;
      }>;
      "arcgis-assistant": CustomElement<{
        "reference-element"?: string;
        heading?: string;
        "entry-message"?: string;
      }>;
      "arcgis-assistant-navigation-agent": CustomElement;
      "arcgis-assistant-help-agent": CustomElement;
      "arcgis-assistant-data-exploration-agent": CustomElement;
      "calcite-button": CustomElement<{
        appearance?: string;
        scale?: string;
        kind?: string;
        "icon-start"?: string;
        loading?: boolean;
        width?: string;
      }>;
      "calcite-loader": CustomElement<{
        label?: string;
        scale?: string;
        text?: string;
      }>;
    }
  }
}

/** Re-export so the ArcgisMap element type is available to consumers. */
export type { ArcgisMap };
