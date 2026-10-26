// Resend's sign-in sends the owner back here with a code and a state this builder made ("rs_…").
export function returned() {
  const q = new URLSearchParams(location.search);
  if (!q.get("state")?.startsWith("rs_")) return null;
  history.replaceState(null, "", "/admin#settings");
  return { code: q.get("code") ?? "", state: q.get("state")! };
}
