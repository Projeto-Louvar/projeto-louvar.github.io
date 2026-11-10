# Site de Louvores — Design

Data: 2026-11-10
Status: aprovado pelo usuário (conversa de 2026-11-10)

## Problema

O acervo de louvores está numa pasta do Google Drive ("Louvores - SVA", Drive compartilhado,
ID `1ak8DwNK4UeRQmKLpKhEao-XdyEj0Z8EC`). O público é majoritariamente idoso e tem dificuldade
com o Drive: navegar por pastas, visualizador confuso, avisos de login e download.

## Objetivo

Um site estilo "Spotify simplificado" para ouvir e baixar as músicas, pensado primeiro para
celular, funcionando bem no computador.

Critérios de sucesso:
- Uma pessoa idosa abre o link do WhatsApp e ouve uma música com no máximo 2 toques.
- Baixar uma música: 1 toque. Baixar uma coleção inteira no computador: 1 clique (.zip).
- O dono só mexe no Drive; o site se atualiza sozinho uma vez por dia.

## Decisões

| Tema | Decisão |
|---|---|
| Acesso | Qualquer pessoa com o link. Sem login. `noindex` + `robots.txt` bloqueando buscadores. |
| Hospedagem do site | GitHub Pages |
| Hospedagem do áudio | GitHub Releases (um release por coleção) |
| Atualização | GitHub Actions, diário (06:00 UTC) + disparo manual |
| Conta GitHub | Conta dedicada ao projeto, separada da conta principal do dono (isola risco de denúncia de direitos autorais) |
| Conteúdo | Somente áudio: `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`. Vídeos, imagens e demais formatos são ignorados e listados no log. |
| Capas | Cor sólida por coleção (paleta fixa, sem degradê) + nome em letra grande |
| Stack do site | Vite + TypeScript sem framework, roteamento por hash (`#/c/<id>`) |
| Fonte | Atkinson Hyperlegible (feita para baixa visão) |

## Estrutura de conteúdo

- Cada pasta do Drive vira uma **coleção**. Subpastas viram coleções-filhas.
- Colapso: uma pasta sem áudio direto e com exatamente uma subpasta é substituída pela
  subpasta (evita níveis vazios). Aplicado antes de tudo.
- Tela inicial: cada filha da raiz vira uma **seção** (título grande, ex. "Biblioteca
  Completa", "Bônus"); dentro da seção, cada filha dela vira uma **capa**. Uma capa sem
  áudio direto abre uma página de coleção que lista só as subcoleções.
- Filhas da raiz que têm áudio direto aparecem também como capa numa seção "Outras".
- Coleções sem nenhum áudio (direto ou em subpastas) não aparecem.
- Título da faixa derivado do nome do arquivo: remove extensão, remove numeração inicial
  (`"18 - "`, `"01. "`), troca `_` por espaço. Se sobrar `"Artista - Título"`, separa artista
  e título; senão o artista fica vazio.

## Arquitetura

```
Google Drive ──(sync, GitHub Actions)──▶ GitHub Releases (áudio + .zip)
                         │
                         └──▶ public/catalog.json (commit) ──▶ build Vite ──▶ GitHub Pages
```

### Unidade 1 — `sync/` (Node + TypeScript)

Responsabilidade: espelhar o Drive em Releases e gerar `catalog.json`.

- Autentica no Drive com conta de serviço (secret `GDRIVE_SA_JSON`), `supportsAllDrives`.
- Percorre a árvore a partir da pasta raiz e monta a lista de pastas e arquivos de áudio
  (id, nome, pasta, `md5Checksum`, tamanho).
- Compara com o `catalog.json` atual (que serve de estado):
  - arquivo novo ou com md5 diferente → baixa para disco temporário, envia ao release da
    coleção, apaga do disco;
  - mesmo md5 já enviado em outro lugar → reaproveita a URL (sem reenvio);
  - arquivo removido do Drive → sai do catálogo e o asset é apagado.
- Release por coleção: tag `c-<driveFolderId>`. Nome do asset: nome do arquivo em ASCII
  seguro; colisão recebe sufixo `-2`, `-3`.
- Gera um `.zip` (modo store, sem compressão) por coleção com as faixas diretas dela. Acima
  de 1,9 GB divide em partes (`parte-1.zip`, `parte-2.zip`). Só regera se a coleção mudou.
- Orçamento de tempo: para após 5h de execução, grava o progresso no catálogo e o próximo
  ciclo continua (a primeira carga do acervo provavelmente leva vários ciclos).
- Ao final, faz commit de `public/catalog.json` se mudou; o commit dispara o deploy.

Lógica pura (parse de títulos, colapso de pastas, diff Drive × catálogo, divisão de zips)
fica separada da camada de I/O (Drive API, GitHub API) para ser testada sem rede.

### Formato de `catalog.json`

```json
{
  "generatedAt": "2026-11-10T06:00:00Z",
  "collections": [
    { "id": "<driveFolderId>", "name": "Louvor das Antigas", "parentId": null,
      "color": "#1F4E79", "trackIds": ["..."], "childIds": ["..."],
      "zipUrls": ["https://github.com/.../louvor-das-antigas.zip"] }
  ],
  "tracks": [
    { "id": "<driveFileId>", "title": "Com Muito Louvor", "artist": "Cassiane",
      "collectionId": "...", "url": "https://github.com/.../releases/download/...",
      "size": 5023653, "md5": "..." }
  ]
}
```

### Unidade 2 — `web/` (site)

Telas:
1. **Início** — grade de capas grandes (2 por linha no celular, 4–6 no computador) + campo
   de busca no topo.
2. **Coleção** — nome grande, botões "Tocar tudo" e "Baixar todas", subcoleções (se houver)
   e lista de faixas em linhas altas (mín. 64px) com botão "Baixar" por faixa.
3. **Busca** — resultados por título/artista, ignorando acentos e maiúsculas.

Player fixo no rodapé, sempre visível depois da primeira música: título grande, botões
anterior / tocar-pausar (≥ 72px) / próxima, barra de progresso tocável. Ao terminar uma
faixa, toca a próxima da coleção. Integração com Media Session API (controle pela tela de
bloqueio). Última faixa e posição lembradas no aparelho (`localStorage`, com try/catch).

Download de coleção ("Baixar todas"):
- Computador → baixa o(s) `.zip`.
- Android → aviso "Vai aparecer uma pergunta. Toque em **Permitir**." e baixa as faixas em
  sequência, uma a cada ~1,5 s, mostrando "Baixando 3 de 40".
- iPhone/iPad → botão substituído por "No iPhone, baixe uma música por vez".

Acessibilidade e legibilidade: fonte base 20px, contraste AA ou melhor, alvos de toque
≥ 56px, sem gestos de arrastar obrigatórios, sem ícone sem rótulo, foco visível.

PWA: `manifest.webmanifest` + service worker que guarda só a casca do site (não o áudio),
permitindo "Adicionar à tela inicial".

## Erros

- Falha ao tocar uma faixa → mensagem curta "Não foi possível tocar esta música" e pula para
  a próxima após 3 s.
- `catalog.json` indisponível → tela "Sem conexão. Tente de novo." com botão grande.
- Sync: falha em um arquivo não derruba o ciclo; é registrada no log e tentada no ciclo
  seguinte. Falha de autenticação derruba o ciclo (o Actions notifica por e-mail).

## Risco a validar primeiro

URLs de Releases redirecionam para `objects.githubusercontent.com` com
`Content-Type: application/octet-stream`. É preciso confirmar, antes de construir o resto,
que `<audio>` toca e permite avançar (requisições Range) nesses arquivos no Chrome Android,
Safari iOS e Chrome desktop. Plano B se falhar no Safari: servir o áudio pelo próprio GitHub
Pages a partir de repositórios de mídia separados (limite ~1 GB por site), divididos por
coleção.

## Testes

- Unitários (Vitest): parse de títulos, colapso de pastas, diff de sincronização, divisão de
  zips, busca sem acento, decisão de modo de download por plataforma.
- Ponta a ponta (Playwright, emulação de celular): abrir início → coleção → tocar → player
  aparece → próxima faixa; botão de download presente; layout sem rolagem horizontal em 360px.
- Desenvolvimento sem credenciais: catálogo de amostra com áudios curtos gerados localmente.

## Fora do escopo (v1)

Vídeos, letras/cifras, contas de usuário, favoritos, playlists próprias, estatísticas.

## Configuração única do dono (ao final)

1. Criar conta GitHub dedicada.
2. Criar conta de serviço no Google Cloud, baixar a chave JSON e compartilhar a pasta
   "Louvores - SVA" com o e-mail dela (leitor).
3. Colar a chave como secret `GDRIVE_SA_JSON` no repositório.
