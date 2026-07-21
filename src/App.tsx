import { useCallback, useRef, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useAssistantSetup } from "./hooks/useAssistantSetup";
import HubServerManager from "./components/HubServerManager";
import SelectionPanel from "./components/SelectionPanel";
import { generateWebmapEmbeddings } from "./utils/webmapEmbeddings";
import type { ArcgisMapElement } from "./utils/mapContext";
import { config } from "./config";

type EmbeddingsStatus = "idle" | "running" | "done" | "error";

export default function App() {
  const { user, status, signIn, signOut } = useAuth();
  const { mapRef, assistantRef } = useAssistantSetup(status === "signed-in");
  const [showMcp, setShowMcp] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [embStatus, setEmbStatus] = useState<EmbeddingsStatus>("idle");
  const mapElRef = useRef<ArcgisMapElement | null>(null);

  const onSignIn = useCallback(() => {
    signIn().catch((err) => console.error("Sign-in failed", err));
  }, [signIn]);

  const combinedMapRef = useCallback(
    (el: HTMLElement | null) => {
      mapElRef.current = el as ArcgisMapElement | null;
      mapRef(el);
    },
    [mapRef],
  );

  const onGenerateEmbeddings = useCallback(() => {
    const el = mapElRef.current;
    if (!el) return;
    setEmbStatus("running");
    generateWebmapEmbeddings(el)
      .then(() => setEmbStatus("done"))
      .catch((err) => {
        console.error("Failed to generate web map embeddings", err);
        setEmbStatus("error");
      });
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Florida Hurricane Risk Explorer</h1>
        {status === "signed-in" && user && (
          <div className="app__header-user">
            <span>{user.fullName}</span>
            <calcite-button
              appearance="outline-fill"
              kind="inverse"
              scale="s"
              onClick={signOut}
            >
              Sign out
            </calcite-button>
            <calcite-button
              className="app__info-btn"
              appearance="transparent"
              kind="inverse"
              scale="s"
              icon-start="information"
              onClick={() => setShowInfo((v) => !v)}
              title="About this app"
            />
          </div>
        )}
      </header>

      {status === "checking" && (
        <div className="app__center">
          <calcite-loader label="Checking sign-in status" />
        </div>
      )}

      {status === "signed-out" && (
        <div className="app__center">
          <p>Sign in with your ArcGIS account to explore the hurricane-risk map.</p>
          <calcite-button onClick={onSignIn}>Sign in</calcite-button>
        </div>
      )}

      {status === "signed-in" && (
        <div className="app__body">
          <div className="app__map">
            <arcgis-map
              id="map"
              item-id={config.webMapItemId}
              ref={combinedMapRef}
            >
              <arcgis-search position="top-right" />
              <arcgis-expand
                position="top-left"
                group="map-tools"
                expand-tooltip="Layers"
              >
                <arcgis-layer-list />
              </arcgis-expand>
              <arcgis-expand
                position="top-left"
                group="map-tools"
                expand-tooltip="Bookmarks"
              >
                <arcgis-bookmarks />
              </arcgis-expand>
              <arcgis-expand
                position="top-left"
                group="map-tools"
                expand-icon="legend"
                expand-tooltip="Legend"
              >
                <arcgis-legend />
              </arcgis-expand>
              <arcgis-zoom position="top-left" />
            </arcgis-map>
            <SelectionPanel />
          </div>
          <div className="app__assistant">
            <arcgis-assistant
              ref={assistantRef}
              reference-element="#map"
              heading={"\u2728\uFE0E Map Assistant"}
              entry-message="Welcome to the Florida Hurricane Risk Explorer! I'm your Map Assistant. I can find similar geodemographic areas, describe an area's demographics, add live Living Atlas layers, and zoom to your bookmarks — just ask."
            />
          </div>
          {showMcp && <HubServerManager onClose={() => setShowMcp(false)} />}
          {showInfo && (
            <div className="mcp-panel info-panel">
              <div className="mcp-panel__header">
                <h2>About</h2>
                <button
                  className="mcp-panel__close"
                  onClick={() => setShowInfo(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="mcp-panel__body">
                <p className="mcp-panel__hint">
                  Florida Hurricane Risk Explorer lets you explore geodemographic
                  hex bins, find similar areas, add live Living Atlas layers, and
                  zoom to saved bookmarks — all through the Map Assistant.
                </p>
                <p className="mcp-panel__hint">
                  If the assistant reports that embeddings are missing, generate
                  them for this web map. This is a one-time step and requires
                  write access to the web map item.
                </p>
                <calcite-button
                  width="full"
                  loading={embStatus === "running" ? true : undefined}
                  onClick={onGenerateEmbeddings}
                >
                  {embStatus === "done"
                    ? "Embeddings generated"
                    : embStatus === "error"
                      ? "Retry embeddings"
                      : "Generate map embeddings"}
                </calcite-button>
                <calcite-button
                  width="full"
                  appearance="outline-fill"
                  onClick={() => {
                    setShowMcp(true);
                    setShowInfo(false);
                  }}
                >
                  MCP servers
                </calcite-button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
