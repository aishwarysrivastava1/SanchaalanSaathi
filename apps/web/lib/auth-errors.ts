export function authErrorCode(err: unknown): string {
  return (err as { code?: string })?.code ?? "";
}

export function authErrorMessage(err: unknown): string {
  const code = authErrorCode(err);
  if (code === "auth/popup-in-flight") return "Sign-in already in progress. Please wait.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in window was closed. Please try again.";
  if (code === "auth/cancelled-popup-request") return "Another sign-in request is in progress. Please wait.";
  if (code === "auth/popup-blocked") return "Popup blocked by your browser. Allow popups for this site and try again.";
  if (code === "auth/unauthorized-domain") return "This domain is not authorized in Firebase Authentication settings.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  if (code === "auth/redirect-started") return "Redirecting to Google sign-in...";

  const msg = (err as Error)?.message ?? "";
  if (msg.toLowerCase().includes("timeout")) return "Request timed out. Please try again.";
  return msg || "Sign-in failed. Please try again.";
}

export function isDismissedPopupError(err: unknown): boolean {
  const code = authErrorCode(err);
  return code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request";
}
