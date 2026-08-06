const sp = await import(new URL('../../src/utils/sensitive-patterns.ts', import.meta.url).href);
const om = await import(new URL('../../src/utils/optimized-masker.ts', import.meta.url).href);

const CORPUS = [
  'apikey=s3cr3t', 'api_key=s3cr3t', 'api-key=s3cr3t',
  'accesstoken=s3cr3t', 'access_token=s3cr3t', 'access-token=s3cr3t',
  'authtoken=s3cr3t', 'auth_token=s3cr3t', 'authentication_token=s3cr3t',
  'privatekey=s3cr3t', 'private_key=s3cr3t', 'secretkey=s3cr3t', 'secret_key=s3cr3t',
  'awsaccesskeyid=AKIA1', 'aws_access_key_id=AKIA1', 'aws-access-key-id=AKIA1',
  'awssecretaccesskey=x', 'aws_secret_access_key=x', 'aws-secret-access-key=x',
  'githubtoken=x', 'github_token=x', 'github-token=x',
  'token=s3cr3t', 'password=hunter2', 'passwd=hunter2', 'pwd=hunter2',
  'secret=s3cr3t', 'clientsecret=s3cr3t', 'client_secret=s3cr3t', 'client-secret=s3cr3t',
  'api_key: s3cr3t', 'apikey : s3cr3t', 'api_key="s3 v"', "api_key='s3 v'",
  'password=hunter2 next', 'mysql --password hunter2', 'mysql --password "h 2"',
  'app --secret s3', 'app --client-secret s3', 'app --client_secret s3', 'app --clientsecret s3',
  '{"apikey": "s3"}', '{"api_key": "s3"}', '{"password": "s3"}', '{"token": "s3"}',
  '{"secret": "s3"}', '{"client_secret": "s3"}', '{"name": "prod"}',
  'DB_PASSWORD=s3', 'API_TOKEN=s3', 'SIGNING_KEY=s3', 'MY_SECRET=s3',
  'SERVICE_PASSWD=s3', 'ADMIN_PWD=s3', 'STRIPE_APIKEY=s3', 'GOOGLE_API_KEY=s3',
  'TOKEN_A=s3', 'SECRET_KEY=s3', 'SERVICE-TOKEN=s3',
  'key=value', 'monkey=banana', 'donkey=grey', 'whiskey=irish', 'keyboard=mechanical',
  'NODE_ENV=production', 'LOG_LEVEL=debug', 'my_secret_plan=documented',
  'Authorization: Bearer abc123', 'Authorization: Basic dXNlcg', 'Authorization: Negotiate',
  'sent Bearer abc123 upstream',
  'postgres://user:hunter2@db/app', 'redis://a:b@c:6379', 'https://example.com/p?q=1',
  'curl -u alice:hunter2 x', 'curl --user alice:hunter2 x',
  'ghp_0123456789abcdefghij', 'ghs_0123456789abcdefghij', 'gha_0123456789abcdefghij', 'ghp_short',
  'AIzaSyD-0123456789abcdefghijklmnop', 'xoxb-1234567890-abcdefghij', 'xoxq-1234567890-abcdefghij',
  'sk_live_0123456789abcdef', 'pk_test_0123456789abcdef', 'rk_live_0123456789abcdef', 'sk_other_0123456789abcdef',
  'glpat-0123456789abcdefgh', 'glpat-short', 'npm_0123456789abcdefghij0123456789abcd',
  'AKIAIOSFODNN7EXAMPLE', 'ASIAIOSFODNN7EXAMPLE', 'AKIASHORT',
  '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----',
  '-----BEGIN OPENSSH PRIVATE KEY-----\nMIIE\n-----END OPENSSH PRIVATE KEY-----',
  '-----BEGIN CERTIFICATE-----\nMIIE\n-----END CERTIFICATE-----',
  '-----BEGIN PUBLIC KEY-----\nMIIE\n-----END PUBLIC KEY-----',
  'total 48 drwxr-xr-x deploy', 'commit 8a26d89f1c0e', 'Listening on http://localhost:3000',
];

const rules = sp.defaultSensitiveRules();
const mask = om.createOptimizedMasker(rules, sp.DEFAULT_REDACTION);
const out = [];

// Every rule alone, so overlap cannot hide a change in one of them.
// Indexed, not named by source: printing the pattern would make any edit
// to it a "difference" even when the redaction is identical.
rules.forEach((rule, i) => {
  const one = om.createOptimizedMasker([rule], sp.DEFAULT_REDACTION);
  for (const t of CORPUS) out.push(`R${i} ` + JSON.stringify(one(t)));
});
for (const t of CORPUS) out.push('ALL ' + JSON.stringify(mask(t)));

// The inference path, one pattern arity at a time.
const infer = (re, text) => om.createOptimizedMasker([re], sp.DEFAULT_REDACTION)(text);
for (const [re, text] of [
  [/\bTOKEN-[0-9]+/g, 'saw TOKEN-1 here'],
  [/\b(S-[0-9]+)/g, 'id S-9 end'],
  [/"(secret)":\s*"([^"]+)"/g, '{"secret": "v"}'],
  [/(p-)([0-9]+)/g, 'p-42'],
  [/\b(k)(=)([^\s]+)/g, 'k=v rest'],
  [/(Bearer)(\s+)([a-z0-9]+)/g, 'Bearer abc'],
  [/(Authorization:\s*)(Bearer)(\s+)([a-z0-9]+)/g, 'Authorization: Bearer abc'],
  [/(a)(b)(c)(d)/g, 'abcd'],
  [/\b(k)(\s*=\s*)("([^"]+)"|'([^']+)'|([^\s]+))/g, 'k = v'],
  [/(--p)(\s+)("([^"]+)"|'([^']+)'|([^\s]+))/g, '--p   v'],
  [/(--s)(\s+)("([^"]+)"|([^\s]+))/g, '--s   v'],
  [/(k)(=)((a)(b))/g, 'k=ab'],
  [/(o)(p)(a)(q)(u)(e)(=value)/g, 'opaque=value'],
  [/(o)(p)(a)(q)(u)(e)(:value)/g, 'opaque:value'],
  [/(o)(p)(a)(q)(u)(e)(x)/g, 'opaquex'],
  [/gh[ps]_[a-zA-Z0-9]{16,}/g, 'ghp_0123456789abcdefghij'],
]) out.push('INFER ' + JSON.stringify(infer(re, text)));

out.push('EMPTY ' + JSON.stringify(mask('')));
out.push('NOPATTERNS ' + JSON.stringify(om.createOptimizedMasker([], sp.DEFAULT_REDACTION)('x')));
out.push('DOLLAR ' + JSON.stringify(om.createOptimizedMasker([{ pattern: /\b(k)(=)([^\s]+)/g, shape: 'assignment' }], '<$&>')('k=v')));
try { om.createOptimizedMasker([{ pattern: /x/g, shape: 'nope' }], 'R')('x'); out.push('BADSHAPE no throw'); }
catch (e) { out.push('BADSHAPE ' + e.constructor.name); }
console.log(out.join('\n'));

function _(){}
