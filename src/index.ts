#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as DDG from "duck-duck-scrape";

// ============================================================================
// Type Definitions
// ============================================================================

interface WebSearchArgs {
  query: string;
  count?: number;
  safeSearch?: "strict" | "moderate" | "off";
  region?: string;
  time?: "day" | "week" | "month" | "year" | "all";
}

interface NewsSearchArgs {
  query: string;
  count?: number;
  safeSearch?: "strict" | "moderate" | "off";
  time?: "day" | "week" | "month" | "year" | "all";
}

interface WebSearchResult {
  title: string;
  description: string;
  url: string;
  hostname: string;
}

interface NewsSearchResult {
  title: string;
  excerpt: string;
  url: string;
  source: string;
  date: string;
  relativeTime: string;
}

interface RateLimit {
  perSecond: number;
  perMonth: number;
}

interface RequestCount {
  second: number;
  month: number;
  lastSecondReset: number;
  lastMonthReset: number;
}

type LogLevel = "debug" | "info" | "warn" | "error" | "none";

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

const CONFIG = {
  server: {
    name: "duckduckgo-mcp-server",
    version: "0.3.0",
  },
  rateLimit: {
    perSecond: parseInt(process.env["RATE_LIMIT_PER_SECOND"] ?? "1", 10),
    perMonth: parseInt(process.env["RATE_LIMIT_PER_MONTH"] ?? "15000", 10),
  } as RateLimit,
  search: {
    maxQueryLength: 400,
    maxResults: 20,
    defaultResults: 10,
    defaultSafeSearch: "moderate" as const,
    defaultRegion: "wt-wt", // Worldwide
  },
  logging: {
    level: (process.env["LOG_LEVEL"]?.toLowerCase() ?? "info") as LogLevel,
  },
} as const;

// ============================================================================
// Logging
// ============================================================================

function log(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] >= LOG_LEVELS[CONFIG.logging.level]) {
    const prefix = `[${level.toUpperCase()}]`;
    if (data !== undefined) {
      console.error(prefix, message, data);
    } else {
      console.error(prefix, message);
    }
  }
}

// ============================================================================
// Common Regions
// ============================================================================

const VALID_REGIONS = [
  "wt-wt", // Worldwide (default)
  "us-en", // United States
  "uk-en", // United Kingdom
  "ca-en", // Canada (English)
  "au-en", // Australia
  "de-de", // Germany
  "fr-fr", // France
  "es-es", // Spain
  "it-it", // Italy
  "jp-jp", // Japan
  "br-pt", // Brazil
  "mx-es", // Mexico
  "in-en", // India
];

// ============================================================================
// Tool Definitions
// ============================================================================

const WEB_SEARCH_TOOL = {
  name: "duckduckgo_web_search",
  description:
    "Performs a web search using DuckDuckGo. Returns organic search results with titles, descriptions, and URLs. " +
    "Ideal for general queries, finding information, articles, and websites. " +
    "Supports region-specific results and time filtering.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: `Search query (max ${CONFIG.search.maxQueryLength} characters)`,
        maxLength: CONFIG.search.maxQueryLength,
      },
      count: {
        type: "number",
        description: `Number of results (1-${CONFIG.search.maxResults}, default: ${CONFIG.search.defaultResults})`,
        minimum: 1,
        maximum: CONFIG.search.maxResults,
        default: CONFIG.search.defaultResults,
      },
      safeSearch: {
        type: "string",
        description: "Content filtering level",
        enum: ["strict", "moderate", "off"],
        default: "moderate",
      },
      region: {
        type: "string",
        description:
          "Region for localized results. Examples: 'us-en' (US), 'uk-en' (UK), 'de-de' (Germany), 'fr-fr' (France), 'wt-wt' (worldwide, default)",
        default: "wt-wt",
      },
      time: {
        type: "string",
        description: "Time range filter for results",
        enum: ["day", "week", "month", "year", "all"],
        default: "all",
      },
    },
    required: ["query"],
  },
};

const NEWS_SEARCH_TOOL = {
  name: "duckduckgo_news_search",
  description:
    "Search for recent news articles using DuckDuckGo News. Returns news results with titles, excerpts, sources, and publication dates. " +
    "Best for current events, breaking news, and recent developments on any topic.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: `News search query (max ${CONFIG.search.maxQueryLength} characters)`,
        maxLength: CONFIG.search.maxQueryLength,
      },
      count: {
        type: "number",
        description: `Number of results (1-${CONFIG.search.maxResults}, default: ${CONFIG.search.defaultResults})`,
        minimum: 1,
        maximum: CONFIG.search.maxResults,
        default: CONFIG.search.defaultResults,
      },
      safeSearch: {
        type: "string",
        description: "Content filtering level",
        enum: ["strict", "moderate", "off"],
        default: "moderate",
      },
      time: {
        type: "string",
        description: "Time range for news articles",
        enum: ["day", "week", "month", "year", "all"],
        default: "all",
      },
    },
    required: ["query"],
  },
};

// ============================================================================
// Server Instance
// ============================================================================

const server = new Server(CONFIG.server, {
  capabilities: {
    tools: {},
  },
});

// ============================================================================
// Rate Limiting
// ============================================================================

const ONE_SECOND_MS = 1000;
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const requestCount: RequestCount = {
  second: 0,
  month: 0,
  lastSecondReset: Date.now(),
  lastMonthReset: Date.now(),
};

/**
 * Checks and updates rate limits.
 * Throws an error if request would exceed configured limits.
 */
function checkRateLimit(): void {
  const now = Date.now();

  // Reset per-second counter if more than 1 second has passed
  if (now - requestCount.lastSecondReset > ONE_SECOND_MS) {
    requestCount.second = 0;
    requestCount.lastSecondReset = now;
  }

  // Reset monthly counter if more than 30 days have passed
  if (now - requestCount.lastMonthReset > ONE_MONTH_MS) {
    requestCount.month = 0;
    requestCount.lastMonthReset = now;
  }

  // Check if limits would be exceeded
  if (requestCount.second >= CONFIG.rateLimit.perSecond) {
    const error = new Error(
      `Rate limit exceeded: Maximum ${CONFIG.rateLimit.perSecond} request(s) per second`
    );
    log("error", "Per-second rate limit exceeded", {
      current: requestCount.second,
      limit: CONFIG.rateLimit.perSecond,
    });
    throw error;
  }

  if (requestCount.month >= CONFIG.rateLimit.perMonth) {
    const error = new Error(
      `Rate limit exceeded: Maximum ${CONFIG.rateLimit.perMonth} requests per month`
    );
    log("error", "Monthly rate limit exceeded", {
      current: requestCount.month,
      limit: CONFIG.rateLimit.perMonth,
    });
    throw error;
  }

  // Update counters
  requestCount.second++;
  requestCount.month++;

  log("debug", "Rate limit check passed", {
    secondCount: requestCount.second,
    monthCount: requestCount.month,
  });
}

// ============================================================================
// Validation
// ============================================================================

function isValidQuery(query: unknown): query is string {
  return (
    typeof query === "string" &&
    query.trim().length > 0 &&
    query.length <= CONFIG.search.maxQueryLength
  );
}

function isValidCount(count: unknown): count is number {
  return (
    count === undefined ||
    (typeof count === "number" && count >= 1 && count <= CONFIG.search.maxResults)
  );
}

function isValidSafeSearch(safeSearch: unknown): safeSearch is "strict" | "moderate" | "off" {
  return safeSearch === undefined || ["strict", "moderate", "off"].includes(safeSearch as string);
}

function isValidTime(time: unknown): time is "day" | "week" | "month" | "year" | "all" {
  return time === undefined || ["day", "week", "month", "year", "all"].includes(time as string);
}

function isValidRegion(region: unknown): region is string {
  // Accept any string that looks like a region code (xx-xx format) or known regions
  if (region === undefined) return true;
  if (typeof region !== "string") return false;
  return VALID_REGIONS.includes(region) || /^[a-z]{2}-[a-z]{2}$/i.test(region);
}

function isWebSearchArgs(args: unknown): args is WebSearchArgs {
  if (typeof args !== "object" || args === null) return false;
  const { query, count, safeSearch, region, time } = args as Record<string, unknown>;
  return (
    isValidQuery(query) &&
    isValidCount(count) &&
    isValidSafeSearch(safeSearch) &&
    isValidRegion(region) &&
    isValidTime(time)
  );
}

function isNewsSearchArgs(args: unknown): args is NewsSearchArgs {
  if (typeof args !== "object" || args === null) return false;
  const { query, count, safeSearch, time } = args as Record<string, unknown>;
  return (
    isValidQuery(query) && isValidCount(count) && isValidSafeSearch(safeSearch) && isValidTime(time)
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getSafeSearchType(safeSearch: "strict" | "moderate" | "off"): DDG.SafeSearchType {
  const map = {
    strict: DDG.SafeSearchType.STRICT,
    moderate: DDG.SafeSearchType.MODERATE,
    off: DDG.SafeSearchType.OFF,
  };
  return map[safeSearch];
}

function getTimeType(
  time: "day" | "week" | "month" | "year" | "all"
): DDG.SearchTimeType | undefined {
  if (time === "all") return undefined;
  const map = {
    day: DDG.SearchTimeType.DAY,
    week: DDG.SearchTimeType.WEEK,
    month: DDG.SearchTimeType.MONTH,
    year: DDG.SearchTimeType.YEAR,
  };
  return map[time];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ============================================================================
// Search Functions
// ============================================================================

async function performWebSearch(args: WebSearchArgs): Promise<string> {
  const {
    query,
    count = CONFIG.search.defaultResults,
    safeSearch = CONFIG.search.defaultSafeSearch,
    region = CONFIG.search.defaultRegion,
    time = "all",
  } = args;

  log("info", `Web search: "${query}"`, { count, safeSearch, region, time });

  checkRateLimit();

  const timeType = getTimeType(time);
  const searchResults = await DDG.search(query, {
    safeSearch: getSafeSearchType(safeSearch),
    region,
    ...(timeType !== undefined && { time: timeType }),
  });

  if (searchResults.noResults) {
    log("info", `No results for: "${query}"`);
    return `# DuckDuckGo Web Search\n\n**Query:** "${query}"\n\nNo results found.`;
  }

  const results: WebSearchResult[] = searchResults.results.slice(0, count).map((r) => ({
    title: r.title,
    description: r.description || r.title,
    url: r.url,
    hostname: r.hostname,
  }));

  log("info", `Found ${results.length} web results for: "${query}"`);

  const formattedResults = results
    .map((r, i) => `### ${i + 1}. ${r.title}\n\n${r.description}\n\n🔗 [${r.hostname}](${r.url})`)
    .join("\n\n---\n\n");

  return `# DuckDuckGo Web Search

**Query:** "${query}"  
**Region:** ${region}  
**Results:** ${results.length}

---

${formattedResults}
`;
}

async function performNewsSearch(args: NewsSearchArgs): Promise<string> {
  const {
    query,
    count = CONFIG.search.defaultResults,
    safeSearch = CONFIG.search.defaultSafeSearch,
    time = "all",
  } = args;

  log("info", `News search: "${query}"`, { count, safeSearch, time });

  checkRateLimit();

  const timeType = getTimeType(time);
  const searchResults = await DDG.searchNews(query, {
    safeSearch: getSafeSearchType(safeSearch),
    ...(timeType !== undefined && { time: timeType }),
  });

  if (searchResults.noResults) {
    log("info", `No news results for: "${query}"`);
    return `# DuckDuckGo News Search\n\n**Query:** "${query}"\n\nNo news articles found.`;
  }

  const results: NewsSearchResult[] = searchResults.results.slice(0, count).map((r) => ({
    title: r.title,
    excerpt: r.excerpt,
    url: r.url,
    source: r.syndicate,
    date: formatDate(r.date),
    relativeTime: r.relativeTime,
  }));

  log("info", `Found ${results.length} news results for: "${query}"`);

  const formattedResults = results
    .map(
      (r, i) =>
        `### ${i + 1}. ${r.title}\n\n${r.excerpt}\n\n📰 **Source:** ${r.source} • ${r.relativeTime}\n\n🔗 [Read article](${r.url})`
    )
    .join("\n\n---\n\n");

  return `# DuckDuckGo News Search

**Query:** "${query}"  
**Time Range:** ${time === "all" ? "All time" : `Past ${time}`}  
**Results:** ${results.length}

---

${formattedResults}
`;
}

// ============================================================================
// Request Handlers
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [WEB_SEARCH_TOOL, NEWS_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    log("debug", "Tool call received", request.params);

    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "duckduckgo_web_search": {
        if (!isWebSearchArgs(args)) {
          throw new Error(
            `Invalid arguments for duckduckgo_web_search. Query must be a non-empty string (max ${CONFIG.search.maxQueryLength} chars).`
          );
        }
        const results = await performWebSearch(args);
        return { content: [{ type: "text", text: results }], isError: false };
      }

      case "duckduckgo_news_search": {
        if (!isNewsSearchArgs(args)) {
          throw new Error(
            `Invalid arguments for duckduckgo_news_search. Query must be a non-empty string (max ${CONFIG.search.maxQueryLength} chars).`
          );
        }
        const results = await performNewsSearch(args);
        return { content: [{ type: "text", text: results }], isError: false };
      }

      default: {
        log("error", `Unknown tool: ${name}`);
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    }
  } catch (error) {
    log("error", "Request handler error", error);
    return {
      content: [
        { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function runServer(): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("info", `DuckDuckGo MCP Server v${CONFIG.server.version} running on stdio`);
    log(
      "info",
      `Rate limits: ${CONFIG.rateLimit.perSecond}/sec, ${CONFIG.rateLimit.perMonth}/month`
    );
    log("info", `Log level: ${CONFIG.logging.level}`);
  } catch (error) {
    log("error", "Failed to start server", error);
    process.exit(1);
  }
}

process.on("uncaughtException", (error) => {
  log("error", "Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection", reason);
  process.exit(1);
});

runServer();
