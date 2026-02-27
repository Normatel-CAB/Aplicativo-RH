const microsoftLoginBtn = document.getElementById('microsoftLoginBtn');
const microsoftRegisterBtn = document.getElementById('microsoftRegisterBtn');
const loginMensagem = document.getElementById('loginMensagem');
const OAUTH_CTX_KEY = 'rh_oauth_context';
const OAUTH_CALLBACK_URL = 'http://localhost:5500/rh-oauth-callback.html';

function redirecionarParaLocalhostSeNecessario() {
  if (window.location.hostname !== '127.0.0.1') {
    return false;
  }

  const url = new URL(window.location.href);
  url.hostname = 'localhost';
  window.location.replace(url.toString());
  return true;
}


import { auth } from './firebase-config.js';

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

async function garantirBaseUrlAtiva() {
  const principal = pocketbaseConfig.baseUrl;
  const alternativa = montarBaseUrlAlternativa(principal);

  if (await baseUrlDisponivel(principal)) {
    return principal;
  }

  if (alternativa && await baseUrlDisponivel(alternativa)) {
    pocketbaseConfig.baseUrl = alternativa;
    pocketbaseClient = new window.PocketBase(alternativa);
    pocketbaseClient.autoCancellation(false);
    return alternativa;
  }

  return '';
}

function inicializarPocketBase() {
  if (!window.POCKETBASE_CONFIG || !window.PocketBase) {
    return false;
  }

  const config = window.POCKETBASE_CONFIG;
  const baseUrlValida = typeof config.baseUrl === 'string' && /^https?:\/\//i.test(config.baseUrl);
  const collectionValida = typeof config.authCollection === 'string' && config.authCollection.trim().length > 0;

  if (!baseUrlValida || !collectionValida) {
    return false;
  }

  pocketbaseConfig = {
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    authCollection: config.authCollection || 'users',
    authProvider: config.authProvider || 'microsoft'
  };

  pocketbaseClient = new window.PocketBase(pocketbaseConfig.baseUrl);
  pocketbaseClient.autoCancellation(false);
  return true;
}

function irParaPainelRh() {
  window.location.href = 'rh-atestados.html';
}

function usuarioAprovado(modeloUsuario) {
  return Boolean(modeloUsuario && modeloUsuario.emailVisibility === true);
}

function definirMensagem(texto, erro = false) {
  loginMensagem.textContent = texto;
  loginMensagem.style.color = '';
  loginMensagem.classList.remove('status-message--info', 'status-message--success', 'status-message--error');
  loginMensagem.classList.add(erro ? 'status-message--error' : 'status-message--info');
}

function montarUrlCallbackOAuth() {
  return OAUTH_CALLBACK_URL;
}

function montarUrlAutorizacao(provider) {
  const authBase = provider?.authURL || provider?.authUrl;
  if (!authBase) {
    throw new Error('Provider Microsoft sem authURL no PocketBase.');
  }

  const authUrl = new URL(authBase);
  authUrl.searchParams.set('redirect_uri', montarUrlCallbackOAuth());
  return authUrl.toString();
}

async function autenticarMicrosoft(modoCadastro = false) {
  const ok = inicializarPocketBase();
  if (!ok) {
    definirMensagem('Configuração inválida do PocketBase para login Microsoft.', true);
    return;
  }

  const baseUrlAtiva = await garantirBaseUrlAtiva();
  if (!baseUrlAtiva) {
    definirMensagem('PocketBase offline. Inicie o servidor (start-pocketbase.ps1) e tente novamente.', true);
    return;
  }

  if (pocketbaseClient.authStore.isValid) {
    if (usuarioAprovado(pocketbaseClient.authStore.model)) {
      irParaPainelRh();
    } else {
      pocketbaseClient.authStore.clear();
      definirMensagem('Seu cadastro está pendente de aprovação do administrador.', true);
    }
    return;
  }

  microsoftLoginBtn.disabled = true;
  microsoftRegisterBtn.disabled = true;
  definirMensagem(modoCadastro ? 'Iniciando cadastro com Microsoft...' : 'Iniciando login Microsoft...');

  try {
    const authMethods = await pocketbaseClient.collection(pocketbaseConfig.authCollection).listAuthMethods();
    const providersOauth2 = Array.isArray(authMethods?.oauth2?.providers) ? authMethods.oauth2.providers : [];
    const providersLegado = Array.isArray(authMethods?.authProviders) ? authMethods.authProviders : [];
    const providers = [...providersOauth2, ...providersLegado];
    const oauthEnabled = Boolean(authMethods?.oauth2?.enabled);
    const providerOk = providers.some((provider) => provider?.name === pocketbaseConfig.authProvider);

    if (!oauthEnabled || !providerOk) {
      definirMensagem('Ative OAuth2 Microsoft na coleção users (Auth methods) no PocketBase Admin.', true);
      return;
    }

    const provider = providers.find((item) => item?.name === pocketbaseConfig.authProvider);
    if (!provider) {
      throw new Error('Provider Microsoft não encontrado no PocketBase.');
    }

    const contextoOAuth = {
      provider: provider.name,
      codeVerifier: provider.codeVerifier || '',
      modoCadastro
    };

    sessionStorage.setItem(OAUTH_CTX_KEY, JSON.stringify(contextoOAuth));
    window.location.href = montarUrlAutorizacao(provider);
    return;
  } catch (error) {
    sessionStorage.removeItem(OAUTH_CTX_KEY);
    const detalhe = (error?.response?.message || error?.message || 'Falha no login Microsoft.').toLowerCase();

    if (detalhe.includes('redirect_uri') || detalhe.includes('aadsts50011')) {
      definirMensagem('Redirect URI inválida no Entra ID. Cadastre: http://localhost:5500/rh-oauth-callback.html', true);
    } else if (detalhe.includes('aadsts7000215') || detalhe.includes('invalid_client') || detalhe.includes('client secret')) {
      definirMensagem('Client Secret inválido no provider Microsoft do PocketBase.', true);
    } else if (detalhe.includes('something went wrong while processing your request')) {
      definirMensagem('PocketBase/Microsoft respondeu erro genérico. Revise provider Microsoft (Client ID/Secret/redirect URI) e tente novamente.', true);
    } else if (detalhe.includes('failed to fetch') || detalhe.includes('networkerror') || detalhe.includes('timeout')) {
      definirMensagem('Sem conexão com PocketBase. Verifique se está em execução em http://localhost:8090.', true);
    } else {
      definirMensagem(`Não foi possível concluir: ${error?.response?.message || error?.message || 'Erro OAuth'}`, true);
    }
  } finally {
    microsoftLoginBtn.disabled = false;
    microsoftRegisterBtn.disabled = false;
  }
}

if (microsoftLoginBtn) {
  microsoftLoginBtn.addEventListener('click', () => {
    autenticarMicrosoft(false);
  });
}

if (microsoftRegisterBtn) {
  microsoftRegisterBtn.addEventListener('click', () => {
    autenticarMicrosoft(true);
  });
}

if (redirecionarParaLocalhostSeNecessario()) {
  definirMensagem('Redirecionando para localhost...', false);
}
