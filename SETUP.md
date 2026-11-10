# Colocar o site no ar (configuração única)

Leva uns 15 minutos. Depois disso o site se atualiza sozinho todo dia às 3h (horário de Brasília).

## 1. Conta do GitHub só para o site

1. Abra https://github.com/signup e crie uma conta nova (use um e-mail diferente da sua conta principal).
2. Confirme o e-mail.
3. No terminal do VS Code, rode `gh auth login` e escolha: GitHub.com → HTTPS → Login with a web browser. Entre com a conta nova.

## 2. "Robô" do Google com acesso de leitura à pasta

1. Abra https://console.cloud.google.com/projectcreate, nome do projeto `louvores`, clique em **Criar**.
2. Abra https://console.cloud.google.com/apis/library/drive.googleapis.com e clique em **Ativar**.
3. Abra https://console.cloud.google.com/iam-admin/serviceaccounts → **Criar conta de serviço** → nome `louvores-sync` → **Concluir** (pule as permissões).
4. Clique na conta criada → aba **Chaves** → **Adicionar chave** → **Criar nova chave** → **JSON**. Um arquivo será baixado.
5. Copie o e-mail da conta de serviço (termina em `iam.gserviceaccount.com`).
6. No Google Drive, clique com o botão direito na pasta **Louvores - SVA** → **Compartilhar** → cole o e-mail → permissão **Leitor** → desmarque "Notificar" → **Compartilhar**.
7. Me diga onde ficou o arquivo JSON baixado. Eu cuido do resto e apago a cópia local depois.

## O que eu faço em seguida

- Crio o repositório público `louvores` na conta nova e envio o código.
- Guardo a chave como segredo `GDRIVE_SA_JSON` (ela nunca fica visível no repositório).
- Ativo o GitHub Pages e rodo a primeira sincronização. A primeira carga do acervo pode levar alguns ciclos (cada ciclo dura até 5 horas); o site já funciona com o que tiver sido enviado.
- Testo a reprodução num iPhone e num Android com você.
