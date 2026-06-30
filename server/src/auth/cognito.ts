import { createHmac, randomUUID } from 'node:crypto';
import {
  AuthFlowType,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  type InitiateAuthCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getClient(): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({
    region: requireEnv('AWS_REGION'),
    credentials: {
      accessKeyId: requireEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('AWS_SECRET_ACCESS_KEY'),
    },
  });
}

function getClientId(): string {
  return requireEnv('COGNITO_CLIENT_ID');
}

function getClientSecret(): string | undefined {
  const secret = process.env.COGNITO_CLIENT_SECRET?.trim();
  return secret || undefined;
}

function secretHash(username: string): string | undefined {
  const clientSecret = getClientSecret();
  if (!clientSecret) return undefined;

  return createHmac('sha256', clientSecret)
    .update(username + getClientId())
    .digest('base64');
}

function toAuthTokens(
  result: InitiateAuthCommandOutput,
  fallbackRefreshToken?: string,
): AuthTokens {
  const auth = result.AuthenticationResult;
  if (!auth?.AccessToken || !auth.IdToken || !auth.ExpiresIn) {
    throw new Error('Authentication did not return tokens');
  }

  const refreshToken = auth.RefreshToken ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error('Authentication did not return tokens');
  }

  return {
    accessToken: auth.AccessToken,
    idToken: auth.IdToken,
    refreshToken,
    expiresIn: auth.ExpiresIn,
  };
}

function mapCognitoError(error: unknown): string {
  const err = error as Error & { name?: string };
  const name = err?.name ?? '';
  const message = err?.message?.trim() ?? '';

  switch (name) {
    case 'UsernameExistsException':
      return 'An account with this email already exists';
    case 'InvalidPasswordException':
      return message || 'Password does not meet the requirements';
    case 'InvalidParameterException':
      if (message.includes('Password did not conform')) {
        return message.replace(/^Password did not conform with policy:\s*/i, 'Password policy: ');
      }
      return message || 'Invalid sign-up details';
    case 'CodeMismatchException':
      return 'Invalid verification code';
    case 'ExpiredCodeException':
      return 'Verification code has expired';
    case 'UserNotFoundException':
      return 'No account found for this email';
    case 'UserNotConfirmedException':
      return 'Please verify your email before signing in';
    case 'NotAuthorizedException':
      if (message.includes('SECRET_HASH')) {
        return 'Server auth misconfiguration: app client secret is required';
      }
      return message || 'Incorrect email or password';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
      return 'Too many attempts. Please try again later';
    default:
      return message || 'Authentication failed';
  }
}

export async function signUp(
  email: string,
  password: string,
): Promise<{ cognitoUsername: string }> {
  const client = getClient();
  const clientId = getClientId();
  const cognitoUsername = randomUUID();
  const hash = secretHash(cognitoUsername);

  try {
    await client.send(
      new SignUpCommand({
        ClientId: clientId,
        Username: cognitoUsername,
        Password: password,
        SecretHash: hash,
        UserAttributes: [{ Name: 'email', Value: email }],
      }),
    );
    return { cognitoUsername };
  } catch (error) {
    throw new Error(mapCognitoError(error));
  }
}

export async function confirmSignUp(cognitoUsername: string, code: string): Promise<void> {
  const client = getClient();
  const clientId = getClientId();
  const hash = secretHash(cognitoUsername);

  try {
    await client.send(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: cognitoUsername,
        ConfirmationCode: code.trim(),
        SecretHash: hash,
      }),
    );
  } catch (error) {
    throw new Error(mapCognitoError(error));
  }
}

export async function resendConfirmationCode(cognitoUsername: string): Promise<void> {
  const client = getClient();
  const clientId = getClientId();
  const hash = secretHash(cognitoUsername);

  try {
    await client.send(
      new ResendConfirmationCodeCommand({
        ClientId: clientId,
        Username: cognitoUsername,
        SecretHash: hash,
      }),
    );
  } catch (error) {
    throw new Error(mapCognitoError(error));
  }
}

export async function signIn(email: string, password: string): Promise<AuthTokens> {
  const client = getClient();
  const clientId = getClientId();
  const hash = secretHash(email);

  try {
    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          ...(hash ? { SECRET_HASH: hash } : {}),
        },
      }),
    );

    return toAuthTokens(result);
  } catch (error) {
    throw new Error(mapCognitoError(error));
  }
}

export async function refreshSession(refreshToken: string): Promise<AuthTokens> {
  const client = getClient();
  const clientId = getClientId();

  try {
    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      }),
    );

    const tokens = toAuthTokens(result, refreshToken);
    return tokens;
  } catch (error) {
    throw new Error(mapCognitoError(error));
  }
}

export async function signOut(accessToken: string): Promise<void> {
  const client = getClient();

  try {
    await client.send(
      new GlobalSignOutCommand({
        AccessToken: accessToken,
      }),
    );
  } catch {
    // Client session is cleared even if the token was already invalid.
  }
}

export async function getEmailFromAccessToken(accessToken: string): Promise<string> {
  const result = await getClient().send(
    new GetUserCommand({
      AccessToken: accessToken,
    }),
  );

  const email = result.UserAttributes?.find((attr) => attr.Name === 'email')?.Value;
  if (!email) {
    throw new Error('Could not read account email');
  }

  return email.toLowerCase();
}
