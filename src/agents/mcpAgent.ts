import { z } from "zod";
import {
  createLLMAgent,
  createFunctionTool,
} from "@arcgis/ai-components/agent-utils/index.js";
import type { LLMAgent } from "@arcgis/ai-components/agent-utils/LLMAgent.js";
import { listTools, callTool } from "../utils/mcpHub";

/**
 * Builds a passthrough agent that lets the assistant discover and call tools on
 * whatever public MCP servers the user has connected via the hub. The agent
 * keeps two meta-tools so it always reflects the currently connected servers
 * without re-registration.
 */
export async function createMcpAgent(): Promise<LLMAgent> {
  const listMcpTools = await createFunctionTool({
    name: "listMcpTools",
    description:
      "Lists the tools available from all connected MCP servers, including each " +
      "tool's namespaced name, description, and input schema. Call this first to " +
      "discover what you can do before calling a tool.",
    inputSchema: z.object({}),
    resultMode: "continue",
    execute: async () => {
      const tools = await listTools();
      if (tools.length === 0) {
        return "No MCP servers are connected, or they expose no tools. Ask the user to add a public MCP server URL using the 'MCP servers' panel.";
      }
      return JSON.stringify(
        tools.map((t) => ({
          name: t.name,
          server: t.serverName,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        null,
        2,
      );
    },
  });

  const callMcpTool = await createFunctionTool({
    name: "callMcpTool",
    description:
      "Calls a tool on a connected MCP server. Use the namespaced tool name " +
      "(serverId__toolName) exactly as returned by listMcpTools, and pass the " +
      "arguments object matching that tool's input schema.",
    inputSchema: z.object({
      name: z
        .string()
        .describe("Namespaced tool name (serverId__toolName) from listMcpTools."),
      arguments: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Arguments object matching the tool's input schema."),
    }),
    resultMode: "continue",
    execute: async ({ name, arguments: args }) => {
      try {
        const result = await callTool(name, args ?? {});
        return JSON.stringify(result);
      } catch (err) {
        return `Tool call failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  return createLLMAgent({
    name: "McpTools",
    description:
      "Interacts with public MCP servers the user has connected (for example " +
      "weather or census servers). Use for questions that a connected MCP tool " +
      "could answer, such as weather forecasts or census lookups.",
    modelTier: "default",
    prompt:
      "You can use tools from public MCP servers the user has connected. " +
      "When a request might be served by an MCP tool, first call listMcpTools to " +
      "see what is available, then call callMcpTool with the correct namespaced " +
      "name and arguments. Summarize the tool result for the user in plain language. " +
      "If no relevant tool is available, tell the user which MCP server they might connect.",
    tools: [listMcpTools, callMcpTool],
  });
}
