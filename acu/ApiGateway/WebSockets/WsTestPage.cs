namespace AcuApiGateway.WebSockets;

/// <summary>
/// Self-contained WebSocket test console served at GET /ws-test.
/// Open in a browser — no extra tooling required.
/// </summary>
public static class WsTestPage
{
    public static readonly string Html = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>ACU — WebSocket Test Console</title>
          <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; min-height: 100vh; }
            h1   { font-size: 1.2rem; font-weight: 700; color: #f8fafc; margin-bottom: 3px; }
            .subtitle { font-size: 0.75rem; color: #64748b; margin-bottom: 24px; }
            .panel { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 20px; margin-bottom: 14px; }
            .panel-title { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: #64748b; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
            .row { display: flex; gap: 10px; align-items: center; }
            input, textarea {
              background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
              border-radius: 6px; padding: 8px 12px; font-size: 0.875rem; width: 100%;
              font-family: inherit;
            }
            input:focus, textarea:focus { outline: 2px solid #3b82f6; border-color: transparent; }
            textarea { height: 80px; resize: vertical; font-family: 'Cascadia Code', 'Fira Mono', monospace; font-size: 0.8rem; }
            button { padding: 8px 16px; border-radius: 6px; font-size: 0.875rem; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s; white-space: nowrap; }
            button:hover:not(:disabled) { opacity: 0.85; }
            button:disabled { opacity: 0.38; cursor: not-allowed; }
            .btn-green  { background: #16a34a; color: #fff; }
            .btn-red    { background: #dc2626; color: #fff; }
            .btn-blue   { background: #2563eb; color: #fff; }
            .btn-slate  { background: #334155; color: #94a3b8; font-size: 0.72rem; padding: 3px 10px; }
            .status-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; transition: background 0.2s; }
            .dot-off { background: #475569; }
            .dot-on  { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
            .dot-err { background: #ef4444; }
            #log {
              height: 360px; overflow-y: auto;
              font-family: 'Cascadia Code', 'Fira Mono', monospace; font-size: 0.78rem;
              background: #020617; border: 1px solid #1e293b; border-radius: 8px;
              padding: 12px; line-height: 1.65;
            }
            .msg-ts  { color: #334155; }
            .msg-sys { color: #64748b; font-style: italic; }
            .msg-rx  { color: #34d399; }
            .msg-tx  { color: #60a5fa; }
            .msg-err { color: #f87171; }
            .quick-btns { display: flex; flex-wrap: wrap; gap: 8px; }
            .qbtn { padding: 5px 12px; font-size: 0.75rem; font-weight: 600; background: #1e293b; color: #94a3b8; border: 1px solid #334155; border-radius: 6px; cursor: pointer; transition: background 0.15s, color 0.15s; }
            .qbtn:hover { background: #334155; color: #e2e8f0; }
            .url-tag { font-family: monospace; font-size: 0.76rem; color: #a78bfa; background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 4px 10px; }
            .hint { font-size: 0.72rem; color: #475569; margin-top: 6px; }
          </style>
        </head>
        <body>
          <h1>ACU &mdash; WebSocket Test Console</h1>
          <p class="subtitle">Browser-based test for the bot WebSocket endpoint on this server</p>

          <!-- Connection panel -->
          <div class="panel">
            <div class="panel-title">Connection</div>
            <div class="row" style="margin-bottom:10px">
              <input id="deviceId" type="text" placeholder="Device ID — e.g. robot-008" value="robot-008" style="flex:1" />
              <button class="btn-green" id="btnConnect">Connect</button>
              <button class="btn-red"   id="btnDisconnect" disabled>Disconnect</button>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span class="status-dot dot-off" id="statusDot"></span>
              <span id="statusText" style="font-size:0.8rem;color:#64748b">Disconnected</span>
              <span id="urlPreview" class="url-tag" style="margin-left:auto"></span>
            </div>
          </div>

          <!-- Quick send -->
          <div class="panel">
            <div class="panel-title">Quick send</div>
            <div class="quick-btns">
              <button class="qbtn" data-msg='{"type":"heartbeat"}'> heartbeat</button>
              <button class="qbtn" data-msg='{"type":"ping"}'> ping</button>
              <button class="qbtn" data-msg='{"type":"destinations","destinations":[{"name":"Waiting Room 1","type":"usher","x":12.5,"y":8.3,"z":0.0},{"name":"Nurses Station","type":"table","x":5.2,"y":14.1,"z":0.0},{"name":"Charging Pad","type":"charge","x":0.5,"y":1.0,"z":0.0}]}'>📍 destinations (sample)</button>
            </div>
            <p class="hint">Ctrl+Enter in the raw JSON box to send.</p>
          </div>

          <!-- Raw send -->
          <div class="panel">
            <div class="panel-title">Send raw JSON</div>
            // <textarea id="msgInput" placeholder='{"type":"heartbeat"}'></textarea>
            <div style="margin-top:8px;display:flex;justify-content:flex-end">
              <button class="btn-blue" id="btnSend" disabled>Send &uarr;</button>
            </div>
          </div>

          <!-- Log -->
          <div class="panel">
            <div class="panel-title">
              Message log
              <button class="btn-slate" onclick="clearLog()">Clear</button>
            </div>
            <div id="log"></div>
          </div>

          <script>
            let ws = null;
            const $ = (id) => document.getElementById(id);
            const log      = $('log');
            const devInput = $('deviceId');
            const urlPrev  = $('urlPreview');
            const dot      = $('statusDot');
            const statusTx = $('statusText');
            const btnConn  = $('btnConnect');
            const btnDisc  = $('btnDisconnect');
            const btnSend  = $('btnSend');
            const msgInput = $('msgInput');

            // Derive WebSocket base URL from whatever host/port this page is served on.
            // Handles any port, and upgrades to wss:// when served over HTTPS.
            const wsProto = () => window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsBase  = () => `${wsProto()}//${window.location.host}`;
            const wsUrl   = (id) => `${wsBase()}/ws/bot/${encodeURIComponent(id)}`;

            const ts = () => new Date().toLocaleTimeString('en', { hour12: false });
            const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

            function updateUrlPreview() {
              const id = devInput.value.trim() || '<deviceId>';
              urlPrev.textContent = wsUrl(id);
            }

            function addLog(text, cls) {
              const div = document.createElement('div');
              div.innerHTML = `<span class="msg-ts">[${ts()}]</span> <span class="${cls}">${esc(text)}</span>`;
              log.appendChild(div);
              log.scrollTop = log.scrollHeight;
            }

            function clearLog() { log.innerHTML = ''; }

            function setConnected(on) {
              dot.className = 'status-dot ' + (on ? 'dot-on' : 'dot-off');
              statusTx.textContent = on ? 'Connected' : 'Disconnected';
              statusTx.style.color = on ? '#22c55e' : '#64748b';
              btnConn.disabled =  on;
              btnDisc.disabled = !on;
              btnSend.disabled = !on;
            }

            // Initialise URL preview on page load and on input changes
            updateUrlPreview();
            devInput.addEventListener('input', updateUrlPreview);

            btnConn.addEventListener('click', () => {
              const id = devInput.value.trim();
              if (!id) { addLog('Enter a Device ID first.', 'msg-err'); return; }
              const url = wsUrl(id);
              addLog(`Connecting → ${url}`, 'msg-sys');
              ws = new WebSocket(url);
              ws.onopen = () => {
                setConnected(true);
                addLog('Connection established.', 'msg-sys');
              };
              ws.onclose = (e) => {
                setConnected(false);
                addLog(`Connection closed. Code: ${e.code} ${e.reason || ''}`, 'msg-sys');
                ws = null;
              };
              ws.onerror = () => addLog('WebSocket error — check browser DevTools console.', 'msg-err');
              ws.onmessage = (e) => {
                try {
                  addLog('← ' + JSON.stringify(JSON.parse(e.data), null, 2), 'msg-rx');
                } catch {
                  addLog('← ' + e.data, 'msg-rx');
                }
              };
            });

            btnDisc.addEventListener('click', () => {
              if (ws) { ws.close(1000, 'User disconnected'); }
            });

            function sendRaw(text) {
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                addLog('Not connected.', 'msg-err'); return;
              }
              try { JSON.parse(text); } catch {
                addLog('Invalid JSON — fix syntax before sending.', 'msg-err'); return;
              }
              ws.send(text);
              addLog('→ ' + text, 'msg-tx');
            }

            btnSend.addEventListener('click', () => sendRaw(msgInput.value.trim()));
            msgInput.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') sendRaw(msgInput.value.trim()); });

            document.querySelectorAll('.qbtn').forEach((btn) => {
              btn.addEventListener('click', () => sendRaw(btn.getAttribute('data-msg')));
            });
          </script>
        </body>
        </html>
        """;
}
