function esc(t: unknown): string {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const b    = (t: unknown) => `<b>${esc(t)}</b>`;
export const code = (t: unknown) => `<code>${esc(t)}</code>`;
export const link = (text: string, url: string) => `<a href="${url.replace(/"/g, '&quot;')}">${esc(text)}</a>`;
