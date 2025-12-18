import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Sends a JSON-RPC message to the server and waits for a response.
 */
async function sendMessage(server, message, retries = 6) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout waiting for response"));
        }, 15000);

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

      if (result.result?.isError && result.result.content?.[0]?.text?.includes("anomaly")) {
        throw new Error("Rate limit hit");
      }
      return result;
    } catch (err) {
      if (i === retries - 1) throw err;
      if (err.message === "Rate limit hit" || err.message.includes("anomaly")) {
        const waitTime = (i + 1) * 5000;
        console.log(`Rate limit hit, retrying in ${waitTime}ms...`);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }
      throw err;
    }
  }
}

describe("Optimization Features", () => {
  it("should respect limit override (limit=1)", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error" },
    });

    try {
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

      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "duckduckgo_web_search",
          arguments: { query: "typescript", limit: 1 },
        },
      });

      if (response.result.isError) {
        console.error("Tool call failed:", JSON.stringify(response.result.content));
      }
      assert.strictEqual(response.result.isError, false);
      const text = response.result.content[0].text;
      const lines = text.split("\n").filter((l) => l.startsWith("["));
      assert.strictEqual(lines.length, 1, "Should return exactly 1 result");
    } finally {
      server.kill();
    }
  });

  it("should output JSON format when configured", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error", DDG_OUTPUT_FORMAT: "json" },
    });

    try {
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

      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "duckduckgo_web_search",
          arguments: { query: "json" },
        },
      });

      const text = response.result.content[0].text;
      assert.doesNotThrow(() => JSON.parse(text), "Output should be valid JSON");
      const json = JSON.parse(text);
      assert.ok(Array.isArray(json), "Should return an array");
      assert.ok(json[0].title, "Result should have title");
    } finally {
      server.kill();
    }
  });

  it("should output minimal format when configured", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const server = spawn("node", ["build/index.js"], {
      cwd: process.cwd(),
      env: { ...process.env, LOG_LEVEL: "error", DDG_OUTPUT_FORMAT: "minimal" },
    });

    try {
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

      const response = await sendMessage(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "duckduckgo_web_search",
          arguments: { query: "minimal" },
        },
      });

      const text = response.result.content[0].text;
      assert.ok(!text.includes("[1]"), "Should not contain dense format indices");
      assert.ok(!text.includes("Web:"), "Should not contain header");
    } finally {
      server.kill();
    }
  });
});
