import type { Express, Response } from 'express';
import { validatePasswordAgainstPolicy } from '../../../shared/auth/passwordPolicy.js';
import {
  confirmSignUp,
  refreshSession,
  resendConfirmationCode,
  signIn,
  signOut,
  signUp,
} from './cognito.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readPassword(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

function validateEmail(email: string): string | null {
  if (!email) return 'Email is required';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address';
  return null;
}

function validatePassword(password: string): string | null {
  return validatePasswordAgainstPolicy(password);
}

function validateLoginPassword(password: string): string | null {
  if (!password) return 'Password is required';
  return null;
}

export function registerAuthRoutes(app: Express): void {
  app.post('/api/auth/signup', async (req, res) => {
    const email = readString(req.body, 'email').toLowerCase();
    const password = readPassword(req.body, 'password');
    const confirmPassword = readPassword(req.body, 'confirmPassword');

    const emailError = validateEmail(email);
    if (emailError) return sendError(res, 400, emailError);

    const passwordError = validatePassword(password);
    if (passwordError) return sendError(res, 400, passwordError);

    if (password !== confirmPassword) {
      return sendError(res, 400, 'Passwords do not match');
    }

    try {
      const { cognitoUsername } = await signUp(email, password);
      res.json({ success: true, email, cognitoUsername });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Sign up failed');
    }
  });

  app.post('/api/auth/confirm', async (req, res) => {
    const email = readString(req.body, 'email').toLowerCase();
    const cognitoUsername = readString(req.body, 'cognitoUsername');
    const code = readString(req.body, 'code');
    const password = readPassword(req.body, 'password');

    const emailError = validateEmail(email);
    if (emailError) return sendError(res, 400, emailError);
    if (!cognitoUsername) return sendError(res, 400, 'Sign-up session expired. Please sign up again.');
    if (!code) return sendError(res, 400, 'Verification code is required');

    const passwordError = validatePassword(password);
    if (passwordError) return sendError(res, 400, passwordError);

    try {
      await confirmSignUp(cognitoUsername, code);
      const tokens = await signIn(email, password);
      res.json({ success: true, email, tokens });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Verification failed');
    }
  });

  app.post('/api/auth/resend-code', async (req, res) => {
    const cognitoUsername = readString(req.body, 'cognitoUsername');
    if (!cognitoUsername) return sendError(res, 400, 'Sign-up session expired. Please sign up again.');

    try {
      await resendConfirmationCode(cognitoUsername);
      res.json({ success: true });
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'Could not resend code');
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = readString(req.body, 'email').toLowerCase();
    const password = readPassword(req.body, 'password');

    const emailError = validateEmail(email);
    if (emailError) return sendError(res, 400, emailError);
    const passwordError = validateLoginPassword(password);
    if (passwordError) return sendError(res, 400, passwordError);

    try {
      const tokens = await signIn(email, password);
      res.json({ success: true, email, tokens });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      const needsVerification = message.includes('verify your email');
      res.status(needsVerification ? 403 : 401).json({
        error: message,
        needsVerification,
      });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    const refreshToken = readString(req.body, 'refreshToken');
    if (!refreshToken) return sendError(res, 400, 'Refresh token is required');

    try {
      const tokens = await refreshSession(refreshToken);
      res.json({ success: true, tokens });
    } catch (error) {
      sendError(res, 401, error instanceof Error ? error.message : 'Session expired');
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const accessToken = readString(req.body, 'accessToken');
    if (accessToken) {
      try {
        await signOut(accessToken);
      } catch {
        // Ignore — client clears local session regardless.
      }
    }
    res.json({ success: true });
  });
}

