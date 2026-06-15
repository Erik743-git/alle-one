import {
  assertMicrosoftTenantAllowed,
  isMicrosoftV2Issuer,
  microsoftEmailVerified,
} from './microsoft-id-token.verifier';

describe('isMicrosoftV2Issuer', () => {
  it('aceita issuer v2.0 do tenant', () => {
    expect(
      isMicrosoftV2Issuer(
        'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',
      ),
    ).toBe(true);
  });

  it('rejeita issuer common', () => {
    expect(
      isMicrosoftV2Issuer('https://login.microsoftonline.com/common/v2.0'),
    ).toBe(false);
  });
});

describe('assertMicrosoftTenantAllowed', () => {
  it('permite qualquer tenant quando configurado como common', () => {
    expect(() =>
      assertMicrosoftTenantAllowed('any-tenant-id', 'common'),
    ).not.toThrow();
  });

  it('exige tid quando tenant específico', () => {
    expect(() =>
      assertMicrosoftTenantAllowed(
        '11111111-2222-3333-4444-555555555555',
        '11111111-2222-3333-4444-555555555555',
      ),
    ).not.toThrow();

    expect(() =>
      assertMicrosoftTenantAllowed(
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        '11111111-2222-3333-4444-555555555555',
      ),
    ).toThrow('microsoft_tenant_mismatch');
  });
});

describe('microsoftEmailVerified', () => {
  it('aceita quando email_verified é true', () => {
    expect(microsoftEmailVerified({ email_verified: true })).toBe(true);
  });

  it('rejeita quando email_verified é false', () => {
    expect(microsoftEmailVerified({ email_verified: false })).toBe(false);
  });

  it('aceita conta Azure AD com tid', () => {
    expect(
      microsoftEmailVerified({
        tid: '11111111-2222-3333-4444-555555555555',
      }),
    ).toBe(true);
  });

  it('aceita tenant organizacional sem claim explícito', () => {
    const original = process.env.MICROSOFT_OAUTH_TENANT_ID;
    process.env.MICROSOFT_OAUTH_TENANT_ID = 'organizations';
    expect(microsoftEmailVerified({})).toBe(true);
    process.env.MICROSOFT_OAUTH_TENANT_ID = original;
  });

  it('rejeita tenant common sem tid nem claim', () => {
    const original = process.env.MICROSOFT_OAUTH_TENANT_ID;
    process.env.MICROSOFT_OAUTH_TENANT_ID = 'common';
    expect(microsoftEmailVerified({})).toBe(false);
    process.env.MICROSOFT_OAUTH_TENANT_ID = original;
  });
});
