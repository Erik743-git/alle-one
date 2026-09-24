export const publicRoutes = [
  "/login",
  "/primeiro-acesso",
  "/redefinir-senha",
  "/esqueci-senha",
];

/**
 * Links de pesquisa que o cliente abre pelo e-mail, sem login: o token do
 * caminho identifica a pesquisa. Sem isto a tela mandava para o login.
 */
export const publicRoutePrefixes = ["/satisfacao/", "/nps/"];

export function isPublicRoute(pathname: string) {
  return (
    publicRoutes.includes(pathname) ||
    publicRoutePrefixes.some((prefixo) => pathname.startsWith(prefixo))
  );
}
