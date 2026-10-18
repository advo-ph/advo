import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { requireBotKey } from "../middleware/bot-auth.js";
import { registerReadTools, registerWriteTools } from "../services/mcp-tools.service.js";
import type { McpVariables } from "../types/bot-context.js";

const mcpRoutes = new Hono<{ Variables: McpVariables }>();

const mcpLimiter = rateLimiter<{ Variables: McpVariables }>({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (c) => String(c.get("botKey")?.botKeyId ?? "unknown"),
});

// Order matters: requireBotKey must set the context before mcpLimiter's keyGenerator reads it.
mcpRoutes.use("/", requireBotKey, mcpLimiter);

mcpRoutes.post("/", async (c) => {
  const botContext = c.get("botKey");
  const server = new McpServer({ name: "advo", version: "1.0.0" });
  registerReadTools(server, botContext);
  registerWriteTools(server, botContext);

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// Stateless mode supports neither a server-initiated SSE stream nor session teardown.
mcpRoutes.get("/", (c) => c.json({ data: null, error: "GET not supported in stateless mode" }, 405));
mcpRoutes.delete("/", (c) => c.json({ data: null, error: "DELETE not supported in stateless mode" }, 405));

export default mcpRoutes;
