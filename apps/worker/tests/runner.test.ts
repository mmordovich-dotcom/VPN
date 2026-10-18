import { it, expect, vi } from 'vitest';
import { runTasks } from '../src/runner.js';
it('runs supplied tasks in order and respects cancellation', async () => {
  const controller = new AbortController(); const second = vi.fn();
  await runTasks([{ name: 'one', run: async () => { controller.abort(); } }, { name: 'two', run: second }], controller.signal);
  expect(second).not.toHaveBeenCalled();
});
