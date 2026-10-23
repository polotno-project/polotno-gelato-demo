# Gelato API demo with Polotno

A 30 × 40 cm poster editor built with Polotno SDK that sends the print PDF to the Gelato API and shows where Gelato would print it for buyers in six countries, with price and delivery time.

> **You need a Polotno API key to run this.** The code in this repo is MIT, but it runs on [Polotno SDK](https://polotno.com), which is commercial. Get a trial key in your [Polotno dashboard](https://polotno.com/cabinet) to try it (trial keys show a "Powered by Polotno" credit); shipping it in a product needs a [paid Polotno license](https://polotno.com/sdk/pricing).

Try it live: [polotno.com/sdk/product/integrations/gelato](https://polotno.com/sdk/product/integrations/gelato)

## How it works

1. The editor is sized to Gelato's print spec, so the export matches what Gelato expects.
2. Pressing the button in the **Gelato** tab exports the print file and posts it to the server.
3. The server quotes the poster for a buyer in each country, then creates a draft order and deletes it. Drafts are never produced or charged.
4. The result shows what came back, plus the exact requests sent, ready to copy into your backend.

## Run it

You need Node 20+, pnpm, a Polotno API key (a trial key from [polotno.com/cabinet](https://polotno.com/cabinet) works for trying it) and Gelato API credentials.

```bash
cd server
cp .env.example .env   # add your Gelato credentials
node --env-file=.env server.mjs
```

```bash
cd web
cp .env.example .env   # add your Polotno key
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The credentials stay on the server.

## Where things are

- `web/src/index.jsx`: the editor, sized to the product
- `web/src/gelato-section.jsx`: the Gelato tab and the result dialog
- `server/server.mjs`: the Gelato API calls

## More providers

The same pattern for other print APIs: [polotno-project on GitHub](https://github.com/polotno-project?q=demo) (Printful, Printify, Teemill, Fourthwall, Spreadconnect, Scalable Press, Lulu, Peecho, Gelato, Prodigi).

## License

The code in this repository is MIT. Polotno SDK itself is not: it needs a Polotno API key, and production use needs a [paid license](https://polotno.com/sdk/pricing).
