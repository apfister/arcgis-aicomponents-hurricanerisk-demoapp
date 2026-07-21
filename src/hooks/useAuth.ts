import { useCallback, useEffect, useState } from "react";
import {
  checkSignInStatus,
  signIn as doSignIn,
  signOut as doSignOut,
  type SignedInUser,
} from "../utils/arcgisOnline";

export interface UseAuth {
  user: SignedInUser | null;
  status: "checking" | "signed-out" | "signed-in";
  signIn: () => Promise<void>;
  signOut: () => void;
}

/** Manages ArcGIS OAuth sign-in state. */
export function useAuth(): UseAuth {
  const [user, setUser] = useState<SignedInUser | null>(null);
  const [status, setStatus] = useState<UseAuth["status"]>("checking");

  useEffect(() => {
    let cancelled = false;
    checkSignInStatus().then((u) => {
      if (cancelled) return;
      setUser(u);
      setStatus(u ? "signed-in" : "signed-out");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    const u = await doSignIn();
    setUser(u);
    setStatus("signed-in");
  }, []);

  const signOut = useCallback(() => {
    doSignOut();
    setUser(null);
    setStatus("signed-out");
  }, []);

  return { user, status, signIn, signOut };
}
