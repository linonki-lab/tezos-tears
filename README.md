# Tezos Tears (Teia Interactive OBJKT)

Pixel raindrops rendered with p5.js. Each new Tezos transaction observed from **TzKT** spawns a new falling “drop” whose color keeps evolving while it falls.

## Local run

From this folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Mint on Teia

- Ensure `index.html` is at the **top level** of the zip.
- Ensure all paths are **relative** (this project is).
- p5 is bundled locally at `assets/p5.min.js` (no external library loads).

Zip the folder contents (example):

```bash
zip -r tezos-tears.zip index.html style.css assets src
```

Upload `tezos-tears.zip` at Teia mint page and test the preview.

## Notes

- Live data: `https://api.tzkt.io/v1/operations/transactions` (polled every ~2.5s).\n+- If the network is blocked or fails, the sketch automatically switches to a lightweight **demo mode** spawner so the piece still animates.

