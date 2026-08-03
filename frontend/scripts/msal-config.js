// Configuração do MSAL.js para integração com Microsoft Entra ID (Azure AD)
 // Guia de configuração: https://learn.microsoft.com/en-us/azure/active-directory/develop/vs-active-directory-add-connected-service
 
 const DEFAULT_CLIENT_ID = "89b8bf1d-7f65-466d-81eb-150c26a0b57a";
 const DEFAULT_TENANT_ID = "6b8311fd-897b-42b3-8ec4-bb68ddf44a01";
 
 // Configuração MSAL.js corrigida para login Microsoft seguro
function getCanonicalHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === '127.0.0.1' ? 'localhost' : normalized;
}

function getCanonicalRedirectUri() {
  const protocol = window.location.protocol || 'http:';
  const host = getCanonicalHost(window.location.hostname);
  const port = window.location.port ? `:${window.location.port}` : '';
  const pathname = window.location.pathname || '/';
  return `${protocol}//${host}${port}${pathname}`;
}

function getCanonicalPostLogoutRedirectUri() {
  const protocol = window.location.protocol || 'http:';
  const host = getCanonicalHost(window.location.hostname);
  const port = window.location.port ? `:${window.location.port}` : '';
  return `${protocol}//${host}${port}/`;
}

window.msalConfig = {
  auth: {
    clientId: DEFAULT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${DEFAULT_TENANT_ID}`,
    redirectUri: getCanonicalRedirectUri(),
    postLogoutRedirectUri: getCanonicalPostLogoutRedirectUri()
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (!containsPii) {
          console.log(`[MSAL] ${message}`);
        }
      },
      logLevel: "Error",
      piiLoggingEnabled: false
    }
  }
};
 
 // Configuração de escopos (permissões)
 window.loginRequest = {
   scopes: ["openid", "profile", "email"]
 };
 
 window.tokenRequest = {
   scopes: ["openid", "profile", "email"]
 };
 
 // Exportar para uso em outros scripts
 if (typeof module !== 'undefined' && module.exports) {
   module.exports = { msalConfig: window.msalConfig, loginRequest: window.loginRequest, tokenRequest: window.tokenRequest };
 }