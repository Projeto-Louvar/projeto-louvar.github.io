// Duas versões do mesmo site, geradas juntas a cada publicação:
// - pública (endereço principal): bônus aparecem trancados;
// - completa (endereço secreto, enviado a quem mandou o comprovante): tudo liberado.
export const FULL_EDITION = import.meta.env.VITE_EDITION === 'completa';

// Número de WhatsApp que recebe os comprovantes (só dígitos, com DDI e DDD, ex.: 5531999998888).
const WHATSAPP = String(import.meta.env.VITE_WHATSAPP ?? '').replace(/\D/g, '');
// Como pagar (ex.: "Pix: chave@exemplo.com · R$ 29,90"). Vazio: não mostra.
export const PAYMENT_INFO: string = String(import.meta.env.VITE_PAYMENT_INFO ?? '').trim();

const MESSAGE = 'Olá! Fiz o pagamento do bônus do Projeto Louvar. Segue o comprovante:';
export const WHATSAPP_URL = WHATSAPP ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MESSAGE)}` : '';
