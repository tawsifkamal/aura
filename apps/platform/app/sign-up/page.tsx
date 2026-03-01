"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * GitHub OAuth doesn't require a separate sign-up flow.
 * Redirect to sign-in.
 */
export default function SignUp() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sign-in");
  }, [router]);

  return null;
}
