import { useEffect, useState } from "react";

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function useSessionId(): string {
  const [sessionId, setSessionId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem("askmydocs_session_id");

    if (!id) {
      id = generateSessionId();
      localStorage.setItem("askmydocs_session_id", id);
    }

    setSessionId(id);
  }, []);

  return sessionId;
}