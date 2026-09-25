import { describe, it, expect } from 'vitest';
import { PROVIDERS_CONFIG, buildDerivWsUrls, resolveDerivAppId } from './providers.config';

describe('Deriv WS endpoints', () => {
  it('lists ws.derivws.com first and api.derivws.com as the fallback', () => {
    expect(PROVIDERS_CONFIG.deriv.wsEndpoints).toEqual([
      'wss://ws.derivws.com/websockets/v3',
      'wss://api.derivws.com/trading/v1/options/ws/public',
    ]);
  });

  it('buildDerivWsUrls keeps the priority order, appends app_id only to the first endpoint', () => {
    const appId = encodeURIComponent(resolveDerivAppId());
    expect(buildDerivWsUrls()).toEqual([
      `wss://ws.derivws.com/websockets/v3?app_id=${appId}`,
      'wss://api.derivws.com/trading/v1/options/ws/public',
    ]);
  });

  it('has a positive per-endpoint connect timeout so a hanging host cannot block the fallback', () => {
    expect(PROVIDERS_CONFIG.deriv.connectTimeoutMs).toBeGreaterThan(0);
  });
});
