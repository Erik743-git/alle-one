import { microsoftEmailVerified } from './microsoft-id-token.verifier';

describe('microsoftEmailVerified', () => {
  it('aceita quando email_verified é true', () => {
    expect(microsoftEmailVerified({ email_verified: true })).toBe(true);
  });

  it('rejeita quando email_verified é false', () => {
    expect(microsoftEmailVerified({ email_verified: false })).toBe(false);
  });

  it('aceita tenant organizacional sem claim explícito', () => {
    const original = process.env.MICROSOFT_OAUTH_TENANT_ID;
    process.env.MICROSOFT_OAUTH_TENANT_ID = 'organizations';
    expect(microsoftEmailVerified({})).toBe(true);
    process.env.MICROSOFT_OAUTH_TENANT_ID = original;
  });

  it('rejeita tenant common sem claim', () => {
    const original = process.env.MICROSOFT_OAUTH_TENANT_ID;
    process.env.MICROSOFT_OAUTH_TENANT_ID = 'common';
    expect(microsoftEmailVerified({})).toBe(false);
    process.env.MICROSOFT_OAUTH_TENANT_ID = original;
  });
});
