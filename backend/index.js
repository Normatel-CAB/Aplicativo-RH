const http = require('http');
const url = require('url');

const server = http.createServer(async (req, res) => {
  const origem = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/') || 'unknown';
  const ip = obterIpCliente(req);
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Aplicar cabeçalhos de segurança
  setSecurityHeaders(req, res);
  const origemPermitida = setCORSHeaders(res, origem);
  if (!origemPermitida) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Origem não permitida por CORS' }));
    return;
  }

  // Aplicar middleware de autenticação para rotas protegidas
  if (ROTAS_PROTEGIDAS.some(route => pathname.startsWith(route))) {
    try {
      await verificarUsuarioAutenticado(req, res, () => {
        // Usuário autenticado, continua para o próximo middleware
        setAuthHeaders(req, res, () => {
          // Continua para o tratamento normal da rota
          // Resto do código de tratamento de rotas
          // ... (código existente)
        });
      });
    } catch (error) {
      // Erro de autenticação
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Autenticação falhou' }));
      return;
    }
  }

  // Verificar se é rota admin (exige token de admin diferente)
  if (ROTAS_ADMIN.some(prefixo => pathname.startsWith(prefixo))) {
    if (!(await exigirAdmin(req, res))) return;
  }

  // Resto do código...
  res.writeHead(200);
  res.end('Backend funcionando');
});

server.listen(3001, () => {
  console.log('Servidor rodando em http://localhost:3001');
});

function obterIpCliente(req) {
  return req.socket.remoteAddress;
}

function setSecurityHeaders(req, res) {
  // Headers de segurança básicos
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
}

function setCORSHeaders(res, origem) {
  const origemPermitida = ['http://localhost:3000', 'https://normatel-rh.web.app', 'http://localhost:3000'];
  return origemPermitida.includes(origem);
}

function verificarUsuarioAutenticado(req, res, callback) {
  // Simulação de verificação de autenticação
  // Em um sistema real, isso verificaria tokens JWT ou sessões
  callback();
}

function setAuthHeaders(req, res, callback) {
  // Adiciona cabeçalhos de autenticação
  res.setHeader('X-User-Id', 'user123');
  res.setHeader('X-User-Email', 'user@example.com');
  callback();
}

function exigirAdmin(req, res) {
  // Simulação de verificação de admin
  // Em um sistema real, verificaria um token de admin específico
  return true; // Permite admin por enquanto
}

// Mock de funções que deveriam estar em outros lugares
function obterIpCliente(req) {
  return req.socket.remoteAddress;
}

function setSecurityHeaders(req, res) {
  // Headers de segurança
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
}

function setAuthHeaders(req, res, callback) {
  // Adiciona cabeçalhos de autenticação
  res.setHeader('X-Authenticated', 'true');
  callback();
}

function exigirAdmin(req, res) {
  // Verifica se o usuário é admin (simulação)
  // Em produção, isso verificaria um token de admin válido
  return true;
}

// Mock de arrays de rotas protegidas e admin
const ROTAS_PROTEGIDAS = [
  '/envios',
  '/formulario',
  '/dashboard',
  '/atestados',
  '/login'
];

const ROTAS_ADMIN = [
  '/admin',
  '/admin/*'
};