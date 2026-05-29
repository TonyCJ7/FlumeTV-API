export function trimmedOrFallback(trimmed: string, fallback: string): string {
  return trimmed.length > 0 ? trimmed : fallback;
}

export function getXtremeCompleteBaseUrl(url: string, username: string, password: string): string {
  return `${url}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
}
