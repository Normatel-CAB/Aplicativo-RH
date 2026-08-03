// Configuração do MSAL.js para integração com Microsoft Entra ID (Azure AD)
// Guia de configuração: https://learn.microsoft.com/en-us/azure/active-directory/develop/vs-active-directory-add-connected-service

const DEFAULT_CLIENT_ID = "89b8bf1d-7f65-466d-81eb-150c26a0b57a";
const DEFAULT_TENANT_ID = "6b8311fd-897b-42b3-8ec4-bb68ddf44a01";

// Configuração MSAL.js corrigida para login Microsoft sicuro
const msalConfig = {
  auth: {
    clientId: DEFAULT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${DEFAULT_TENANT_ID}`, // Força tenant correto
    redirectUri: "https://normatel-rh.firebaseapp.com/account-selector.html", // Redirecionamento seguro
    postLogoutRedirectUri: "https://normatel-rh.firebaseapp.com/"
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
const loginRequest = {
  scopes: ["openid", "profile", "email"]
};

const tokenRequest = {
  scopes: ["openid", "profile", "email"]
};

// Exportar para uso em outros scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { msalConfig, loginRequest, tokenRequest };
}