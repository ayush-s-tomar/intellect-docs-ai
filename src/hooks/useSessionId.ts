import { useState } from "react";

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function useSessionId(): string {
  const [sessionId] = useState<string>(() => {
    if (typeof window === "undefined") return "";

    let id = localStorage.getItem("askmydocs_session_id");

    if (!id) {
      id = generateSessionId();
      localStorage.setItem("askmydocs_session_id", id);
    }

    return id;
  });

  return sessionId;
}