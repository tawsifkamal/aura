"use client";

import { useState } from "react";
import styles from "./page.module.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (username === "admin" && password === "password123") {
      setStatus("success");
    } else {
      setStatus("error");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>A</span>
        </div>
        <h1 className={styles.heading}>Sign in to Aura</h1>
        <p className={styles.subheading}>Welcome back — let&apos;s pick up where you left off.</p>

        {status === "success" && (
          <div id="success-banner" className={styles.bannerSuccess}>
            ✓ Authentication successful! Welcome, {username}.
          </div>
        )}
        {status === "error" && (
          <div id="error-banner" className={styles.bannerError}>
            ✕ Invalid username or password. Please try again.
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} id="login-form">
          <div className={styles.field}>
            <label htmlFor="username" className={styles.label}>
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="off"
              placeholder="e.g. admin"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="off"
              placeholder="••••••••"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button id="sign-in-button" type="submit" className={styles.button}>
            Sign In
          </button>
        </form>

        <p className={styles.hint}>
          Hint: use <code>admin</code> / <code>password123</code>
        </p>
      </div>
    </div>
  );
}
