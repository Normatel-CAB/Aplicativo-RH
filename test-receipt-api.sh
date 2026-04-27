#!/bin/bash
# ============================================================
# Script de Teste da API de Submissão de Atestados
# ============================================================

echo "🧪 Testando API de Submissão de Atestados..."
echo ""

# Verificar se backend está rodando
echo "1️⃣ Verificando se backend está rodando..."
curl -s http://localhost:3001/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Backend está rodando em http://localhost:3001"
else
    echo "❌ Backend não está respondendo. Inicie com: npm run dev"
    exit 1
fi
echo ""

# Testar endpoint GET /api/envios
echo "2️⃣ Testando GET /api/envios..."
curl -s http://localhost:3001/api/envios?limit=10 | python -m json.tool > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Endpoint GET /api/envios funcionando"
else
    echo "❌ Erro no endpoint GET /api/envios"
fi
echo ""

# Criar PDF de teste em base64 (PDF mínimo)
# Nota: Este é um PDF mínimo para teste
read -r -d '' PDF_BASE64 << 'EOF'
JVBERi0xLjAKCjEgMCBvYmo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PmVuZG9iaiAyIDAgb2JqPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj5lbmRvYmogMyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDQgMCBSPj4+Pi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PnN0cmVhbQpCVAovRjEgMTIgVGYKNTAgNzUwIFRkCihIZWxsbyBXb3JsZCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iaiA0IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYgp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNzAgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM2MApFT0Y=
EOF

# Testar POST /api/envios com dados simples
echo "3️⃣ Testando POST /api/envios com dados de teste..."

TEST_PAYLOAD=$(cat <<'EOF'
{
  "nome": "João da Silva",
  "email": "teste@exemplo.com",
  "funcao": "Analista",
  "projeto": "Projeto 736 - Base Imbetiba",
  "tipo_atestado": "Atestado médico",
  "data_inicio": "2024-01-15T00:00:00.000Z",
  "data_fim": "2024-01-20T00:00:00.000Z",
  "dias": 6,
  "horas_comparecimento": "8",
  "arquivos": [
    {
      "nome": "atestado-teste.pdf",
      "tipo": "application/pdf",
      "conteudoBase64": "data:application/pdf;base64,JVBERi0xLjAKCjEgMCBvYmo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PmVuZG9iaiAyIDAgb2JqPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj5lbmRvYmogMyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDQgMCBSPj4+Pi9NZWRpYUJveFswIDAgNjEyIDc5Ml0+PnN0cmVhbQpCVAovRjEgMTIgVGYKNTAgNzUwIFRkCihIZWxsbyBXb3JsZCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iaiA0IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYgp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTEwIDAwMDAwIG4gCjAwMDAwMDAyNjUgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM2MApFT0Y="
    }
  ]
}
EOF
)

RESPONSE=$(curl -s -X POST http://localhost:3001/api/envios \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD")

echo "Resposta recebida:"
echo "$RESPONSE" | python -m json.tool 2>/dev/null || echo "$RESPONSE"

# Extrair tracking_id da resposta
TRACKING_ID=$(echo "$RESPONSE" | grep -o '"tracking_id":"[^"]*' | cut -d'"' -f4)

if [ ! -z "$TRACKING_ID" ]; then
    echo "✅ Submissão realizada com sucesso!"
    echo "📊 Tracking ID: $TRACKING_ID"
    echo ""
    echo "4️⃣ Verificando se foi gravado no Firestore..."
    echo "   Acesse: Firebase Console > Firestore > envios_atestados"
    echo ""
    echo "5️⃣ Verificando se email foi enviado..."
    echo "   Verifique: teste@exemplo.com"
else
    echo "❌ Erro na submissão"
    echo "Resposta: $RESPONSE"
fi
