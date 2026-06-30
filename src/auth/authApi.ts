import { API_BASE_URL } from '../config/apiUrl';

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthErrorBody {
  error?: string;
  needsVerification?: boolean;
}

async function postJson<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as T & AuthErrorBody;
  if (!response.ok) {
    const error = new Error(data.error ?? 'Request failed') as Error & {
      needsVerification?: boolean;
      status?: number;
    };
    error.needsVerification = data.needsVerification;
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function apiSignUp(
  email: string,
  password: string,
  confirmPassword: string,
): Promise<{ email: string; cognitoUsername: string }> {
  return postJson('/api/auth/signup', { email, password, confirmPassword });
}

export async function apiConfirmSignUp(
  email: string,
  cognitoUsername: string,
  code: string,
  password: string,
): Promise<{ email: string; tokens: AuthTokens }> {
  return postJson('/api/auth/confirm', { email, cognitoUsername, code, password });
}

export async function apiResendCode(cognitoUsername: string): Promise<void> {
  await postJson('/api/auth/resend-code', { cognitoUsername });
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ email: string; tokens: AuthTokens }> {
  return postJson('/api/auth/login', { email, password });
}

export async function apiRefresh(refreshToken: string): Promise<AuthTokens> {
  const result = await postJson<{ tokens: AuthTokens }>('/api/auth/refresh', {
    refreshToken,
  });
  return result.tokens;
}

export async function apiLogout(accessToken: string): Promise<void> {
  await postJson('/api/auth/logout', { accessToken });
}
