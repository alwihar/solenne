const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const validators = Object.freeze({
  name: (v) => (v.trim().length >= 2 ? '' : 'Two characters minimum — even pseudonyms.'),
  email: (v) => (EMAIL_RE.test(v.trim()) ? '' : 'That email won’t reach the horizon.'),
  dream: (v) => (v.trim().length >= 10 ? '' : 'Give the dream at least a sentence.'),
});

// Mock commission form: client-side validation, success state swap.
export const initContactForm = () => {
  const form = document.getElementById('contact-form');
  const success = document.getElementById('contact-success');
  if (!form || !success) return;

  const showError = (field, message) => {
    const slot = form.querySelector(`[data-error-for="${field}"]`);
    if (slot) slot.textContent = message;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    const errors = Object.entries(validators)
      .map(([field, validate]) => [field, validate(String(data[field] ?? ''))])
      .filter(([, message]) => message);

    Object.keys(validators).forEach((field) => showError(field, ''));
    errors.forEach(([field, message]) => showError(field, message));

    if (errors.length === 0) {
      form.hidden = true;
      success.hidden = false;
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
};
