import { resolveAuditClientIp, isTrustProxyEnabled } from './audit-client-ip';
import type { Request } from 'express';

describe('audit-client-ip', () => {
  const prev = process.env.TRUST_PROXY;

  afterEach(() => {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
  });

  function fakeReq(partial: {
    ip?: string;
    xff?: string;
    remote?: string;
  }): Request {
    return {
      ip: partial.ip,
      headers: partial.xff ? { 'x-forwarded-for': partial.xff } : {},
      socket: { remoteAddress: partial.remote },
    } as unknown as Request;
  }

  it('sem TRUST_PROXY ignora XFF e usa socket', () => {
    delete process.env.TRUST_PROXY;
    expect(isTrustProxyEnabled()).toBe(false);
    expect(
      resolveAuditClientIp(
        fakeReq({ xff: '1.2.3.4', remote: '10.0.0.8' }),
      ),
    ).toBe('10.0.0.8');
  });

  it('com TRUST_PROXY usa req.ip', () => {
    process.env.TRUST_PROXY = '1';
    expect(isTrustProxyEnabled()).toBe(true);
    expect(
      resolveAuditClientIp(
        fakeReq({ ip: '203.0.113.10', xff: '1.2.3.4', remote: '10.0.0.8' }),
      ),
    ).toBe('203.0.113.10');
  });
});
