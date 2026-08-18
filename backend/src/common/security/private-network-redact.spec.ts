import {
  isPrivateIpv4,
  redactPrivateNetworkFields,
} from './private-network-redact';

describe('private-network-redact', () => {
  it('reconhece RFC1918 e loopback', () => {
    expect(isPrivateIpv4('10.2.0.4')).toBe(true);
    expect(isPrivateIpv4('192.168.1.1')).toBe(true);
    expect(isPrivateIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
  });

  it('remove IP privado de hosts Zabbix sem alterar hostname', () => {
    const out = redactPrivateNetworkFields({
      name: 'fw-alle',
      interfaces: [{ ip: '10.2.0.4', dns: 'fw.local' }],
    });
    expect(out.name).toBe('fw-alle');
    expect(out.interfaces[0].ip).toBe('');
    expect(out.interfaces[0].dns).toBe('fw.local');
  });
});
