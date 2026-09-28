// Used only inside the entrypoint's quoted command substitution. Never log this URL.
function databaseUrl(env) {
  for (const name of ['DB_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB']) {
    if (!env[name]) throw new Error(`${name} must be set`);
  }
  const url = new URL('postgresql://localhost');
  url.hostname = env.DB_HOST;
  url.port = env.DB_PORT || '5432';
  url.username = encodeURIComponent(env.POSTGRES_USER);
  url.password = encodeURIComponent(env.POSTGRES_PASSWORD);
  url.pathname = `/${encodeURIComponent(env.POSTGRES_DB)}`;
  return url.toString();
}
if (require.main === module) {
  try { process.stdout.write(databaseUrl(process.env)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { databaseUrl };
