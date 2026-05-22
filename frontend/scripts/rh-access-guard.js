(function rhAccessGuard() {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    var token   = String(localStorage.getItem('rh_auth_token')  || '').trim();
    var email   = String(localStorage.getItem('rh_user_email')  || '').trim();
    var pendente = localStorage.getItem('rh_user_pendente') === 'true';

    if (!token || !email || pendente) {
      var destino = String(window.location.pathname || '').split('/').pop() || 'rh-atestados.html';
      var query   = String(window.location.search || '');
      var hash    = String(window.location.hash   || '');
      localStorage.setItem('rh_redirect_after_login', destino + query + hash);
      window.location.replace('rh-login.html');
      return;
    }

    // Páginas que exigem cargo "admin"
    var ADMIN_ONLY_PAGES = ['rh-usuarios.html', 'rh-admin.html'];
    var currentPage = String(window.location.pathname || '').split('/').pop() || '';

    if (ADMIN_ONLY_PAGES.indexOf(currentPage) !== -1) {
      var role = String(localStorage.getItem('rh_user_role') || 'colaborador').toLowerCase().trim();
      if (role !== 'admin') {
        window.location.replace('rh-atestados.html');
        return;
      }
    }
  } catch (_e) {
    window.location.replace('rh-login.html');
  }
})();
