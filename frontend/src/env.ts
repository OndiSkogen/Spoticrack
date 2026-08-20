export function isLocalHost(hostname: string = window.location.hostname): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
