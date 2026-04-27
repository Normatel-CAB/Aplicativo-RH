# 📚 Referência Rápida - API e Funções

## 🔌 Endpoints da API

### GET `/api/health`
Verificar se o servidor está respondendo
```bash
curl http://localhost:3001/api/health
# Resposta: {"status":"ok","timestamp":"..."}
```

### GET `/api/envios?limit=100`
Listar todas as submissões
```bash
curl http://localhost:3001/api/envios?limit=10
# Resposta: [{id, tracking_id, nome, email, status, ...}, ...]
```

### POST `/api/envios` ⭐ Principal
Submeter novo atestado
```bash
curl -X POST http://localhost:3001/api/envios \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João",
    "email": "joao@empresa.com",
    "funcao": "Analista",
    "projeto": "Projeto 736",
    "tipo_atestado": "Atestado médico",
    "data_inicio": "2024-01-15T00:00:00.000Z",
    "data_fim": "2024-01-20T00:00:00.000Z",
    "dias": 6,
    "arquivos": [...]
  }'

# Resposta:
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tracking_id": "ABC1D2E3",
  "success": true,
  "comprovante_url": "https://storage.googleapis.com/...",
  "firestore": true
}
```

### POST `/api/envios/status/:id`
Marcar como processado
```bash
curl -X POST http://localhost:3001/api/envios/status/550e8400-e29b... \
  -H "Content-Type: application/json" \
  -d '{"atendimento_status": "feito"}'
```

### POST `/api/envios/excluir/:id`
Marcar como deletado (soft delete)
```bash
curl -X POST http://localhost:3001/api/envios/excluir/550e8400-e29b...
```

---

## 🛠️ Funções Criadas no Backend

### `gerarComprovantePDF(envio)`
Gera PDF de comprovante com todos os dados
```javascript
// backend/index.js, linha ~270
async function gerarComprovantePDF(envio) {
  // Cria PDF com:
  // - Título: "Comprovante de Submissão"
  // - Dados: nome, email, funcao, projeto, tipo, datas
  // - Tracking ID
  // - Data/hora de submissão
  // - Lista de arquivos
  return pdfBuffer // Buffer com PDF
}
```

**Entrada:**
```javascript
{
  id: "uuid",
  tracking_id: "ABC1D2E3",
  nome: "João",
  email: "joao@empresa.com",
  funcao: "Analista",
  projeto: "Projeto 736",
  tipo_atestado: "Atestado médico",
  data_inicio: "2024-01-15T00:00:00.000Z",
  data_fim: "2024-01-20T00:00:00.000Z",
  dias: 6,
  criado_em: "2024-01-15T10:30:00.000Z",
  arquivos: [{nome, tipo, url}, ...]
}
```

**Saída:** Buffer com PDF (pronto para upload/envio)

### `enviarEmailComprovante(envio, comprovanteUrl)`
Envia email com confirmação e PDF anexado
```javascript
// backend/index.js, linha ~300
async function enviarEmailComprovante(envio, comprovanteUrl) {
  // Configuração automática via nodemailer
  // Envia para: envio.email
  // Com: PDF anexado em comprovanteUrl
}
```

**Requer variáveis:**
```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-app-password
EMAIL_FROM=seu-email@gmail.com
```

### `validarAtestado(dados)`
Valida todos os dados da submissão
```javascript
// backend/index.js, linha ~546
function validarAtestado(dados) {
  // Valida:
  // - Nome (obrigatório, max 150)
  // - Email (obrigatório, valid, max 200) ⭐ NOVO
  // - Função (obrigatório, max 100)
  // - Projeto (obrigatório, max 100)
  // - Tipo de atestado (obrigatório)
  // - Datas (válidas, fim >= início)
  // - Dias (1-365)
  return [] // Array vazio se OK, ou lista de erros
}
```

### `salvarEnvioNoFirestore(envio)`
Salva documentoto no Firestore
```javascript
// backend/index.js, linha ~195
async function salvarEnvioNoFirestore(envio) {
  const db = await obterFirestoreObrigatorio();
  await db
    .collection(FIRESTORE_COLLECTIONS.envios)
    .doc(String(envio.id))
    .set(envio, { merge: true });
}
```

### `salvarArquivosDoEnvioNoStorage(envioId, arquivos)`
Decodifica base64 e faz upload para Storage
```javascript
// backend/index.js, linha ~558
async function salvarArquivosDoEnvioNoStorage(envioId, arquivos) {
  // Para cada arquivo:
  // 1. Decoda base64
  // 2. Cria buffer
  // 3. Upload para: envios/{envioId}/arquivo.pdf
  // 4. Retorna URL pública
  return [] // Array de {nome, tipo, url}
}
```

---

## 🎨 Funções Criadas no Frontend

### `blobToBase64(blob)`
Converte blob em string base64 (para enviar ao backend)
```javascript
// frontend/scripts/script.js
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

**Uso:**
```javascript
const blob = arquivo.blob; // De converterArquivoParaPdf()
const base64 = await blobToBase64(blob);
// base64 = "data:application/pdf;base64,JVBERi0x..."
```

---

## 📊 Dados Criados no Firestore

### Coleção: `envios_atestados`

Cada documento tem:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tracking_id": "ABC1D2E3",
  "nome": "João da Silva",
  "email": "joao@empresa.com",
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
      "nome": "atestado.pdf",
      "tipo": "application/pdf",
      "url": "https://storage.googleapis.com/bucket/envios/uuid/arquivo.pdf"
    }
  ],
  "comprovante_url": "https://storage.googleapis.com/bucket/comprovantes/uuid_comprovante.pdf",
  "status": "enviado",
  "atendimento_status": null,
  "excluido": false
}
```

---

## 📁 Storage Paths

### Estrutura no Firebase Storage

```
seu-bucket.appspot.com/
├── envios/
│   ├── {uuid1}/
│   │   ├── 1-atestado.pdf          ← Arquivo original
│   │   └── 2-complemento.pdf       ← Se houver múltiplos
│   ├── {uuid2}/
│   │   └── 1-atestado.pdf
│   └── ...
└── comprovantes/
    ├── {uuid1}_comprovante.pdf     ← PDF de comprovante
    ├── {uuid2}_comprovante.pdf
    └── ...
```

---

## 🔄 Fluxo de Dados

### Envio de Atestado (POST /api/envios)

```
Frontend
  ├─ Coleta dados do formulário
  ├─ Converte arquivo para PDF
  ├─ Converte PDF para base64
  ├─ Envia JSON com base64
  └─ Recebe: {id, tracking_id, comprovante_url}
       ↓
Backend
  ├─ Valida dados com validarAtestado()
  ├─ Gera UUID e tracking_id
  ├─ Decodifica base64
  ├─ Upload para Storage com salvarArquivosDoEnvioNoStorage()
  ├─ Salva no Firestore com salvarEnvioNoFirestore()
  ├─ Gera PDF com gerarComprovantePDF()
  ├─ Upload PDF para Storage
  ├─ Envia email com enviarEmailComprovante()
  └─ Retorna: {id, tracking_id, comprovante_url, success}
       ↓
Email Provider (Gmail/SMTP)
  ├─ Cria conexão
  ├─ Valida credenciais
  ├─ Monta corpo do email
  ├─ Anexa PDF
  └─ Envia para: envio.email
       ↓
Frontend (Sucesso)
  ├─ Exibe tracking_id
  ├─ Exibe data/hora
  ├─ Exibe email
  └─ Exibe link PDF
```

---

## 🧪 Scripts de Teste

### test-api.js
Teste completo da API
```bash
node test-api.js
# Envia submissão de teste
# Mostra tracking_id e comprovante_url
```

### test-receipt-api.sh
Teste via bash/curl
```bash
bash test-receipt-api.sh
# Verifica endpoints
# Testa POST com dados
# Extrai tracking_id
```

---

## 🔐 Variáveis de Ambiente Necessárias

### Firebase
```bash
FIREBASE_PROJECT_ID=seu-projeto-id
FIREBASE_SERVICE_ACCOUNT_JSON=./arquivo-json.json
FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
```

### Email
```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=sua-app-password
EMAIL_FROM=seu-email@gmail.com
```

### Security
```bash
FORCE_HTTPS=true
ALLOWED_ORIGINS=http://localhost:3000,https://seu-dominio.com
ALLOWED_ORIGIN_SUFFIXES=.vercel.app
```

---

## 📱 Páginas Frontend Modificadas

### formulario.html
```html
<!-- Campo novo adicionado -->
<label>
  Email
  <input type="email" id="email" name="email" required />
</label>
```

### sucesso.html
```html
<!-- Novo conteúdo exibido -->
<div id="confirmationDetails">
  <p><strong>ID de Rastreamento:</strong> <span id="trackingId"></span></p>
  <p><strong>Data e Hora:</strong> <span id="submissionTime"></span></p>
  <p><strong>Email:</strong> <span id="userEmail"></span></p>
  <p><a id="receiptUrl" href="#" target="_blank">Baixar Comprovante PDF</a></p>
</div>
```

---

## 🚀 Como Usar na Prática

### Teste Local Rápido
```bash
# 1. Terminal 1: Backend
npm run dev

# 2. Terminal 2: Teste automático
node test-api.js

# 3. Resultado
✅ Tracking ID: ABC1D2E3
📧 Email enviado
📄 PDF gerado
```

### Manual pelo Navegador
```
1. Abrir: http://localhost:3000/frontend/pages/formulario.html
2. Preencher dados
3. Enviar
4. Ver página de sucesso com tracking_id
5. Receber email em 1-2 min
```

### Manual pelo curl
```bash
curl -X POST http://localhost:3001/api/envios \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João",
    "email": "seu-email@gmail.com",
    "funcao": "Analista",
    "projeto": "Projeto 736",
    "tipo_atestado": "Atestado médico",
    "data_inicio": "2024-01-15T00:00:00Z",
    "data_fim": "2024-01-20T00:00:00Z",
    "dias": 6,
    "arquivos": [{
      "nome": "atestado.pdf",
      "tipo": "application/pdf",
      "conteudoBase64": "data:application/pdf;base64,JVBERi0x..."
    }]
  }'
```

---

## ✨ Resumo de Mudanças

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| backend/index.js | Código | +2 funções (PDF, Email), +validação email |
| backend/package.json | Config | +3 dependências |
| frontend/pages/formulario.html | HTML | +campo email |
| frontend/pages/sucesso.html | HTML | +confirmação com tracking_id |
| frontend/scripts/script.js | Código | +função base64, novo envio backend |

**Total:** 14 mudanças em 5 arquivos + 5 novos arquivos de documentação.

