import { mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeUploadedBuffer } from './local-file.helper';

describe('local-file.helper', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'alleone-upload-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('cria diretórios e grava o buffer', async () => {
    const targetPath = join(tempDir, 'nested', 'file.bin');
    const payload = Buffer.from('conteudo-teste');

    await writeUploadedBuffer(targetPath, payload);

    const saved = await readFile(targetPath);
    expect(saved.equals(payload)).toBe(true);
  });
});
