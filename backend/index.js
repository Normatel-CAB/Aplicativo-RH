import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURAÇÃO DE SEGURANÇA
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:8080'
];

const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_REQUESTS_PER_MINUTE = 100;
const REQUEST_TRACKER = new Map(); // IP -> { count, timestamp }

// Simulação de dados em memória (em produção, usar Firebase)
let envios = [];
let usuarios = [];

// Rate Limiting
function verificarRateLimit(ip) {
  const agora = Date.now();
  const minutoAtras = agora - 60000;
  
  if (!REQUEST_TRACKER.has(ip)) {
    REQUEST_TRACKER.set(ip, { count: 1, timestamp: agora });
    return true;
  }
  
  const registro = REQUEST_TRACKER.get(ip);
  if (registro.timestamp < minutoAtras) {
    REQUEST_TRACKER.set(ip, { count: 1, timestamp: agora });
    return true;
  }
  
  if (registro.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  registro.count++;
  return true;
}

// Validação de entrada
function validarAtestado(dados) {
  const erros = [];
  
  if (!dados.nome || typeof dados.nome !== 'string' || dados.nome.trim().length === 0) {
    erros.push('Nome é obrigatório');
  } else if (dados.nome.length > 150) {
    erros.push('Nome muito longo (máx 150 caracteres)');
  }
  
  if (!dados.funcao || typeof dados.funcao !== 'string' || dados.funcao.trim().length === 0) {
    erros.push('Função é obrigatória');
  } else if (dados.funcao.length > 100) {
    erros.push('Função muito longa (máx 100 caracteres)');
  }
  
  if (!dados.projeto || typeof dados.projeto !== 'string' || dados.projeto.trim().length === 0) {
    erros.push('Projeto é obrigatório');
  } else if (dados.projeto.length > 100) {
    erros.push('Projeto muito longo (máx 100 caracteres)');
  }
  
  if (!dados.tipo_atestado || typeof dados.tipo_atestado !== 'string') {
    erros.push('Tipo de atestado é obrigatório');
  }
  
  // Validar datas
  const dataInicio = new Date(dados.data_inicio);
  const dataFim = new Date(dados.data_fim);
  
  if (isNaN(dataInicio.getTime())) {
    erros.push('Data de início inválida');
  }
  
  if (isNaN(dataFim.getTime())) {
    erros.push('Data de fim inválida');
  }
  
  if (dataFim < dataInicio) {
    erros.push('Data de fim não pode ser antes de data de início');
  }
  
  if (typeof dados.dias !== 'number' || dados.dias < 1 || dados.dias > 365) {
    erros.push('Dias deve ser entre 1 e 365');
  }
  
  return erros;
}

// Função para parsear o corpo da requisição com limite
function parseBody(req, maxSize = MAX_PAYLOAD_SIZE) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error('Payload muito grande'));
        return;
      }
      data += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('JSON inválido'));
      }
    });
    
    req.on('error', (err) => {
      reject(err);
    });
  });
}

// Obter IP do cliente
function obterIpCliente(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress || 
         'unknown';
}

// CORS middleware com whitelist
function setCORSHeaders(res, origem) {
  const origemPermitida = ALLOWED_ORIGINS.includes(origem);
  
  if (origemPermitida) {
    res.setHeader('Access-Control-Allow-Origin', origem);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '3600');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const origem = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/') || 'unknown';
  const ip = obterIpCliente(req);
  
  setCORSHeaders(res, origem);

  // Verificar rate limit
  if (!verificarRateLimit(ip)) {
    res.writeHead(429);
    res.end(JSON.stringify({ error: 'Muitas requisições. Tente novamente em alguns minutos.' }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  try {
    // Rota de teste
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'API RH backend online!' }));
      return;
    }

    // Envio de atestados
    if (pathname === '/api/envios' && req.method === 'POST') {
      const body = await parseBody(req);
      
      // Validar dados
      const erros = validarAtestado(body);
      if (erros.length > 0) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Validação falhou', detalhes: erros }));
        return;
      }
      
      const novoEnvio = {
        id: Date.now().toString(),
        nome: body.nome.trim(),
        funcao: body.funcao.trim(),
        projeto: body.projeto.trim(),
        tipo_atestado: body.tipo_atestado,
        data_inicio: body.data_inicio,
        data_fim: body.data_fim,
        dias: body.dias,
        horas_comparecimento: body.horas_comparecimento || '',
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
        arquivos: []
      };
      envios.push(novoEnvio);
      res.writeHead(201);
      res.end(JSON.stringify({ id: novoEnvio.id, success: true }));
      return;
    }

    // Listar atestados
    if (pathname === '/api/envios' && req.method === 'GET') {
      const limit = Math.min(parseInt(parsedUrl.query.limit) || 100, 1000);
      const data = envios
        .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
        .slice(0, limit)
        .map(({ criado_por_ip, ...rest }) => rest); // Não expor IP
      
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    // Listar usuários pendentes
    if (pathname === '/api/usuarios/pendentes' && req.method === 'GET') {
      const data = usuarios
        .filter(u => u.emailVisibility === false)
        .map(({ ...rest }) => rest);
      
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    // Aprovar usuário (NOTA: Implementar autenticação aqui em produção)
    if (pathname.match(/^\/api\/usuarios\/aprovar\//) && req.method === 'POST') {
      const id = pathname.split('/').pop();
      
      if (!id || id.length > 50) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ID inválido' }));
        return;
      }
      
      const user = usuarios.find(u => u.id === id);
      if (user) {
        user.emailVisibility = true;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ id, aprovado: true }));
      return;
    }

    // Health check
    if (pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    // Fallback
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
  } catch (err) {
    console.error('Erro:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✓ Servidor RH backend rodando em http://localhost:${PORT}`);
  console.log(`\nEndpoints disponíveis:`);
  console.log(`  - GET  /`);
  console.log(`  - GET  /api/health`);
  console.log(`  - GET  /api/envios?limit=100`);
  console.log(`  - POST /api/envios`);
  console.log(`  - GET  /api/usuarios/pendentes`);
  console.log(`  - POST /api/usuarios/aprovar/:id`);
  console.log(`\n⚠️ SEGURANÇA ATIVA:`);
  console.log(`  - CORS: Whitelist ${ALLOWED_ORIGINS.length} origens`);
  console.log(`  - Rate limit: ${MAX_REQUESTS_PER_MINUTE} req/min por IP`);
  console.log(`  - Tamanho máximo: ${MAX_PAYLOAD_SIZE / 1024 / 1024}MB`);
});
