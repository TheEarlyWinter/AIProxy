(() => {
  const cardId = 'ai-proxy-current-node-card';
  const styleId = 'ai-proxy-current-node-style';
  const delayCardId = 'ai-proxy-multi-delay-card';
  const delayGroups = [
    ['香港', 'AI-GOOD-香港'],
    ['澳门', 'AI-GOOD-澳门'],
    ['台湾', 'AI-GOOD-台湾'],
    ['日本', 'AI-GOOD-日本'],
    ['韩国', 'AI-GOOD-韩国'],
    ['新加坡', 'AI-GOOD-新加坡'],
    ['马来西亚', 'AI-GOOD-马来西亚'],
    ['越南', 'AI-GOOD-越南'],
    ['印度尼西亚', 'AI-GOOD-印度尼西亚'],
    ['美国', 'AI-GOOD-美国'],
    ['英国', 'AI-GOOD-英国'],
    ['乌克兰', 'AI-GOOD-乌克兰'],
    ['澳大利亚', 'AI-GOOD-澳大利亚'],
  ];
  let timer;
  let delayRequest;

  function isHome() {
    return location.hash === '' || location.hash === '#/' || location.hash.startsWith('#/overview');
  }

  function addStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      #${cardId} {
        position: fixed;
        top: 76px;
        right: 24px;
        z-index: 9999;
        width: min(330px, calc(100vw - 48px));
        box-sizing: border-box;
        padding: 13px 16px;
        border: 1px solid rgba(98, 211, 224, .28);
        border-radius: 12px;
        color: #dbeafe;
        background: rgba(10, 24, 31, .96);
        box-shadow: 0 12px 34px rgba(0, 0, 0, .28);
        font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
      #${cardId} .aipx-title { display: flex; align-items: center; gap: 8px; color: #8fe7ef; font-weight: 700; }
      #${cardId} .aipx-dot { width: 8px; height: 8px; border-radius: 50%; background: #21c55d; box-shadow: 0 0 10px #21c55d; }
      #${cardId}.aipx-offline .aipx-dot { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
      #${cardId} .aipx-node { margin-top: 6px; color: #ffffff; font-size: 15px; font-weight: 650; overflow-wrap: anywhere; }
      #${cardId} .aipx-route { margin-top: 5px; color: #94a3b8; font-size: 11px; overflow-wrap: anywhere; }
      #${cardId} .aipx-time { margin-top: 4px; color: #64748b; font-size: 10px; }
      @media (max-width: 700px) { #${cardId} { top: 68px; right: 12px; width: calc(100vw - 24px); } }

      #${delayCardId} {
        position: fixed; right: 24px; bottom: 20px; z-index: 9998;
        width: min(430px, calc(100vw - 48px)); box-sizing: border-box;
        padding: 14px 16px; border: 1px solid rgba(98, 211, 224, .28);
        border-radius: 12px; color: #dbeafe; background: rgba(10, 24, 31, .97);
        box-shadow: 0 12px 34px rgba(0, 0, 0, .3);
        font: 12px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${delayCardId} .aipx-delay-title { color: #8fe7ef; font-weight: 700; font-size: 13px; }
      #${delayCardId} .aipx-delay-help { margin-top: 3px; color: #94a3b8; font-size: 11px; }
      #${delayCardId} .aipx-delay-controls { display: flex; gap: 8px; margin-top: 10px; }
      #${delayCardId} select, #${delayCardId} button {
        min-height: 30px; border: 1px solid rgba(148, 163, 184, .28); border-radius: 7px;
        color: #e2e8f0; background: #172832; font: inherit;
      }
      #${delayCardId} select { min-width: 150px; padding: 0 8px; }
      #${delayCardId} button { padding: 0 11px; color: #062127; background: #8fe7ef; cursor: pointer; font-weight: 700; }
      #${delayCardId} button:disabled { opacity: .55; cursor: wait; }
      #${delayCardId} .aipx-delay-status { margin-top: 9px; color: #cbd5e1; }
      #${delayCardId} .aipx-delay-results { display: grid; gap: 6px; max-height: 38vh; overflow: auto; margin-top: 8px; padding-right: 3px; }
      #${delayCardId} .aipx-delay-row { padding: 7px 8px; border-radius: 7px; background: rgba(30, 52, 61, .75); }
      #${delayCardId} .aipx-delay-node { color: #f8fafc; overflow-wrap: anywhere; }
      #${delayCardId} .aipx-delay-pills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
      #${delayCardId} .aipx-delay-pill { padding: 1px 5px; border-radius: 4px; font-size: 10px; }
      #${delayCardId} .aipx-delay-pill.ok { color: #bbf7d0; background: rgba(22, 163, 74, .28); }
      #${delayCardId} .aipx-delay-pill.bad { color: #cbd5e1; background: rgba(100, 116, 139, .28); }
      @media (max-width: 700px) { #${delayCardId} { right: 12px; bottom: 12px; width: calc(100vw - 24px); } }
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    if (!isHome()) {
      document.getElementById(cardId)?.remove();
      return null;
    }
    addStyle();
    let card = document.getElementById(cardId);
    if (card) return card;

    card = document.createElement('aside');
    card.id = cardId;
    card.innerHTML = `
      <div class="aipx-title"><span class="aipx-dot"></span><span>当前出站节点</span></div>
      <div class="aipx-node" data-aipx-node>读取中…</div>
      <div class="aipx-route" data-aipx-route>AI-OUT</div>
      <div class="aipx-time" data-aipx-time></div>
    `;
    document.body.appendChild(card);
    return card;
  }

  function isProxyPage() {
    return location.hash.startsWith('#/proxies');
  }

  function ensureDelayCard() {
    if (!isProxyPage()) {
      document.getElementById(delayCardId)?.remove();
      return null;
    }

    let card = document.getElementById(delayCardId);
    if (card) return card;

    card = document.createElement('aside');
    card.id = delayCardId;
    card.innerHTML = `
      <div class="aipx-delay-title">多站点延迟复核</div>
      <div class="aipx-delay-help">任一测试地址成功即标记为可用；不会改变现有自动故障转移规则。</div>
      <div class="aipx-delay-controls">
        <select data-aipx-delay-group aria-label="选择国家分组"></select>
        <button type="button" data-aipx-delay-run>开始复核</button>
      </div>
      <div class="aipx-delay-status" data-aipx-delay-status>选择分组后点击“开始复核”</div>
      <div class="aipx-delay-results" data-aipx-delay-results></div>
    `;
    const select = card.querySelector('[data-aipx-delay-group]');
    for (const [label, value] of delayGroups) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      if (value === 'AI-GOOD-日本') option.selected = true;
      select.appendChild(option);
    }
    card.querySelector('[data-aipx-delay-run]').addEventListener('click', runDelayTest);
    document.body.appendChild(card);
    return card;
  }

  function renderDelayResult(data) {
    const card = ensureDelayCard();
    if (!card) return;
    const status = card.querySelector('[data-aipx-delay-status]');
    const results = card.querySelector('[data-aipx-delay-results]');
    const button = card.querySelector('[data-aipx-delay-run]');
    button.disabled = false;
    if (!data?.ok) {
      status.textContent = '复核失败，请稍后重试';
      results.replaceChildren();
      return;
    }

    const passed = Number(data.availableCount) || 0;
    const total = Number(data.nodeCount) || 0;
    const ignored = Number(data.ignoredIpv6OnlyCount) || 0;
    const ignoredText = ignored > 0 ? `；已忽略 IPv6 Only ${ignored} 个` : '';
    status.textContent = `任一地址成功：${passed}/${total}${ignoredText}；${new Date(data.testedAt).toLocaleTimeString()}`;
    results.replaceChildren();
    for (const node of data.nodes || []) {
      const row = document.createElement('div');
      row.className = 'aipx-delay-row';
      const name = document.createElement('div');
      name.className = 'aipx-delay-node';
      name.textContent = node.name;
      row.appendChild(name);

      const pills = document.createElement('div');
      pills.className = 'aipx-delay-pills';
      for (const check of node.checks || []) {
        const pill = document.createElement('span');
        pill.className = `aipx-delay-pill ${check.delay === null ? 'bad' : 'ok'}`;
        pill.textContent = check.delay === null ? `${check.label} —` : `${check.label} ${check.delay}ms`;
        pills.appendChild(pill);
      }
      row.appendChild(pills);
      results.appendChild(row);
    }
  }

  async function runDelayTest() {
    const card = ensureDelayCard();
    if (!card) return;
    delayRequest?.abort();
    delayRequest = new AbortController();
    const group = card.querySelector('[data-aipx-delay-group]').value;
    const button = card.querySelector('[data-aipx-delay-run]');
    const status = card.querySelector('[data-aipx-delay-status]');
    const results = card.querySelector('[data-aipx-delay-results]');
    button.disabled = true;
    status.textContent = '正在依次测试 3 个地址，可能需要几十秒…';
    results.replaceChildren();
    try {
      const response = await fetch(`/api/multi-delay?group=${encodeURIComponent(group)}`, {
        cache: 'no-store',
        signal: delayRequest.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'multi-delay-failed');
      renderDelayResult(data);
    } catch (error) {
      if (error.name !== 'AbortError') renderDelayResult({ ok: false });
    } finally {
      if (card.isConnected) button.disabled = false;
    }
  }

  function render(data) {
    const card = ensureCard();
    if (!card) return;
    card.classList.toggle('aipx-offline', !data?.ok);
    card.querySelector('[data-aipx-node]').textContent = data?.ok && data.node ? data.node : '控制器暂不可用';
    const route = data?.chain?.map((item) => item.group).join(' → ') || 'AI-OUT';
    card.querySelector('[data-aipx-route]').textContent = `链路：${route}`;
    const time = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '';
    card.querySelector('[data-aipx-time]').textContent = time ? `更新：${time}` : '';
  }

  async function refresh() {
    if (!isHome()) return;
    try {
      const response = await fetch('/api/current-node', { cache: 'no-store' });
      render(await response.json());
    } catch {
      render({ ok: false });
    }
  }

  function boot() {
    addStyle();
    ensureCard();
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 15000);
  }

  window.addEventListener('hashchange', () => {
    refresh();
    ensureDelayCard();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
