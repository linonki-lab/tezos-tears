(() => {
  const API = "https://api.tzkt.io/v1/operations/transactions";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function nowIsoMinus(ms) {
    return new Date(Date.now() - ms).toISOString();
  }

  function buildUrl({ sinceIso, limit }) {
    const u = new URL(API);
    u.searchParams.set("sort.desc", "level");
    u.searchParams.set("limit", String(limit));
    if (sinceIso) u.searchParams.set("timestamp.gt", sinceIso);
    return u.toString();
  }

  function normalizeTx(op) {
    // TzKT returns "amount" as a number (mutez) for transactions.
    // See: https://api.tzkt.io/#operation/Operations_GetTransactions
    const id = op?.id;
    const hash = op?.hash;
    const amountMutez = Number(op?.amount ?? 0);

    return {
      id,
      hash,
      amountMutez,
      level: op?.level,
      timestamp: op?.timestamp,
    };
  }

  function createTxPoller({
    onTxBatch,
    onError,
    pollMs = 2500,
    limit = 50,
    // Start a bit in the past so the first load isn't empty.
    initialLookbackMs = 20_000,
    maxDedupe = 5000,
  }) {
    let running = false;
    let cursorIso = nowIsoMinus(initialLookbackMs);

    const seen = new Set();
    const seenQueue = [];

    function markSeen(key) {
      if (seen.has(key)) return false;
      seen.add(key);
      seenQueue.push(key);
      while (seenQueue.length > maxDedupe) {
        const old = seenQueue.shift();
        if (old != null) seen.delete(old);
      }
      return true;
    }

    async function tick() {
      const url = buildUrl({ sinceIso: cursorIso, limit });
      const res = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`TzKT ${res.status}: ${text.slice(0, 160)}`);
      }

      const ops = await res.json();
      if (!Array.isArray(ops) || ops.length === 0) return;

      // Update cursor to newest timestamp we saw.
      // TzKT returns newest first due to sort.desc=level.
      const newestTs = ops[0]?.timestamp;
      if (newestTs) cursorIso = newestTs;

      // Return oldest-first for nicer spawn progression.
      const out = [];
      for (let i = ops.length - 1; i >= 0; i--) {
        const op = ops[i];
        const key = op?.id ?? op?.hash;
        if (key == null) continue;
        if (!markSeen(String(key))) continue;
        out.push(normalizeTx(op));
      }

      if (out.length) onTxBatch(out);
    }

    async function loop() {
      while (running) {
        try {
          await tick();
        } catch (e) {
          onError?.(e);
          // Backoff a bit on errors.
          await sleep(Math.min(15_000, pollMs * 3));
        }
        await sleep(pollMs);
      }
    }

    return {
      start() {
        if (running) return;
        running = true;
        loop();
      },
      stop() {
        running = false;
      },
      setPollMs(ms) {
        pollMs = ms;
      },
      getCursorIso() {
        return cursorIso;
      },
    };
  }

  window.TezosTearsTzkt = {
    createTxPoller,
  };
})();

