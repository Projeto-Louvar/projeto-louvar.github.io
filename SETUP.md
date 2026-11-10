# Colocar o site no ar (configuração única)

Leva uns 15 minutos. Depois disso o site se atualiza sozinho todo dia às 3h (horário de Brasília).

## 1. Conta do GitHub só para o site

1. Abra https://github.com/signup e crie uma conta nova (use um e-mail diferente da sua conta principal).
2. Confirme o e-mail.
3. No terminal do VS Code, rode `gh auth login`. Se o comando `gh` não existir, peça ao assistente para instalar o GitHub CLI e depois rode o comando você mesmo. As telas desse comando aparecem em inglês; escolha: GitHub.com → HTTPS → Login with a web browser. Entre com a conta nova.

## 2. "Robô" do Google com acesso de leitura à pasta

1. Abra https://console.cloud.google.com/projectcreate, nome do projeto `louvores`, clique em **Criar**.
2. Abra https://console.cloud.google.com/apis/library/drive.googleapis.com e clique em **Ativar**.
3. Abra https://console.cloud.google.com/iam-admin/serviceaccounts → **Criar conta de serviço** → nome `louvores-sync` → **Concluir** (não escolha nenhuma função; clique em **Continuar** e depois em **Concluir**).
4. Clique na conta criada → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON**. Um arquivo será baixado.

> **Atenção: este arquivo é uma chave secreta.** Não cole o conteúdo dele em nenhuma conversa de chat. Não envie por e-mail nem por WhatsApp. Não coloque o arquivo dentro da pasta `louvores-site`; deixe ele na pasta **Downloads**.

5. Copie o e-mail da conta de serviço (termina em `iam.gserviceaccount.com`). Ele aparece na lista de contas de serviço, na coluna **E-mail**.
6. No Google Drive, clique com o botão direito na pasta **Louvores - SVA** → **Compartilhar** → cole o e-mail → permissão **Leitor** → desmarque a opção "Notificar pessoas" → **Compartilhar**.
7. Me diga apenas onde ficou o arquivo JSON baixado (o caminho do arquivo, não o conteúdo). Eu leio o arquivo, guardo a chave como segredo do GitHub e depois apago a cópia local.

## O que eu faço em seguida

- Crio o repositório público `louvores` na conta nova e envio o código.
- Guardo a chave como segredo `GDRIVE_SA_JSON` (ela nunca fica visível no repositório).
- Ativo o GitHub Pages e rodo a primeira sincronização. A primeira carga do acervo pode levar alguns ciclos (cada ciclo dura até 5 horas); o site já funciona com o que tiver sido enviado.
- Testo a reprodução num iPhone e num Android com você.
