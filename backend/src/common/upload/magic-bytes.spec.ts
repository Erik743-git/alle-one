import {
  detectUploadKind,
  mimeMatchesMagicBytes,
} from './magic-bytes';
import {
  assertAllowedUpload,
  assertInventoryImportUpload,
} from '../upload.config';

describe('magic-bytes / upload validation', () => {
  const pdf = Buffer.from('%PDF-1.4 sample');
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

  it('detecta PDF, PNG, JPEG e ZIP', () => {
    expect(detectUploadKind(pdf)).toBe('pdf');
    expect(detectUploadKind(png)).toBe('png');
    expect(detectUploadKind(jpeg)).toBe('jpeg');
    expect(detectUploadKind(zip)).toBe('zip');
  });

  it('rejeita MIME mentiroso (exe como PDF)', () => {
    expect(mimeMatchesMagicBytes('application/pdf', exe)).toBe(false);
    expect(() =>
      assertAllowedUpload({ mimetype: 'application/pdf', buffer: exe }),
    ).toThrow(/não corresponde/);
  });

  it('aceita PDF e imagem coerentes', () => {
    expect(() =>
      assertAllowedUpload({ mimetype: 'application/pdf', buffer: pdf }),
    ).not.toThrow();
    expect(() =>
      assertAllowedUpload({ mimetype: 'image/png', buffer: png }),
    ).not.toThrow();
  });

  it('valida import inventário como xlsx (ZIP)', () => {
    expect(() =>
      assertInventoryImportUpload({
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: zip,
      }),
    ).not.toThrow();
    expect(() =>
      assertInventoryImportUpload({
        mimetype: 'application/pdf',
        buffer: pdf,
      }),
    ).toThrow(/Excel/);
  });
});
