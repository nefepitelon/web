// Public local-engine installers contain reviewed source, never live profiles.
// Keep this policy shared by all recursive source packagers so an accidentally
// created runtime file inside src/ cannot become a public download.
const privateDirectories = new Set([
  '.git', '.next', '.vercel', '.runtime', '.venv', 'venv', 'node_modules',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', 'data',
  'state', 'settings', 'secrets', 'credentials', 'tenants'
]);
const privateNames = new Set([
  'api-auth.json', 'deployment.json', 'device.json', 'account.json',
  'accounts.json', 'credentials.json', 'settings.json', 'state.json',
  '.state.json', '.npmrc', '.netrc'
]);

export function isPrivatePackagePath(relativePath) {
  const parts = String(relativePath).replaceAll('\\', '/').toLowerCase().split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return true;
  if (parts.some(part => privateDirectories.has(part))) return true;
  const name = parts.at(-1);
  // Checked-in templates are intentional source, including .env.example.
  if (name === '.env.example' || name === 'env.example') return false;
  if (name === '.env' || name.startsWith('.env.') || privateNames.has(name)) return true;
  if (/\.(?:pyc|pem|key|p12|pfx|keystore|har|log|bak|sqlite3?|db)(?:[-.].*)?$/.test(name)) return true;
  return /(?:credentials?|secrets?|private[-_]?key|keypair)[^/]*\.(?:json|ya?ml|toml|txt)$/.test(name);
}
