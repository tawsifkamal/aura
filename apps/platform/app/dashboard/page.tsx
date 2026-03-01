"use client";

import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function Dashboard() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/sign-in");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Glimpse</h1>
          <span className={styles.subtitle}>0 recordings</span>
        </div>
        <button
          className={styles.signOutButton}
          onClick={handleSignOut}
          type="button"
        >
          Sign out
        </button>
      </header>

      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No recordings yet</p>
        <p>
          Run <code>/record-demo</code> or open a PR to generate a demo
          video.
        </p>
      </div>
    </div>
  );
}
