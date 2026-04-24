(() => {
  const { clamp, quantize, hashToHue } = window.TezoTearsUtils;

  const CFG = {
    pixel: 4, // grid size (px)
    maxDrops: 1200,
    spawnBurstCap: 40, // cap spawns per poll to avoid huge bursts
    fadeBgAlpha: 26, // 0..255 (higher = more trails)
    baseBg: [5, 6, 10],
  };

  class Drop {
    constructor({ x, y, px, speed, baseHue, weight = 1, seed = 0 }) {
      this.x = x;
      this.y = y;
      this.px = px;
      this.speed = speed;
      this.baseHue = baseHue;
      this.weight = weight;
      this.seed = seed;
      this.t = 0;
      this.wobble = (seed % 1000) / 1000;
    }

    update(dt, w, h) {
      this.t += dt;

      // Slight horizontal drift with quantized “pixel” feel.
      const drift =
        Math.sin((this.t * 0.9 + this.wobble * 10) * 2.0) * (this.px * 0.35);
      this.x += drift * dt;

      this.y += this.speed * dt;

      // Wrap softly horizontally to stay on screen.
      if (this.x < -this.px) this.x = w + this.px;
      if (this.x > w + this.px) this.x = -this.px;

      return this.y < h + this.px * 2;
    }

    draw(p) {
      // Color evolves while falling (time + slight noise).
      const hue =
        (this.baseHue +
          this.t * (40 + this.speed * 0.08) +
          Math.sin(this.t * 1.7 + this.wobble * 6) * 18) %
        360;

      const sat = 78;
      const bri = 98;
      const alpha = 0.95;

      p.noStroke();
      p.fill(hue, sat, bri, alpha);

      // Quantize to grid for pixel look.
      const qx = quantize(this.x, this.px);
      const qy = quantize(this.y, this.px);

      // “Raindrop” = a short vertical pixel streak.
      const len = Math.max(1, Math.round(this.weight));
      for (let i = 0; i < len; i++) {
        p.rect(qx, qy - i * this.px, this.px, this.px);
      }
    }
  }

  const state = {
    drops: [],
    lastFrameMs: 0,
    poller: null,
    demoSpawnAcc: 0,
    status: {
      mode: "boot",
      lastOkAt: 0,
      lastErrAt: 0,
      lastErr: "",
      lastCount: 0,
    },
  };

  function spawnDropFromTx(p, tx) {
    const w = p.width;

    const seed = tx?.hash ? window.TezoTearsUtils.fnv1a32(tx.hash) : 0;
    const baseHue = hashToHue(tx?.hash ?? String(tx?.id ?? seed));

    // Map amount (mutez) to speed/weight, clamped to keep performance stable.
    const amountMutez = Number(tx?.amountMutez ?? 0);
    const amountXTZ = amountMutez / 1_000_000;
    const speed = clamp(140 + Math.sqrt(amountXTZ + 1) * 120, 140, 860);
    const weight = clamp(1 + Math.log10(amountXTZ + 1) * 2.2, 1, 7);

    const x = (seed % 10_000) / 10_000 * w;
    const y = -CFG.pixel * (2 + (seed % 7));

    state.drops.push(
      new Drop({
        x,
        y,
        px: CFG.pixel,
        speed,
        baseHue,
        weight,
        seed,
      }),
    );
  }

  function spawnDemoDrops(p, count) {
    for (let i = 0; i < count; i++) {
      const seed = (Math.random() * 0xffffffff) >>> 0;
      spawnDropFromTx(p, {
        id: seed,
        hash: `demo_${seed}`,
        amountMutez: Math.floor(Math.random() * 4_000_000),
      });
    }
  }

  function enforceCap() {
    if (state.drops.length <= CFG.maxDrops) return;
    state.drops.splice(0, state.drops.length - CFG.maxDrops);
  }

  const sketch = (p) => {
    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.colorMode(p.HSB, 360, 100, 100, 1);
      p.rectMode(p.CORNER);

      p.background(...CFG.baseBg);
      state.lastFrameMs = p.millis();

      // Start tx poller (implemented in src/tzkt.js).
      if (window.TezosTearsTzkt?.createTxPoller) {
        state.poller = window.TezosTearsTzkt.createTxPoller({
          onTxBatch: (txs) => {
            state.status.mode = "live";
            state.status.lastOkAt = Date.now();
            state.status.lastCount = txs.length;

            const capped = txs.slice(0, CFG.spawnBurstCap);
            for (const tx of capped) spawnDropFromTx(p, tx);
            enforceCap();
          },
          onError: (err) => {
            state.status.mode = "demo";
            state.status.lastErrAt = Date.now();
            state.status.lastErr = String(err?.message ?? err ?? "unknown");
          },
        });

        state.poller.start();
      } else {
        state.status.mode = "demo";
        state.status.lastErr = "tzkt module missing";
      }
    };

    p.draw = () => {
      const now = p.millis();
      const dt = Math.min(0.05, (now - state.lastFrameMs) / 1000);
      state.lastFrameMs = now;

      // Background fade for trails.
      p.noStroke();
      p.fill(CFG.baseBg[0], CFG.baseBg[1], CFG.baseBg[2], CFG.fadeBgAlpha / 255);
      p.rect(0, 0, p.width, p.height);

      // Demo spawner if live is failing.
      if (state.status.mode !== "live") {
        state.demoSpawnAcc += dt;
        const every = 0.12; // ~8 drops/sec
        while (state.demoSpawnAcc >= every) {
          state.demoSpawnAcc -= every;
          spawnDemoDrops(p, 1);
        }
        enforceCap();
      }

      // Update + render drops.
      const kept = [];
      for (const d of state.drops) {
        if (d.update(dt, p.width, p.height)) {
          d.draw(p);
          kept.push(d);
        }
      }
      state.drops = kept;

      // Minimal HUD (very subtle).
      p.noStroke();
      p.fill(0, 0, 100, 0.55);
      p.textSize(12);
      p.textFont("monospace");
      const mode = state.status.mode;
      const txInfo =
        mode === "live" ? `tx+${state.status.lastCount}` : "demo";
      p.text(
        `mode:${mode}  drops:${state.drops.length}  ${txInfo}`,
        10,
        18,
      );
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };
  };

  // eslint-disable-next-line no-new
  new p5(sketch, document.getElementById("app"));
})();

