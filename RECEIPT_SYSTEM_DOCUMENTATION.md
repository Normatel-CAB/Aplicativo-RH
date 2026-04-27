# Sistema de Comprovante de Submissão - Documentação Completa

## 📋 Visão Geral

Sistema robusto que gera e envia comprovantes (receipts) automaticamente quando usuários enviam atestados médicos. Inclui:

- ✅ Upload seguro de arquivos
- ✅ Armazenamento no Firebase Storage
- ✅ Gravação de metadados no Firestore
- ✅ Geração de PDF de comprovante
- ✅ Envio de email automático com anexo
- ✅ Tracking ID único para rastreamento
- ✅ UI de confirmação interativa

---

## 🏗️ Arquitetura

### Frontend → Backend → Firebase

```
Frontend (Browser)
    ↓ (JSON com base64)
Backend Node.js
    ├─ Decoda base64
    ├─ Upload para Firebase Storage
    ├─ Salva metadados no Firestore
    ├─ Gera PDF do comprovante
    ├─ Upload PDF para Storage
    └─ Envia email com anexo
    ↓ (Resposta com tracking_id)
Frontend (Página de sucesso)
    └─ Exibe tracking ID e link para PDF
```

---

## 📦 Dependências Instaladas

```bash
npm --prefix backend install
```

### package.json (backend)
```json
{
  "dependencies": {
    "uuid": "^9.0.0",           // Gerar IDs únicos
    "pdfkit": "^0.13.0",        // Gerar PDFs
    "nodemailer": "^6.9.0",     // Enviar emails
    "firebase-admin": "^13.7.0",
    "firebase-functions": "^7.2.0"
  }
}
```

---

## 🔐 Variáveis de Ambiente Necessárias

### Firebase Configuration

```bash
# Service Account (recomendado)
FIREBASE_SERVICE_ACCOUNT_JSON=./caminho/para/service-account-key.json

# OU variáveis individuais
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_CLIENT_EMAIL=seu-email@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Storage Bucket
FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
```

### Email Configuration

```bash
# Gmail (recomendado para desenvolvimento)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-senha-de-app  # NÃO usar senha regular, usar App Password
EMAIL_FROM=seu-email@gmail.com

# Ou outro provedor SMTP
# EMAIL_HOST=smtp.seudominio.com
# EMAIL_PORT=587
# EMAIL_USER=seu-usuario
# EMAIL_PASS=sua-senha
```

### Security Configuration

```bash
FORCE_HTTPS=true
ALLOWED_ORIGINS=http://localhost:3000,https://seu-dominio.com
ALLOWED_ORIGIN_SUFFIXES=.vercel.app
```

---

## 🚀 Como Configurar Gmail para Desenvolvimento

1. **Ativar autenticação de 2 fatores:**
   - Acesse: https://myaccount.google.com/security
   - Ative "Verificação em 2 etapas"

2. **Gerar senha de app:**
   - Acesse: https://myaccount.google.com/apppasswords
   - Selecione "Mail" e "Windows Computer" (ou seu dispositivo)
   - Copie a senha gerada (16 caracteres)
   - Cole em `EMAIL_PASS` no `.env`

3. **Atualizar .env do backend:**
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=seu-email@gmail.com
   EMAIL_PASS=sua-senha-de-app-16-caracteres
   EMAIL_FROM=seu-email@gmail.com
   ```

---

## 📊 Estrutura Firestore

### Coleção: `envios_atestados`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tracking_id": "ABC1D2E3",
  "nome": "João da Silva",
  "email": "joao.silva@empresa.com",
  "funcao": "Analista de Sistemas",
  "projeto": "Projeto 736 - Base Imbetiba",
  "tipo_atestado": "Atestado médico",
  "data_inicio": "2024-01-15T00:00:00.000Z",
  "data_fim": "2024-01-20T00:00:00.000Z",
  "dias": 6,
  "horas_comparecimento": "8",
  "criado_em": "2024-01-15T10:30:45.123Z",
  "criado_por_ip": "192.168.1.100",
  "arquivos": [
    {
      "nome": "atestado-joao-silva.pdf",
      "tipo": "application/pdf",
      "url": "https://storage.googleapis.com/bucket/envios/uuid/arquivo.pdf"
    }
  ],
  "comprovante_url": "https://storage.googleapis.com/bucket/comprovantes/uuid_comprovante.pdf",
  "status": "enviado",
  "atendimento_status": null,
  "atendimento_atualizado_em": null,
  "excluido": false,
  "origem_persistencia": "backend-node"
}
```

---

## 🔄 Fluxo de Submissão Detalhado

### 1. Frontend: Preparação

```javascript
// Arquivo: frontend/scripts/script.js

// Converter arquivo para PDF
const resultadosConversao = await Promise.all(
  listaArquivos.map(arquivo => converterArquivoParaPdf(arquivo))
);

// Preparar dados com base64
const dadosEnvio = {
  nome: documento.getElementById('nome').value,
  email: document.getElementById('email').value,
  funcao: document.getElementById('funcao').value,
  projeto: projetoSelect.value,
  tipo_atestado: tipoAtestado.value,
  data_inicio: dataInicioISO,
  data_fim: dataFimISO,
  dias: diasEnvio,
  arquivos: await Promise.all(convertidos.map(async convertido => ({
    nome: nomeArquivo,
    tipo: 'application/pdf',
    conteudoBase64: await blobToBase64(convertido.blob)
  })))
};

// Enviar para backend
const response = await fetch('http://localhost:3001/api/envios', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(dadosEnvio)
});

const result = await response.json();
// result.tracking_id, result.comprovante_url
```

### 2. Backend: Processamento

```javascript
// Arquivo: backend/index.js - POST /api/envios

// Validar dados
const erros = validarAtestado(body);

// Criar objeto com dados únicos
const novoEnvio = {
  id: uuidv4(),
  tracking_id: uuidv4().substring(0, 8).toUpperCase(),
  nome: body.nome.trim(),
  email: body.email.trim(),
  // ... outros campos
};

// Decodificar base64 e upload para Storage
const arquivosSalvos = await salvarArquivosDoEnvioNoStorage(novoEnvio.id, body.arquivos);

// Salvar metadados no Firestore
await salvarEnvioNoFirestore(novoEnvio);

// Gerar PDF do comprovante
const pdfBuffer = await gerarComprovantePDF(novoEnvio);
const bucket = await obterStorageObrigatorio();
await bucket.file(`comprovantes/${novoEnvio.id}_comprovante.pdf`).save(pdfBuffer);
await file.makePublic();
const comprovanteUrl = `https://storage.googleapis.com/${firebaseStorageBucket}/comprovantes/${novoEnvio.id}_comprovante.pdf`;

// Enviar email
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  await enviarEmailComprovante(novoEnvio, comprovanteUrl);
}

// Retornar resultado
res.writeHead(201);
res.end(JSON.stringify({
  id: novoEnvio.id,
  tracking_id: novoEnvio.tracking_id,
  comprovante_url: comprovanteUrl,
  success: true
}));
```

### 3. Frontend: Confirmação

```javascript
// Página sucesso.html
sessionStorage.setItem('envio_success_data', JSON.stringify({
  tracking_id: result.tracking_id,
  comprovante_url: result.comprovante_url,
  nome: dadosEnvio.nome,
  email: dadosEnvio.email,
  criado_em: new Date().toISOString()
}));

// Exibir na página de sucesso
document.getElementById('trackingId').textContent = parsed.tracking_id;
document.getElementById('submissionTime').textContent = new Date(parsed.criado_em).toLocaleString('pt-BR');
document.getElementById('receiptUrl').href = parsed.comprovante_url;
```

---

## 📧 Exemplo de Email Enviado

**Para:** joao.silva@empresa.com  
**Assunto:** Comprovante de Submissão - Atestado RH

```html
<h2>Comprovante de Submissão</h2>
<p>Olá João da Silva,</p>
<p>Seu atestado foi enviado com sucesso para o sistema RH da Normatel Engenharia.</p>

<h3>Detalhes:</h3>
<ul>
  <li>ID de Rastreamento: ABC1D2E3</li>
  <li>Tipo: Atestado médico</li>
  <li>Projeto: Projeto 736 - Base Imbetiba</li>
  <li>Data de Submissão: 15/01/2024 10:30:45</li>
  <li>Dias: 6</li>
</ul>

<p>
  <a href="https://storage.googleapis.com/.../comprovante-ABC1D2E3.pdf">
    Baixar Comprovante PDF
  </a>
</p>

<p>Em caso de dúvidas, entre em contato com o RH.</p>
<p>Atenciosamente,<br>Sistema RH Normatel</p>

---

**Anexo:** comprovante-ABC1D2E3.pdf (PDF de comprovante)
```

---

## 🧪 Testando Localmente

### 1. Preparar Firebase

```bash
# 1. Criar projeto no Firebase Console
# 2. Baixar credenciais em Project Settings > Service Accounts
# 3. Copiar arquivo para backend/
# 4. Copiar nome do bucket (ex: meu-projeto.appspot.com)
```

### 2. Configurar .env

```bash
cd backend
cp .env.example .env
# Editar .env com suas credenciais
```

### 3. Iniciar servidor

```bash
npm run dev
# ✓ Servidor RH backend rodando em http://localhost:3001
# ✓ Firestore inicializado
# ✓ Firebase Storage inicializado
```

### 4. Testar submissão

```bash
# Frontend
http://localhost:3000/frontend/pages/formulario.html

# Preencher:
# - Nome: João Silva
# - Email: seu-email@gmail.com
# - Função: Analista
# - Projeto: Projeto 736
# - Tipo: Atestado médico
# - Arquivo: PDF ou imagem
# - Clique em Enviar
```

### 5. Verificar resultado

- ✅ Email recebido em `seu-email@gmail.com`
- ✅ Firestore: coleção `envios_atestados` com novo documento
- ✅ Firebase Storage: pasta `envios/` e `comprovantes/` com arquivos
- ✅ Página de sucesso mostrando tracking ID

---

## 🔍 Verificar Firestore e Storage

### Firebase Console

1. **Firestore Database:**
   - Coleção: `envios_atestados`
   - Documentos: seus registros de submissão

2. **Storage:**
   ```
   envios/
     └─ {uuid}/
        ├─ 1-arquivo.pdf
        └─ 2-arquivo.pdf
   comprovantes/
     └─ {uuid}_comprovante.pdf
   ```

---

## 🚨 Troubleshooting

### Erro: "Cannot find package 'firebase-admin'"

```bash
npm --prefix backend install
```

### Erro: "Firebase Storage não configurado"

```bash
# Verificar:
# 1. FIREBASE_STORAGE_BUCKET está definido no .env
# 2. Service account tem permissões de Storage
```

### Erro: "Email não enviado"

```bash
# Verificar:
# 1. EMAIL_USER e EMAIL_PASS estão corretos
# 2. Se usar Gmail: criar App Password (não senha regular)
# 3. EMAIL_HOST=smtp.gmail.com e EMAIL_PORT=587
```

### Erro: "CORS blocked"

```bash
# Verificar:
# 1. ALLOWED_ORIGINS inclui http://localhost:3000
# 2. Requester está na whitelist
```

---

## ✨ Recursos

- **Automático:** Sem intervenção manual necessária
- **Seguro:** Uploads criptografados, CORS validado, HTTPS obrigatório
- **Confiável:** Retry logic, error handling, logging
- **Rastreável:** UUID único para cada submissão
- **Documentado:** PDF de comprovante com todos os detalhes

---

## 📝 Próximos Passos

1. Configurar domínio próprio
2. Setup de produção (Fly.io, Vercel)
3. Configurar monitoramento de erros
4. Adicionar dashboard de visualização
5. Integração com sistema RH completo
