import { describe, expect, it, afterEach } from '@jest/globals';
import { shouldRunScheduledJobs } from './should-run-scheduled-jobs';

describe('shouldRunScheduledJobs', () => {
  const original = process.env.NODE_APP_INSTANCE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NODE_APP_INSTANCE;
    } else {
      process.env.NODE_APP_INSTANCE = original;
    }
  });

  it('permite cron quando NODE_APP_INSTANCE não está definido', () => {
    delete process.env.NODE_APP_INSTANCE;
    expect(shouldRunScheduledJobs()).toBe(true);
  });

  it('permite cron na instância 0 do cluster', () => {
    process.env.NODE_APP_INSTANCE = '0';
    expect(shouldRunScheduledJobs()).toBe(true);
  });

  it('bloqueia cron nas demais instâncias', () => {
    process.env.NODE_APP_INSTANCE = '1';
    expect(shouldRunScheduledJobs()).toBe(false);
  });
});
