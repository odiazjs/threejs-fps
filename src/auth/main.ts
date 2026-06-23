import '../styles/pages.css';
import { getSession, registerUsername } from '../auth/playerSession';

const form = document.getElementById('auth-form') as HTMLFormElement;
const input = document.getElementById('auth-username') as HTMLInputElement;
const button = document.getElementById('auth-submit') as HTMLButtonElement;
const errorEl = document.getElementById('auth-error') as HTMLElement;

const existing = getSession();
if (existing) {
  window.location.replace('/lobby.html');
} else {
  document.body.hidden = false;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = input.value.trim();
  if (!username) {
    errorEl.textContent = 'Enter a username';
    return;
  }

  errorEl.textContent = '';
  button.disabled = true;
  button.textContent = 'REGISTERING...';

  registerUsername(username);
  window.location.href = '/lobby.html';
});
