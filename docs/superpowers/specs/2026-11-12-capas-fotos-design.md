# Capas com fotos — Design

Data: 2026-11-12
Status: aprovado pelo usuário ("foto colorida e uma cor só"). Prévia aprovada:
https://claude.ai/artifact/5dqNRREpuJaRkQncLSoyve

## Decisão

- Cada capa de coleção mostra uma **foto colorida** (cores originais) em cima e uma **faixa
  com o nome e a contagem** embaixo.
- O cartão inteiro (faixa + moldura de 4px) usa **uma cor só** para todas as coleções:
  azul-marinho `#1F3A55` (branco sobre ele: 11,7:1). As cores por coleção deixam de aparecer.
- Fotos de uso livre do Wikimedia Commons, sem imagens católicas e sem rosto de cantor.
  51 coleções têm foto própria; as demais (álbuns dentro de cantores) herdam a foto do
  ancestral mais próximo. Sem foto em nenhum ancestral → cartão liso na cor do cartão.
- Página da coleção: a foto aparece pequena (quadrada) ao lado do título.
- Nova página `#/creditos` com autor e licença de cada foto; link "Créditos das fotos" no fim
  da tela inicial.

## Arquivos

- `scripts/covers-source.json`: id da coleção → nome, URL da miniatura no Commons, autor,
  licença, página. Fonte da verdade para trocar uma foto.
- `scripts/make-covers.ts`: baixa as miniaturas e gera `web/public/covers/<id>.webp`
  (600×600, recorte central, WebP) e `web/src/coverData.json` (id → arquivo + crédito).
- `web/src/covers.ts`: `coverFor(idx, id)` com herança pelo `parentId`.
- `components.ts` / `views.ts` / `router.ts` / `styles.css`: novo cartão, cabeçalho da coleção,
  rota e página de créditos.

O sync não muda: as fotos são do site, não do Drive. Ids de pasta do Drive são estáveis, então
renomear uma pasta não perde a foto; uma pasta nova sem foto herda a do pai.

## Testes

- Vitest: herança de capa (própria, do pai, do avô, nenhuma); rota `#/creditos`.
- Playwright: capa da tela inicial tem `<img>` carregada; página de créditos abre; continua
  sem rolagem horizontal em 360px.
