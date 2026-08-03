const http = require('http');
const url = require('url');
const admin = require('firebase-admin');
const fs = require('fs');

// Inicializar Firebase Admin SDK quando as credenciais estiverem presentes
try {
  if (process.env.FIREBASE_ADMIN_SDK_JSON) {
    const svc = JSON.parse(process.env.FIREBASE_ADMIN_SDK_JSON);
    admin.initializeApp({ credential: admin.credential.cert(svc) });
    console.log('Firebase Admin inicializado a partir de FIREBASE_ADMIN_SDK_JSON');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    const key = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({ credential: admin.credential.cert(key) });
    console.log('Firebase Admin inicializado a partir de GOOGLE_APPLICATION_CREDENTIALS');
  } else if (process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) {
    // Em ambientes Google Cloud / Cloud Functions a inicialização automática funciona
    admin.initializeApp();
    console.log('Firebase Admin inicializado automaticamente (ambiente GCP)');
  } else {
    console.warn('Firebase Admin SKIPPED: defina FIREBASE_ADMIN_SDK_JSON ou GOOGLE_APPLICATION_CREDENTIALS para habilitar leitura segura do Firestore');
  }
} catch (e) {
  console.error('Erro ao inicializar Firebase Admin:', e.message || e);
}

const server = http.createServer(async (req, res) => {
  const origem = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/') || 'unknown';
  const ip = obterIpCliente(req);
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Rota segura: retornar usuarios_rh usando Admin SDK (requer credenciais)
  if (pathname === '/api/usuarios_rh' && req.method === 'GET') {
    try {
      // Autenticação: prefira BACKEND_API_KEY simples, senão valida MSAL token (se configurado)
      const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
      const provided = authHeader.replace(/^Bearer\s+/i, '');

      // Checa chave estática
      if (process.env.BACKEND_API_KEY && provided === process.env.BACKEND_API_KEY) {
        // permitido
      } else if (provided) {
        // tentar validar como token MSAL (JWT) se variável MSAL_CLIENT_ID estiver configurada
        if (process.env.MSAL_CLIENT_ID) {
          const payload = await verifyMsalToken(provided);
          if (!payload) throw new Error('Token MSAL inválido');
          // opcional: verificar domínio de email
          if (process.env.ALLOWED_EMAIL_DOMAIN && payload.preferred_username) {
            const domain = payload.preferred_username.split('@').pop();
            if (domain !== process.env.ALLOWED_EMAIL_DOMAIN) throw new Error('Domínio não permitido');
          }
        } else {
          throw new Error('Nenhum método de verificação configurado (defina BACKEND_API_KEY ou MSAL_CLIENT_ID)');
        }
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authorization required' }));
        return;
      }

      if (!admin.apps || admin.apps.length === 0) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Admin SDK não inicializado. Configure FIREBASE_ADMIN_SDK_JSON ou GOOGLE_APPLICATION_CREDENTIALS' }));
        return;
      }

      const db = admin.firestore();
      const snapshot = await db.collection('usuarios_rh').get();
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items }));
      return;
    } catch (err) {
      console.error('Erro em /api/usuarios_rh:', err.message || err);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'forbidden' }));
      return;
    }
  }

  // Receber envio de atestados via backend (POST /api/envios)
  if (pathname === '/api/envios' && req.method === 'POST') {
    try {
      setSecurityHeaders(req, res);
      setCORSHeaders(res, origem);
      const body = await readJson(req);
      if (!body || !body.nome || !body.email || !body.projeto || !body.tipo_atestado || !body.data_inicio || !body.data_fim) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload' }));
        return;
      }
      const novo = Object.assign({}, body, { criado_por_ip: ip, criado_em: body.criado_em || new Date().toISOString() });

      if (admin.apps && admin.apps.length > 0) {
        const db = admin.firestore();
        const docRef = await db.collection('envios_atestados').add(novo);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: docRef.id, saved: 'firestore' }));
        return;
      }

      // Fallback: salvar localmente em backend/data/envios.json
      const dataPath = __dirname + '/data/envios.json';
      let arr = [];
      try { arr = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]'); } catch (e) { arr = []; }
      const id = String(Date.now());
      novo.id = id;
      arr.unshift(novo);
      fs.writeFileSync(dataPath, JSON.stringify(arr, null, 2), 'utf8');
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, saved: 'local' }));
      return;
    } catch (err) {
      const msg = err.stack || err.message || String(err);
      console.error('Erro em /api/envios:', msg);
      try { fs.appendFileSync(__dirname + '/backend-error.log', `[${new Date().toISOString()}] /api/envios error:\n${msg}\n\n`); } catch (e) {}
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'internal' }));
      return;
    }
  }

  // Endpoint para enviar dados de email (POST /api/email)
  if (pathname === '/api/email' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const dataPath = __dirname + '/data/emails.json';
      let arr = [];
      try { arr = JSON.parse(fs.readFileSync(dataPath, 'utf8') || '[]'); } catch (e) { arr = []; }
      arr.unshift(Object.assign({ recebido_em: new Date().toISOString(), ip }, body || {}));
      fs.writeFileSync(dataPath, JSON.stringify(arr, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    } catch (err) {
      console.error('Erro em /api/email:', err.message || err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'internal' }));
      return;
    }
  }

  // Aplicar cabeçalhos de segurança
  setSecurityHeaders(req, res);
  const origemPermitida = setCORSHeaders(res, origem);
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
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
  // Headers de segurança completos
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://storage.googleapis.com; connect-src 'self' https://www.gstatic.com https://*.gstatic.com https://*.googleapis.com https://www.googleapis.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com https://storage.googleapis.com wss://*.firebaseio.com https://*.cloudfunctions.net https://login.microsoftonline.com https://graph.microsoft.com; frame-src https://login.microsoftonline.com https://normatel-rh.firebaseapp.com https://apis.google.com; upgrade-insecure-requests");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
}

function setCORSHeaders(res, origem) {
const origemPermitida = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://normatel-rh.web.app',
    'https://seusite.com'
];

  // Se não houver cabeçalho Origin, não é uma requisição CORS e pode seguir normalmente.
  if (!origem) {
    return true;
  }

  const allowed = origemPermitida.includes(origem);
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return allowed;
}

function verificarUsuarioAutenticado(req, res, callback) {
  // Verifica se o usuário está autenticado
  // Em um sistema real, isso verificaria tokens JWT ou sessões
  // Para este exemplo, simulamos um usuário autenticado
  const userId = 'user123';
  const userEmail = 'user@example.com';
  
  // Adiciona informações de autenticação ao request
  req.user = {
    id: userId,
    email: userEmail,
    authenticated: true
  };
  
  callback();
}

function setAuthHeaders(req, res, callback) {
  // Adiciona cabeçalhos de autenticação
  res.setHeader('X-User-Id', req.user?.id || 'user123');
  res.setHeader('X-User-Email', req.user?.email || 'user@example.com');
  callback();
}

function exigirAdmin(req, res) {
  // Verifica se o usuário é admin (simulação)
  // Em um sistema real, verificaria um token de admin específico
  // Para este exemplo, simulamos que o usuário é admin
  return false;
}

// Mock de funções que deveriam estar em outros lugares

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
];

// Valida token MSAL (Azure AD) usando JWKS remoto. Requer MSAL_CLIENT_ID (client/application id).
async function verifyMsalToken(token) {
  try {
    const jose = await import('jose');
    const tenant = process.env.MSAL_TENANT_ID || 'common';
    const jwksUri = `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUri));
    const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
    const audience = process.env.MSAL_CLIENT_ID;
    const verifyOptions = {};
    if (audience) verifyOptions.audience = audience;
    verifyOptions.issuer = issuer;
    const { payload } = await jose.jwtVerify(token, JWKS, verifyOptions);
    return payload;
  } catch (err) {
    console.error('verifyMsalToken failed:', err.message || err);
    return null;
  }
}

// Ler JSON do corpo da requisição
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        if (!data) return resolve(null);
        try {
          return resolve(JSON.parse(data));
        } catch (e) {
          try {
            const vm = require('vm');
            const obj = vm.runInNewContext('(' + data + ')', {}, {timeout: 1000});
            return resolve(obj);
          } catch (e2) {
            // tentativa de sanitização: escapar barras invertidas soltas
            try {
              const sanitized = data.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
              return resolve(JSON.parse(sanitized));
            } catch (eSan) {
              // continue para próximas tentativas
            }
            // last fallback: try decodeURIComponent then parse
            try {
              const dec = decodeURIComponent(data);
              return resolve(JSON.parse(dec));
            } catch (e3) {
              const err = new Error('Invalid JSON payload');
              err.raw = data;
              return reject(err);
            }
          }
        }
      } catch (err) { reject(err); }
    });
    req.on('error', err => reject(err));
  });
}