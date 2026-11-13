import { describe, expect, it } from 'vitest';
import { parsePrices, pixPhone, whatsappUrl } from '../../web/src/payment';

describe('pagamento do bônus', () => {
  it('lê as opções de valor, uma por linha', () => {
    expect(parsePrices('💛 R$12,90 — valor base\n🙏 R$19,90 — fortalece nossa comunidade\n👑 R$24,90 — contribuição especial')).toEqual([
      { icon: '💛', value: 'R$ 12,90', label: 'valor base' },
      { icon: '🙏', value: 'R$ 19,90', label: 'fortalece nossa comunidade' },
      { icon: '👑', value: 'R$ 24,90', label: 'contribuição especial' },
    ]);
    expect(parsePrices('')).toEqual([]);
  });
  it('chave Pix de celular: mostra formatada e copia com +55', () => {
    expect(pixPhone('37988033948')).toEqual({ display: '(37) 98803-3948', copy: '+5537988033948' });
    expect(pixPhone('+55 (37) 98803-3948')).toEqual({ display: '(37) 98803-3948', copy: '+5537988033948' });
    expect(pixPhone('chave@email.com')).toBeNull();
  });
  it('link do WhatsApp com DDI do Brasil e mensagem pronta', () => {
    expect(whatsappUrl('31990143836', 'Oi')).toBe('https://wa.me/5531990143836?text=Oi');
    expect(whatsappUrl('5531990143836', 'Oi')).toBe('https://wa.me/5531990143836?text=Oi');
    expect(whatsappUrl('', 'Oi')).toBe('');
  });
});
