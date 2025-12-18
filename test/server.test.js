import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Sends a JSON-RPC message to the server and waits for a response.
 */
function sendMessage(server, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for response"));
    }, 5000);

    const onData = (data) => {
      clearTimeout(timeout);
      server.stdout.off("data", onData);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (_e) {
        reject(new Error(`Invalid JSON response: ${data.toString()}`));
      }
    };

    server.stdout.on("data", onData);
    server.stdin.write(JSON.stringify(message) + "\n");
  });
}

describe("DuckDuckGo MCP Server", () => {
  it("should respond to initialize request", async () => {
    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error" },
    });

    try {
      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 1);
      assert.ok(response.result);
      assert.strictEqual(response.result.serverInfo.name, "duckduckgo-mcp-server");
      assert.strictEqual(response.result.serverInfo.version, "0.3.0");
      assert.strictEqual(response.result.protocolVersion, "2024-11-05");
    } finally {
      server.kill();
    }
  });

  it("should list both web and news search tools", async () => {
    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error" },
    });

    try {
      // Initialize first
      await sendMessage(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      // List tools
      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 2);
      assert.ok(Array.isArray(response.result.tools));
      assert.strictEqual(response.result.tools.length, 2);

      // Check web search tool
      const webTool = response.result.tools.find((t) => t.name === "duckduckgo_web_search");
      assert.ok(webTool, "Should have web search tool");
      assert.ok(webTool.inputSchema.properties.query);
      assert.ok(webTool.inputSchema.properties.region, "Web search should support region");
      assert.ok(webTool.inputSchema.properties.time, "Web search should support time filter");

      // Check news search tool
      const newsTool = response.result.tools.find((t) => t.name === "duckduckgo_news_search");
      assert.ok(newsTool, "Should have news search tool");
      assert.ok(newsTool.inputSchema.properties.query);
      assert.ok(newsTool.inputSchema.properties.time, "News search should support time filter");
    } finally {
      server.kill();
    }
  });

  it("should reject invalid web search arguments", async () => {
    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error" },
    });

    try {
      // Initialize first
      await sendMessage(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      // Call tool with invalid arguments (empty query)
      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "duckduckgo_web_search",
          arguments: { query: "" },
        },
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 2);
      assert.strictEqual(response.result.isError, true);
    } finally {
      server.kill();
    }
  });

  it("should reject invalid news search arguments", async () => {
    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error" },
    });

    try {
      // Initialize first
      await sendMessage(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      // Call tool with invalid arguments (empty query)
      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "duckduckgo_news_search",
          arguments: { query: "" },
        },
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 2);
      assert.strictEqual(response.result.isError, true);
    } finally {
      server.kill();
    }
  });

  it("should handle unknown tool gracefully", async () => {
    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error" },
    });

    try {
      // Initialize first
      await sendMessage(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      // Call unknown tool
      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "unknown_tool",
          arguments: { query: "test" },
        },
      });

      assert.strictEqual(response.jsonrpc, "2.0");
      assert.strictEqual(response.id, 2);
      assert.strictEqual(response.result.isError, true);
      assert.ok(response.result.content[0].text.includes("Unknown tool"));
    } finally {
      server.kill();
    }
  });
});
