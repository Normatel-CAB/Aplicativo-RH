# Setup PocketBase - Envio de Atestado

## 1) Subir o PocketBase

1. Baixe o PocketBase: https://pocketbase.io/docs/
2. Extraia o `.zip` e copie o arquivo `pocketbase.exe` para a pasta do projeto.
3. Execute no PowerShell dentro da pasta do projeto:

```bash
.\pocketbase.exe serve
```

Alternativa (script pronto do projeto):

```bash
.\start-pocketbase.ps1
```

Por padrão ele sobe em `http://127.0.0.1:8090`.

## 2) Configurar frontend

Arquivo: [pocketbase-config.js](pocketbase-config.js)

```js
window.POCKETBASE_CONFIG = {
  baseUrl: "http://127.0.0.1:8090",
  collection: "envios_atestados",
  fileField: "arquivo_pdf",
  authCollection: "users",
  authProvider: "microsoft",
  rhAdminEmails: ["raphael.campos@normatel.com.br"]
};
```

## 3) Criar coleção

No painel Admin do PocketBase (`/_/`), crie a coleção `envios_atestados` com os campos:

- `nome` (text, required)
- `funcao` (text, required)
- `projeto` (text, required)
- `tipo_atestado` (text, required)
- `horas_comparecimento` (number, opcional)
- `data_inicio` (date, required)
- `data_fim` (date, required)
- `dias` (number, required)
- `arquivo_pdf` (file, required, max files >= 1, tipos: `.pdf`)

## 4) Regras de acesso (API Rules)

Na coleção, em API Rules:

- `Create rule`: deixe vazio para permitir criação pública (MVP)
- `List/View/Update/Delete`: opcionalmente bloqueie conforme necessidade

## 5) Como funciona no app

1. Usuário seleciona arquivo(s).
2. O app converte os arquivos suportados para PDF no navegador.
3. Envia o formulário + arquivos PDF para a coleção `envios_atestados`.
4. Redireciona para `sucesso.html`.

## 6) Formatos suportados para conversão

- PDF
- Imagem (png/jpg/jpeg)
- TXT

## 7) Login com Microsoft (PocketBase OAuth2)

1. No PocketBase Admin, acesse `Settings` → `Auth providers`.
2. Ative o provedor `Microsoft` e preencha Client ID/Client Secret.
3. No Azure App Registration, configure Redirect URI para:

```txt
http://localhost:5500/rh-oauth-callback.html
```

4. Garanta que a coleção de autenticação `users` esteja com OAuth2 habilitado.
5. No app, abra sempre via `http://localhost:5500` (não use `127.0.0.1:5500`).
6. No app, clique em `RH` e depois em `Entrar com Microsoft`.

## 8) Aprovação de usuário RH

Fluxo atual:

- Usuário novo faz login/cadastro Microsoft.
- Se não estiver aprovado, fica pendente e não acessa o painel RH.
- Administrador libera o usuário na tela `Aprovar usuários`.

Como liberar um usuário:

1. Entrar no RH com um e-mail listado em `rhAdminEmails` no `pocketbase-config.js`.
2. Abrir `Painel RH` → botão `Aprovar usuários`.
3. Clicar em `Aprovar usuário`.

Observação técnica:

- A aprovação RH usa o campo nativo `emailVisibility` da coleção `users`.
