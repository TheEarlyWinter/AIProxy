import http from 'node:http';
import fs from 'node:fs/promises';
import { URL } from 'node:url';

const port = Number(process.env.PORT || 3000);
const upstream = process.env.DASHBOARD_UPSTREAM || 'http://dashboard-core:80';
const mihomo = process.env.MIHOMO_URL || 'http://ai-proxy:9090';
const configPath = process.env.MIHOMO_CONFIG || '/run/secrets/ai-proxy-config';
const delayTestUrls = (process.env.DELAY_TEST_URLS || [
  'https://www.gstatic.com/generate_204',
  'https://cp.cloudflare.com/generate_204',
  'https://www.google.com/generate_204',
].join(','))
  .split(',')
  .map((value) => value.trim())
  .filter((value) => /^https:\/\//i.test(value))
  .slice(0, 5);
const delayTestTimeoutMs = Math.max(1000, Number(process.env.DELAY_TEST_TIMEOUT_MS || 5000));

async function readSecret() {
  const contents = await fs.readFile(configPath, 'utf8');
  const match = contents.match(/^\s*secret:\s*["']?([^"'\s]+)["']?\s*$/m);
  if (!match) {
    throw new Error('Mihomo secret was not found');
  }
  return match[1];
}

const controllerSecret = await readSecret();

function json(res, statusCode, value) {
  const body = JSON.stringify(value);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function controllerHeaders() {
  return { authorization: `Bearer ${controllerSecret}` };
}

async function controllerJson(path, options = {}) {
  const response = await fetch(`${mihomo}${path}`, {
    headers: controllerHeaders(),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Mihomo returned ${response.status}`);
  }
  return response.json();
}

function chainFromProxies(payload) {
  const proxies = payload?.proxies || {};
  const chain = [];
  let cursor = 'AI-OUT';

  for (let index = 0; index < 8; index += 1) {
    const current = proxies[cursor];
    if (!current) break;

    const next = typeof current.now === 'string' ? current.now : '';
    chain.push({ group: cursor, now: next });
    const nextEntry = next ? proxies[next] : null;
    const isGroup = nextEntry && Array.isArray(nextEntry.all);
    if (!next || !isGroup) {
      return { chain, node: next || null };
    }
    cursor = next;
  }

  return { chain, node: chain.at(-1)?.now || null };
}

async function fetchCurrentNode() {
  const route = chainFromProxies(await controllerJson('/proxies'));
  return {
    ok: true,
    ...route,
    updatedAt: new Date().toISOString(),
  };
}

function delayTestLabel(target) {
  const hostname = new URL(target).hostname;
  if (hostname === 'www.gstatic.com') return 'Google static';
  if (hostname === 'cp.cloudflare.com') return 'Cloudflare';
  if (hostname === 'www.google.com') return 'Google';
  return hostname;
}

function validDelay(value) {
  const delay = Number(value);
  return Number.isFinite(delay) && delay > 0 ? delay : null;
}

async function runConcurrent(items, limit, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function multiDelaySnapshot(groupName) {
  const catalog = await controllerJson('/proxies');
  const group = catalog?.proxies?.[groupName];
  if (!group || !Array.isArray(group.all)) {
    throw new Error('Unknown proxy group');
  }

  const allNodeNames = group.all.filter((name) => {
    const item = catalog.proxies[name];
    return item && !Array.isArray(item.all) && name !== 'DIRECT' && name !== 'REJECT';
  });
  const nodeNames = allNodeNames.filter((name) => !/ipv6\s*only|ipv6专用/i.test(name));

  const probeItems = nodeNames.flatMap((name) => delayTestUrls.map((target) => ({
    name,
    target,
    label: delayTestLabel(target),
  })));
  const probeResults = await runConcurrent(probeItems, 8, async ({ name, target, label }) => {
    const query = new URLSearchParams({
      url: target,
      timeout: String(delayTestTimeoutMs),
      expected: '204',
    });
    try {
      const payload = await controllerJson(
        `/proxies/${encodeURIComponent(name)}/delay?${query.toString()}`,
        { signal: AbortSignal.timeout(delayTestTimeoutMs + 2000) },
      );
      return { name, target, label, delay: validDelay(payload?.delay), error: null };
    } catch (error) {
      return { name, target, label, delay: null, error: error.message };
    }
  });
  const resultByKey = new Map(probeResults.map((result) => [`${result.name}\u0000${result.target}`, result]));
  const tests = delayTestUrls.map((target) => {
    const matching = probeResults.filter((result) => result.target === target);
    return {
      url: target,
      label: delayTestLabel(target),
      ok: matching.some((result) => result.delay !== null),
    };
  });

  const nodes = nodeNames.map((name) => {
    const checks = delayTestUrls.map((target) => {
      const result = resultByKey.get(`${name}\u0000${target}`);
      return {
        label: result?.label || delayTestLabel(target),
        url: target,
        delay: result?.delay ?? null,
        error: result?.error ? 'test-failed' : null,
      };
    });
    const successful = checks.map((check) => check.delay).filter((delay) => delay !== null);
    return {
      name,
      available: successful.length > 0,
      bestDelay: successful.length > 0 ? Math.min(...successful) : null,
      checks,
    };
  }).sort((left, right) => {
    if (left.available !== right.available) return left.available ? -1 : 1;
    return (left.bestDelay ?? Number.MAX_SAFE_INTEGER) - (right.bestDelay ?? Number.MAX_SAFE_INTEGER);
  });

  return {
    ok: true,
    group: groupName,
    urls: tests.map(({ url, label, ok }) => ({ url, label, ok })),
    nodeCount: nodes.length,
    ignoredIpv6OnlyCount: allNodeNames.length - nodeNames.length,
    availableCount: nodes.filter((node) => node.available).length,
    nodes,
    testedAt: new Date().toISOString(),
  };
}

async function multiDelay(res, req) {
  const target = new URL(req.url, 'http://localhost');
  const groupName = target.searchParams.get('group') || 'AI-GOOD-日本';
  if (!groupName.startsWith('AI-GOOD') || groupName.includes('/')) {
    return json(res, 400, { ok: false, error: 'unsupported-group' });
  }

  try {
    json(res, 200, await multiDelaySnapshot(groupName));
  } catch (error) {
    console.error('Multi-site delay lookup failed:', error.message);
    json(res, 503, {
      ok: false,
      error: 'controller-unavailable',
      detail: error.message,
      testedAt: new Date().toISOString(),
    });
  }
}

async function currentNode(res) {
  try {
    json(res, 200, await fetchCurrentNode());
  } catch (error) {
    console.error('Current-node lookup failed:', error.message);
    json(res, 503, {
      ok: false,
      error: 'controller-unavailable',
      updatedAt: new Date().toISOString(),
    });
  }
}

function configScript(res) {
  const body = `window.__METACUBEXD_CONFIG__ = { defaultBackendURL: 'http://127.0.0.1:9090', githubToken: '' };\n`;
  res.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function initialDashboardCard(snapshot) {
  const node = snapshot?.ok && snapshot.node ? snapshot.node : '控制器暂不可用';
  const route = snapshot?.chain?.map((item) => item.group).join(' → ') || 'AI-OUT';
  const stateClass = snapshot?.ok ? '' : ' class="aipx-offline"';
  return `
    <style id="ai-proxy-current-node-style">
      #ai-proxy-current-node-card {
        position: fixed; top: 76px; right: 24px; z-index: 9999;
        width: min(330px, calc(100vw - 48px)); box-sizing: border-box;
        padding: 13px 16px; border: 1px solid rgba(98, 211, 224, .28);
        border-radius: 12px; color: #dbeafe; background: rgba(10, 24, 31, .96);
        box-shadow: 0 12px 34px rgba(0, 0, 0, .28);
        font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #ai-proxy-current-node-card .aipx-title { display: flex; align-items: center; gap: 8px; color: #8fe7ef; font-weight: 700; }
      #ai-proxy-current-node-card .aipx-dot { width: 8px; height: 8px; border-radius: 50%; background: #21c55d; box-shadow: 0 0 10px #21c55d; }
      #ai-proxy-current-node-card.aipx-offline .aipx-dot { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
      #ai-proxy-current-node-card .aipx-node { margin-top: 6px; color: #ffffff; font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
      #ai-proxy-current-node-card .aipx-route { margin-top: 5px; color: #94a3b8; font-size: 11px; overflow-wrap: anywhere; }
      #ai-proxy-current-node-card .aipx-time { margin-top: 4px; color: #64748b; font-size: 10px; }
      @media (max-width: 700px) { #ai-proxy-current-node-card { top: 68px; right: 12px; width: calc(100vw - 24px); } }
    </style>
    <aside id="ai-proxy-current-node-card"${stateClass}>
      <div class="aipx-title"><span class="aipx-dot"></span><span>当前出站节点</span></div>
      <div class="aipx-node" data-aipx-node>${escapeHtml(node)}</div>
      <div class="aipx-route" data-aipx-route>链路：${escapeHtml(route)}</div>
      <div class="aipx-time" data-aipx-time>首屏状态</div>
    </aside>
  `;
}

async function proxyDashboardDocument(req, res) {
  try {
    const target = new URL(req.url, upstream);
    const [response, snapshot] = await Promise.all([
      fetch(target),
      fetchCurrentNode().catch((error) => {
        console.error('Initial current-node lookup failed:', error.message);
        return { ok: false };
      }),
    ]);
    let body = await response.text();
    const card = initialDashboardCard(snapshot);
    const scriptTag = '<script src="/dashboard-current-node.js" defer></script>';
    body = body.includes('</body>')
      ? body.replace('</body>', `${card}${scriptTag}</body>`)
      : `${body}${card}${scriptTag}`;

    res.writeHead(response.status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  } catch (error) {
    console.error('Dashboard document failed:', error.message);
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Dashboard upstream unavailable');
  }
}

async function proxyToDashboard(req, res) {
  const target = new URL(req.url, upstream);
  const headers = { ...req.headers, host: target.host };
  const proxyRequest = http.request(target, {
    method: req.method,
    headers,
  }, (proxyResponse) => {
    res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(res);
  });

  proxyRequest.on('error', (error) => {
    console.error('Dashboard proxy failed:', error.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Dashboard upstream unavailable');
  });
  req.pipe(proxyRequest);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'GET' && pathname === '/__health') {
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && pathname === '/api/current-node') {
    return currentNode(res);
  }
  if (req.method === 'GET' && pathname === '/api/multi-delay') {
    return multiDelay(res, req);
  }
  if (req.method === 'GET' && pathname === '/config.js') {
    return configScript(res);
  }
  if (req.method === 'GET' && pathname === '/dashboard-current-node.js') {
    const body = await fs.readFile(new URL('./dashboard-current-node.js', import.meta.url), 'utf8');
    res.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    });
    return res.end(body);
  }
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return proxyDashboardDocument(req, res);
  }

  return proxyToDashboard(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Dashboard wrapper listening on :${port}`);
});
