/** Credenciais demo nunca aparecem em produção, mesmo com SHOW_DEMO_CREDENTIALS. */
export function shouldShowDemoCredentials(env: {
  NODE_ENV?: string;
  SHOW_DEMO_CREDENTIALS?: string;
}): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.SHOW_DEMO_CREDENTIALS === "true";
}
