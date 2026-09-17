/* Motion is progressive enhancement. Posters, film links and navigation work without JS. */
(() => {
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
  const menu = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#site-nav");
  if (menu && nav) {
    document.documentElement.classList.add("nav-enhanced");
    menu.hidden = false;
    const closeMenu = () => {
      menu.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    };
    menu.addEventListener("click", () => {
      const open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        closeMenu();
        menu.focus();
      }
    });
  }

  const preview = document.querySelector("#hero-preview");
  const motionButton = document.querySelector(".motion-toggle");
  const dialog = document.querySelector(".film-dialog");
  const film = dialog?.querySelector(".full-film");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection;
  const constrained = () =>
    connection?.saveData ||
    ["slow-2g", "2g"].includes(connection?.effectiveType);
  let manuallyPaused = false;
  let previewVisible = false;
  let autoBlocked = false;
  let loadToken = 0;
  let lastFilmLink = null;
  const previewAllowed = () =>
    !reducedMotion.matches && !constrained() && !manuallyPaused && !autoBlocked;
  const setPreviewButton = () => {
    if (!motionButton || !preview) return;
    const playing = !preview.paused;
    motionButton.querySelector("[data-motion-label]").textContent = playing
      ? "Pause preview"
      : "Play preview";
    motionButton.querySelector(".motion-symbol").textContent = playing
      ? "Ⅱ"
      : "▶";
  };
  const startPreview = async () => {
    const token = ++loadToken;
    if (!preview.src) preview.src = preview.dataset.previewSrc;
    try {
      await preview.play();
      if (
        token !== loadToken ||
        document.hidden ||
        dialog?.open ||
        !previewVisible
      )
        preview.pause();
    } catch {
      if (token === loadToken) autoBlocked = true;
    }
    setPreviewButton();
  };
  const stopPreview = () => {
    loadToken += 1;
    preview?.pause();
    setPreviewButton();
  };
  const syncPreview = () => {
    if (!preview) return;
    if (previewAllowed() && previewVisible && !document.hidden && !dialog?.open)
      startPreview();
    else stopPreview();
  };
  if (preview && motionButton) {
    motionButton.hidden = false;
    preview.addEventListener("play", setPreviewButton);
    preview.addEventListener("pause", setPreviewButton);
    preview.addEventListener("error", () => {
      autoBlocked = true;
      stopPreview();
      motionButton.hidden = true;
      preview.removeAttribute("src");
      preview.load();
    });
    motionButton.addEventListener("click", () => {
      if (!preview.paused) {
        manuallyPaused = true;
        stopPreview();
      } else {
        manuallyPaused = false;
        autoBlocked = false;
        startPreview();
      }
    });
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          previewVisible = entries[0].isIntersecting;
          syncPreview();
        },
        { threshold: 0.15 },
      );
      observer.observe(preview);
    } else {
      // A browser without visibility observation gets an explicit play control.
      previewVisible = true;
    }
    reducedMotion.addEventListener("change", syncPreview);
    connection?.addEventListener?.("change", syncPreview);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) film?.pause();
      syncPreview();
    });
    window.addEventListener("pagehide", () => {
      stopPreview();
      film?.pause();
    });
    window.addEventListener("pageshow", syncPreview);
  }

  if (!dialog || !film || typeof dialog.showModal !== "function") return;
  const films = {
    mobile: {
      title: "CorkBot in motion",
      poster: "/assets/media/corkbot/mobile-poster.webp",
      original: "/assets/media/corkbot/mobile-film-4k.mp4",
    },
    gripper: {
      title: "Rotating base + three-axis gripper",
      poster: "/assets/media/corkbot/gripper-poster.webp",
      original: "/assets/media/corkbot/gripper-film-4k.mp4",
    },
  };
  document.querySelectorAll("[data-film]").forEach((link) =>
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const selected = films[link.dataset.film];
      if (!selected) return;
      event.preventDefault();
      lastFilmLink = link;
      stopPreview();
      dialog.querySelector("#film-title").textContent = selected.title;
      film.setAttribute(
        "aria-label",
        `${selected.title}. Simulated demonstration.`,
      );
      film.poster = selected.poster;
      film.src = link.href;
      dialog.querySelector(".film-original").href = selected.original;
      dialog.querySelector(".film-error a").href = selected.original;
      dialog.querySelector(".film-error").hidden = true;
      dialog.showModal();
      document.body.classList.add("dialog-open");
      film.play().catch(() => {
        /* Native controls remain available if playback needs another gesture. */
      });
    }),
  );
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    film.pause();
    film.removeAttribute("src");
    film.load();
    document.body.classList.remove("dialog-open");
    lastFilmLink?.focus({ preventScroll: true });
    syncPreview();
  });
  film.addEventListener("error", () => {
    if (film.getAttribute("src"))
      dialog.querySelector(".film-error").hidden = false;
  });
})();
