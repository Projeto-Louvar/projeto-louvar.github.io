const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

export const ICONS = {
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 5h4v14H6zm8 0h4v14h-4z'),
  prev: svg('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
  next: svg('M16 6h2v12h-2zM6 18l8.5-6L6 6z'),
  shuffle: svg('M10.6 9.2 5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4-1.4 1.4 3.1 3.1-2 2H20v-5.5l-2 2z'),
};
