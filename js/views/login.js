// Login View
// Ported from React Login.tsx - full login form with dual auth collection support

import { pb } from '../api.js';

/**
 * Create the login view with centered card, NE logo, email/password form,
 * loading state, and error display.
 *
 * @param {HTMLElement} container - The container to render into.
 * @param {Object} opts
 * @param {Function} opts.onSuccess - Called after successful authentication.
 */
export function createLoginView(container, { onSuccess }) {
  container.innerHTML = '';

  // --- Card wrapper ---
  const card = document.createElement('div');
  card.className = 'card p-6';
  card.style.cssText = 'max-width:24rem;margin:10vh auto;';

  // --- Logo + heading ---
  const header = document.createElement('div');
  header.style.cssText = 'text-align:center;margin-bottom:1.5rem;';

  const logo = document.createElement('div');
  logo.style.cssText = [
    'margin:0 auto 1rem',
    'width:48px',
    'height:48px',
    'font-size:20px',
    'background:linear-gradient(135deg, var(--primary), #818cf8)',
    'border-radius:8px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'color:white',
    'font-weight:700',
  ].join(';') + ';';
  logo.textContent = 'NE';

  const h2 = document.createElement('h2');
  h2.className = 'mb-1';
  h2.textContent = 'Welcome back';

  const subtitle = document.createElement('p');
  subtitle.className = 'text-secondary text-sm';
  subtitle.textContent = 'Sign in to your account';

  header.appendChild(logo);
  header.appendChild(h2);
  header.appendChild(subtitle);
  card.appendChild(header);

  // --- Form ---
  const form = document.createElement('form');

  // Email field
  const emailGroup = document.createElement('div');
  emailGroup.className = 'form-group';
  const emailLabel = document.createElement('label');
  emailLabel.textContent = 'Email';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.required = true;
  emailInput.placeholder = 'you@company.com';
  emailGroup.appendChild(emailLabel);
  emailGroup.appendChild(emailInput);
  form.appendChild(emailGroup);

  // Password field
  const passwordGroup = document.createElement('div');
  passwordGroup.className = 'form-group';
  const passwordLabel = document.createElement('label');
  passwordLabel.textContent = 'Password';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.required = true;
  passwordInput.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
  passwordGroup.appendChild(passwordLabel);
  passwordGroup.appendChild(passwordInput);
  form.appendChild(passwordGroup);

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary w-full';
  submitBtn.textContent = 'Sign In';
  form.appendChild(submitBtn);

  // Error display
  const errorEl = document.createElement('div');
  errorEl.className = 'mt-4 text-center text-sm';
  errorEl.style.cssText = 'color:var(--danger);display:none;';
  form.appendChild(errorEl);

  // --- Submit handler ---
  let loading = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loading) return;

    const email = emailInput.value;
    const password = passwordInput.value;

    // Clear error & set loading
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    loading = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      // Try _superusers first, then users collection
      try {
        await pb.collection('_superusers').authWithPassword(email, password);
      } catch {
        await pb.collection('users').authWithPassword(email, password);
      }
      onSuccess();
    } catch (err) {
      errorEl.textContent = 'Invalid login credentials.';
      errorEl.style.display = '';
    } finally {
      loading = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });

  card.appendChild(form);
  container.appendChild(card);

  return {
    destroy() {
      container.innerHTML = '';
    },
  };
}
