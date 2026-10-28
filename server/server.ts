import {enforceExpiration,enforcePermitOnly} from './archives/schema';
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { Store } from "./accounts/store";
import { accountRoutes } from "./accounts/routes";
import { verifier, Verify } from "./accounts/auth";
import { gzipSync } from 'node:zlib';
import { mapRoutes } from './map/routes';
export function createApp(options: {
  file: string;
  webRoot: string;
  origin?: string;
  verify?: Verify;
}) {
  const root = resolve(options.webRoot);
  const store = new Store(options.file + ".sqlite", options.file);
  const route = accountRoutes(store, options.verify || verifier());
  const mapRoute = mapRoutes(store);
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
  };
  const assets = new Map<string,{stamp:string,raw:Buffer,gzip?:Buffer}>();
  const limits = new Map<string, { count: number; until: number }>();
  const server = createServer(async (req, res) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "")) {
      const now = Date.now(),
        key = req.socket.remoteAddress || "unknown";
      for (const [address, limit] of limits)
        if (limit.until < now) limits.delete(address);
      const limit = limits.get(key) || { count: 0, until: now + 60000 };
      limit.count++;
      limits.set(key, limit);
      if (limit.count > 100) {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "60",
        });
        res.end(
          JSON.stringify({ error: "Too many requests. Try again shortly." }),
        );
        return;
      }
    }
    const origin = req.headers.origin;
    const trusted = options.origin || `http://${req.headers.host}`;
    if (origin && origin !== trusted) {
      res.writeHead(403);
      res.end("Origin not allowed");
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, If-None-Match",
      );
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", "http://localhost");
    const json = (code: number, value: unknown) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    try {
      if(url.pathname.startsWith('/api/')){enforcePermitOnly(store.db);enforceExpiration(store.db);}
      if (mapRoute(req, res, url)) return;
      if (await route(req, res, url.pathname)) return;
      if (url.pathname.startsWith("/api/")) {
        json(404, { error: "Not found" });
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const path = resolve(
        root,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
      if (!path.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(path)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader(
        "Content-Type",
        types[extname(path)] || "application/octet-stream",
      );
      const stat=statSync(path),stamp=stat.mtimeMs+':'+stat.size;
      let asset=assets.get(path);
      if(!asset||asset.stamp!==stamp){
        const raw=readFileSync(path);
        asset={stamp,raw,...(/\.(?:js|css|html|svg)$/.test(path)?{gzip:gzipSync(raw)}:{})};
        if(assets.size>=32)assets.delete(assets.keys().next().value!);
        if(raw.length<8*1024*1024)assets.set(path,asset);
      }
      const tag='W/"'+stamp+'"';
      res.setHeader('ETag',tag);
      res.setHeader('Vary','Origin, Accept-Encoding');
      res.setHeader('Cache-Control',/[-.][a-f0-9]{16,}\.(?:js|css)$/.test(path)?'public, max-age=31536000, immutable':'no-cache');
      if(req.headers['if-none-match']===tag){res.writeHead(304);res.end();return;}
      const compressed=asset.gzip&&/(?:^|,)\s*gzip\s*(?:,|$)/.test(req.headers['accept-encoding']||'');
      const body=compressed?asset.gzip!:asset.raw;
      if(compressed)res.setHeader('Content-Encoding','gzip');
      res.setHeader('Content-Length',body.length);
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (!(error as any)?.status || (error as any).status >= 500)
        console.error(error instanceof Error ? error.message : "Server error");
      if (!res.headersSent) {
        const status = Number((error as any)?.status) || 500;
        json(status, {
          error:
            status === 500
              ? "Server could not complete this request."
              : (error as Error).message,
        });
      } else res.end();
    }
  });
  server.on("close", () => store.close());
  return Object.assign(server, { store });
}
