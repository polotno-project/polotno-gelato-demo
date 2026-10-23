import React from 'react';
import { SectionTab } from 'polotno/side-panel';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from 'polotno/primitives';

// Gelato tab: export the poster as a PDF with bleed and send it, through the
// demo backend that holds the Gelato key, to Gelato's order API. Gelato quotes
// it for buyers in six countries, showing which country would print each one,
// then creates a draft order for the chosen buyer. Drafts are never produced
// or charged, and the backend deletes it right away.

const API = (import.meta.env.VITE_POD_API || 'http://localhost:8787').replace(/\/$/, '');

const COUNTRIES = {
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  AU: 'Australia',
  JP: 'Japan',
  BR: 'Brazil',
};
const countryName = (code) => {
  try {
    return COUNTRIES[code] || new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
  } catch {
    return code;
  }
};

/** Inline styles: the published CSS only ships `pn:` utilities. */
const styles = {
  panel: { display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflowY: 'auto', paddingBottom: 24 },
  label: { fontSize: 12, fontWeight: 500, opacity: 0.75 },
  spec: { fontSize: 13, margin: 0, lineHeight: 1.5 },
  select: { width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4 },
  hint: { fontSize: 12, lineHeight: 1.45, opacity: 0.65, margin: 0 },
  progress: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '10px 12px', background: '#f4f4f4' },
  error: { fontSize: 13, color: '#b42318', margin: 0 },
  dialog: { maxWidth: 820, width: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' },
  verdict: { padding: '12px 14px', fontSize: 14, fontWeight: 600, background: '#e8f5e9', color: '#1b5e20' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 },
  th: { textAlign: 'left', fontWeight: 500, opacity: 0.7, padding: '6px 8px', borderBottom: '1px solid #e0e0e0' },
  td: { padding: '6px 8px', borderBottom: '1px solid #f0f0f0' },
  chosen: { background: '#fff8e1' },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.5,
    margin: '6px 0 0',
    padding: 12,
    background: '#f4f4f4',
    overflowX: 'auto',
    whiteSpace: 'pre',
    maxHeight: 280,
  },
};

const money = (value, currency = 'EUR') =>
  typeof value === 'number' ? new Intl.NumberFormat('en', { style: 'currency', currency }).format(value) : '–';
const show = (value) =>
  JSON.stringify(value, (k, v) => (typeof v === 'string' && v.length > 100 ? `${v.slice(0, 60)}…` : v), 2);

function Result({ result, onClose }) {
  const chosen = result.quotes.find((q) => q.country === result.country);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent style={styles.dialog}>
        <DialogHeader>
          <DialogTitle>Back from Gelato</DialogTitle>
          <DialogDescription>
            Gelato&apos;s order API quoted the PDF this editor just exported for buyers in six countries, and picked the
            print location for each. Nothing was ordered: the draft order is never produced or charged.
          </DialogDescription>
        </DialogHeader>
        {chosen && (
          <div style={styles.verdict}>
            A buyer in {chosen.city} gets this poster printed in {countryName(chosen.printedIn)}, delivered in{' '}
            {chosen.days?.[0]}–{chosen.days?.[1]} days.
          </div>
        )}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Buyer in</th>
              <th style={styles.th}>Printed in</th>
              <th style={styles.th}>Poster</th>
              <th style={styles.th}>Shipping</th>
              <th style={styles.th}>Delivery</th>
            </tr>
          </thead>
          <tbody>
            {result.quotes.map((q) => (
              <tr key={q.country} style={q.country === result.country ? styles.chosen : undefined}>
                <td style={styles.td}>{q.city}</td>
                <td style={styles.td}>{q.printedIn ? countryName(q.printedIn) : '–'}</td>
                <td style={styles.td}>{money(q.price, q.currency)}</td>
                <td style={styles.td}>{money(q.shipping, q.currency)}</td>
                <td style={styles.td}>{q.days ? `${q.days[0]}–${q.days[1]} days` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.requests.map((r) => (
          <div key={r.endpoint} style={{ marginTop: 18 }}>
            <span style={styles.label}>{r.title}</span>
            <pre style={styles.code}>{`${r.endpoint}\n${show(r.body)}\n\n→ ${show(r.response)}`}</pre>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

export function gelatoSection(product) {
  const Panel = ({ store }) => {
    const [country, setCountry] = React.useState('DE');
    const [step, setStep] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [result, setResult] = React.useState(null);

    const send = async () => {
      setError(null);
      setStep('Exporting the print PDF with bleed…');
      try {
        store.selectElements([]);
        const pdf = await store.toPDFDataURL({ includeBleed: true });
        setStep('Gelato is quoting six countries…');
        const res = await fetch(`${API}/gelato/order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf, country }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Gelato request failed');
        setResult(json);
      } catch (e) {
        console.error('gelato order failed', e);
        setError(e?.message || 'Something went wrong');
      } finally {
        setStep(null);
      }
    };

    return (
      <div style={styles.panel}>
        <div>
          <span style={styles.label}>Product</span>
          <p style={styles.spec}>
            Premium Matte Poster, {product.widthMm / 10} × {product.heightMm / 10} cm + {product.bleedMm} mm bleed
          </p>
        </div>
        <label>
          <span style={styles.label}>Ship to</span>
          <select style={styles.select} value={country} onChange={(e) => setCountry(e.target.value)} disabled={!!step}>
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={step ? undefined : send} aria-busy={!!step}>
          {step ? 'Asking Gelato…' : 'Send to Gelato'}
        </Button>
        {step && (
          <div role="status" style={styles.progress}>
            <Spinner />
            {step}
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
        <p style={styles.hint}>
          Exports this poster as a print PDF and sends it to Gelato&apos;s API, which quotes it and picks the nearest
          print location for each buyer. The draft order is never produced or charged.
        </p>
        {result && <Result result={result} onClose={() => setResult(null)} />}
      </div>
    );
  };

  return {
    name: 'gelato',
    Tab: (props) => (
      <SectionTab name="Gelato" {...props}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2.5 10h15M10 2.5c2.2 2.3 2.2 12.7 0 15M10 2.5c-2.2 2.3-2.2 12.7 0 15" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </SectionTab>
    ),
    Panel,
  };
}
