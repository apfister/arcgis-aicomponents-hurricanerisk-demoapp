/**
 * MCP hub — a small Node process that connects to public MCP servers (by URL)
 * and exposes their tools to the browser app through a simple REST API.
 *
 * Runs on port 8808 (override with MCP_HUB_PORT). The Vite dev server proxies
 * browser calls at /api/mcp to this process, so the app talks to it same-origin.
 *
 * Only URL-based MCP servers are supported (StreamableHTTP with SSE fallback).
 * The hub never spawns local processes, so pasting a URL cannot run commands.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const PORT = Number(process.env.MCP_HUB_PORT ?? 8808);
const CONFIG_PATH = resolve(process.cwd(), "mcp-hub.config.json");

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface ServerRecord {
  id: string;
  name: string;
  url: string;
  status: "connected" | "error" | "connecting";
  error?: string;
  tools: McpTool[];
  client?: Client;
}

const servers = new Map<string, ServerRecord>();

/** Public (serializable) view of a server, without the live client. */
function publicServer(s: ServerRecord) {
  return {
    id: s.id,
    name: s.name,
    url: s.url,
    status: s.status,
    error: s.error,
    tools: s.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
}

/** Connects to an MCP server URL, trying StreamableHTTP then SSE. */
async function connect(url: string): Promise<Client> {
  const client = new Client({ name: "hurricane-risk-hub", version: "1.0.0" });
  const target = new URL(url);
  try {
    await client.connect(new StreamableHTTPClientTransport(target));
    return client;
  } catch {
    await client.connect(new SSEClientTransport(target));
    return client;
  }
}

/** Connects (or reconnects) a server record and loads its tool list. */
async function activate(record: ServerRecord): Promise<void> {
  record.status = "connecting";
  record.error = undefined;
  try {
    const client = await connect(record.url);
    const { tools } = await client.listTools();
    record.client = client;
    record.tools = tools as McpTool[];
    record.status = "connected";
  } catch (err) {
    record.status = "error";
    record.error = err instanceof Error ? err.message : String(err);
    record.tools = [];
  }
}

function persist(): void {
  const data = [...servers.values()].map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
  }));
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

async function loadPersisted(): Promise<void> {
  if (!existsSync(CONFIG_PATH)) return;
  try {
    const data = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Array<{
      id: string;
      name: string;
      url: string;
    }>;
    for (const entry of data) {
      const record: ServerRecord = {
        id: entry.id,
        name: entry.name || entry.url,
        url: entry.url,
        status: "connecting",
        tools: [],
      };
      servers.set(record.id, record);
    }
    await Promise.all([...servers.values()].map(activate));
  } catch (err) {
    console.error("Failed to load persisted MCP config:", err);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, servers: servers.size });
});

app.get("/servers", (_req, res) => {
  res.json([...servers.values()].map(publicServer));
});

app.post("/servers", async (req, res) => {
  const { url, name } = req.body ?? {};
  if (typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "A server 'url' is required." });
    return;
  }
  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL." });
    return;
  }

  const record: ServerRecord = {
    id: randomUUID(),
    name: typeof name === "string" && name.trim() ? name.trim() : url,
    url,
    status: "connecting",
    tools: [],
  };
  servers.set(record.id, record);
  await activate(record);
  persist();
  res.status(201).json(publicServer(record));
});

app.delete("/servers/:id", async (req, res) => {
  const record = servers.get(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Server not found." });
    return;
  }
  try {
    await record.client?.close();
  } catch {
    /* ignore close errors */
  }
  servers.delete(record.id);
  persist();
  res.json({ ok: true });
});

/** Aggregated tool list across all connected servers (namespaced). */
app.get("/tools", (_req, res) => {
  const tools = [...servers.values()]
    .filter((s) => s.status === "connected")
    .flatMap((s) =>
      s.tools.map((t) => ({
        name: `${s.id}__${t.name}`,
        serverId: s.id,
        serverName: s.name,
        toolName: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    );
  res.json(tools);
});

/** Calls a namespaced tool (serverId__toolName) on its server. */
app.post("/tools/call", async (req, res) => {
  const { name, arguments: args } = req.body ?? {};
  if (typeof name !== "string" || !name.includes("__")) {
    res.status(400).json({ error: "A namespaced tool 'name' is required." });
    return;
  }
  const [serverId, ...rest] = name.split("__");
  const toolName = rest.join("__");
  const record = servers.get(serverId);
  if (!record?.client || record.status !== "connected") {
    res.status(404).json({ error: "Server not connected." });
    return;
  }
  try {
    const result = await record.client.callTool({
      name: toolName,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

await loadPersisted();
app.listen(PORT, () => {
  console.log(`MCP hub listening on http://127.0.0.1:${PORT}`);
});
