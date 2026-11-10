import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/stores';

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const setSession = useAuth((state) => state.setSession);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const session = await api<{
        accessToken: string;
        user: Parameters<typeof setSession>[0]['user'];
      }>(path, { method: 'POST', body: JSON.stringify(payload) }, false);
      setSession(session);
      const invite = sessionStorage.getItem('pulse.invite');
      if (invite) {
        sessionStorage.removeItem('pulse.invite');
        navigate(`/invite/${invite}`);
        return;
      }
      navigate('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <div className="rings" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="brand">Pulse</p>
        <h1>The work, still in one thread.</h1>
        <p className="lede">
          Channels, direct messages, and the context around a decision. Quiet enough to read, live
          enough to trust.
        </p>
      </section>
      <section className="auth-panel">
        <form onSubmit={onSubmit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          {mode === 'register' && (
            <>
              <label>
                Name
                <input name="name" autoComplete="name" required minLength={2} />
              </label>
              <label>
                Handle
                <input
                  name="handle"
                  autoComplete="username"
                  required
                  pattern="[a-zA-Z][a-zA-Z0-9_]{2,20}"
                />
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={10}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="primary" disabled={pending}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          {mode === 'login' ? (
            <p className="switch">
              New to Pulse? <Link to="/register">Create an account</Link>
            </p>
          ) : (
            <p className="switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
