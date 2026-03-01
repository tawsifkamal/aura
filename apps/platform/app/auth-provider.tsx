"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSession, type Session } from "./api-client";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  session: Session | null;
}

const AuthContext = createContext<AuthState>({
  loading: true,
  authenticated: false,
  session: null,
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    loading: true,
    authenticated: false,
    session: null,
  });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    getSession()
      .then((res) => {
        setState({
          loading: false,
          authenticated: res.authenticated,
          session: res.session,
        });

        if (!res.authenticated && !PUBLIC_PATHS.includes(pathname)) {
          router.replace("/sign-in");
        }
      })
      .catch(() => {
        setState({ loading: false, authenticated: false, session: null });
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.replace("/sign-in");
        }
      });
  }, [pathname, router]);

  return (
    <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
  );
}
