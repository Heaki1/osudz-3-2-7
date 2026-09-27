export function parseProfileUrl(pathname: string): string | null {
  const match = new RegExp('^/player/(.+)$').exec(pathname);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function profileUrl(username: string): string {
  return '/player/' + encodeURIComponent(username);
}