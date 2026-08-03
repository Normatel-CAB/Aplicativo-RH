const http = require('http');
const data = JSON.stringify({
  nome: 'Teste',
  email: 'teste@normatel.com',
  funcao: 'Analista',
  projeto: 'Projeto 736 - Base Imbetiba',
  tipo_atestado: 'Atestado médico',
  data_inicio: '01/08/2026',
  data_fim: '01/08/2026',
  arquivos: [{ nome: 'teste.pdf', url: 'https://example.com/teste.pdf' }]
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/envios',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS', res.statusCode);
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('BODY', body);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});

req.write(data);
req.end();
