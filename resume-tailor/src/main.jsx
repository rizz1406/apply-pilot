import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Resume Tailor crashed", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <main style={{ minHeight: "100vh", boxSizing: "border-box", padding: 32, background: "#0f0a1e", color: "#f2eefc", fontFamily: "Inter, sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "60px auto", padding: 24, border: "1px solid rgba(255,255,255,.2)", borderRadius: 16, background: "rgba(255,255,255,.08)" }}>
        <h1 style={{ marginTop: 0 }}>Resume Tailor hit an error</h1>
        <p>Your data is still in this browser. Reload first; if the error returns, reset the saved app data and upload your resume again.</p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#ffb2a5", fontSize: 12 }}>{this.state.error?.message || "Unknown error"}</pre>
        <button onClick={() => location.reload()} style={{ padding: "9px 14px", marginRight: 8 }}>Reload</button>
        <button onClick={() => { Object.keys(localStorage).filter((key) => key.startsWith("resumeTailor.")).forEach((key) => localStorage.removeItem(key)); sessionStorage.clear(); location.reload(); }} style={{ padding: "9px 14px" }}>Reset app data</button>
      </div>
    </main>;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);
