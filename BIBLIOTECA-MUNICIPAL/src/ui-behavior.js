(() => {
  const state = { currentModal: null, previousFocus: null };

  const isAdmin = () => {
    try {
      const user = JSON.parse(localStorage.getItem('biblioteca_user') || 'null');
      return user?.perfil === 'Administrador';
    } catch {
      return false;
    }
  };

  const activeBack = () => [...document.querySelectorAll('.back')].at(-1) || null;

  const focusables = (root) => [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);

  const applyUsersUi = () => {
    const heading = [...document.querySelectorAll('h1')].find(el => el.textContent?.trim() === 'Usuários do sistema');
    if (!heading) return;
    const main = heading.closest('main');
    const toolbar = main?.querySelector('.toolbar');
    const search = toolbar?.querySelector('.search');
    if (search) search.style.display = 'none';
  };

  const applyCategoriesUi = () => {
    const heading = [...document.querySelectorAll('h1')].find(el => el.textContent?.trim() === 'Categorias');
    if (!heading) return;
    const main = heading.closest('main');
    const page = main?.querySelector('.category-page');
    if (!page) return;
    const admin = isAdmin();
    const form = page.querySelector('.category-form');
    if (form) form.style.display = admin ? '' : 'none';
    page.querySelectorAll('.actions').forEach(actions => {
      actions.querySelectorAll('button').forEach(button => {
        if (/^Editar$|^Excluir$/.test(button.textContent?.trim() || '')) {
          button.style.display = admin ? '' : 'none';
        }
      });
    });
  };

  const focusModal = (back) => {
    const dialog = back.querySelector('[role="dialog"]') || back.querySelector('.modal');
    if (!dialog) return;
    state.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = focusables(dialog)[0];
    first?.focus();
    document.body.style.overflow = 'hidden';
  };

  const restoreFocus = () => {
    document.body.style.overflow = '';
    if (state.previousFocus && document.contains(state.previousFocus)) state.previousFocus.focus();
    state.previousFocus = null;
  };

  const handleModalKeyboard = (event) => {
    const back = activeBack();
    if (!back) return;
    const dialog = back.querySelector('[role="dialog"]') || back.querySelector('.modal');
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const close = dialog.querySelector('header button');
      close?.click();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(dialog);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const applyUi = () => {
    applyUsersUi();
    applyCategoriesUi();
    const modal = activeBack();
    if (modal && modal !== state.currentModal) {
      state.currentModal = modal;
      requestAnimationFrame(() => focusModal(modal));
    }
    if (!modal && state.currentModal) {
      state.currentModal = null;
      restoreFocus();
    }
  };

  document.addEventListener('keydown', handleModalKeyboard);
  new MutationObserver(applyUi).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storage', applyUi);
  window.addEventListener('focus', applyUi);
  applyUi();
})();
