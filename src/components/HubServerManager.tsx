import { useCallback, useEffect, useState } from "react";
import {
  listServers,
  addServer,
  removeServer,
  type HubServer,
} from "../utils/mcpHub";

interface Props {
  onClose: () => void;
}

/**
 * Panel for connecting public MCP servers by URL. The assistant's MCP agent can
 * then discover and call their tools.
 */
export default function HubServerManager({ onClose }: Props) {
  const [servers, setServers] = useState<HubServer[]>([]);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setServers(await listServers());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — is the MCP hub running (npm run hub)?`
          : "Failed to reach the MCP hub.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addServer(url.trim(), name.trim() || undefined);
      setUrl("");
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server.");
    } finally {
      setBusy(false);
    }
  }, [url, name, refresh]);

  const onRemove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await removeServer(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove server.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <div className="mcp-panel">
      <div className="mcp-panel__header">
        <h2>MCP servers</h2>
        <button className="mcp-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="mcp-panel__body">
        <p className="mcp-panel__hint">
          Paste a public MCP server URL (for example a weather or census server)
          to let the assistant use its tools.
        </p>

        <label className="mcp-field">
          <span>Server URL</span>
          <input
            type="url"
            value={url}
            placeholder="https://example.com/mcp"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="mcp-field">
          <span>Name (optional)</span>
          <input
            type="text"
            value={name}
            placeholder="Weather"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <button className="mcp-add" onClick={onAdd} disabled={busy || !url.trim()}>
          {busy ? "Working…" : "Add server"}
        </button>

        {error && <p className="mcp-error">{error}</p>}

        <ul className="mcp-list">
          {servers.length === 0 && (
            <li className="mcp-list__empty">No servers connected yet.</li>
          )}
          {servers.map((s) => (
            <li key={s.id} className="mcp-list__item">
              <div className="mcp-list__info">
                <span className={`mcp-status mcp-status--${s.status}`}>
                  {s.status}
                </span>
                <strong>{s.name}</strong>
                <span className="mcp-url">{s.url}</span>
                {s.status === "connected" && (
                  <span className="mcp-tools">{s.tools.length} tool(s)</span>
                )}
                {s.error && <span className="mcp-error">{s.error}</span>}
              </div>
              <button
                className="mcp-remove"
                onClick={() => onRemove(s.id)}
                disabled={busy}
                aria-label={`Remove ${s.name}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
