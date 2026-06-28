const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

exports.proxy = async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send("No url provided");

    let customReferer = req.query.referer;
    
    if (targetUrl.includes('owocdn.top') || targetUrl.includes('uwucdn.top') || targetUrl.includes('bigdreamsmalldih.site')) {
        customReferer = 'https://kwik.cx/';
    }
    
    if (targetUrl.includes('nekostream.site') || targetUrl.includes('ipstatp.com')) {
        customReferer = 'https://vidtube.site/';
    }

    if (targetUrl.includes('wixmp.com') || targetUrl.includes('203.188.') || targetUrl.includes('allmanga') || customReferer?.includes('fallanime')) {
        customReferer = 'https://allmanga.to/';
    }

    const refererHeader = customReferer ? customReferer : new URL(targetUrl).origin + "/";
    let originHeader = "";
    try {
      originHeader = new URL(refererHeader).origin;
    } catch (e) {
      originHeader = new URL(targetUrl).origin;
    }

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": refererHeader,
      "Origin": originHeader,
    };

    if (req.headers.range) {
      headers["Range"] = req.headers.range;
    }

    const controller = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });

    const response = await fetch(targetUrl, { headers, signal: controller.signal });
    if (!response.ok && response.status !== 206) {
      res.status(response.status);
      const errText = await response.text().catch(() => "Proxy error");
      return res.send(errText);
    }

    const reader = response.body.getReader();
    const { done, value: firstChunk } = await reader.read();

    if (done || !firstChunk) {
      res.status(response.status).end();
      return;
    }

    const isKey = targetUrl.includes('.key');
    const isM3u8 =
      targetUrl.includes('.m3u8') ||
      (!isKey && firstChunk.length >= 7 && Buffer.from(firstChunk.slice(0, 7)).toString('utf-8') === '#EXTM3U') ||
      response.headers.get("content-type")?.toLowerCase().includes("mpegurl") ||
      response.headers.get("content-type")?.toLowerCase().includes("m3u8");

    if (isM3u8) {
      const chunks = [firstChunk];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      let text = Buffer.concat(chunks).toString("utf-8");
      const baseUrl = new URL(targetUrl);
      const lines = text.split('\n');
      const proxyBase = `/proxy?url=`; 

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line && !line.startsWith('#')) {
          let absoluteUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
          lines[i] = proxyBase + encodeURIComponent(absoluteUrl) + "&referer=" + encodeURIComponent(refererHeader);
        } else if (line.includes('URI="')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match) {
            let uri = match[1];
            if (!uri.startsWith('data:')) {
              let absoluteUri = uri.startsWith('http') ? uri : new URL(uri, baseUrl).href;
              let wrappedUri = proxyBase + encodeURIComponent(absoluteUri) + "&referer=" + encodeURIComponent(refererHeader);
              lines[i] = line.replace(`URI="${match[1]}"`, `URI="${wrappedUri}"`);
            }
          }
        }
      }
      const outBuffer = Buffer.from(lines.join('\n'), "utf-8");

      res.status(response.status);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Content-Length", outBuffer.byteLength);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      return res.send(outBuffer);
    }

    let chunkToWrite = firstChunk;
    let slicedFakePng = false;

    if (chunkToWrite.length > 8 && chunkToWrite[0] === 0x89 && chunkToWrite[1] === 0x50 && chunkToWrite[2] === 0x4E && chunkToWrite[3] === 0x47) {
      let tsOffset = -1;
      for (let i = 0; i < Math.min(chunkToWrite.length, 100000); i++) {
        if (chunkToWrite[i] === 0x47 && chunkToWrite[i + 188] === 0x47 && chunkToWrite[i + 376] === 0x47) {
          tsOffset = i;
          break;
        }
      }
      if (tsOffset !== -1) {
        chunkToWrite = chunkToWrite.slice(tsOffset);
        slicedFakePng = true;
      }
    }

    res.status(response.status);

    const headersToKeep = ["content-type", "accept-ranges", "content-range"];
    if (!slicedFakePng) {
      headersToKeep.push("content-length");
    }

    response.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (headersToKeep.includes(lowerKey)) {
        res.setHeader(key, val);
      }
    });

    if (slicedFakePng || targetUrl.includes('.jpg') || targetUrl.includes('.png') || targetUrl.includes('.ts')) {
      res.setHeader("Content-Type", "video/mp2t");
    } else if (isKey) {
      res.setHeader("Content-Type", "application/octet-stream");
    } else if (targetUrl.includes('.vtt')) {
      res.setHeader("Content-Type", "text/vtt");
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    async function* streamGenerator() {
      yield chunkToWrite;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    }

    await pipeline(Readable.from(streamGenerator()), res).catch((err) => {
      if (err.code !== "ERR_STREAM_PREMATURE_CLOSE" && err.name !== "AbortError") {
        console.error("Pipeline streaming error:", err.message);
      }
    });
  } catch (err) {
    if (err.name !== "AbortError" && err.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      console.error("Proxy error:", err.message);
      if (!res.headersSent) {
        res.status(500).send("Proxy error");
      }
    }
  }
};
