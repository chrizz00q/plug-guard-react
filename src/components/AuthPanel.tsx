import { useState, type FormEvent } from "react"
import * as api from "../lib/api"

export function AuthPanel({
  onAuthenticated,
}: {
  onAuthenticated: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [error, setError] = useState("")
  const [working, setWorking] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setWorking(true)
    setError("")
    const data = new FormData(event.currentTarget)
    try {
      if (mode === "login") {
        await api.login(String(data.get("email")), String(data.get("password")))
      } else {
        await api.register(
          String(data.get("displayName")),
          String(data.get("email")),
          String(data.get("password")),
        )
      }
    } catch (caught) {
      setWorking(false)
      const code = caught instanceof api.ApiFailure ? caught.code : ""
      if (code === "NETWORK" || code === "DATABASE_UNAVAILABLE") {
        setError("The server is not reachable. Make sure Apache and MySQL are running in XAMPP.")
        return
      }
      setError(
        mode === "login"
          ? "Email or password was not recognized."
          : "The account could not be created. Use a unique email and a password of at least 10 characters.",
      )
      return
    }
    setWorking(false)
    await onAuthenticated()
  }

  return (
    <main className="auth-screen auth-screen--plain">
      <section className="auth-shell">
        <aside className="auth-visual auth-visual--page-left">
          <div className="auth-visual__glow" />
          <div className="auth-visual__brand">
            <span>
              <img
                alt=""
                height={40}
                src="/plugguard-logo.png"
                width={40}
              />
            </span>
            <div>
              <strong>PlugGuard</strong>
              <small>Electrical safety</small>
            </div>
          </div>
          <img
            alt=""
            aria-hidden="true"
            className="auth-visual__watermark"
            height={380}
            src="/plugguard-logo.png"
            width={380}
          />
          <div className="auth-visual__copy">
            <span>Always-on protection</span>
            <h2>Safety starts at the outlet.</h2>
            <p className="auth-visual__desktop-copy">
              Monitor live electrical load, heat, and urgent household alerts
              from one protected command center.
            </p>
            <p className="auth-visual__mobile-copy">
              Built to notice danger before you do.
            </p>
            <div className="auth-visual__status">
              <i />
              Encrypted hardware access
            </div>
          </div>
        </aside>

        <div className="auth-form-panel auth-form-panel--page-right">
          <div className="auth-form-panel__inner">
            <div className="auth-form-heading">
              <span>{mode === "login" ? "Welcome back" : "Get protected"}</span>
              <h1>{mode === "login" ? "Log in" : "Create account"}</h1>
              <p>
                {mode === "login"
                  ? "Enter your details to access your PlugGuard hardware."
                  : "Set up your household monitoring account in seconds."}
              </p>
            </div>

            <form className="auth-form" onSubmit={submit}>
              {mode === "register" && (
                <label>
                  <span>Display name</span>
                  <input
                    name="displayName"
                    placeholder="How should we address you?"
                    minLength={2}
                    required
                  />
                </label>
              )}
              <label>
                <span className="auth-label--email">Email address</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
              <label>
                <span className="auth-label--password">Password</span>
                <div className="auth-password">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    minLength={10}
                    placeholder="At least 10 characters"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                  />
                  <button
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {error && <p className="auth-error">{error}</p>}
              <button className="auth-primary" type="submit" disabled={working}>
                {working
                  ? "Authenticating…"
                  : mode === "login"
                    ? "Log in"
                    : "Sign up"}
              </button>
            </form>

            <div className="auth-divider">
              <span className="auth-divider__label">or continue with</span>
            </div>

            <button
              className="auth-google"
              type="button"
              onClick={() => {
                setError(
                  "Google sign-in is not configured in this standalone build. Use email and password.",
                )
              }}
          >
            <svg
              aria-hidden="true"
              className="auth-google__icon"
              viewBox="0 0 24 24"
            >
              <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.98-.9 6.63-2.35l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.63A10 10 0 0 0 12 22Z"
              />
              <path
                fill="#FBBC05"
                d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.45H3.04A10 10 0 0 0 2 12c0 1.64.39 3.19 1.04 4.55l3.35-2.63Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.63C7.18 7.7 9.39 5.94 12 5.94Z"
              />
            </svg>
            {mode === "login" ? "Log in" : "Sign up"} with Google
          </button>

            <p className="auth-switch">
              {mode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setError("")
                  setMode((current) =>
                    current === "login" ? "register" : "login",
                  )
                }}
              >
                {mode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
