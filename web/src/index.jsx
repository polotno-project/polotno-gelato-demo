import React from 'react';
import ReactDOM from 'react-dom/client';
import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { ZoomButtons } from 'polotno/toolbar/zoom-buttons';
import { SidePanel, DEFAULT_SECTIONS } from 'polotno/side-panel';
import { Workspace } from 'polotno/canvas/workspace';
import { createStore } from 'polotno/model/store';

import { gelatoSection } from './gelato-section';

// A poster editor with a Gelato tab. Gelato's Premium Matte Poster is
// 300 × 400 mm and wants 4 mm of bleed on every side, so the editor works in
// millimetres at 300 DPI with that bleed, and the PDF export includes it.

const DPI = 300;
const WIDTH_MM = 300;
const HEIGHT_MM = 400;
const BLEED_MM = 4;
const px = (mm) => (mm / 25.4) * DPI;

// Polotno SDK needs an API key: a trial key from https://polotno.com/cabinet
// works for trying this; production use needs a paid license.
const store = createStore({ key: import.meta.env.VITE_POLOTNO_KEY, showCredit: false });
window.store = store;

store.setUnit({ unit: 'mm', dpi: DPI });
store.setSize(px(WIDTH_MM), px(HEIGHT_MM));
const page = store.addPage({ bleed: px(BLEED_MM) });
store.toggleBleed(true);

// A starter poster. The background runs into the bleed; text stays well inside.
const W = store.width;
const H = store.height;
page.set({ background: '#1f3a5f' });
page.addElement({
  type: 'figure',
  subType: 'rect',
  x: W * 0.08,
  y: H * 0.08,
  width: W * 0.84,
  height: H * 0.56,
  fill: '#f2c14e',
});
page.addElement({
  type: 'text',
  text: 'PRINTED\nNEAR YOU',
  x: W * 0.08,
  y: H * 0.68,
  width: W * 0.84,
  fontSize: W * 0.12,
  lineHeight: 1,
  fontFamily: 'Oswald',
  fill: '#f7f3e9',
  align: 'center',
});
page.addElement({
  type: 'text',
  text: 'Premium matte poster · 30 × 40 cm',
  x: W * 0.15,
  y: H * 0.9,
  width: W * 0.7,
  fontSize: W * 0.03,
  fontFamily: 'Roboto',
  fill: '#f7f3e9',
  align: 'center',
});
store.selectElements([]);

// Only what a poster needs: no generic templates, no resize (the print size
// is fixed by the product), no drawing.
const sections = [
  gelatoSection({ widthMm: WIDTH_MM, heightMm: HEIGHT_MM, bleedMm: BLEED_MM }),
  ...DEFAULT_SECTIONS.filter((s) =>
    ['text', 'photos', 'elements', 'upload', 'background', 'layers'].includes(s.name)
  ),
];

const App = () => (
  <PolotnoContainer style={{ width: '100vw', height: '100vh' }}>
    <SidePanelWrap>
      <SidePanel store={store} sections={sections} defaultSection="gelato" />
    </SidePanelWrap>
    <WorkspaceWrap>
      <Toolbar store={store} downloadButtonEnabled />
      <Workspace store={store} />
      <ZoomButtons store={store} />
    </WorkspaceWrap>
  </PolotnoContainer>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
