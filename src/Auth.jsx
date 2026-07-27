import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin(data.session);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Conta criada! Verifique seu e-mail para confirmar antes de entrar.");
      }
    } catch (err) {
      setError(err.message || "Algo deu errado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#FDF4F7", fontFamily: "'Inter', sans-serif", padding: 20,
    }}>
      <style>{`
        .auth-field:focus-visible { outline: 2px solid #AF486A; outline-offset: 2px; border-color: #AF486A; }
        .auth-btn:focus-visible { outline: 2px solid #AF486A; outline-offset: 2px; }
      `}</style>
      <form onSubmit={handleSubmit} style={{
        background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 380,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 800, fontSize: 24, color: "#4A3841", marginBottom: 4 }}>
          Organização Financeira
        </div>
        <div style={{ fontSize: 13, color: "#80646D", marginBottom: 10 }}>
          {mode === "login" ? "Entre na sua conta" : "Crie sua conta"}
        </div>

        <label htmlFor="auth-email" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>E-mail</label>
        <input
          id="auth-email" className="auth-field"
          type="email" placeholder="E-mail" value={email} required autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          style={{ border: "1px solid #F3DCE6", borderRadius: 10, padding: "12px 12px", minHeight: 44, fontSize: 14, boxSizing: "border-box" }}
        />
        <label htmlFor="auth-password" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Senha</label>
        <input
          id="auth-password" className="auth-field"
          type="password" placeholder="Senha" value={password} required minLength={6} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          style={{ border: "1px solid #F3DCE6", borderRadius: 10, padding: "12px 12px", minHeight: 44, fontSize: 14, boxSizing: "border-box" }}
        />

        {error && <div role="alert" style={{ color: "#C1554A", fontSize: 13 }}>{error}</div>}
        {info && <div role="status" style={{ color: "#3F8F63", fontSize: 13 }}>{info}</div>}

        <button type="submit" disabled={loading} className="auth-btn" style={{
          background: "#AF486A", color: "#fff", border: "none", borderRadius: 999,
          padding: "12px 0", minHeight: 44, fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}>
          {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}
        </button>

        <button
          type="button"
          className="auth-btn"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}
          style={{ background: "none", border: "none", color: "#AF486A", fontSize: 13, cursor: "pointer", marginTop: 4, minHeight: 44 }}
        >
          {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
