# Checklist de Produção - Sistema de Comprovante

## ✅ Pré-Deployment

### 1. Firebase Setup
- [ ] Projeto Firebase criado
- [ ] Firestore Database criado
- [ ] Storage Bucket criado e testado
- [ ] Service Account gerado e credenciais baixadas
- [ ] Regras de Firestore definidas para permitir leitura/escrita
- [ ] Regras de Storage definidas para permitir uploads

### 2. Email Configuration
- [ ] SMTP provider escolhido (Gmail, SendGrid, etc)
- [ ] Email account criado
- [ ] Se Gmail: App Password gerado (não usar senha regular)
- [ ] Teste de envio manual realizado
- [ ] EMAIL_USER, EMAIL_PASS, EMAIL_HOST, EMAIL_PORT configurados

### 3. Security Review
- [ ] HTTPS forçado (FORCE_HTTPS=true)
- [ ] CORS whitelist configurado
- [ ] Rate limiting ativo
- [ ] Validação de input em todos os campos
- [ ] Regex de email validado
- [ ] Tamanho máximo de payload (30MB) definido

### 4. Code Review
- [ ] Senhas/tokens NÃO commitados no repo
- [ ] .env.example criado com variáveis necessárias
- [ ] Error handling implementado
- [ ] Logging configurado
- [ ] Sem console.log sensível em produção

### 5. Testing
- [ ] Teste manual de submissão completa
- [ ] Verificar email enviado
- [ ] Verificar Firestore gravado
- [ ] Verificar Storage com arquivo
- [ ] Verificar PDF de comprovante gerado
- [ ] Testar com arquivo grande (>10MB)
- [ ] Testar com múltiplos arquivos
- [ ] Testar email inválido (deve falhar gracefully)

### 6. Performance
- [ ] Tempo de resposta < 5s para submissão
- [ ] PDF geração testada com files grandes
- [ ] Email envio testado (async, não bloqueia resposta)
- [ ] Cache headers configurados
- [ ] Gzip compression ativo

### 7. Backup & Recovery
- [ ] Firestore backup automático habilitado
- [ ] Storage backup strategy definida
- [ ] Plano de recuperação documentado
- [ ] Teste de restore realizado

---

## 🚀 Deploy

### Pré-Deploy
```bash
# 1. Preparar ambiente
npm install
npm run build

# 2. Verificar variáveis de ambiente
printenv | grep EMAIL
printenv | grep FIREBASE

# 3. Rodar testes locais
npm run test  # Se houver

# 4. Revisar logs
npm run dev 2>&1 | tail -20
```

### Deploy no Fly.io (Exemplo)
```bash
# 1. Instalar CLI
curl -L https://fly.io/install.sh | sh

# 2. Autenticar
flyctl auth login

# 3. Preparar app
flyctl apps create seu-app-name
flyctl secrets set EMAIL_USER=seu-email@gmail.com
flyctl secrets set EMAIL_PASS=sua-app-password
flyctl secrets set FIREBASE_PROJECT_ID=seu-projeto
# ... outras variáveis

# 4. Deploy
flyctl deploy
```

### Deploy no Vercel (Frontend)
```bash
# 1. Instalar CLI
npm install -g vercel

# 2. Deploy
vercel --prod --env-file .env.production

# 3. Configurar variáveis
# Dashboard > Settings > Environment Variables
```

### Deploy no Google Cloud Run (Backend)
```bash
# 1. Preparar Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ ./
EXPOSE 3001
CMD ["node", "index.js"]
EOF

# 2. Build & Deploy
gcloud builds submit --tag gcr.io/seu-projeto/rh-backend
gcloud run deploy rh-backend \
  --image gcr.io/seu-projeto/rh-backend \
  --set-env-vars FIREBASE_PROJECT_ID=seu-projeto
```

---

## 📊 Monitoramento Pós-Deploy

### 1. Health Checks
```bash
# Verificar se API está respondendo
curl https://seu-dominio.com/api/health

# Esperar resposta:
# {"status":"ok","timestamp":"2024-01-15T10:30:00.000Z"}
```

### 2. Logs
```bash
# Fly.io
flyctl logs

# Google Cloud Run
gcloud run logs read seu-app-name --limit 50

# Verificar erros de:
# - Firebase conexão
# - Email envio
# - Upload Storage
```

### 3. Métricas
- [ ] Tempo de resposta API (target: <2s)
- [ ] Taxa de erro (target: <0.1%)
- [ ] Emails enviados com sucesso (target: >99%)
- [ ] Tamanho médio de payload
- [ ] Uso de Storage

### 4. Alertas
- [ ] Configurar alertas para:
  - Taxa de erro > 1%
  - Tempo de resposta > 5s
  - Falha de email
  - Falha de Firebase connection
  - Quota de Storage atingida

---

## 🔍 Troubleshooting em Produção

### Problema: Email não enviado
```bash
# Verificar logs
flyctl logs | grep -i email

# Verificar credenciais
echo $EMAIL_USER
echo $EMAIL_PASS (não deve mostrar valor!)

# Solução:
# 1. Verificar se conta Gmail tem 2FA ativo
# 2. Gerar novo App Password
# 3. Atualizar secrets
flyctl secrets set EMAIL_PASS=nova-password
```

### Problema: Storage quota atingida
```bash
# Verificar tamanho
gsutil du -s gs://seu-bucket

# Limpar comprovantes antigos
gsutil -m rm gs://seu-bucket/comprovantes/*2024-01*

# Ou configurar lifecycle policy
```

### Problema: Firestore quota atingida
```bash
# Verificar uso no Firebase Console
# Project Settings > Usage

# Solução:
# 1. Upgrade do plano
# 2. Implementar archiving de dados antigos
# 3. Implementar rate limiting mais agressivo
```

---

## 📈 Optimization Contínua

### Performance
- [ ] Implementar cache de PDFs
- [ ] Compressão de arquivos
- [ ] CDN para comprovantes PDF
- [ ] Batch email sending

### Confiabilidade
- [ ] Dead letter queue para emails falhados
- [ ] Retry logic exponencial
- [ ] Fallback email provider
- [ ] Database replication

### Security
- [ ] Audit logs de acesso
- [ ] Encriptação end-to-end
- [ ] Rate limiting por usuário
- [ ] Detecção de fraude

---

## 📋 Runbook de Emergência

### Cenário: Serviço de email caiu
```bash
# 1. Verificar status
curl https://smtp.gmail.com -I

# 2. Usar provider alternativo
flyctl secrets set EMAIL_HOST=smtp-alternativo.com

# 3. Redeployed
flyctl deploy
```

### Cenário: Storage quota cheio
```bash
# 1. Verificar uso
gsutil du -s gs://seu-bucket

# 2. Limpar arquivos antigos
# Implementar em código ou manual

# 3. Upgrade de quota
# Firebase Console > Settings > Upgrade
```

### Cenário: Firestore inativo
```bash
# 1. Verificar status
gcloud firestore databases describe

# 2. Reiniciar backup
gcloud firestore backups create

# 3. Restaurar se necessário
gcloud firestore restore
```

---

## ✨ Success Criteria

- ✅ Submissões sendo recebidas
- ✅ Emails enviados com sucesso
- ✅ Comprovantes em PDF gerados
- ✅ Sem erros em logs
- ✅ Response time < 2s
- ✅ Taxa de sucesso > 99%
- ✅ Usuários confirmando recebimento de email
- ✅ Dashboard RH mostrando registros

---

## 📞 Contato de Suporte

Para problemas:
1. Verificar logs (flyctl logs)
2. Consultar documentação
3. Abrir issue no GitHub
4. Contatar suporte Firebase
