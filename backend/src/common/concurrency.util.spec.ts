import { mapWithConcurrency } from './concurrency.util';

describe('mapWithConcurrency', () => {
  it('preserva ordem dos resultados', async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('retorna array vazio para entrada vazia', async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });
});
