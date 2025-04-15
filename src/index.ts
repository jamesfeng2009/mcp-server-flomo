#!/usr/bin/env node

/**
 * This is a MCP server that call flomo api to write notes.
 * It demonstrates core MCP concepts like tools by allowing:
 * - Writing notes to flomo via a tool
 */

// 导入dotenv并配置环境变量
import * as dotenv from 'dotenv';
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FlomoClient } from "./flomo.js";
import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "http";

// 定义接口
interface RestServerTransportOptions {
  port?: number;
  endpoint?: string;
}

interface ParamsObject {
  [key: string]: string;
}

// 自定义JSONRPC消息接口
interface JSONRPCMessage {
  jsonrpc: string;
  method?: string;
  id?: string | number;
  params?: any;
  result?: any;
  error?: any;
}

// Utility functions for parameter handling
export function getParams(): ParamsObject {
    const args: ParamsObject = {};
    process.argv.slice(2).forEach((arg) => {
        if (arg.startsWith("--")) {
            const [key, value] = arg.slice(2).split("=");
            if (key) args[key] = value || '';
        }
    });
    return args;
}

export function getParamValue(name: string): string {
    const args = getParams();
    if (!args || typeof args !== "object" || Object.keys(args).length === 0) {
        return "";
    }
    const value = args[name] ||
        args[name.toUpperCase()] ||
        args[name.toLowerCase()] ||
        process.env[name] ||
        process.env[name.toUpperCase()] ||
        process.env[name.toLowerCase()] ||
        "";
    return value;
}

export function getAuthValue(request: any, name: string): string {
    const auth = request.params?._meta?.auth;
    if (!auth || typeof auth !== "object" || Object.keys(auth).length === 0) {
        return "";
    }
    const value = auth?.[name] ||
        auth?.[name.toUpperCase()] ||
        auth?.[name.toLowerCase()] ||
        process.env[name] ||
        process.env[name.toUpperCase()] ||
        process.env[name.toLowerCase()] ||
        "";
    return value;
}

// 定义Transport接口
interface Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  start(): Promise<void>;
  close(): Promise<void>;
  send(message: JSONRPCMessage): Promise<void>;
}

// RestServerTransport implementation
export class RestServerTransport implements Transport {
    private _started = false;
    private _endpoint: string;
    private _port: number;
    private _httpServer: HttpServer | null = null;
    private _pendingRequests = new Map<string | number, ServerResponse>();
    
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;
    
    constructor(options: RestServerTransportOptions = {}) {
        this._endpoint = options.endpoint || "/rest";
        this._port = options.port || 3000;
    }

    /**
     * Start the HTTP server
     */
    async startServer(): Promise<void> {
        if (this._httpServer) {
            return;
        }
        
        this._httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
            this.handleRequest(req, res);
        });
        
        return new Promise<void>((resolve) => {
            if (this._httpServer) {
                this._httpServer.listen(this._port, () => {
                    console.error(`REST Server listening on port ${this._port} with endpoint ${this._endpoint}`);
                    resolve();
                });
            }
        });
    }

    /**
     * Stop the HTTP server
     */
    async stopServer(): Promise<void> {
        if (!this._httpServer) {
            return;
        }
        
        return new Promise<void>((resolve, reject) => {
            if (this._httpServer) {
                this._httpServer.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this._httpServer = null;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Starts the transport. This is required by the Transport interface but is a no-op
     * for the Synchronous HTTP transport as connections are managed per-request.
     */
    async start(): Promise<void> {
        this._started = true;
    }

    /**
     * Handles an incoming HTTP request
     */
    async handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void> {
        if (req.method === "POST" && req.url === this._endpoint) {
            await this.handlePostRequest(req, res, parsedBody);
        } else {
            res.statusCode = 404;
            res.end("Not Found");
        }
    }

    /**
     * Handles POST requests containing JSON-RPC messages
     */
    private async handlePostRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void> {
        let body: any = parsedBody;
        
        if (!body) {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            const data = Buffer.concat(chunks).toString();
            
            try {
                body = JSON.parse(data);
            } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Invalid JSON" }));
                return;
            }
        }
        
        const requestId = body.id;
        if (requestId) {
            this._pendingRequests.set(requestId, res);
        
            if (this.onmessage) {
                this.onmessage(body as JSONRPCMessage);
            } else {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Server not initialized" }));
                this._pendingRequests.delete(requestId);
            }
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing request ID" }));
        }
    }

    async close(): Promise<void> {
        await this.stopServer();
        this._started = false;
        if (this.onclose) {
            this.onclose();
        }
    }

    async send(message: JSONRPCMessage): Promise<void> {
        const id = message.id;
        if (id !== undefined && this._pendingRequests.has(id)) {
            const res = this._pendingRequests.get(id);
            this._pendingRequests.delete(id);
            
            if (res) {
                res.setHeader("Content-Type", "application/json");
                res.statusCode = 200;
                res.end(JSON.stringify(message));
            }
        }
    }
}

// 在使用flomoApiUrl之前先打印出来，检查是否正确获取
const flomoApiUrl = process.env.FLOMO_API_URL || getParamValue("flomo_api_url") || "";
console.error('[MCP Server] Environment FLOMO_API_URL:', process.env.FLOMO_API_URL);
console.error('[MCP Server] Parameter flomo_api_url:', getParamValue("flomo_api_url"));
console.error('[MCP Server] Using Flomo API URL:', flomoApiUrl);

const mode = getParamValue("mode") || "stdio";
const port = parseInt(getParamValue("port") || "9593", 10);
const endpoint = getParamValue("endpoint") || "/rest";

/**
 * Create an MCP server with capabilities for tools (to write notes to flomo).
 */
const server = new Server(
  {
    name: "mcp-server-flomo",
    version: "0.0.3",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools.
 * Exposes a single "write_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  return {
    tools: [
      {
        name: "write_note",
        description: "Write note to flomo",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Text content of the note with markdown format",
            },
          },
          required: ["content"],
        },
      },
    ],
  };
});

/**
 * Handler for the write_note tool.
 * Creates a new note with the content, save to flomo and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const apiUrl = flomoApiUrl || getAuthValue(request, "flomo_api_url");
  if (!apiUrl) {
    console.error('[MCP Server] Flomo API URL not set');
    throw new Error("Flomo API URL not set");
  }
  console.error('[MCP Server] Using Flomo API URL:', apiUrl);

  switch (request.params.name) {
    case "write_note": {
      console.error('[MCP Server] Processing write_note request');
      const content = String(request.params.arguments?.content);
      if (!content) {
        console.error('[MCP Server] Content is empty');
        throw new Error("Content is required");
      }
      console.error('[MCP Server] Content length:', content.length);

      console.error('[MCP Server] Creating FlomoClient instance');
      const flomo = new FlomoClient({ apiUrl });
      
      console.error('[MCP Server] Calling writeNote');
      const result = await flomo.writeNote({ content });
      console.error('[MCP Server] Flomo API response:', JSON.stringify(result, null, 2));

      if (!result.memo || !result.memo.slug) {
        console.error('[MCP Server] Failed to write note to flomo:', result?.message || "unknown error");
        throw new Error(
          `Failed to write note to flomo: ${result?.message || "unknown error"}`
        );
      }

      const responseText = `Write note to flomo success, result: ${JSON.stringify(result)}`;
      console.error('[MCP Server] Sending success response');
      
      return {
        content: [
          {
            type: "text",
            text: responseText
          },
        ],
      };
    }

    default:
      console.error('[MCP Server] Unknown tool requested');
      throw new Error("Unknown tool");
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  console.error(`[MCP Server] Starting server in ${mode} mode`);
  
  if (mode === "rest") {
    console.error(`[MCP Server] Initializing REST transport on port ${port} with endpoint ${endpoint}`);
    const transport = new RestServerTransport({
      port,
      endpoint,
    });
    await server.connect(transport);
    console.error('[MCP Server] Server connected to REST transport');

    await transport.startServer();
    console.error('[MCP Server] REST server started');
  } else {
    console.error('[MCP Server] Initializing stdio transport');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[MCP Server] Server connected to stdio transport');
  }
  
  console.error('[MCP Server] Server initialization complete');
}

main().catch((error) => {
  console.error("[MCP Server] Server error:", error);
  process.exit(1);
});
