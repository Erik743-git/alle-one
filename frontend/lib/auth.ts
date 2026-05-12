export const publicRoutes = ["/login", "/primeiro-acesso", "/redefinir-senha"];

export function isPublicRoute(pathname: string) {
  return publicRoutes.includes(pathname);
}