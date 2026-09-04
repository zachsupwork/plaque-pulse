import { useEffect, useState } from "react";
import { nfcSession, type NfcSessionState } from "@/lib/nfc-client";

/**
 * Live view of the single global NFC session, plus automatic teardown when the
 * component (or route) goes away — no scan ever survives a navigation.
 */
export function useNfcSession() {
  const [state, setState] = useState<NfcSessionState>({ operation: "idle", status: "idle", busy: false });

  useEffect(() => {
    const unsubscribe = nfcSession.subscribe(setState);
    return () => {
      unsubscribe();
      nfcSession.stop();
    };
  }, []);

  return { ...state, cancel: () => nfcSession.cancel() };
}
