export function resolveWorkflowMedia(path: string, acuUrl: string): { uri: string; local: boolean } {
  path = path.trim();
  if (!path) throw new Error("Workflow media path is empty.");
  if (/^(file|content):\/\//i.test(path)) return { uri: path, local: true };
  if (/^\/(?!\/|api(?:\/|$))/.test(path)) return { uri: `file://${path}`, local: true };
  const uri = new URL(path, `${acuUrl.replace(/\/+$/, "")}/`);
  if (uri.protocol !== "http:" && uri.protocol !== "https:")
    throw new Error("Workflow media must use HTTP(S) or a robot-local file path.");
  return { uri: uri.href, local: false };
}
