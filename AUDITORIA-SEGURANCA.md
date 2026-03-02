# 🔍 RELATÓRIO DE AUDITORIA - SEGURANÇA & BUGS

Data: 2 de março de 2026  
Status: ⚠️ PROBLEMAS ENCONTRADOS - 10 CRÍTICOS, 8 ALTOS

---

## 🔴 SEGURANÇA - CRÍTICO (Corrigir Imediatamente)

### 1. **CORS Aberto para Todas as Origens**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `backend/index.js` linha 32  
**Problema**: `Access-Control-Allow-Origin: '*'`  
**Risco**: Qualquer site pode fazer requisições ao seu API  
**Solução**: Whitelist de origens permitidas

### 2. **Sem Validação de Entrada**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `backend/index.js`  
**Problema**: POST /api/envios aceita qualquer dado sem validar  
**Risco**: Injection attacks, dados malformados  
**Solução**: Validar campos obrigatórios, types, tamanhos

### 3. **Sem Autenticação/Autorização**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: Todos endpoints  
**Problema**: Qualquer um pode enviar atestados, aprovar usuários  
**Risco**: Acesso não autorizado aos dados  
**Solução**: Implementar JWT ou Firebase Auth

### 4. **Sem Rate Limiting**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `backend/index.js`  
**Problema**: Sem limite de requisições por IP  
**Risco**: DDoS, abuso da API  
**Solução**: Implementar rate limiting

### 5. **Dados em Memória (Perdidos ao Reiniciar)**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `backend/index.js`  
**Problema**: `let envios = []; let usuarios = [];`  
**Risco**: Perda de dados  
**Solução**: Usar Firebase Firestore ou banco de dados

### 6. **Sem Proteção CSRF**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: POST endpoints  
**Problema**: Sem token CSRF  
**Risco**: Cross-Site Request Forgery  
**Solução**: Implementar CSRF token

### 7. **innerHTML com Dados do Usuário**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `rh-dashboard.js` linha 180  
**Problema**: `tr.innerHTML = ...` com `record.nome` diretamente  
**Risco**: XSS (Cross-Site Scripting)  
**Solução**: Usar `textContent` ou escaper

### 8. **Sem Validação de Tamanho de Arquivo**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `backend/index.js`  
**Problema**: Sem limite de tamanho em POST /api/envios  
**Risco**: Upload de arquivos gigantes, DoS  
**Solução**: Limitar tamanho máximo (ex: 10MB)

### 9. **Sem Validação de Tipo de Arquivo Real**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `backend/index.js`  
**Problema**: Confia no `Content-Type` do cliente  
**Risco**: Mime type spoofing, upload de executáveis  
**Solução**: Validar magic bytes do arquivo

### 10. **Dados Sensíveis no localStorage/sessionStorage**
**Nível**: 🔴 CRÍTICO  
**Arquivo**: `rh-login.js`, `script.js`  
**Problema**: `sessionStorage.setItem(OAUTH_CTX_KEY, ...)`  
**Risco**: XSS pode acessar tokens  
**Solução**: Usar secure httpOnly cookies

---

## 🟠 BUGS - ALTO (Corrigir em Breve)

### 1. **PocketBase Ainda Referenciado**
**Arquivo**: `script.js`, `rh-login.js`, `rh-dashboard.js`  
**Problema**: Código tenta usar `pocketbaseClient` que não existe  
**Impacto**: Ficar autenticado não funciona  
```javascript
estaAutenticado() {
  return Boolean(pocketbaseClient && pocketbaseClient.authStore && pocketbaseClient.authStore.isValid);
}
```

### 2. **OAUTH_CALLBACK_URL Hardcoded**
**Arquivo**: `rh-login.js` linha 5  
**Problema**: `const OAUTH_CALLBACK_URL = 'http://localhost:5500/...'`  
**Impacto**: Não funciona em produção  
**Solução**: Usar `window.location.origin`

### 3. **Firebase referências que não funcionam**
**Arquivo**: `rh-dashboard.js` linha 9  
**Problema**: `import { db, auth } from './firebase-config.js';`  
**Impacto**: Variáveis nunca usadas corretamente  
**Solução**: Remover ou implementar Firebase real

### 4. **Sem Tratamento de Erros de Rede**
**Arquivo**: `script.js` linha ~520  
**Problema**: Fetch sem catch para problemas de conexão  
**Impacto**: Usuário fica preso se backend cair  
**Solução**: Adicionar try-catch e retry logic

### 5. **Sem Validação de Respostas HTTP**
**Arquivo**: `firebase-config.js`  
**Problema**: Assume sempre `.json()` funciona  
**Impacto**: Crash se resposta não é JSON  
**Solução**: Validar `Content-Type` antes

### 6. **HTML Injection em Links**
**Arquivo**: `rh-dashboard.js` linha 180  
**Problema**: `href="${montarLinkArquivo(record, urlArquivo)}"`  
**Impacto**: Possibilidade de javascript: URLs  
**Solução**: Validar URLs antes de usar

### 7. **Cookies sem Flags de Segurança**
**Arquivo**: Nenhum implementado ainda  
**Problema**: Se implementar sessão, sem `Secure`, `HttpOnly`, `SameSite`  
**Solução**: Adicionar flags corretas

### 8. **console.error Expõe Detalhes**
**Arquivo**: `firebase-config.js`  
**Problema**: `console.error('Erro ao listar atestados:', error)`  
**Impacto**: Informações sensíveis em logs públicos  
**Solução**: Logar apenas em servidor, UI neutra

---

## 🟡 AVISOS - MÉDIO

### 1. Sem Compressão de Resposta
**Arquivo**: `backend/index.js`  
**Impacto**: Respostas maiores são mais lentas

### 2. Sem Logs de Auditoria
**Arquivo**: Todos  
**Impacto**: Impossível rastrear quem fez o quê

### 3. Sem Validação de Email no Backend
**Arquivo**: `backend/index.js`  
**Impacto**: Dados inválidos podem ser salvos

### 4. Sem Sanitização de Nomes
**Arquivo**: `script.js`  
**Impacto**: Caracteres especiais em PDF podem quebrar

---

## ✅ O QUE ESTÁ BOM

✓ Conversão de PDF funciona  
✓ Sanitização de nomes de arquivo  
✓ Tratamento básico de erros em conversão  
✓ Layout responsivo  
✓ Validação frontend (HTML5)  

---

## 📋 PRIORIDADE DE CORREÇÃO

### Imediato (Hoje):
1. Corrigir CORS - Whitelist de origens
2. Adicionar validação de entrada no backend
3. Remover innerHTML direto - usar textContent/DOMPurify
4. Implementar autenticação básica

### Curto Prazo (Esta Semana):
1. Corrigir referências ao PocketBase
2. Limpar código legacy
3. Adicionar rate limiting
4. Implementar CSRF tokens

### Médio Prazo (Este Mês):
1. Integrar Firebase real
2. Adicionar logs de auditoria
3. Implementar cookies seguros
4. Testes de segurança

---

## 🔧 AÇÕES RECOMENDADAS

1. **Instale um WAF** (Web Application Firewall)
2. **Faça testes de penetração** regularmente
3. **Use HTTPS em produção** (com redirect de HTTP)
4. **Implemente CSP** (Content Security Policy)
5. **Configure SRI** (Subresource Integrity) para CDNs
6. **Atualize dependências** regularmente
7. **Use secrets management** para credenciais

---

## 📊 SCORE DE SEGURANÇA

```
Antes: 3/10 ⚠️ MUI INSEGURO
Depois da correção: 7/10 ✓ ACEITÁVEL
Depois do Firebase + Auth: 9/10 ✓ MUITO BOM
```
