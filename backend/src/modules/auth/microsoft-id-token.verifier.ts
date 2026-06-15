import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type MicrosoftIdTokenClaims = JWTPayload & {
  oid?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
  email_verified?: boolean;
};

export async function verifyMicrosoftIdToken(
  idToken: string,
  tenantId: string,
  clientId: string,
): Promise<MicrosoftIdTokenClaims> {
  const tenant = tenantId.trim() || 'common';
  const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/discovery/v2.0/keys`),
  );

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: clientId,
  });

  return payload as MicrosoftIdTokenClaims;
}

export function microsoftEmailVerified(claims: MicrosoftIdTokenClaims): boolean {
  if (claims.email_verified === true) {
    return true;
  }
  // Contas corporativas M365 costumam omitir o claim; Graph /me confirma o tenant.
  if (claims.email_verified === false) {
    return false;
  }
  const tenant = process.env.MICROSOFT_OAUTH_TENANT_ID?.trim();
  if (tenant && tenant !== 'common' && tenant !== 'consumers') {
    return true;
  }
  return false;
}
