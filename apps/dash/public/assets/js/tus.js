/* A minimal TUS 1.0.0 upload client (ClickUp z8uq9mhbhd, CP-1 R2), written by hand so the dashboard takes no new dependency. It sends one file to
   Bunny Stream's TUS endpoint with the signed headers the API gave (AuthorizationSignature, AuthorizationExpire, VideoId, LibraryId): one POST creates the
   upload, then the file goes in chunks (PATCH, each at the offset the server last confirmed). A chunk that fails to arrive (no answer, a 5xx, a 409
   or a 423) is retried after the client asks the server where it got to (HEAD), up to `retries` times in a row; any other refusal (401, 403, 404,
   410, 413 ...) ends the upload at once. The headers never carry a cookie and are never logged. Plain ES5.
   NOTus.upload(file, {endpoint, headers, metadata, chunk, retries, wait, fetch, onProgress}) -> {promise, abort}.
   The promise resolves {url} when every byte is in, or rejects {code, status}: "create", "send", "aborted", "refused". */
(function () {
  var VERSION = "1.0.0", CHUNK = 2 * 1024 * 1024, RETRIES = 3;

  /* base64 of the UTF-8 bytes of a string (TUS metadata values are base64). */
  function b64(text) {
    var bytes = [], i, c, set = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", out = "";
    var s = String(text == null ? "" : text);
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { var d = s.charCodeAt(i + 1); if (d >= 0xDC00 && d < 0xE000) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; } }
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else bytes.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    for (i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += set.charAt((n >> 18) & 63) + set.charAt((n >> 12) & 63) + (i + 1 < bytes.length ? set.charAt((n >> 6) & 63) : "=") + (i + 2 < bytes.length ? set.charAt(n & 63) : "=");
    }
    return out;
  }
  function metadata(meta) {
    return Object.keys(meta || {}).map(function (k) { return k + " " + b64(meta[k]); }).join(",");
  }
  function merge(a, b) { var o = {}; Object.keys(a || {}).forEach(function (k) { o[k] = String(a[k]); }); Object.keys(b || {}).forEach(function (k) { o[k] = String(b[k]); }); return o; }
  function offsetOf(res) { var v = res && res.headers && res.headers.get ? res.headers.get("Upload-Offset") : null; var n = v === null || v === undefined || v === "" ? NaN : Number(v); return isFinite(n) && n >= 0 ? Math.floor(n) : NaN; }
  function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function upload(file, o) {
    o = o || {};
    var send = o.fetch || (typeof fetch === "function" ? fetch : null), size = file.size, chunk = o.chunk || CHUNK, retries = o.retries == null ? RETRIES : o.retries;
    var wait = o.wait || function (n) { return pause(Math.min(8000, 500 * Math.pow(2, n))); };
    var stopped = false, ctl = typeof AbortController === "function" ? new AbortController() : null;
    function fail(code, status) { return { code: code, status: status || 0 }; }
    function call(method, url, headers, body) {
      if (stopped) return Promise.reject(fail("aborted"));
      return send(url, { method: method, headers: merge(o.headers, headers), body: body, signal: ctl ? ctl.signal : undefined, credentials: "omit", cache: "no-store" })
        .then(function (res) { return res; }, function () { return stopped ? Promise.reject(fail("aborted")) : null; }); /* null: no answer */
    }
    function create() {
      var h = { "Tus-Resumable": VERSION, "Upload-Length": String(size) }, md = metadata(o.metadata);
      if (md) h["Upload-Metadata"] = md;
      return call("POST", o.endpoint, h).then(function (res) {
        if (!res || res.status !== 201) throw fail("create", res ? res.status : 0);
        var loc = res.headers && res.headers.get ? res.headers.get("Location") : "";
        if (!loc) throw fail("create", res.status);
        try { return new URL(loc, o.endpoint).href; } catch (e) { throw fail("create", res.status); }
      });
    }
    function resync(url) { /* where did the server get to? */
      return call("HEAD", url, { "Tus-Resumable": VERSION }).then(function (res) {
        if (res && (res.status === 404 || res.status === 410 || res.status === 403 || res.status === 401)) throw fail("refused", res.status);
        var n = res && res.ok ? offsetOf(res) : NaN;
        return isNaN(n) ? null : n;
      });
    }
    function run(url) {
      var offset = 0, failures = 0;
      function step() {
        if (stopped) return Promise.reject(fail("aborted"));
        if (offset >= size) return Promise.resolve({ url: url });
        var end = Math.min(size, offset + chunk), at = offset;
        return call("PATCH", url, { "Tus-Resumable": VERSION, "Upload-Offset": String(at), "Content-Type": "application/offset+octet-stream" }, file.slice(at, end)).then(function (res) {
          if (res && res.status >= 200 && res.status < 300) {
            var n = offsetOf(res); offset = isNaN(n) ? end : Math.min(size, n); failures = 0;
            if (o.onProgress) o.onProgress(size ? Math.min(100, Math.floor(offset * 100 / size)) : 100);
            return step();
          }
          var retry = !res || res.status >= 500 || res.status === 409 || res.status === 423 || res.status === 408 || res.status === 429;
          if (!retry) throw fail("refused", res.status);
          if (++failures > retries) throw fail("send", res ? res.status : 0);
          return wait(failures).then(function () { return resync(url); }).then(function (n) { if (n !== null && n <= size) offset = n; return step(); });
        });
      }
      return step();
    }
    var promise = create().then(run);
    return { promise: promise, abort: function () { stopped = true; if (ctl) { try { ctl.abort(); } catch (e) { /* ignore */ } } } };
  }

  window.NOTus = { upload: upload, b64: b64, metadata: metadata };
})();
