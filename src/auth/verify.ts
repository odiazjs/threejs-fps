import '../styles/pages.css';
import { apiConfirmSignUp, apiResendCode } from './authApi';
import {
  clearPendingAuth,
  createSession,
  getPendingAuth,
  getSession,
  saveSession,
} from './playerSession';

const verifyEmailEl = document.getElementById('verify-email') as HTMLElement;
const verifyForm = document.getElementById('verify-form') as HTMLFormElement;
const verifyCode = document.getElementById('verify-code') as HTMLInputElement;
const verifySubmit = document.getElementById('verify-submit') as HTMLButtonElement;
const verifyResend = document.getElementById('verify-resend') as HTMLButtonElement;
const verifyError = document.getElementById('verify-error') as HTMLElement;
const verifyStatus = document.getElementById('verify-status') as HTMLElement;

const pending = getPendingAuth();
if (!pending) {
  window.location.replace('/');
} else {
  verifyEmailEl.textContent = pending.email;
  document.body.hidden = false;
}

verifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pending) return;

  verifyError.textContent = '';
  verifyStatus.textContent = '';
  verifySubmit.disabled = true;
  verifySubmit.textContent = 'VERIFYING...';

  try {
    const result = await apiConfirmSignUp(
      pending.email,
      pending.cognitoUsername,
      verifyCode.value,
      pending.password,
    );
    saveSession(createSession(result.email, result.tokens, getSession()));
    clearPendingAuth();
    window.location.href = '/lobby.html';
  } catch (error) {
    verifyError.textContent = error instanceof Error ? error.message : 'Verification failed';
    verifySubmit.disabled = false;
    verifySubmit.textContent = 'VERIFY & PLAY';
  }
});

verifyResend.addEventListener('click', async () => {
  if (!pending) return;

  verifyError.textContent = '';
  verifyStatus.textContent = '';
  verifyResend.disabled = true;

  try {
    await apiResendCode(pending.cognitoUsername);
    verifyStatus.textContent = 'A new code was sent to your email.';
  } catch (error) {
    verifyError.textContent = error instanceof Error ? error.message : 'Could not resend code';
  } finally {
    verifyResend.disabled = false;
  }
});
