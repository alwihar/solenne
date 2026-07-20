const COPY_EMAIL = "hello@solenne.studio";
const COPIED_LABEL = "COPIED ✓";
const DEFAULT_LABEL = "COPY";
const REVERT_DELAY_MS = 2000;

// Wires the email copy button in the contact section.
export const initContactForm = () => {
  const btn = document.getElementById("copy-email");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(COPY_EMAIL);
    } catch {
      // Clipboard API unavailable — still show the feedback state
      // so the user knows what address to copy manually.
    }

    btn.textContent = COPIED_LABEL;
    btn.classList.add("contact__copy--copied");

    setTimeout(() => {
      btn.textContent = DEFAULT_LABEL;
      btn.classList.remove("contact__copy--copied");
    }, REVERT_DELAY_MS);
  });
};
