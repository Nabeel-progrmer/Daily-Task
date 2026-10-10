import { useState } from "react";
import "./Auth.css";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignup = mode === "signup";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/auth/${isSignup ? "signup" : "login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        }
      );
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        throw new Error(
          "Authentication service is unavailable. Start the app with `npm run dev` from the Task project folder."
        );
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Authentication failed.");
      }

      onAuthenticated(result);
    } catch (requestError) {
      setError(
        requestError.message === "Failed to fetch"
          ? "Can't reach the server. Make sure the API is running."
          : requestError.message
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            ✓
          </span>
          <span>TaskFlow</span>
        </div>

        <div className="auth-heading">
          <p className="auth-eyebrow">YOUR DAY, IN GOOD ORDER</p>
          <h1 id="auth-title">
            {isSignup ? "Make room for what matters." : "Good to have you back."}
          </h1>
          <p>
            {isSignup
              ? "Create an account and get your plans in one clear place."
              : "Sign in to pick up right where you left off."}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={!isSignup ? "selected" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={isSignup ? "selected" : ""}
            onClick={() => {
              setMode("signup");
              setError("");
            }}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup && (
            <label>
              Name
              <input
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                required
                maxLength={80}
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              minLength={isSignup ? 8 : undefined}
              required
            />
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Please wait..."
              : isSignup
                ? "Create your account"
                : "Sign in"}
            {!isSubmitting && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="auth-footnote">
          Your account keeps your tasks private to you.
        </p>
      </section>

      <aside className="auth-aside" aria-label="TaskFlow planner">
        <div className="auth-aside-top">
          <span>PLAN WITH CLARITY</span>
          <span className="auth-live-dot">A calmer kind of productive</span>
        </div>
        <div className="auth-quote">
          <span className="auth-quote-mark" aria-hidden="true">
            “
          </span>
          <p>Small steps, thoughtfully planned, add up to meaningful days.</p>
        </div>
        <div className="auth-day-card">
          <div className="auth-day-heading">
            <div>
              <span>YOUR PLANNER</span>
              <strong>Make today count</strong>
            </div>
            <span className="auth-checkmark" aria-hidden="true">
              ✓
            </span>
          </div>
          <div className="auth-preview-task">
            <span className="auth-preview-check">✓</span>
            <span>Start with what matters</span>
            <small>09:00</small>
          </div>
          <div className="auth-preview-task">
            <span className="auth-preview-check empty" />
            <span>Leave a little room to breathe</span>
            <small>11:30</small>
          </div>
          <div className="auth-progress">
            <span />
          </div>
          <div className="auth-progress-caption">
            <span>One thing at a time</span>
            <span>01 / 02</span>
          </div>
        </div>
        <p className="auth-aside-footer">A little more intention. A lot more done.</p>
      </aside>
    </main>
  );
}