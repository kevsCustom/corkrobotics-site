/* Original image links remain usable without JavaScript. */
(() => {
  const dialog = document.querySelector(".image-dialog");
  const links = [...document.querySelectorAll("[data-gallery-image]")];
  if (!dialog || !links.length || typeof dialog.showModal !== "function")
    return;
  const image = dialog.querySelector(".gallery-full-image");
  const title = dialog.querySelector("#image-title");
  const description = dialog.querySelector("#image-description");
  const counter = dialog.querySelector(".image-counter");
  const original = dialog.querySelector(".image-original");
  const error = dialog.querySelector(".image-error");
  let current = 0;
  let opener = null;
  const show = (index) => {
    current = (index + links.length) % links.length;
    const link = links[current];
    const card = link.closest(".gallery-card");
    error.hidden = true;
    title.textContent = card.querySelector("h2").textContent;
    description.textContent = card.querySelector("p").textContent;
    image.alt = link.querySelector("img").alt;
    image.src = link.href;
    original.href = link.href;
    counter.textContent = `${String(current + 1).padStart(2, "0")} / ${links.length}`;
  };
  links.forEach((link, index) =>
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      opener = link;
      show(index);
      dialog.showModal();
      document.body.classList.add("dialog-open");
    }),
  );
  dialog
    .querySelector(".image-close")
    .addEventListener("click", () => dialog.close());
  dialog
    .querySelector(".image-previous")
    .addEventListener("click", () => show(current - 1));
  dialog
    .querySelector(".image-next")
    .addEventListener("click", () => show(current + 1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      show(current + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });
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
    document.body.classList.remove("dialog-open");
    opener?.focus({ preventScroll: true });
  });
  image.addEventListener("error", () => {
    error.hidden = false;
  });
})();
