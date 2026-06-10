/** Ordena por `name` (locale pt-BR), útil para listas de empresas/mesas. */
export function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
