import React from "react";
import ReactDOM from "react-dom/client";

// Styles
import "@arcgis/core/assets/esri/themes/light/main.css";
import "@esri/calcite-components/main.css";
import "@arcgis/ai-components/main.css";
import "./index.css";

// Map component (self-registers the <arcgis-map> custom element)
import "@arcgis/map-components/components/arcgis-map";

// Map widgets shown in the map's corners
import "@arcgis/map-components/components/arcgis-expand";
import "@arcgis/map-components/components/arcgis-search";
import "@arcgis/map-components/components/arcgis-layer-list";
import "@arcgis/map-components/components/arcgis-bookmarks";
import "@arcgis/map-components/components/arcgis-zoom";
import "@arcgis/map-components/components/arcgis-legend";

// Assistant + agent host components
import "@arcgis/ai-components/components/arcgis-assistant";
import "@arcgis/ai-components/components/arcgis-assistant-agent";

// Built-in agents
import "@arcgis/ai-components/components/arcgis-assistant-navigation-agent";
import "@arcgis/ai-components/components/arcgis-assistant-help-agent";
import "@arcgis/ai-components/components/arcgis-assistant-data-exploration-agent";

// Calcite controls used in the app shell
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-loader";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
