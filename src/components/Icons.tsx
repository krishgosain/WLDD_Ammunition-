/** Inline 16px icons on a 24-grid. Stroke inherits currentColor. */
const S = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconSearch = () => (
  <svg {...S}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconClose = () => (
  <svg {...S}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconPlus = () => (
  <svg {...S}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = () => (
  <svg {...S}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconExternal = () => (
  <svg {...S}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></svg>
);
export const IconCopy = () => (
  <svg {...S}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
export const IconWarn = () => (
  <svg {...S}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
);
export const IconSun = () => (
  <svg {...S}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" /></svg>
);
export const IconMoon = () => (
  <svg {...S}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
);
export const IconFilter = () => (
  <svg {...S}><path d="M3 5h18M7 12h10M10 19h4" /></svg>
);
export const IconLink = () => (
  <svg {...S}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
);
export const IconDownload = () => (
  <svg {...S}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></svg>
);
export const IconPresent = () => (
  <svg {...S}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M12 17v4M8 21h8" /></svg>
);
export const IconLayers = () => (
  <svg {...S}><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 17 9 5 9-5M3 12l9 5 9-5" /></svg>
);
export const IconWaves = () => (
  <svg {...S}><path d="M2 6c2.5-2 5.5-2 8 0s5.5 2 8 0M2 12c2.5-2 5.5-2 8 0s5.5 2 8 0M2 18c2.5-2 5.5-2 8 0s5.5 2 8 0" /></svg>
);
export const IconRows = () => (
  <svg {...S}><path d="M3 5h18M3 12h18M3 19h18" /></svg>
);
export const IconGrid = () => (
  <svg {...S}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>
);
