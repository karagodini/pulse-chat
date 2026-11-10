import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { AuthScreen } from './components/AuthScreen';
import { Messenger } from './components/Messenger';
import { api, refreshSession } from './lib/api';
import { useAuth, useToasts, useUi } from './lib/stores';

export function App() {
  const user = useAuth((state) => state.user);
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    refreshSession().finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="boot">Pulse</div>;

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <AuthScreen mode="login" />}
        />
        <Route
          path="/register"
          element={user ? <Navigate to="/" replace /> : <AuthScreen mode="register" />}
        />
        <Route path="/invite/:token" element={<InviteAccept />} />
        <Route path="/*" element={user ? <Messenger /> : <Navigate to="/login" replace />} />
      </Routes>
      <div className="toasts">
        {toasts.map((toast) => (
          <button key={toast.id} type="button" onClick={() => dismiss(toast.id)}>
            {toast.text}
          </button>
        ))}
      </div>
    </>
  );
}

function InviteAccept() {
  const { token } = useParams();
  const user = useAuth((state) => state.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setWorkspaceId = useUi((state) => state.setWorkspaceId);
  const push = useToasts((state) => state.push);

  useEffect(() => {
    if (!token) return;
    if (!user) {
      sessionStorage.setItem('pulse.invite', token);
      navigate('/login');
      return;
    }
    api<{ workspaceId: string }>(`/api/invites/${token}/accept`, { method: 'POST' })
      .then(async (result) => {
        setWorkspaceId(result.workspaceId);
        await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        navigate('/');
      })
      .catch((error: Error) => {
        push(error.message);
        navigate('/');
      });
  }, [token, user, navigate, queryClient, setWorkspaceId, push]);

  return <div className="boot">Pulse</div>;
}
