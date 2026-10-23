// Backend for the Polotno + Gelato demo.
//
// The editor runs in the browser, so it cannot hold the Gelato credentials.
// This server holds them and exposes:
//
//   GET /health
//   GET /gelato/product
//   POST /gelato/order
//
// Env:
//   GELATO_API_KEY
//   PUBLIC_URL      this server's public URL; the provider downloads print files from it
//   ALLOWED_ORIGINS comma-separated, defaults to localhost:5173

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const env = process.env;
const PORT = Number(env.PORT || 8787);
const PUBLIC_URL = (env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ALLOWED_ORIGINS = (
  env.ALLOWED_ORIGINS ||
  'http://localhost:5173'
).split(',');

const MAX_BODY = 25 * 1024 * 1024;
const FILE_TTL_MS = 10 * 60 * 1000;

// --- helpers ------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cached(fn, ttlMs = 60 * 60 * 1000) {
  const cache = new Map();
  return async (key) => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await fn(key);
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  };
}

async function api(base, token, path, { method = 'GET', body, headers = {} } = {}) {
  // A provider with its own auth header passes Authorization: undefined.
  const allHeaders = Object.fromEntries(
    Object.entries({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }).filter(
      ([, v]) => v !== undefined
    )
  );
  const res = await fetch(base + path, {
    method,
    headers: allHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail = json?.error?.message || json?.message || json?.result || text;
    throw new HttpError(502, `${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

// --- temporary file hosting (Gelato downloads print files by URL) -----------

const files = new Map();

const FILE_TYPES = { png: 'image/png', pdf: 'application/pdf' };

function hostFile(base64, ext = 'png') {
  const id = randomUUID();
  files.set(id, { data: Buffer.from(base64, 'base64'), ext, expires: Date.now() + FILE_TTL_MS });
  return `${PUBLIC_URL}/files/${id}.${ext}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, f] of files) if (f.expires < now) files.delete(id);
}, 60 * 1000).unref();

// --- Gelato -----------------------------------------------------------------------

// Gelato has no test environment, so the demo only uses calls that cost
// nothing: quotes, and a draft order that is deleted as soon as it is read.
// Drafts are never produced or charged.
const GELATO_ORDER_API = 'https://order.gelatoapis.com/v4';
const GELATO_PRODUCT_API = 'https://product.gelatoapis.com/v3';
// Premium Matte Poster, 30 × 40 cm portrait. Gelato asks for 4 mm bleed.
const GELATO_PRODUCT = env.GELATO_PRODUCT_UID || 'flat_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver';
const GELATO_BLEED_MM = 4;

// One buyer per country, to show where Gelato routes the same poster.
const GELATO_BUYERS = {
  US: { city: 'New York', postCode: '10001', addressLine1: '350 5th Ave', state: 'NY' },
  GB: { city: 'London', postCode: 'SW1A 1AA', addressLine1: '10 Downing St' },
  DE: { city: 'Berlin', postCode: '10117', addressLine1: 'Unter den Linden 1' },
  AU: { city: 'Sydney', postCode: '2000', addressLine1: '1 Macquarie St', state: 'NSW' },
  JP: { city: 'Tokyo', postCode: '100-0005', addressLine1: '1-1 Marunouchi' },
  BR: { city: 'São Paulo', postCode: '01310-100', addressLine1: 'Av. Paulista 1000', state: 'SP' },
};

const gelato = (base, path, opts = {}) => {
  if (!env.GELATO_API_KEY) throw new HttpError(503, 'GELATO_API_KEY is not set');
  return api(base, null, path, { ...opts, headers: { Authorization: undefined, 'X-API-KEY': env.GELATO_API_KEY } });
};

const gelatoProduct = cached(async () => {
  const p = await gelato(GELATO_PRODUCT_API, `/products/${GELATO_PRODUCT}`);
  return {
    uid: p.productUid,
    widthMm: Number(p.dimensions?.Width?.value),
    heightMm: Number(p.dimensions?.Height?.value),
    bleedMm: GELATO_BLEED_MM,
    countries: p.supportedCountries?.length,
  };
});

const gelatoAddress = (country) => ({
  firstName: 'Polotno',
  lastName: 'Demo',
  email: 'demo@polotno.com',
  country,
  ...GELATO_BUYERS[country],
});

async function gelatoOrder(body) {
  const pdf = String(body?.pdf || '').replace(/^data:application\/pdf[^,]*,/, '');
  if (!pdf.startsWith('JVBER')) throw new HttpError(400, 'pdf is not a PDF');
  const country = GELATO_BUYERS[body?.country] ? body.country : 'DE';
  const product = await gelatoProduct('product');
  const fileUrl = hostFile(pdf, 'pdf');
  const item = { itemReferenceId: 'poster', productUid: product.uid, files: [{ type: 'default', url: fileUrl }], quantity: 1 };

  const quoteBody = (c) => ({
    orderReferenceId: `polotno-demo-quote-${c}`,
    customerReferenceId: 'polotno-demo',
    currency: 'EUR',
    allowMultipleQuotes: false,
    recipient: gelatoAddress(c),
    products: [item],
  });
  const quotes = await Promise.all(
    Object.keys(GELATO_BUYERS).map(async (c) => {
      const q = (await gelato(GELATO_ORDER_API, '/orders:quote', { method: 'POST', body: quoteBody(c) })).quotes?.[0];
      const cheapest = [...(q?.shipmentMethods || [])].sort((a, b) => a.price - b.price)[0];
      return {
        country: c,
        city: GELATO_BUYERS[c].city,
        printedIn: q?.productionCountry,
        price: q?.products?.[0]?.price,
        shipping: cheapest?.price,
        shippingName: cheapest?.name,
        days: cheapest ? [cheapest.minDeliveryDays, cheapest.maxDeliveryDays] : null,
        currency: q?.products?.[0]?.currency,
      };
    })
  );

  const orderBody = {
    orderType: 'draft',
    orderReferenceId: `polotno-demo-${Date.now()}-${randomUUID().slice(0, 8)}`,
    customerReferenceId: 'polotno-demo',
    currency: 'EUR',
    items: [item],
    shippingAddress: gelatoAddress(country),
  };
  const draft = await gelato(GELATO_ORDER_API, '/orders', { method: 'POST', body: orderBody });
  // Drafts cost nothing, but don't leave one behind per click.
  if (draft.id) await gelato(GELATO_ORDER_API, `/orders/${draft.id}`, { method: 'DELETE' }).catch(() => {});
  const draftItem = draft.items?.[0] || {};

  return {
    product: { ...product, name: draftItem.productName || 'Premium Matte Poster' },
    country,
    quotes,
    draft: {
      id: draft.id,
      status: draft.fulfillmentStatus,
      productName: draftItem.productName,
      price: draftItem.price,
      currency: draft.currency,
    },
    requests: [
      {
        title: `Quote the poster for a buyer in each country (${quotes.length} calls)`,
        endpoint: `POST ${GELATO_ORDER_API}/orders:quote`,
        body: quoteBody(country),
        response: quotes.find((q) => q.country === country),
      },
      {
        title: 'Create the order as a draft (never produced or charged)',
        endpoint: `POST ${GELATO_ORDER_API}/orders`,
        body: orderBody,
        response: { id: draft.id, fulfillmentStatus: draft.fulfillmentStatus, items: [{ productName: draftItem.productName, price: draftItem.price }] },
      },
    ],
  };
}

// --- rate limit -----------------------------------------------------------------

const hits = new Map();
function rateLimit(ip, limit = 12, windowMs = 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) throw new HttpError(429, 'Too many requests, try again in a minute');
  recent.push(now);
  hits.set(ip, recent);
}

// --- server ---------------------------------------------------------------------

const routes = {
  'GET /health': async () => ({ ok: true }),
  'GET /gelato/product': () => gelatoProduct('product'),
  'POST /gelato/order': (body) => gelatoOrder(body),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Design too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        reject(new HttpError(400, 'Body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const file = url.pathname.match(/^\/files\/([0-9a-f-]+)\.(png|pdf)$/);
  if (req.method === 'GET' && file) {
    const f = files.get(file[1]);
    if (!f || f.ext !== file[2]) return res.writeHead(404).end();
    return res.writeHead(200, { 'Content-Type': FILE_TYPES[f.ext] }).end(f.data);
  }

  const route = routes[`${req.method} ${url.pathname}`];
  try {
    if (!route) throw new HttpError(404, 'Not found');
    if (req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
        .split(',')[0]
        .trim();
      rateLimit(ip);
    }
    const body = req.method === 'POST' ? await readBody(req) : null;
    const result = await route(body, url.searchParams);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(req.method, url.pathname, e.message);
    res
      .writeHead(status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => console.log(`pod-proxy listening on ${PORT}`));
