const path = require("path");
const https = require("https");
const http = require("http");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {initializeApp, cert, applicationDefault, getApps} =
  require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {getStorage} = require("firebase-admin/storage");
const { PDFDocument } = require("pdf-lib");

setGlobalOptions({maxInstances: 10, region: "southamerica-east1"});

const FIRESTORE_COLLECTIONS = {
  envios: "envios_atestados",
  usuarios: "usuarios_rh",
  eventos: "eventos_frontend",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://normatel-rh.web.app",
  "https://normatel-rh.firebaseapp.com",
  // Origem de produção do frontend (Vercel). Deploy previews continuam
  // cobertos pelo sufixo .vercel.app em ALLOWED_ORIGIN_SUFFIXES.
  "https://rh2-sigma.vercel.app",
];

const ALLOWED_ORIGINS = obterOrigensPermitidas();
const ALLOWED_ORIGIN_SUFFIXES = obterSufixosPermitidos();
const MAX_PAYLOAD_SIZE = 30 * 1024 * 1024;
const REQUEST_TRACKER = new Map();
const MAX_EVENT_REQUESTS_PER_MINUTE = 2000;
const MAX_CRITICAL_REQUESTS_PER_MINUTE = 300;

let firestoreDb = null;
let firebaseStorage = null;
let firebaseStorageBucket = "";

function obterOrigensPermitidas() {
  const origensEnv = String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origem) => origem.trim().replace(/\/+$/, ""))
      .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...origensEnv]));
}

function obterSufixosPermitidos() {
  const sufixosPadrao = [".vercel.app"];
  const sufixosEnv = String(process.env.ALLOWED_ORIGIN_SUFFIXES || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .map((item) => (item.startsWith(".") ? item : `.${item}`));

  return Array.from(new Set([...sufixosPadrao, ...sufixosEnv]));
}

function obterServiceAccountFirebase() {
  const valor = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!valor) {
    return null;
  }

  try {
    if (valor.startsWith("{")) {
      return JSON.parse(valor);
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function garantirFirebaseInicializado() {
  if (firestoreDb && firebaseStorage) {
    return;
  }

  const serviceAccount = obterServiceAccountFirebase();
  const bucketConfigurado = String(process.env.FIREBASE_STORAGE_BUCKET || "")
      .trim();
  const projectIdDetectado = serviceAccount?.project_id ||
    String(process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "")
        .trim();
  const bucketPadrao = projectIdDetectado ?
    `${projectIdDetectado}.firebasestorage.app` : "";
  firebaseStorageBucket = bucketConfigurado || bucketPadrao;

  if (getApps().length === 0) {
    const credencialFirebase = serviceAccount ? cert(serviceAccount) : applicationDefault();
    initializeApp({
      credential: credencialFirebase,
      ...(firebaseStorageBucket ? {storageBucket: firebaseStorageBucket} : {}),
    });
  }

  firestoreDb = getFirestore();
  firebaseStorage = getStorage();
}

async function obterFirestoreObrigatorio() {
  garantirFirebaseInicializado();
  if (!firestoreDb) {
    throw new Error("FIRESTORE_NOT_CONFIGURED");
  }
  return firestoreDb;
}

async function obterStorageObrigatorio() {
  garantirFirebaseInicializado();
  if (!firebaseStorage || !firebaseStorageBucket) {
    throw new Error("FIREBASE_STORAGE_NOT_CONFIGURED");
  }
  return firebaseStorage.bucket(firebaseStorageBucket);
}

function normalizarOrigem(origem) {
  return String(origem || "").trim().replace(/\/+$/, "");
}

function origemEhLocalhost(origem) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origem);
}

function origemEhPermitidaPorSufixo(origem) {
  if (!origem) {
    return false;
  }

  let host = "";
  try {
    host = new URL(origem).hostname.toLowerCase();
  } catch (_error) {
    return false;
  }

  return ALLOWED_ORIGIN_SUFFIXES.some((sufixo) => host.endsWith(sufixo));
}

function setSecurityHeaders(res) {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function setCORSHeaders(res, origem) {
  const origemNormalizada = normalizarOrigem(origem);
  const origemPermitida = ALLOWED_ORIGINS.includes(origemNormalizada) ||
    origemEhLocalhost(origemNormalizada) ||
    origemEhPermitidaPorSufixo(origemNormalizada);

  if (origemPermitida && origemNormalizada && origemNormalizada !== "unknown") {
    res.setHeader("Access-Control-Allow-Origin", origemNormalizada);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");
  return origemPermitida || !origemNormalizada || origemNormalizada === "unknown";
}

function obterIpCliente(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.ip ||
    "unknown";
}

function verificarRateLimit(chave, limitePorMinuto) {
  const agora = Date.now();
  const minutoAtras = agora - 60000;

  if (!REQUEST_TRACKER.has(chave)) {
    REQUEST_TRACKER.set(chave, {count: 1, timestamp: agora});
    return true;
  }

  const registro = REQUEST_TRACKER.get(chave);
  if (registro.timestamp < minutoAtras) {
    REQUEST_TRACKER.set(chave, {count: 1, timestamp: agora});
    return true;
  }

  if (registro.count >= limitePorMinuto) {
    return false;
  }

  registro.count += 1;
  return true;
}

function normalizarTextoCurto(valor, limite = 120) {
  return String(valor || "").trim().slice(0, limite);
}

async function bufferFromStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function converterImagemParaPdf(buffer, contentType) {
  const imageType = String(contentType || "").toLowerCase();
  const pdfDoc = await PDFDocument.create();
  let embeddedImage;

  if (imageType === "image/jpeg" || imageType === "image/jpg") {
    embeddedImage = await pdfDoc.embedJpg(buffer);
  } else if (imageType === "image/png") {
    embeddedImage = await pdfDoc.embedPng(buffer);
  } else {
    return null;
  }

  const { width, height } = embeddedImage.scale(1);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(embeddedImage, { x: 0, y: 0, width, height });
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function validarAtestado(dados) {
  const erros = [];
  if (!dados.nome || !String(dados.nome).trim()) erros.push("Nome é obrigatório");
  if (!dados.funcao || !String(dados.funcao).trim()) erros.push("Função é obrigatória");
  if (!dados.projeto || !String(dados.projeto).trim()) erros.push("Projeto é obrigatório");
  if (!dados.tipo_atestado || !String(dados.tipo_atestado).trim()) {
    erros.push("Tipo de atestado é obrigatório");
  }

  const dataInicio = new Date(dados.data_inicio);
  const dataFim = new Date(dados.data_fim);
  if (Number.isNaN(dataInicio.getTime())) erros.push("Data de início inválida");
  if (Number.isNaN(dataFim.getTime())) erros.push("Data de fim inválida");
  if (!Number.isNaN(dataInicio.getTime()) && !Number.isNaN(dataFim.getTime()) && dataFim < dataInicio) {
    erros.push("Data de fim não pode ser antes de data de início");
  }

  if (typeof dados.dias !== "number" || dados.dias < 1 || dados.dias > 365) {
    erros.push("Dias deve ser entre 1 e 365");
  }

  return erros;
}

async function obterBodyJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.rawBody === "object" && req.rawBody?.length) {
    const texto = req.rawBody.toString("utf8");
    return texto ? JSON.parse(texto) : {};
  }

  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PAYLOAD_SIZE) {
        reject(new Error("Payload muito grande"));
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (_error) {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", (error) => reject(error));
  });
}

function normalizarNomeArquivoStorage(nomeArquivo, indice) {
  const nomeLimpo = String(nomeArquivo || `arquivo-${indice + 1}.pdf`)
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "arquivo.pdf";
  return nomeLimpo;
}

function ehArquivoImagem(nomeArquivo) {
  const extensoesImagem = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.svg'];
  const ext = path.extname(nomeArquivo).toLowerCase();
  return extensoesImagem.includes(ext);
}

function extrairCaminhoStorageDeUrl(urlArquivo) {
  if (!urlArquivo || typeof urlArquivo !== "string") return "";
  const valor = urlArquivo.trim();

  if (valor.startsWith("gs://")) {
    const partes = valor.slice(5).split("/");
    if (partes.length >= 2) {
      return partes.slice(1).join("/");
    }
    return "";
  }

  let parsed;
  try {
    parsed = new URL(valor);
  } catch {
    return "";
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname || "";

  if (host === "firebasestorage.googleapis.com") {
    const segmentos = pathname.split("/").filter(Boolean);
    const indiceO = segmentos.indexOf("o");
    if (indiceO >= 0 && segmentos.length > indiceO + 1) {
      return decodeURIComponent(segmentos.slice(indiceO + 1).join("/"));
    }
  }

  if (host === "storage.googleapis.com") {
    const segmentos = pathname.split("/").filter(Boolean);
    if (segmentos.length >= 2) {
      return segmentos.slice(1).join("/");
    }
  }

  return "";
}

function validarCaminhoStorage(caminho) {
  const valor = String(caminho || "").trim();
  return valor.length > 0 && !valor.includes("..") && !valor.startsWith("/") && !valor.includes("\\");
}

async function salvarArquivosDoEnvioNoStorage(envioId, arquivosEntrada) {
  if (!Array.isArray(arquivosEntrada) || arquivosEntrada.length === 0) {
    return [];
  }

  const bucket = await obterStorageObrigatorio();
  const arquivos = [];

  for (let indice = 0; indice < arquivosEntrada.length; indice += 1) {
    const arquivo = arquivosEntrada[indice];
    if (!arquivo || typeof arquivo !== "object") continue;

    const tipo = String(arquivo.tipo || arquivo.contentType || arquivo.type || "application/pdf").trim() || "application/pdf";
    const nomeOriginal = normalizarNomeArquivoStorage(arquivo.nome || arquivo.name, indice);
    const extensao = path.extname(nomeOriginal) || (tipo.includes("pdf") ? ".pdf" : "");
    const nomeBase = path.basename(nomeOriginal, extensao || undefined);
    const nomeFinal = `${envioId}-${indice + 1}-${Date.now()}-${nomeBase}${extensao}`;
    const caminhoPadrao = `envios/${envioId}/${nomeFinal}`;

    const conteudoBase64 = String(arquivo.conteudoBase64 || "").trim();
    if (conteudoBase64) {
      let base64 = conteudoBase64;
      const dataUrlMatch = conteudoBase64.match(/^data:([^;]+);base64,(.+)$/i);
      if (dataUrlMatch) {
        base64 = dataUrlMatch[2];
      }
      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) continue;
      const file = bucket.file(caminhoPadrao);
      await file.save(buffer, {
        resumable: false,
        metadata: {
          contentType: tipo,
          cacheControl: "private, max-age=0, no-transform",
        },
      });
      arquivos.push({ nome: nomeOriginal, caminho: caminhoPadrao, tipo });
      continue;
    }

    const caminhoInformado = String(arquivo.caminho || arquivo.path || "").trim();
    const caminhoExtraido = caminhoInformado || extrairCaminhoStorageDeUrl(String(arquivo.url || "").trim());
    if (validarCaminhoStorage(caminhoExtraido)) {
      arquivos.push({ nome: nomeOriginal, caminho: caminhoExtraido, tipo });
      continue;
    }

    if (arquivo.url && typeof arquivo.url === "string" && arquivo.url.trim()) {
      arquivos.push({ nome: nomeOriginal, url: arquivo.url.trim(), tipo });
    }
  }

  return arquivos;
}

async function enviarEmailConfirmacao(envio) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não definida nas variáveis de ambiente.");
  }

  const dataInicioBR = String(envio.data_inicio || "").split("-").reverse().join("/");
  const dataFimBR = String(envio.data_fim || "").split("-").reverse().join("/");
  const enviadoEm = new Date(envio.criado_em || Date.now()).toLocaleString("pt-BR");

  const remetente = process.env.EMAIL_FROM || "RH Normatel <onboarding@resend.dev>";

  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: remetente,
      to: [envio.email],
      subject: `Atestado recebido – ${envio.tipo_atestado} – Normatel RH`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#2e7d32;padding:20px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">Normatel Engenharia</h1>
            <p style="color:#c8e6c9;margin:4px 0 0">Sistema RH – Atestados</p>
          </div>
          <div style="padding:24px;background:#fff;border:1px solid #e0e0e0">
            <h2 style="color:#2e7d32;margin-top:0">Atestado recebido com sucesso ✓</h2>
            <p>Olá <strong>${envio.nome}</strong>,</p>
            <p>Seu atestado foi registrado no sistema RH da Normatel Engenharia.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f5f5f5">
                <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;width:40%">Nº de rastreamento</td>
                <td style="padding:8px 12px;border:1px solid #ddd;font-family:monospace;font-size:16px;color:#2e7d32"><strong>${envio.tracking_id}</strong></td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold">Tipo</td>
                <td style="padding:8px 12px;border:1px solid #ddd">${envio.tipo_atestado}</td>
              </tr>
              <tr style="background:#f5f5f5">
                <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold">Projeto</td>
                <td style="padding:8px 12px;border:1px solid #ddd">${envio.projeto}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold">Período</td>
                <td style="padding:8px 12px;border:1px solid #ddd">${dataInicioBR} a ${dataFimBR} (${envio.dias} dia(s))</td>
              </tr>
              <tr style="background:#f5f5f5">
                <td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold">Enviado em</td>
                <td style="padding:8px 12px;border:1px solid #ddd">${enviadoEm}</td>
              </tr>
            </table>
            <p style="color:#666;font-size:13px">Em caso de dúvidas, entre em contato com o departamento de RH.</p>
          </div>
          <div style="padding:12px;text-align:center;background:#f5f5f5;font-size:12px;color:#999">
            Normatel Engenharia – Sistema Automatizado de RH
          </div>
        </div>
      `,
    }),
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`Resend API erro ${resposta.status}: ${dados.message || JSON.stringify(dados)}`);
  }
  return dados;
}

function ehArquivoImagem(nomeArquivo) {
  const extensoesImagem = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.svg'];
  const ext = path.extname(nomeArquivo).toLowerCase();
  return extensoesImagem.includes(ext);
}

const ROTAS_ADMIN = [
  "/api/usuarios/pendentes",
  "/api/usuarios/aprovar/",
  "/api/usuarios/rejeitar/",
  "/api/usuarios/cargo/",
  "/api/envios/status/",
  "/api/envios/excluir/",
  "/api/envios/restaurar/",
  "/api/arquivos/proxy",
  "/api/email",
];

// GET /api/eventos e GET /api/envios expõem PII; POST /api/eventos é público
// (telemetria). Trata GET dessas rotas como admin.
function rotaExigeAdmin(pathname, metodo) {
  if (ROTAS_ADMIN.some((prefixo) => pathname.startsWith(prefixo))) return true;
  if (metodo === "GET" && pathname === "/api/eventos") return true;
  return false;
}

const AAD_TENANT_ID = String(process.env.AAD_TENANT_ID || "6b8311fd-897b-42b3-8ec4-bb68ddf44a01").trim();
const AAD_CLIENT_ID = String(process.env.AAD_CLIENT_ID || "89b8bf1d-7f65-466d-81eb-150c26a0b57a").trim();
const AAD_ISSUER = `https://login.microsoftonline.com/${AAD_TENANT_ID}/v2.0`;
let _aadJwks = null;

async function obterAadJwks() {
  if (!_aadJwks) {
    const {createRemoteJWKSet} = await import("jose");
    _aadJwks = createRemoteJWKSet(
        new URL(`https://login.microsoftonline.com/${AAD_TENANT_ID}/discovery/v2.0/keys`),
    );
  }
  return _aadJwks;
}

// Valida ASSINATURA do id_token Entra ID (JWKS remoto) e confere ADMIN_EMAILS.
// Fallback: token estático forte X-Admin-Token. Fail-closed.
async function verificarTokenAdmin(req) {
  const adminEmails = String(process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

  const authHeader = String(req.headers["authorization"] || "").trim();
  if (adminEmails.length > 0 && authHeader.startsWith("Bearer ")) {
    try {
      const {jwtVerify} = await import("jose");
      const jwks = await obterAadJwks();
      const {payload} = await jwtVerify(authHeader.slice(7), jwks, {
        issuer: AAD_ISSUER,
        audience: AAD_CLIENT_ID,
      });
      const email = String(
          payload.preferred_username || payload.email || payload.upn || "",
      ).toLowerCase();
      return Boolean(email) && adminEmails.includes(email);
    } catch {
      return false;
    }
  }

  // Fallback: token estático via X-Admin-Token (para integrações externas)
  const staticToken = String(process.env.ADMIN_TOKEN || "").trim();
  if (staticToken.length >= 32) {
    const headerToken = String(req.headers["x-admin-token"] || "").trim();
    return headerToken.length > 0 && headerToken === staticToken;
  }

  return false;
}

// Valida assinatura do token Entra ID (JWKS remoto) e devolve o email do
// usuário, ou "" se inválido. Não confere ADMIN_EMAILS — apenas autenticidade.
async function obterEmailUsuarioAutenticado(req) {
  const authHeader = String(req.headers["authorization"] || "").trim();
  if (!authHeader.startsWith("Bearer ")) return "";
  try {
    const {jwtVerify} = await import("jose");
    const jwks = await obterAadJwks();
    const {payload} = await jwtVerify(authHeader.slice(7), jwks, {
      issuer: AAD_ISSUER,
      audience: AAD_CLIENT_ID,
    });
    return String(
        payload.preferred_username || payload.email || payload.upn || "",
    ).toLowerCase();
  } catch {
    return "";
  }
}

// Usuário autenticado E aprovado no Firestore (ou admin da allowlist).
async function verificarUsuarioAprovado(req) {
  const email = await obterEmailUsuarioAutenticado(req);
  if (!email) return false;

  const adminEmails = String(process.env.ADMIN_EMAILS || "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.includes(email)) return true;

  const db = await obterFirestoreObrigatorio();
  const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
      .where("email", "==", email)
      .limit(1)
      .get();
  if (snapshot.empty) return false;
  const usuario = snapshot.docs[0].data() || {};
  return usuario.aprovado === true ||
    String(usuario.status || "").toLowerCase() === "aprovado";
}

// Reads sensíveis (envios/eventos) exigem usuário aprovado; moderação exige
// admin. GET /api/usuarios/existe e POST públicos ficam de fora.
function rotaExigeUsuarioAprovado(pathname, metodo) {
  if (metodo === "GET" && pathname === "/api/envios") return true;
  return false;
}

async function responderApi(req, res) {
  const origem = req.headers.origin || "unknown";
  const ip = obterIpCliente(req);
  const pathname = extrairPathApi(req);

  setSecurityHeaders(res);
  const origemPermitida = setCORSHeaders(res, origem);
  if (!origemPermitida) {
    res.status(403).json({error: "Origem não permitida por CORS"});
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const ehRotaEvento = pathname === "/api/eventos";
  const chaveRateLimit = ehRotaEvento ? `${ip}:eventos` : `${ip}:geral`;
  const limiteRateLimit = ehRotaEvento ? MAX_EVENT_REQUESTS_PER_MINUTE : MAX_CRITICAL_REQUESTS_PER_MINUTE;
  if (!verificarRateLimit(chaveRateLimit, limiteRateLimit)) {
    res.status(429).json({error: "Muitas requisições. Tente novamente em alguns minutos."});
    return;
  }

  if (req.method !== "OPTIONS" && rotaExigeAdmin(pathname, req.method) && !(await verificarTokenAdmin(req))) {
    res.status(401).json({error: "Não autorizado."});
    return;
  }

  if (req.method !== "OPTIONS" && rotaExigeUsuarioAprovado(pathname, req.method) &&
      !(await verificarUsuarioAprovado(req))) {
    res.status(401).json({error: "Não autorizado."});
    return;
  }

  try {
    if ((pathname === "/" || pathname === "/api" || pathname === "/api/health") && req.method === "GET") {
      garantirFirebaseInicializado();
      res.status(200).json({
        status: "healthy",
        service: "rh-functions-api",
        firestoreInicializado: !!firestoreDb,
        storageInicializado: !!firebaseStorage,
      });
      return;
    }

    if (pathname === "/api/envios" && req.method === "POST") {
      const body = await obterBodyJson(req);
      const erros = validarAtestado(body);
      if (erros.length > 0) {
        res.status(400).json({error: "Validação falhou", detalhes: erros});
        return;
      }

      const novoEnvio = {
        id: Date.now().toString(),
        nome: String(body.nome).trim(),
        funcao: String(body.funcao).trim(),
        projeto: String(body.projeto).trim(),
        tipo_atestado: String(body.tipo_atestado),
        data_inicio: body.data_inicio,
        data_fim: body.data_fim,
        dias: body.dias,
        horas_comparecimento: body.horas_comparecimento || "",
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
        arquivos: [],
      };

      const arquivosSalvos = await salvarArquivosDoEnvioNoStorage(novoEnvio.id, body.arquivos);
      if (arquivosSalvos.length > 0) {
        novoEnvio.arquivos = arquivosSalvos;
      }

      const db = await obterFirestoreObrigatorio();
      await db.collection(FIRESTORE_COLLECTIONS.envios)
          .doc(String(novoEnvio.id))
          .set({...novoEnvio, origem_persistencia: "firebase-functions"}, {merge: true});

      res.status(201).json({id: novoEnvio.id, success: true, arquivos: novoEnvio.arquivos});
      return;
    }

    if (pathname === "/api/arquivos/signed-url" && req.method === "GET") {
      const caminhoArquivo = String(req.query.caminho || "").trim();
      if (!validarCaminhoStorage(caminhoArquivo)) {
        res.status(400).json({error: "Caminho de Storage inválido."});
        return;
      }

      const bucket = await obterStorageObrigatorio();
      const file = bucket.file(caminhoArquivo);
      const [existe] = await file.exists();
      if (!existe) {
        res.status(404).json({error: "Arquivo não encontrado."});
        return;
      }

      try {
        const [urlAssinada] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        });
        res.status(200).json({url: urlAssinada, caminho: caminhoArquivo});
      } catch (erroUrl) {
        logger.error("Falha ao gerar URL assinada", {caminho: caminhoArquivo, erro: erroUrl.message || erroUrl});
        res.status(500).json({error: "Falha ao gerar URL de download."});
      }
      return;
    }

    // Proxy de download via Admin SDK. Le o arquivo com credencial de servico
    // (ignora as Storage Rules) e faz stream ao cliente. Nao depende de Signed
    // URL nem de token de download - resolve o 403 sem exigir IAM extra.
    if (pathname === "/api/arquivos/download" && req.method === "GET") {
      const caminhoArquivo = String(req.query.caminho || "").trim();
      if (!validarCaminhoStorage(caminhoArquivo)) {
        res.status(400).json({error: "Caminho de Storage inválido."});
        return;
      }

      const bucket = await obterStorageObrigatorio();
      const file = bucket.file(caminhoArquivo);
      const [existe] = await file.exists();
      if (!existe) {
        res.status(404).json({error: "Arquivo não encontrado."});
        return;
      }

      try {
        const [metadata] = await file.getMetadata();
        const contentType = metadata.contentType || "application/pdf";
        const nomeBase = sanitizarNomeArquivoProxy(caminhoArquivo.split("/").pop());
        res.setHeader("Content-Type", contentType);
        // attachment (não inline): força download em vez de abrir no browser.
        res.setHeader("Content-Disposition", `attachment; filename="${nomeBase}"`);
        res.setHeader("Cache-Control", "private, max-age=0, no-store");
        if (metadata.size) res.setHeader("Content-Length", metadata.size);

        const stream = file.createReadStream();
        stream.on("error", (erroStream) => {
          logger.error("Falha no stream de download", {caminho: caminhoArquivo, erro: erroStream.message || erroStream});
          if (!res.headersSent) res.status(500).json({error: "Falha ao ler o arquivo."});
          else res.destroy();
        });
        stream.pipe(res);
      } catch (erroDownload) {
        logger.error("Falha no download via Admin SDK", {caminho: caminhoArquivo, erro: erroDownload.message || erroDownload});
        if (!res.headersSent) res.status(500).json({error: "Falha ao baixar o arquivo."});
      }
      return;
    }

    if (pathname === "/api/eventos" && req.method === "GET") {
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.eventos)
          .orderBy("criado_em", "desc")
          .limit(limit)
          .get();

      const data = snapshot.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
      res.status(200).json(data);
      return;
    }

    if (pathname === "/api/usuarios/existe" && req.method === "GET") {
      const email = String(req.query.email || "").trim().toLowerCase();
      if (!email) {
        res.status(400).json({error: "Email é obrigatório"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("email", "==", email)
          .limit(1)
          .get();

      if (snapshot.empty) {
        res.status(200).json({existe: false});
        return;
      }

      // Endpoint público (checagem pré-login). Não retorna PII (id/nome/email)
      // para evitar enumeração/confirmação de dados de terceiros — só o mínimo
      // que o fluxo de login precisa.
      const usuario = snapshot.docs[0].data() || {};
      res.status(200).json({
        existe: true,
        aprovado: !!usuario.aprovado,
      });
      return;
    }

    if (pathname === "/api/usuarios/me" && req.method === "GET") {
      const email = await obterEmailUsuarioAutenticado(req);
      if (!email) {
        res.status(401).json({error: "Não autorizado."});
        return;
      }
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("email", "==", email)
          .limit(1)
          .get();
      if (snapshot.empty) {
        res.status(200).json({existe: false, aprovado: false, role: null});
        return;
      }
      const usuario = snapshot.docs[0].data() || {};
      const aprovado = usuario.aprovado === true ||
        String(usuario.status || "").toLowerCase() === "aprovado";
      const adminEmails = String(process.env.ADMIN_EMAILS || "")
          .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
      const role = adminEmails.includes(email) ? "admin" :
        (String(usuario.role || "colaborador").toLowerCase() === "admin" ?
          "admin" : "colaborador");
      res.status(200).json({existe: true, aprovado, role});
      return;
    }

    // Lista completa de usuários (admin) — substitui leitura direta do SDK.
    if (pathname === "/api/usuarios" && req.method === "GET") {
      if (!(await verificarTokenAdmin(req))) {
        res.status(401).json({error: "Não autorizado."});
        return;
      }
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .orderBy("criado_em", "desc")
          .get();
      const data = snapshot.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
      res.status(200).json(data);
      return;
    }

    if (pathname === "/api/usuarios/pendentes" && req.method === "GET") {
      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("aprovado", "==", false)
          .orderBy("criado_em", "desc")
          .get();

      const data = snapshot.docs.map((doc) => ({id: doc.id, ...(doc.data() || {})}));
      res.status(200).json(data);
      return;
    }

    if (pathname === "/api/usuarios" && req.method === "POST") {
      const body = await obterBodyJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const nome = String(body.nome || "").trim();
      if (!email || !nome) {
        res.status(400).json({erros: ["Email e nome são obrigatórios"]});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const snapshot = await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .where("email", "==", email)
          .limit(1)
          .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const usuario = doc.data() || {};
        const status = usuario.aprovado ? "aprovado" : "pendente";
        res.status(usuario.aprovado ? 200 : 202)
            .json({id: doc.id, status, mensagem: "Usuário já cadastrado"});
        return;
      }

      const novoUsuario = {
        id: Date.now().toString(),
        email,
        nome,
        departamento: body.departamento || "",
        cargo: body.cargo || "",
        aprovado: false,
        criado_em: new Date().toISOString(),
        criado_por_ip: ip,
      };

      await db.collection(FIRESTORE_COLLECTIONS.usuarios)
          .doc(String(novoUsuario.id))
          .set(novoUsuario, {merge: false});

      res.status(202).json({id: novoUsuario.id, status: "pendente"});
      return;
    }

    if (/^\/api\/usuarios\/aprovar\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 50) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const body = await obterBodyJson(req);
      const role = ["admin", "colaborador"].includes(String(body?.role || "").toLowerCase()) ?
        String(body.role).toLowerCase() : "colaborador";

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Usuário não encontrado"});
        return;
      }

      await ref.set({
        status: "aprovado",
        aprovado: true,
        role,
        atualizado_em: new Date().toISOString(),
      }, {merge: true});
      res.status(200).json({id, aprovado: true, role});
      return;
    }

    if (/^\/api\/usuarios\/cargo\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 50) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const body = await obterBodyJson(req);
      const role = String(body?.role || "").toLowerCase();
      if (!["admin", "colaborador"].includes(role)) {
        res.status(400).json({error: "role deve ser 'admin' ou 'colaborador'"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Usuário não encontrado"});
        return;
      }

      await ref.set({role, atualizado_em: new Date().toISOString()}, {merge: true});
      res.status(200).json({id, role});
      return;
    }

    if (/^\/api\/usuarios\/rejeitar\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 50) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.usuarios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Usuário não encontrado"});
        return;
      }

      // Tenta remover do Authentication se tiver UID
      const dados = doc.data() || {};
      if (dados.uid) {
        try {
          await getAuth().deleteUser(String(dados.uid));
        } catch (e) {
          // Se não existir no Auth, ignora
          if (e.code !== 'auth/user-not-found') {
            logger.error("Erro ao remover do Authentication", e);
            res.status(500).json({error: "Erro ao remover do Authentication"});
            return;
          }
        }
      }

      await ref.delete();
      res.status(200).json({id, rejeitado: true, mensagem: "Usuário removido do Firestore e Authentication"});
      return;
    }

    if (/^\/api\/envios\/status\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 100) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const body = await obterBodyJson(req);
      const atendimentoStatus = String(body?.atendimento_status || "").trim().toLowerCase();
      if (!["feito", "pendente"].includes(atendimentoStatus)) {
        res.status(400).json({error: "atendimento_status deve ser \"feito\" ou \"pendente\""});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Envio não encontrado"});
        return;
      }

      await ref.set({
        atendimento_status: atendimentoStatus,
        atendimento_atualizado_em: new Date().toISOString(),
      }, {merge: true});

      res.status(200).json({id, atendimento_status: atendimentoStatus, atualizado: true});
      return;
    }

    if (/^\/api\/envios\/excluir\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 100) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Envio não encontrado"});
        return;
      }

      await ref.set({excluido: true, excluido_em: new Date().toISOString()}, {merge: true});
      res.status(200).json({id, excluido: true});
      return;
    }

    if (/^\/api\/envios\/restaurar\//.test(pathname) && req.method === "POST") {
      const id = pathname.split("/").pop();
      if (!id || id.length > 100) {
        res.status(400).json({error: "ID inválido"});
        return;
      }

      const db = await obterFirestoreObrigatorio();
      const ref = db.collection(FIRESTORE_COLLECTIONS.envios).doc(String(id));
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(404).json({error: "Envio não encontrado"});
        return;
      }

      await ref.update({excluido: false, excluido_em: null});
      res.status(200).json({id, restaurado: true});
      return;
    }

    if (pathname === "/api/arquivos/proxy" && req.method === "GET") {
      const urlArquivo = String(req.query.url || "").trim();
      const nomeArquivo = sanitizarNomeArquivoProxy(req.query.nome || "arquivo.pdf");

      if (!urlArquivo) {
        res.status(400).json({error: "Parâmetro url é obrigatório"});
        return;
      }

      if (!urlProxyPermitida(urlArquivo)) {
        res.status(403).json({error: "URL não permitida para proxy"});
        return;
      }

      try {
        const remoto = await baixarArquivoRemotoProxy(urlArquivo);
        res.setHeader("Content-Type", remoto.contentType || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(remoto.buffer);
        return;
      } catch (erroFetch) {
        logger.error("Erro no proxy de arquivo", erroFetch);
        res.status(502).json({error: "Falha ao baixar arquivo remoto"});
        return;
      }
    }

    if (pathname === "/api/email" && req.method === "POST") {
      if (!process.env.RESEND_API_KEY) {
        res.status(503).json({
          error: "Email não configurado. Defina RESEND_API_KEY nas variáveis de ambiente das Functions.",
        });
        return;
      }

      const body = await obterBodyJson(req);
      const emailDestino = String(body.email || "").trim();
      if (!emailDestino || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDestino)) {
        res.status(400).json({error: "Email do destinatário inválido"});
        return;
      }

      logger.info("Enviando email de confirmação", {para: emailDestino, tracking: body.tracking_id});
      try {
        const resultado = await enviarEmailConfirmacao(body);
        logger.info("Email enviado com sucesso", {id: resultado.id, para: emailDestino});
        res.status(200).json({success: true, para: emailDestino, id: resultado.id});
      } catch (emailErr) {
        logger.error("Falha ao enviar email via Resend", {erro: emailErr.message, para: emailDestino});
        res.status(500).json({error: "Falha ao enviar email"});
      }
      return;
    }


    res.status(404).json({error: "Rota não encontrada"});
  } catch (error) {
    logger.error("Erro na API", error);
    // Não expõe error.message ao cliente (evita vazar stack/detalhe interno).
    res.status(500).json({error: "Erro interno do servidor"});
  }
}

function urlProxyPermitida(urlArquivo) {
  try {
    const parsed = new URL(String(urlArquivo || ""));
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = String(parsed.hostname || "").toLowerCase();
    return host === "firebasestorage.googleapis.com" || host === "storage.googleapis.com";
  } catch {
    return false;
  }
}

function sanitizarNomeArquivoProxy(nome) {
  return String(nome || "arquivo.pdf")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "arquivo.pdf";
}

function baixarArquivoRemotoProxy(urlArquivo, redirecionamentosRestantes = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(String(urlArquivo || ""));
    } catch {
      reject(new Error("URL inválida para proxy"));
      return;
    }

    const isHttps = parsed.protocol === "https:";
    const cliente = isHttps ? https : http;
    const reqRemoto = cliente.request(parsed, {
      method: "GET",
      headers: {"User-Agent": "rh-functions-proxy/1.0"},
    }, (resp) => {
      const status = Number(resp.statusCode || 0);
      const location = resp.headers.location;

      if (status >= 300 && status < 400 && location && redirecionamentosRestantes > 0) {
        const proximaUrl = new URL(location, parsed).toString();
        resp.resume();
        // Revalida host a cada redirect: impede SSRF por Location apontando
        // para host interno/arbitrário após um redirect do host permitido.
        if (!urlProxyPermitida(proximaUrl)) {
          reject(new Error("Redirect para host não permitido"));
          return;
        }
        baixarArquivoRemotoProxy(proximaUrl, redirecionamentosRestantes - 1)
            .then(resolve).catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        resp.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }

      const chunks = [];
      resp.on("data", (chunk) => chunks.push(chunk));
      resp.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: resp.headers["content-type"] || "application/octet-stream",
        });
      });
      resp.on("error", (err) => reject(err));
    });

    reqRemoto.on("error", (err) => reject(err));
    reqRemoto.setTimeout(30000, () => {
      reqRemoto.destroy(new Error("Timeout de 30s no proxy"));
    });
    reqRemoto.end();
  });
}

exports.api = onRequest({memory: "1GiB", timeoutSeconds: 120}, responderApi);

exports.apiHealth = onRequest((request, response) => {
  logger.info("RH API online", {structuredData: true});
  response.status(200).json({status: "healthy", service: "functions"});
});

exports.limparEventosAntigos = onSchedule({
  schedule: "every monday 03:00",
  region: "southamerica-east1",
  timeZone: "America/Sao_Paulo",
}, async () => {
  garantirFirebaseInicializado();
  const db = await obterFirestoreObrigatorio();
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let totalRemovidos = 0;

  let snapshot = await db.collection(FIRESTORE_COLLECTIONS.eventos)
      .where("criado_em", "<", trintaDiasAtras)
      .limit(500)
      .get();

  while (!snapshot.empty) {
    const lote = db.batch();
    snapshot.docs.forEach((doc) => lote.delete(doc.ref));
    await lote.commit();
    totalRemovidos += snapshot.size;
    if (snapshot.size < 500) break;
    snapshot = await db.collection(FIRESTORE_COLLECTIONS.eventos)
        .where("criado_em", "<", trintaDiasAtras)
        .limit(500)
        .get();
  }

  logger.info(`Limpeza concluída: ${totalRemovidos} eventos removidos`);
});
