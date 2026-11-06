import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./styles/styles.css"
import "./styles/plugguard-dashboard.css"
import "./styles/auth-page.css"
import "./styles/overrides.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
