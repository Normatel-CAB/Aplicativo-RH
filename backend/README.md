# Backend RH - Node.js + Firebase

## Como rodar

1. Crie um projeto no Firebase e gere uma chave de serviço (service account JSON).
2. Salve o JSON da service account em um arquivo local ou defina a variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON com o conteúdo do JSON.
3. Defina a variável de ambiente FIREBASE_STORAGE_BUCKET com o nome do bucket do seu projeto (ex: normatel-rh.appspot.com).
4. Instale as dependências:

```sh
npm install
```

5. Rode o servidor:

```sh
npm run dev
```

## Rotas principais

- `POST /api/envios` — Envia atestado (form-data: arquivos[], nome, funcao, projeto, tipo_atestado, horas_comparecimento, data_inicio, data_fim, dias)
- `GET /api/envios` — Lista todos os atestados
- `GET /api/usuarios/pendentes` — Lista usuários pendentes de aprovação
- `POST /api/usuarios/aprovar/:id` — Aprova usuário (define emailVisibility=true)

## Observações
- O upload de arquivos é feito para o Firebase Storage e os links ficam públicos.
- O Firestore armazena os metadados dos envios e usuários.
- O frontend pode consumir essas rotas normalmente, sem problemas de CORS.
