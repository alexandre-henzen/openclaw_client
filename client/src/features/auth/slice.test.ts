import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function freshModules() {
  vi.resetModules();
  const sliceMod = await import('./slice');
  const apiMod = await import('./api');
  const baseMod = await import('../../shared/api/baseApi');
  return { sliceMod, apiMod, baseMod };
}

function buildStore(
  reducer: (typeof import('./slice'))['default'],
  base: (typeof import('../../shared/api/baseApi'))['baseApi']
) {
  return configureStore({
    reducer: { auth: reducer, [base.reducerPath]: base.reducer },
    middleware: (gdm) => gdm().concat(base.middleware),
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('auth slice initial state', () => {
  it('starts unauthenticated when localStorage has no token', async () => {
    const { sliceMod, baseMod } = await freshModules();
    const store = buildStore(sliceMod.default, baseMod.baseApi);
    expect(store.getState().auth).toEqual({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  });

  it('hydrates token and isAuthenticated from localStorage', async () => {
    localStorage.setItem('token', 'persisted-jwt');
    const { sliceMod, baseMod } = await freshModules();
    const store = buildStore(sliceMod.default, baseMod.baseApi);
    expect(store.getState().auth.token).toBe('persisted-jwt');
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });
});

describe('login flow', () => {
  it('stores the user, persists the token and flags authentication', async () => {
    const { sliceMod, apiMod, baseMod } = await freshModules();
    const store = buildStore(sliceMod.default, baseMod.baseApi);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ id: '1', email: 'a@b.com', name: 'Alice', accessToken: 'jwt-123' })
      )
    );

    await store.dispatch(
      apiMod.authApi.endpoints.login.initiate({ email: 'a@b.com', password: 'pw' })
    );

    const auth = store.getState().auth;
    expect(auth.user).toEqual({ id: '1', email: 'a@b.com', name: 'Alice' });
    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBe('jwt-123');
    expect(auth.token).toBe('jwt-123');
  });
});

describe('logout', () => {
  it('logout action clears state and removes the persisted token', async () => {
    localStorage.setItem('token', 'jwt-123');
    const { sliceMod, baseMod } = await freshModules();
    const store = buildStore(sliceMod.default, baseMod.baseApi);

    store.dispatch(sliceMod.logout());

    const auth = store.getState().auth;
    expect(auth).toEqual({ user: null, token: null, isAuthenticated: false });
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('logout mutation fulfilled clears state and token', async () => {
    localStorage.setItem('token', 'jwt-123');
    const { sliceMod, apiMod, baseMod } = await freshModules();
    const store = buildStore(sliceMod.default, baseMod.baseApi);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await store.dispatch(apiMod.authApi.endpoints.logout.initiate());

    const auth = store.getState().auth;
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
  });
});
