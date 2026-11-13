// Duas versões do mesmo site, geradas juntas a cada publicação:
// - pública (endereço principal): bônus aparecem trancados;
// - completa (endereço secreto, entregue a quem adquiriu): tudo liberado.
export const FULL_EDITION = import.meta.env.VITE_EDITION === 'completa';

// Para onde leva o botão "Quero liberar" (WhatsApp ou página de pagamento). Vazio: sem botão.
export const UNLOCK_URL: string = import.meta.env.VITE_UNLOCK_URL ?? '';
