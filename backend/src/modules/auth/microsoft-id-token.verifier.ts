import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from 'jose';

export type MicrosoftIdTokenClaims = JWTPayload & {
  oid?: string;
  sub?: string;
  tid?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
  email_verified?: boolean;
};

const MICROSOFT_V2_ISSUER_RE =
  /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/i;

const MICROSOFT_COMMON_JWKS = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);

export function isMicrosoftV2Issuer(issuer: string | undefined): boolean {
  return Boolean(issuer && MICROSOFT_V2_ISSUER_RE.test(issuer));
}

export function assertMicrosoftTenantAllowed(
  tokenTenantId: string | undefined,
  configuredTenantId: string,
): void {
  const tenant = configuredTenantId.trim() || 'common';
  if (tenant === 'common' || tenant === 'organizations' || tenant === 'consumers') {
    return;
  }
  if (!tokenTenantId || tokenTenantId.toLowerCase() !== tenant.toLowerCase()) {
    throw new Error('microsoft_tenant_mismatch');
  }
}

export async function verifyMicrosoftIdToken(
  idToken: string,
  tenantId: string,
  clientId: string,
): Promise<MicrosoftIdTokenClaims> {
  const unverified = decodeJwt(idToken) as MicrosoftIdTokenClaims;
  const issuer = unverified.iss;

  if (!isMicrosoftV2Issuer(issuer)) {
    throw new Error('microsoft_invalid_issuer');
  }

  assertMicrosoftTenantAllowed(unverified.tid, tenantId);

  const { payload } = await jwtVerify(idToken, MICROSOFT_COMMON_JWKS, {
    issuer,
    audience: clientId,
  });

  return payload as MicrosoftIdTokenClaims;
}

export function microsoftEmailVerified(claims: MicrosoftIdTokenClaims): boolean {
  if (claims.email_verified === true) {
    return true;
  }
  if (claims.email_verified === false) {
    return false;
  }
  // Contas corporativas M365 costumam omitir email_verified; tid indica Azure AD.
  if (claims.tid) {
    return true;
  }
  const tenant = process.env.MICROSOFT_OAUTH_TENANT_ID?.trim();
  if (tenant && tenant !== 'common' && tenant !== 'consumers') {
    return true;
  }
  return false;
}
