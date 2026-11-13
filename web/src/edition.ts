// Duas versões do mesmo site, geradas juntas a cada publicação:
// - pública (endereço principal): bônus aparecem trancados;
// - completa (endereço secreto, enviado a quem mandou o comprovante): tudo liberado.
import { parsePrices, pixPhone, whatsappUrl } from './payment';

export const FULL_EDITION = import.meta.env.VITE_EDITION === 'completa';

const env = (k: string) => String((import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();

// Variáveis do repositório: WHATSAPP, PIX_KEY, PIX_NAME, PRICES (uma opção por linha)
export const WHATSAPP_URL = whatsappUrl(env('VITE_WHATSAPP'), 'Olá! Fiz o pagamento do bônus do Projeto Louvar. Segue o comprovante:');
export const PIX = (() => {
  const key = env('VITE_PIX_KEY');
  if (!key) return null;
  const phone = pixPhone(key);
  return { display: phone?.display ?? key, copy: phone?.copy ?? key, kind: phone ? 'celular' : '', name: env('VITE_PIX_NAME') };
})();
export const PRICES = parsePrices(env('VITE_PRICES'));
