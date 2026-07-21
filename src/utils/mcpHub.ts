import { config } from "../config";

export interface HubServer {
  id: string;
  name: string;
  url: string;
  status: "connected" | "error" | "connecting";
  error?: string;
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
}

export interface HubTool {
  name: string;
  serverId: string;
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema?: unknown;
}

const base = config.mcpBaseUrl;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Lists all registered MCP servers and their connection status. */
export function listServers(): Promise<HubServer[]> {
  return request<HubServer[]>("/servers");
}

/** Registers a public MCP server by URL. */
export function addServer(url: string, name?: string): Promise<HubServer> {
  return request<HubServer>("/servers", {
    method: "POST",
    body: JSON.stringify({ url, name }),
  });
}

/** Removes a registered MCP server. */
export function removeServer(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/servers/${id}`, { method: "DELETE" });
}

/** Lists the aggregated tools across all connected servers (namespaced). */
export function listTools(): Promise<HubTool[]> {
  return request<HubTool[]>("/tools");
}

/** Calls a namespaced tool (serverId__toolName) on its server. */
export function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>("/tools/call", {
    method: "POST",
    body: JSON.stringify({ name, arguments: args }),
  });
}
