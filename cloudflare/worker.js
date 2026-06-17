export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (!targetUrl) {
      return new Response("No URL provided", { status: 400 });
    }

    let customReferer = url.searchParams.get("referer");

    // Force Kwik referer for AnimePahe CDNs
    if (targetUrl.includes("owocdn.top") || targetUrl.includes("uwucdn.top") || targetUrl.includes("bigdreamsmalldih.site")) {
      customReferer = "https://kwik.cx/";
    }

    // Force referer for BEE CDNs
    if (targetUrl.includes("nekostream.site") || targetUrl.includes("ipstatp.com")) {
      customReferer = "https://vidtube.site/";
    }

    let refererHeader;
    try {
        refererHeader = customReferer ? customReferer : new URL(targetUrl).origin + "/";
    } catch(e) {
        return new Response("Invalid URL", { status: 400 });
    }

    let originHeader;
    try {
      originHeader = new URL(refererHeader).origin;
    } catch (e) {
      originHeader = new URL(targetUrl).origin;
    }

    const headers = new Headers();
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    headers.set("Accept", "*/*");
    headers.set("Accept-Language", "en-US,en;q=0.9");
    headers.set("Referer", refererHeader);
    headers.set("Origin", originHeader);

    const range = request.headers.get("Range");
    if (range) {
      headers.set("Range", range);
    }

    try {
      const targetResponse = await fetch(targetUrl, {
        method: request.method,
        headers,
      });

      let buffer = await targetResponse.arrayBuffer();
      const isKey = targetUrl.includes(".key");
      let isM3u8 = false;

      if (!isKey && buffer.byteLength > 7) {
        const header = new TextDecoder().decode(buffer.slice(0, 7));
        if (header === "#EXTM3U") {
          isM3u8 = true;
        }
      }

      if (isM3u8) {
        let text = new TextDecoder().decode(buffer);
        const baseUrl = new URL(targetUrl);
        const lines = text.split("\n");

        // The base URL for the proxy itself
        const proxyBase = url.origin + url.pathname + "?url=";

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim();
          if (line && !line.startsWith("#")) {
            let absoluteUrl = line.startsWith("http") ? line : new URL(line, baseUrl).href;
            lines[i] = proxyBase + encodeURIComponent(absoluteUrl) + "&referer=" + encodeURIComponent(refererHeader);
          } else if (line.includes('URI="')) {
            const match = line.match(/URI="([^"]+)"/);
            if (match) {
              let uri = match[1];
              if (!uri.startsWith("data:")) {
                let absoluteUri = uri.startsWith("http") ? uri : new URL(uri, baseUrl).href;
                let wrappedUri = proxyBase + encodeURIComponent(absoluteUri) + "&referer=" + encodeURIComponent(refererHeader);
                lines[i] = line.replace(`URI="${match[1]}"`, `URI="${wrappedUri}"`);
              }
            }
          }
        }
        text = lines.join("\n");
        buffer = new TextEncoder().encode(text).buffer;
      }

      const responseHeaders = new Headers();
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
      responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      responseHeaders.set("Pragma", "no-cache");
      responseHeaders.set("Expires", "0");

      const headersToKeep = ["accept-ranges", "content-range"];
      targetResponse.headers.forEach((val, key) => {
        if (headersToKeep.includes(key.toLowerCase())) {
          responseHeaders.set(key, val);
        }
      });

      if (isM3u8) {
        responseHeaders.set("Content-Type", "application/vnd.apple.mpegurl");
      } else if (isKey) {
        responseHeaders.set("Content-Type", "application/octet-stream");
      } else if (targetUrl.includes(".jpg") || targetUrl.includes(".png") || targetUrl.includes(".ts")) {
        responseHeaders.set("Content-Type", "video/mp2t");
      } else if (targetUrl.includes(".vtt")) {
        responseHeaders.set("Content-Type", "text/vtt");
      } else {
        const ct = targetResponse.headers.get("content-type");
        if (ct) responseHeaders.set("Content-Type", ct);
      }

      // Strip PNG wrapper from disguised TS chunks
      const view = new Uint8Array(buffer);
      if (view.length > 8 && view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E && view[3] === 0x47) {
        let tsOffset = -1;
        for (let i = 0; i < Math.min(view.length, 100000); i++) {
          if (view[i] === 0x47 && view[i + 188] === 0x47 && view[i + 376] === 0x47) {
            tsOffset = i;
            break;
          }
        }
        if (tsOffset !== -1) {
          buffer = buffer.slice(tsOffset);
          responseHeaders.set("Content-Type", "video/mp2t");
        }
      }

      responseHeaders.set("Content-Length", buffer.byteLength.toString());

      return new Response(buffer, {
        status: targetResponse.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response("Proxy error: " + err.message, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  },
};
