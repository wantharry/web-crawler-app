import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    start: [],
    depth: 1,
    maxPages: 20,
    out: "crawl-output.json",
    sameOrigin: true,
    timeoutMs: 10000,
    textChars: 20000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === "--start" && next) {
      args.start = next.split(",").map((s) => s.trim()).filter(Boolean);
      i += 1;
    } else if (key === "--input" && next) {
      args.input = next;
      i += 1;
    } else if (key === "--depth" && next) {
      args.depth = Number.parseInt(next, 10);
      i += 1;
    } else if (key === "--max-pages" && next) {
      args.maxPages = Number.parseInt(next, 10);
      i += 1;
    } else if (key === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (key === "--same-origin" && next) {
      args.sameOrigin = next !== "false";
      i += 1;
    } else if (key === "--timeout-ms" && next) {
      args.timeoutMs = Number.parseInt(next, 10);
      i += 1;
    } else if (key === "--text-chars" && next) {
      args.textChars = Number.parseInt(next, 10);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Web Crawler App\n\nUsage:\n  node crawl.js --start https://example.com --depth 1 --max-pages 20 --out output.json\n\nOptions:\n  --start <url1,url2>   Comma-separated start URLs\n  --input <file>        File with one start URL per line\n  --depth <n>           Crawl depth (default: 1)\n  --max-pages <n>       Maximum pages to fetch (default: 20)\n  --out <file>          Output file path (default: crawl-output.json)\n  --same-origin <bool>  Stay on start origin only (default: true)\n  --timeout-ms <n>      Per-request timeout in ms (default: 10000)\n  --text-chars <n>      Max extracted text chars per page (default: 20000)\n`);
}

async function loadStartUrls(args) {
  const urls = [...args.start];

  if (args.input) {
    const text = await fs.readFile(args.input, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith("#")) {
        continue;
      }
      urls.push(value);
    }
  }

  return [...new Set(urls)];
}

function normalizeUrl(raw) {
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const hrefRegex = /href\s*=\s*["']([^"'#]+)["']/gi;

  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const absolute = new URL(match[1], baseUrl).toString();
      if (absolute.startsWith("http://") || absolute.startsWith("https://")) {
        links.add(absolute);
      }
    } catch {
      // Ignore malformed links.
    }
  }

  return [...links];
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "web-crawler-app/1.0",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      return { ok: false, status: response.status, reason: "non-html-or-error" };
    }

    const html = await response.text();
    return { ok: true, status: response.status, html };
  } catch (error) {
    return { ok: false, status: 0, reason: error?.message || "fetch-failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function crawl({ startUrls, depth, maxPages, sameOrigin, timeoutMs, textChars }) {
  const queue = startUrls.map((url) => ({ url, level: 0, root: new URL(url).origin }));
  const visited = new Set();
  const records = [];

  while (queue.length > 0 && records.length < maxPages) {
    const item = queue.shift();
    if (!item || visited.has(item.url)) {
      continue;
    }
    visited.add(item.url);

    const fetched = await fetchHtml(item.url, timeoutMs);

    if (!fetched.ok) {
      records.push({
        url: item.url,
        depth: item.level,
        status: fetched.status,
        error: fetched.reason,
        crawledAt: new Date().toISOString(),
      });
      continue;
    }

    const html = fetched.html;
    const links = extractLinks(html, item.url);
    const text = stripHtml(html);

    records.push({
      url: item.url,
      depth: item.level,
      status: fetched.status,
      title: extractTitle(html),
      text: text.slice(0, Math.max(0, textChars)),
      textSnippet: text.slice(0, 1000),
      links,
      linkCount: links.length,
      crawledAt: new Date().toISOString(),
    });

    if (item.level >= depth) {
      continue;
    }

    for (const link of links) {
      if (visited.has(link)) {
        continue;
      }

      if (sameOrigin && new URL(link).origin !== item.root) {
        continue;
      }

      queue.push({ url: link, level: item.level + 1, root: item.root });
      if (queue.length + records.length >= maxPages * 4) {
        break;
      }
    }
  }

  return records;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const startUrlsRaw = await loadStartUrls(args);
  const startUrls = startUrlsRaw.map(normalizeUrl).filter(Boolean);

  if (startUrls.length === 0) {
    console.error("No valid start URLs. Use --start or --input.");
    process.exitCode = 1;
    return;
  }

  const results = await crawl({
    startUrls,
    depth: Number.isFinite(args.depth) ? args.depth : 1,
    maxPages: Number.isFinite(args.maxPages) ? args.maxPages : 20,
    sameOrigin: args.sameOrigin,
    timeoutMs: Number.isFinite(args.timeoutMs) ? args.timeoutMs : 10000,
    textChars: Number.isFinite(args.textChars) ? args.textChars : 20000,
  });

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(results, null, 2), "utf8");

  console.log(`Crawled ${results.length} page(s). Output written to ${args.out}`);
}

main().catch((error) => {
  console.error("Crawler failed:", error);
  process.exitCode = 1;
});
