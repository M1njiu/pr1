/* Пивоварня «Тарусский гусь» — interactions */
(() => {
  'use strict';

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsDialog = typeof HTMLDialogElement !== 'undefined';

  /* ---------- Sticky header ---------- */
  const header = $('[data-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  const menu = $('[data-menu]');
  const menuButton = $('[data-menu-open]');
  let menuOpen = false;
  let menuTrigger = null;

  const menuFocusables = () => $$('a[href], button:not([disabled])', menu);

  function closeMenu(restoreFocus = true) {
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Открыть меню');
    body.classList.remove('menu-open');
    document.removeEventListener('keydown', onMenuKeydown);
    if (restoreFocus) {
      (menuTrigger || menuButton).focus();
    }
  }

  function openMenu() {
    if (!menu || menuOpen) return;
    menuOpen = true;
    menuTrigger = document.activeElement;
    menu.classList.add('is-open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Закрыть меню');
    body.classList.add('menu-open');
    document.addEventListener('keydown', onMenuKeydown);
    window.requestAnimationFrame(() => {
      const first = menuFocusables()[0];
      if (first) first.focus();
    });
  }

  function onMenuKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [menuButton, ...menuFocusables()].filter(
      (el) => el && el.getClientRects().length > 0
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (menu && menuButton) {
    menuButton.addEventListener('click', () => {
      if (menuOpen) closeMenu();
      else openMenu();
    });
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1060 && menuOpen) closeMenu(false);
    });
  }

  /* ---------- Age gate ---------- */
  const AGE_KEY = 'tg-age-confirmed';
  const gate = $('#age-gate');

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        /* private mode: the gate will simply show again next visit */
      }
    },
  };

  if (gate && supportsDialog && storage.get(AGE_KEY) !== '1') {
    const mainPanel = $('[data-age-main]', gate);
    const deniedPanel = $('[data-age-denied]', gate);
    const yesButton = $('[data-age-yes]', gate);
    const noButton = $('[data-age-no]', gate);
    const backButton = $('[data-age-back]', gate);

    const showGate = () => {
      try {
        gate.showModal();
        body.classList.add('modal-open');
      } catch (error) {
        /* already open */
      }
    };

    gate.addEventListener('close', () => body.classList.remove('modal-open'));
    gate.addEventListener('cancel', (event) => event.preventDefault());

    if (yesButton) {
      yesButton.addEventListener('click', () => {
        storage.set(AGE_KEY, '1');
        gate.close();
      });
    }

    if (noButton && mainPanel && deniedPanel) {
      noButton.addEventListener('click', () => {
        mainPanel.hidden = true;
        deniedPanel.hidden = false;
        if (backButton) backButton.focus();
      });
    }

    if (backButton && mainPanel && deniedPanel) {
      backButton.addEventListener('click', () => {
        deniedPanel.hidden = true;
        mainPanel.hidden = false;
        if (yesButton) yesButton.focus();
      });
    }

    showGate();
  }

  /* ---------- Secret game: five clicks on the logo ---------- */
  const brandLinks = $$('a.brand');
  if (brandLinks.length) {
    let brandClicks = 0;
    let brandTimer = null;
    let brandTarget = null;
    const isHomePage =
      /(?:^|\/)index\.html$/.test(window.location.pathname) ||
      /\/$/.test(window.location.pathname);

    const resetBrandClicks = () => {
      brandClicks = 0;
      brandTarget = null;
      if (brandTimer) {
        clearTimeout(brandTimer);
        brandTimer = null;
      }
    };

    brandLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        brandClicks += 1;
        brandTarget = link;
        link.classList.add('is-tapped');
        window.setTimeout(() => link.classList.remove('is-tapped'), 180);

        if (brandTimer) clearTimeout(brandTimer);

        if (brandClicks >= 5) {
          resetBrandClicks();
          window.location.href = 'game.html';
          return;
        }

        const href = link.getAttribute('href') || '';
        if (isHomePage && href.includes('index.html')) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // A normal single click still works, just with a small delay so a
        // rapid series of five clicks can be recognised. On the home page
        // the logo already points to the current page, so no reload is needed.
        brandTimer = window.setTimeout(
          () => {
            const href = brandTarget ? brandTarget.getAttribute('href') : null;
            const wasHome = isHomePage;
            resetBrandClicks();
            if (href && !(wasHome && href.includes('index.html'))) {
              window.location.href = href;
            }
          },
          isHomePage ? 1600 : 450
        );
      });
    });
  }

  /* ---------- Scroll reveal ---------- */
  const revealItems = $$('.reveal');
  if (revealItems.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealItems.forEach((el) => el.classList.add('in-view'));
    } else {
      revealItems.forEach((el) => el.classList.add('will-reveal'));
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in-view');
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
      );
      revealItems.forEach((el) => observer.observe(el));
    }
  }

  /* ---------- Gallery lightbox ---------- */
  const lightbox = $('[data-lightbox]');
  const galleryItems = $$('[data-gallery-item]');

  if (lightbox && supportsDialog && galleryItems.length) {
    const lightboxImage = $('[data-lightbox-img]', lightbox);
    const lightboxCaption = $('[data-lightbox-caption]', lightbox);
    const lightboxCount = $('[data-lightbox-count]', lightbox);
    const closeButton = $('[data-lightbox-close]', lightbox);
    const prevButton = $('[data-lightbox-prev]', lightbox);
    const nextButton = $('[data-lightbox-next]', lightbox);
    let current = 0;

    const showSlide = (index) => {
      current = (index + galleryItems.length) % galleryItems.length;
      const item = galleryItems[current];
      const image = $('img', item);
      const full = item.getAttribute('data-full') || (image && image.src);
      const caption =
        item.getAttribute('data-caption') || (image && image.getAttribute('alt')) || '';
      if (lightboxImage) {
        lightboxImage.src = full;
        lightboxImage.alt = caption;
      }
      if (lightboxCaption) lightboxCaption.textContent = caption;
      if (lightboxCount) {
        lightboxCount.textContent = `${current + 1} / ${galleryItems.length}`;
      }
    };

    const openLightbox = (index) => {
      showSlide(index);
      lightbox.showModal();
      body.classList.add('modal-open');
    };

    galleryItems.forEach((item, index) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        openLightbox(index);
      });
    });

    if (closeButton) closeButton.addEventListener('click', () => lightbox.close());
    if (prevButton) prevButton.addEventListener('click', () => showSlide(current - 1));
    if (nextButton) nextButton.addEventListener('click', () => showSlide(current + 1));

    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener('close', () => body.classList.remove('modal-open'));
    lightbox.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showSlide(current - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showSlide(current + 1);
      }
    });
  }

  /* ---------- Beer anchor navigation ---------- */
  const beerNav = $('[data-beer-nav]');
  const beerSections = $$('[data-beer-section]');
  if (beerNav && beerSections.length && 'IntersectionObserver' in window) {
    const links = $$('a', beerNav);
    const linkById = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
    const setActive = (id) => {
      links.forEach((link) => link.classList.remove('is-active'));
      const active = linkById.get(id);
      if (active) {
        active.classList.add('is-active');
        active.setAttribute('aria-current', 'true');
      }
      links.forEach((link) => {
        if (link !== active) link.removeAttribute('aria-current');
      });
    };

    const initialHash = window.location.hash.slice(1);
    setActive(beerSections.some((section) => section.id === initialHash) ? initialHash : beerSections[0].id);
    window.addEventListener('hashchange', () => {
      const id = window.location.hash.slice(1);
      if (beerSections.some((section) => section.id === id)) setActive(id);
    });
    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-28% 0px -58% 0px', threshold: [0, 0.15, 0.5] }
    );
    beerSections.forEach((section) => spy.observe(section));
  }

  /* ---------- Contact form (mailto, no backend) ---------- */
  const contactForm = $('[data-contact-form]');
  const formStatus = $('[data-form-status]');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;

      const data = new FormData(contactForm);
      const name = String(data.get('name') || '').trim();
      const phone = String(data.get('phone') || '').trim();
      const email = String(data.get('email') || '').trim();
      const topic = String(data.get('topic') || 'Сообщение с сайта');
      const message = String(data.get('message') || '').trim();

      const subject = `Сайт: ${topic} — ${name}`;
      const lines = [
        `Имя: ${name}`,
        `Телефон: ${phone || 'не указан'}`,
        `E-mail: ${email || 'не указан'}`,
        `Тема: ${topic}`,
        '',
        message,
      ];
      const href = `mailto:tarusskygus@gmail.com?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(lines.join('\n'))}`;

      if (formStatus) {
        formStatus.hidden = false;
        formStatus.textContent = 'Открываем почтовую программу. Если письмо не появилось, напишите на ';
        const link = document.createElement('a');
        link.href = 'mailto:tarusskygus@gmail.com';
        link.textContent = 'tarusskygus@gmail.com';
        formStatus.appendChild(link);
        formStatus.appendChild(document.createTextNode('.'));
      }

      window.location.href = href;
    });
  }

  /* ---------- Smooth in-page links (respect reduced motion) ---------- */
  if (!reduceMotion) {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link || link.classList.contains('skip-link')) return;
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', id);
    });
  }
})();
