import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
export interface OperatorState {
  token: string;
  setToken: Dispatch<SetStateAction<string>>;
  notice: string;
  notify: Dispatch<SetStateAction<string>>;
}
export const OperatorContext = createContext<OperatorState | null>(null);
export function useOperator() {
  const shared = useContext(OperatorContext);
  const [token, setToken] = useState("");
  const [notice, notify] = useState("");
  return shared || { token, setToken, notice, notify };
}
