import { apiLogin, apiSignUp } from './authApi';
import {
  passwordPolicyHint,
  validatePasswordAgainstPolicy,
} from '../../shared/auth/passwordPolicy';
import {
  clearPendingAuth,
  createSession,
  getPendingAuth,
  getSession,
  isSessionExpired,
  refreshSessionTokens,
  savePendingAuth,
  saveSession,
} from './playerSession';

const loginTab = document.getElementById('auth-tab-login') as HTMLButtonElement;
const signupTab = document.getElementById('auth-tab-signup') as HTMLButtonElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const signupForm = document.getElementById('signup-form') as HTMLFormElement;
const loginError = document.getElementById('login-error') as HTMLElement;
const signupError = document.getElementById('signup-error') as HTMLElement;
const loginSubmit = document.getElementById('login-submit') as HTMLButtonElement;
const signupSubmit = document.getElementById('signup-submit') as HTMLButtonElement;

function showLogin(): void {
  loginTab.classList.add('active');
  signupTab.classList.remove('active');
  loginForm.hidden = false;
  signupForm.hidden = true;
  loginError.textContent = '';
  signupError.textContent = '';
}

function showSignup(): void {
  signupTab.classList.add('active');
  loginTab.classList.remove('active');
  signupForm.hidden = false;
  loginForm.hidden = true;
  loginError.textContent = '';
  signupError.textContent = '';
}

loginTab.addEventListener('click', showLogin);
signupTab.addEventListener('click', showSignup);

async function bootstrap(): Promise<void> {
  const existing = getSession();
  if (existing) {
    if (isSessionExpired(existing)) {
      const refreshed = await refreshSessionTokens(existing);
      if (refreshed) {
        window.location.replace('/lobby.html');
        return;
      }
    } else {
      window.location.replace('/lobby.html');
      return;
    }
  }

  const pending = getPendingAuth();
  if (pending) {
    window.location.replace('/verify.html');
    return;
  }

  document.body.hidden = false;
}

void bootstrap();

const signupPolicyHint = document.getElementById('signup-policy-hint');
if (signupPolicyHint) {
  signupPolicyHint.textContent = passwordPolicyHint();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = (document.getElementById('login-email') as HTMLInputElement).value;
  const password = (document.getElementById('login-password') as HTMLInputElement).value;

  loginError.textContent = '';
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'SIGNING IN...';

  try {
    const result = await apiLogin(email, password);
    saveSession(createSession(result.email, result.tokens, getSession()));
    clearPendingAuth();
    window.location.href = '/lobby.html';
  } catch (error) {
    const err = error as Error & { needsVerification?: boolean };
    if (err.needsVerification) {
      loginError.textContent =
        'Please verify your email with the code we sent you. Use the sign-up flow if you still need to verify.';
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'SIGN IN';
      return;
    }
    loginError.textContent = err.message || 'Sign in failed';
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'SIGN IN';
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = (document.getElementById('signup-email') as HTMLInputElement).value;
  const password = (document.getElementById('signup-password') as HTMLInputElement).value;
  const confirmPassword = (document.getElementById('signup-confirm-password') as HTMLInputElement)
    .value;

  signupError.textContent = '';

  const passwordError = validatePasswordAgainstPolicy(password);
  if (passwordError) {
    signupError.textContent = passwordError;
    return;
  }

  if (password !== confirmPassword) {
    signupError.textContent = 'Passwords do not match';
    return;
  }

  signupSubmit.disabled = true;
  signupSubmit.textContent = 'CREATING...';

  try {
    const result = await apiSignUp(email, password, confirmPassword);
    savePendingAuth(email, password, result.cognitoUsername);
    window.location.href = '/verify.html';
  } catch (error) {
    signupError.textContent = error instanceof Error ? error.message : 'Sign up failed';
    signupSubmit.disabled = false;
    signupSubmit.textContent = 'CREATE ACCOUNT';
  }
});
