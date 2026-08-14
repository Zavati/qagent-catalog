export function normalizePublicPathname(pathname: string): string {
  const publicPrefix = "/v1/catalog";

  if (pathname === publicPrefix || pathname === `${publicPrefix}/`) return "/";
  if (pathname.startsWith(`${publicPrefix}/`)) {
    return pathname.slice(publicPrefix.length) || "/";
  }

  return pathname;
}
