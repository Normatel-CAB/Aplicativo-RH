#!/usr/bin/env node
/**
 * Script de teste da API de submissão de atestados
 * Uso: node test-api.js
 */

const http = require('http');

// Dados de teste
const testData = {
  nome: "João da Silva",
  email: "seu-email@gmail.com", // ⚠️ ALTERAR PARA SEU EMAIL!
  funcao: "Analista de Sistemas",
  projeto: "Projeto 736 - Base Imbetiba",
  tipo_atestado: "Atestado médico",
  data_inicio: "2024-01-15T00:00:00.000Z",
  data_fim: "2024-01-20T00:00:00.000Z",
  dias: 6,
  horas_comparecimento: "8",
  // PDF mínimo em base64 (para teste)
  arquivos: [
    {
      nome: "atestado-teste.pdf",
      tipo: "application/pdf",
      conteudoBase64: "data:application/pdf;base64,JVBERi0xLjQKJeLjz9MNCjEgMCBvYmo8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PmVuZG9iag" +
        "oyIDAgb2JqPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj5lbmRvYmoKMyAwIG9iajw8L1R5cGUvUGFnZS9QYXJlbnQgMiAwIFIvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL0Njdmx" +
        "udmtsZWsvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDQgMCBSPj4+Pj4vc3RyZWFtCkJUCi9GMSAxMiBUZgoxMDAgNzUwIFRkCihIZWxsbyBXb3JsZCkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iag" +
        "o0IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYgp4cmVmCjAgNQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1O" +
        "CAwMDAwMCBuIAowMDAwMDAwMTEwIDAwMDAwIG4gCjAwMDAwMDAyNjUgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNS9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM2MApFT0YK"
    }
  ]
};

console.log('🧪 Testando API de Submissão de Atestados\n');
console.log('⚠️  IMPORTANTE: Altere o email em test-api.js para seu email!\n');

if (testData.email === 'seu-email@gmail.com') {
  console.error('❌ ERRO: Altere o email para seu email antes de testar!');
  console.error('   Edite test-api.js e procure por "seu-email@gmail.com"\n');
  process.exit(1);
}

console.log(`📧 Email para teste: ${testData.email}`);
console.log(`📊 Endpoint: http://localhost:3001/api/envios\n`);

// Fazer requisição
const postData = JSON.stringify(testData);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/envios',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('📤 Enviando requisição...\n');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📊 Status: ${res.statusCode}\n`);

    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 201) {
        console.log('✅ SUCESSO!\n');
        console.log('📊 Resposta:');
        console.log(`  - ID: ${response.id}`);
        console.log(`  - Tracking ID: ${response.tracking_id}`);
        console.log(`  - URL Comprovante: ${response.comprovante_url}`);
        console.log(`  - Firestore: ${response.firestore ? '✅' : '❌'}\n`);

        console.log('📋 Próximos passos:\n');
        console.log('1️⃣  Verificar email em 1-2 minutos:');
        console.log(`   📧 ${testData.email}\n`);

        console.log('2️⃣  Verificar Firestore:');
        console.log('   - Console Firebase');
        console.log('   - Firestore Database');
        console.log('   - Coleção: envios_atestados');
        console.log(`   - Buscar por: tracking_id = ${response.tracking_id}\n`);

        console.log('3️⃣  Verificar Storage:');
        console.log('   - Console Firebase');
        console.log('   - Cloud Storage');
        console.log('   - Pasta: envios/');
        console.log('   - Pasta: comprovantes/\n');

        if (response.comprovante_url) {
          console.log('4️⃣  Baixar comprovante:');
          console.log(`   ${response.comprovante_url}\n`);
        }
      } else {
        console.log('❌ ERRO na submissão:\n');
        console.log(JSON.stringify(response, null, 2));
      }
    } catch (e) {
      console.log('❌ Erro ao analisar resposta:');
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Erro na conexão:\n');
  console.error(error);
  console.error('\n⚠️  Verificar se o servidor está rodando:');
  console.error('   npm run dev\n');
  process.exit(1);
});

req.write(postData);
req.end();
