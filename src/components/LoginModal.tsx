import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldAlert, KeyRound } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (token: string, user: { username: string; name: string; role: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('nayeem');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('nayeem_desk_token', data.token);
      onLoginSuccess(data.token, data.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6 border-b border-zinc-100 bg-zinc-50">
          <div className="w-10 h-10 bg-zinc-900 text-white rounded flex items-center justify-center font-mono font-bold text-sm mb-3">
            ND
          </div>
          <h2 className="text-lg font-semibold text-zinc-950 tracking-tight">
            Nayeem AI Desk Authentication
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Restricted Admin Console for Muhammad Nayeem. Please enter your credentials to manage WhatsApp automation and personal memory.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Admin Username / Email
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-hidden focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 bg-white"
              placeholder="e.g. nayeem or your email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Admin Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-hidden focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950 bg-white"
              placeholder="Enter master password"
            />
          </div>

          <div className="p-3 bg-zinc-100/70 border border-zinc-200/80 rounded text-[11px] text-zinc-600 space-y-1">
            <div className="font-semibold text-zinc-800 flex items-center space-x-1">
              <KeyRound className="w-3 h-3" />
              <span>Accepted Credentials</span>
            </div>
            <div>Enter your configured master password or default password <code className="bg-zinc-200/80 px-1 py-0.5 rounded text-zinc-900 font-mono">ChangeMe_NayeemAdmin2026!</code>.</div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-xs rounded transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In to Admin Console</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
