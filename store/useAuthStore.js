import { create } from 'zustand';
import { authApi } from '../src/features/auth/services/authApi';

const useAuthStore = create((set) => ({
  // 1. Raw State
  isLogin: false,
  isChecking: true, // true until the initial /api/auth/me check resolves
  isSubmitting: false,
  needsSetup: false, // true when no one has created an account on this server yet
  hasRecoveryQuestion: false,
  error: null,

  // 2. Grouped Actions (Cleaner to import and call in components)
  actions: {
    checkSession: async () => {
      try {
        const { authenticated, needsSetup, hasRecoveryQuestion } = await authApi.me();
        set({
          isLogin: authenticated,
          needsSetup: !!needsSetup,
          hasRecoveryQuestion: !!hasRecoveryQuestion,
          isChecking: false,
        });
      } catch {
        set({ isLogin: false, isChecking: false });
      }
    },

    setup: async (password) => {
      set({ isSubmitting: true, error: null });
      try {
        const { hasRecoveryQuestion } = await authApi.setup(password);
        set({
          isLogin: true,
          needsSetup: false,
          hasRecoveryQuestion: !!hasRecoveryQuestion,
          isSubmitting: false,
        });
        return true;
      } catch (err) {
        set({ isSubmitting: false, error: err.message });
        return false;
      }
    },

    login: async (password) => {
      set({ isSubmitting: true, error: null });
      try {
        const { hasRecoveryQuestion } = await authApi.login(password);
        set({
          isLogin: true,
          hasRecoveryQuestion: !!hasRecoveryQuestion,
          isSubmitting: false,
        });
        return true;
      } catch (err) {
        set({ isSubmitting: false, error: err.message });
        return false;
      }
    },

    logout: async () => {
      try {
        await authApi.logout();
      } finally {
        set({ isLogin: false });
      }
    },

    recoveryQuestionSet: () => set({ hasRecoveryQuestion: true }),
  },
}));

export const useAuthActions = () => useAuthStore((state) => state.actions);

export default useAuthStore;
