// Decorative, code-native icons. Visible text carries all names and states.
const paths={
 book:'<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z"/><path d="M12 6v14M6 9h3M15 9h3M6 12h3M15 12h3"/>',
 image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 message:'<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h6"/>',
 pencil:'<path d="m15 4 5 5M4 15 15 4a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3L9 20l-6 1 1-6Z"/><path d="m4 15 5 5"/>',
 folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2l-1 10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2L2 9a2 2 0 0 1 2-2Z"/>',
 search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
 bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3ZM10 21h4M12 2v2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 refresh:'<path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M16 16h5v5"/>'
};
export const icon=name=>`<svg class="ws-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]||paths.book}</svg>`;
export const itemIcon={image:'image',human:'eye',decision:'pencil',judgment:'search',diagram:'image',reader:'eye',orid:'book'};
export const deskArt=()=>'<img class="workspace-desk-art" src="/assets/workspace/study-desk.webp" width="440" height="220" alt="" aria-hidden="true" decoding="async">';
