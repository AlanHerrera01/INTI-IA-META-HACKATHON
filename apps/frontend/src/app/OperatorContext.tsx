import { useState, type ReactNode } from "react";
import { OperatorContext } from "../hooks/useOperator";
export function OperatorProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState("");
  const [notice, notify] = useState("");
  return (
    <OperatorContext.Provider value={{ token, setToken, notice, notify }}>
      {children}
    </OperatorContext.Provider>
  );
}
