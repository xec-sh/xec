import { appendFileSync } from 'node:fs';
import { KubernetesAdapter } from './src/adapters/kubernetes/index.js';
const say = (m: string) => appendFileSync('.p.log', m + '\n');

const adapter = new KubernetesAdapter({ throwOnNonZeroExit: false, kubeconfig: '/tmp/xec-kubecfg' });
const r = await adapter.execute({
  command: 'echo',
  args: ['web-1 ready'],
  adapterOptions: { type: 'kubernetes', pod: 'web-1' } as any,
});
say(`exit=${r.exitCode} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr.slice(0,220))}`);
say('DONE');
