// Dados de pagamento do bônus. Ficam nas variáveis do repositório (GitHub → Settings → Variables),
// para trocar valor ou chave sem mexer no código.
export interface PriceOption { icon: string; value: string; label: string }

/** "💛 R$12,90 — valor base" (uma opção por linha) → { icon, value, label }. */
export function parsePrices(text: string): PriceOption[] {
  return text.split(/\r?\n|\|/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\S*?)\s*(R\$\s*[\d.,]+)\s*[—–-]?\s*(.*)$/u);
    return m ? { icon: m[1], value: m[2].replace(/R\$\s*/, 'R$ '), label: m[3] } : { icon: '', value: line, label: '' };
  });
}

/** Chave Pix de celular: mostra "(37) 98803-3948" e copia "+5537988033948" (formato que todo banco reconhece). */
export function pixPhone(raw: string): { display: string; copy: string } | null {
  const d = raw.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (!/^\d{10,11}$/.test(d)) return null;
  const display = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  return { display, copy: `+55${d}` };
}

export function whatsappUrl(number: string, message: string): string {
  const d = number.replace(/\D/g, '');
  if (!d) return '';
  const full = d.length <= 11 ? `55${d}` : d; // sem DDI: assume Brasil
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
