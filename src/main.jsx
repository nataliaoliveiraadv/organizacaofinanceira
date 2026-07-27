import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import App from "./App";
import "./index.css";

function Root() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div role="status" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#80646D" }}>
        Carregando...
      </div>
    );
  }

  if (!session) {
    return <Auth onLogin={setSession} />;
  }

  return (
    <div>
      <button
        onClick={() => supabase.auth.signOut()}
        aria-label="Sair da conta"
        style={{
          position: "fixed", top: 12, right: 12, zIndex: 999, background: "#fff", minHeight: 44,
          border: "1px solid #F3DCE6", borderRadius: 999, padding: "6px 14px",
          fontSize: 12, fontFamily: "sans-serif", cursor: "pointer", color: "#4A3841",
        }}
      >
        Sair
      </button>
      <App />
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);