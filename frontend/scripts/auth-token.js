// auth-token.js — renovação silenciosa do token Entra ID (AAD)
//
// Problema resolvido: o idToken salvo no login expira (~1h). As páginas de
// administração (aprovação de usuários, cargos, envios) liam esse token do
// localStorage já vencido e recebiam 401 do backend. Aqui centralizamos a
// obtenção de um token SEMPRE válido via MSAL acquireTokenSilent, com fallback
// para o token em cache quando o MSAL não estiver disponível na página.
//
// Requer que a página inclua ANTES deste script:
//   ../assets/vendor/msal-browser.min.js
//   ../scripts/msal-config.js   (define window.msalConfig / window.loginRequest)
(function (global) {
  'use strict';

  var instanciaMsal = null;
  var inicializando = null;

  function temMsal() {
    return typeof global.msal !== 'undefined' && !!global.msalConfig;
  }

  async function obterInstancia() {
    if (!temMsal()) return null;
    if (instanciaMsal) return instanciaMsal;
    if (inicializando) return inicializando;

    inicializando = (async function () {
      var inst = new global.msal.PublicClientApplication(global.msalConfig);
      await inst.initialize();
      try { await inst.handleRedirectPromise(); } catch (_e) { /* ignora */ }
      instanciaMsal = inst;
      return inst;
    })();

    return inicializando;
  }

  function contaAtiva(inst) {
    var conta = inst.getActiveAccount();
    if (conta) return conta;
    var todas = inst.getAllAccounts();
    return todas && todas.length ? todas[0] : null;
  }

  // Retorna um idToken válido. Tenta renovar silenciosamente; se o MSAL não
  // estiver presente ou não houver conta, devolve o token em cache (localStorage).
  async function obterTokenAAD() {
    var tokenCache = String(localStorage.getItem('rh_auth_token') || '').trim();

    try {
      var inst = await obterInstancia();
      if (!inst) return tokenCache;

      var conta = contaAtiva(inst);
      if (!conta) return tokenCache;

      var request = global.loginRequest || { scopes: ['openid', 'profile', 'email'] };
      var resultado = await inst.acquireTokenSilent({
        scopes: request.scopes,
        account: conta,
      });

      var novoToken = (resultado && (resultado.idToken || resultado.accessToken)) || '';
      if (novoToken) {
        localStorage.setItem('rh_auth_token', novoToken);
        return novoToken;
      }
      return tokenCache;
    } catch (_e) {
      // InteractionRequiredAuthError ou MSAL indisponível: usa cache. O guard de
      // rota trata a sessão realmente expirada (sem token) redirecionando ao login.
      return tokenCache;
    }
  }

  global.obterTokenAAD = obterTokenAAD;
})(window);
