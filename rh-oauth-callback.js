const oauthStatus = document.getElementById('oauthStatus');
const OAUTH_CTX_KEY = 'rh_oauth_context';
const OAUTH_CALLBACK_URL = 'http://localhost:5500/rh-oauth-callback.html';

function setStatus(texto, erro = false) {
  oauthStatus.textContent = texto;
  oauthStatus.style.color = '';
  oauthStatus.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  oauthStatus.classList.add(erro ? 'status-message--error' : 'status-message--info');
}

function inicializarPocketBase() {
  if (!window.POCKETBASE_CONFIG || !window.PocketBase) {
    return null;
  }

  const config = window.POCKETBASE_CONFIG;
  if (typeof config.baseUrl !== 'string' || !/^https?:\/\//i.test(config.baseUrl)) {
    return null;
  }

  return {
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    authCollection: config.authCollection || 'users'
  };
}

function extrairDetalheErro(error) {
  return error?.response?.message || error?.message || 'Falha ao concluir autenticação OAuth.';
}

function usuarioAprovado(modeloUsuario) {
  return Boolean(modeloUsuario && modeloUsuario.emailVisibility === true);
}

function montarUrlCallbackOAuth() {
  return OAUTH_CALLBACK_URL;
}

function timeoutPromise(ms = 3000) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), ms);
  });
}

function montarBaseUrlAlternativa(baseUrl) {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      return url.toString().replace(/\/+$/, '');
    }
    if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    return null;
  }

  return null;
}

async function baseUrlDisponivel(baseUrl) {
  try {
    await Promise.race([
      fetch(`${baseUrl}/api/health`, { method: 'GET' }),
      timeoutPromise(3500)
    ]);
    return true;
  } catch {
    return false;
  }
}

async function resolverBaseUrlAtiva(baseUrlOriginal) {
  const alternativa = montarBaseUrlAlternativa(baseUrlOriginal);

  if (await baseUrlDisponivel(baseUrlOriginal)) {
    return baseUrlOriginal;
  }

  if (alternativa && await baseUrlDisponivel(alternativa)) {
    return alternativa;
  }

  return '';
}

(async function concluirOAuth() {
  if (window.location.hostname === '127.0.0.1') {
    const url = new URL(window.location.href);
    url.hostname = 'localhost';
    window.location.replace(url.toString());
    return;
  }

  const pbConfig = inicializarPocketBase();
  if (!pbConfig) {
    setStatus('Configuração inválida do PocketBase.', true);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const oauthError = params.get('error');
  const oauthErrorDescription = params.get('error_description');

  if (oauthError) {
    const detalhe = oauthErrorDescription ? `${oauthError} - ${oauthErrorDescription}` : oauthError;
    setStatus(`Microsoft retornou erro: ${detalhe}`, true);
    return;
  }

  if (!code) {
    setStatus('Código OAuth não recebido. Tente novamente pelo login RH.', true);
    return;
  }

  const contextoRaw = sessionStorage.getItem(OAUTH_CTX_KEY);
  if (!contextoRaw) {
    setStatus('Contexto de autenticação expirado. Volte e inicie o login novamente.', true);
    return;
  }

  let contexto;
  try {
    contexto = JSON.parse(contextoRaw);
  } catch {
    setStatus('Contexto de autenticação inválido. Refaça o login.', true);
    return;
  }

  const provider = contexto?.provider || 'microsoft';
  const codeVerifier = contexto?.codeVerifier || '';
  const modoCadastro = Boolean(contexto?.modoCadastro);
  const redirectUrl = montarUrlCallbackOAuth();

  const baseUrlAtiva = await resolverBaseUrlAtiva(pbConfig.baseUrl);
  if (!baseUrlAtiva) {
    sessionStorage.removeItem(OAUTH_CTX_KEY);
    setStatus('PocketBase offline. Inicie o servidor (start-pocketbase.ps1) e tente novamente.', true);
    return;
  }

  const pb = new window.PocketBase(baseUrlAtiva);
  pb.autoCancellation(false);

  try {
    await pb.collection(pbConfig.authCollection).authWithOAuth2Code(
      provider,
      code,
      codeVerifier,
      redirectUrl,
      {}
    );

    if (!usuarioAprovado(pb.authStore.model)) {
      pb.authStore.clear();
      sessionStorage.removeItem(OAUTH_CTX_KEY);
      setStatus('Cadastro recebido. Seu acesso está pendente de aprovação do administrador.', true);
      return;
    }

    sessionStorage.removeItem(OAUTH_CTX_KEY);
    setStatus(modoCadastro ? 'Cadastro concluído com sucesso. Redirecionando...' : 'Login concluído com sucesso. Redirecionando...');
    window.location.href = 'rh-atestados.html';
  } catch (error) {
    const detalhe = extrairDetalheErro(error).toLowerCase();
    sessionStorage.removeItem(OAUTH_CTX_KEY);

    if (detalhe.includes('aadsts50011') || detalhe.includes('redirect_uri')) {
      setStatus('Redirect URI inválida no Entra ID. Cadastre: http://localhost:5500/rh-oauth-callback.html', true);
    } else if (detalhe.includes('aadsts7000215') || detalhe.includes('invalid_client')) {
      setStatus('Client Secret inválido no PocketBase.', true);
    } else if (detalhe.includes('aadsts7000218') || detalhe.includes('client_secret')) {
      setStatus('Provider Microsoft sem Client Secret no PocketBase. Reconfigure o client secret e tente novamente.', true);
    } else if (detalhe.includes('aadsts70008') || detalhe.includes('authorization code') && detalhe.includes('expired')) {
      setStatus('Código de autorização expirou. Volte para o login RH e tente novamente.', true);
    } else if (detalhe.includes('aadsts53003') || detalhe.includes('conditional access')) {
      setStatus('Acesso bloqueado por política de Acesso Condicional da Microsoft.', true);
    } else if (detalhe.includes('something went wrong while processing your request')) {
      setStatus('PocketBase/Microsoft respondeu erro genérico. Revise provider Microsoft (Client ID/Secret/redirect URI).', true);
    } else if (detalhe.includes('failed to fetch') || detalhe.includes('networkerror') || detalhe.includes('timeout')) {
      setStatus('Sem conexão com PocketBase. Verifique se está em execução em http://localhost:8090.', true);
    } else {
      setStatus(`Não foi possível concluir: ${extrairDetalheErro(error)}`, true);
    }
  }
})();
