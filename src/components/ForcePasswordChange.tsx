"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { passwordRuleStates } from "@/lib/password-policy";

/**
 * Écran de changement de mot de passe OBLIGATOIRE (correctif R2).
 * Affiché par page.tsx tant que user.mustChangePassword est vrai — aucune
 * autre partie de l'application n'est accessible.
 */
export default function ForcePasswordChange() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rules = passwordRuleStates(next);
  const canSubmit = current.length > 0 && next.length > 0 && confirm.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next, confirmPassword: confirm }),
      });
      // Rechargement complet : /api/auth/me renverra mustChangePassword=false
      // et l'application basculera sur l'écran normal.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du changement");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/20 border border-amber-400/30 rounded-2xl mb-4">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Mot de passe temporaire</h1>
          <p className="text-blue-300 mt-2 text-sm leading-relaxed">
            {user?.fullName}, pour sécuriser votre compte, vous devez définir
            un nouveau mot de passe avant d&apos;accéder à la plateforme.
          </p>
        </div>

        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Mot de passe actuel (temporaire)
              </label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoFocus
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full px-4 py-2.5 pr-11 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  aria-label={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className=" absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              <ul className="mt-2.5 space-y-1">
                {rules.map(({ rule, ok }) => (
                  <li key={rule.key} className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-gray-400"}`}>
                    {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={submitting}
                className={`w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 ${
                  confirm && confirm !== next ? "border-red-400" : "border-gray-300 dark:border-gray-700"
                }`}
              />
              {confirm && confirm !== next && (
                <p className="mt-1 text-xs text-red-500">Les deux saisies ne correspondent pas.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || (confirm !== next)}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              {submitting ? "Enregistrement…" : "Définir mon nouveau mot de passe"}
            </button>

            <button
              type="button"
              onClick={() => { void logout(); }}
              className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              <Lock className="w-3 h-3" /> Se déconnecter
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
