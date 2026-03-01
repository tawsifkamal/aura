"use client";

import { getGitHubAuthUrl } from "../api-client";
import styles from "./page.module.css";

export default function SignIn() {
  function handleGitHubSignIn() {
    // After OAuth, backend redirects to /api/auth/callback which sets the platform cookie
    const callbackUrl = `${window.location.origin}/api/auth/callback`;
    window.location.href = getGitHubAuthUrl(callbackUrl);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>Connect your GitHub account</p>

        <button
          className={styles.submit}
          onClick={handleGitHubSignIn}
          type="button"
        >
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
