export interface PasswordPolicy {
  readonly minLength: number;
  readonly requireLowercase: boolean;
  readonly requireUppercase: boolean;
  readonly requireNumber: boolean;
  readonly requireSymbol: boolean;
}

/** Matches the Cognito default password policy for new user pools. */
export const COGNITO_DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: true,
};

const LOWERCASE = /[a-z]/;
const UPPERCASE = /[A-Z]/;
const NUMBER = /[0-9]/;
/** Cognito counts anything outside [A-Za-z0-9] as a symbol. */
const SYMBOL = /[^A-Za-z0-9]/;

export function passwordPolicyHint(
  policy: PasswordPolicy = COGNITO_DEFAULT_PASSWORD_POLICY,
): string {
  const parts: string[] = [`At least ${policy.minLength} characters`];
  if (policy.requireLowercase) parts.push('a lowercase letter');
  if (policy.requireUppercase) parts.push('an uppercase letter');
  if (policy.requireNumber) parts.push('a number');
  if (policy.requireSymbol) parts.push('a symbol');
  return `${parts[0]} with ${parts.slice(1).join(', ')}`;
}

export function validatePasswordAgainstPolicy(
  password: string,
  policy: PasswordPolicy = COGNITO_DEFAULT_PASSWORD_POLICY,
): string | null {
  if (!password) return 'Password is required';
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters`;
  }
  if (policy.requireLowercase && !LOWERCASE.test(password)) {
    return 'Password must include a lowercase letter';
  }
  if (policy.requireUppercase && !UPPERCASE.test(password)) {
    return 'Password must include an uppercase letter';
  }
  if (policy.requireNumber && !NUMBER.test(password)) {
    return 'Password must include a number';
  }
  if (policy.requireSymbol && !SYMBOL.test(password)) {
    return 'Password must include a symbol (e.g. ! @ # $)';
  }
  return null;
}
