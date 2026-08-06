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
      <App />
      <div style={{
        display: "flex", justifyContent: "center", padding: "24px 18px 40px",
      }}>
        <button
          onClick={() => supabase.auth.signOut()}
          aria-label="Sair da conta"
          style={{
            background: "#fff", border: "1px solid #F3DCE6", borderRadius: 999,
            padding: "10px 24px", minHeight: 44, fontSize: 13, fontFamily: "sans-serif",
            cursor: "pointer", color: "#4A3841", fontWeight: 600,
          }}
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);