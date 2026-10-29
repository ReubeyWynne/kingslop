export function deploymentConfig(source, database, preview = false) {
  const config = structuredClone(source);
  const binding = preview ? config.previews.d1_databases[0] : config.d1_databases[0];
  if (!database?.uuid || database.name !== binding.database_name) throw new Error('Database does not match the selected deployment.');
  if (preview && database.name === config.d1_databases[0].database_name) throw new Error('Preview deployments require a separate database.');
  binding.database_id = database.uuid;
  if (preview) config.d1_databases = [structuredClone(binding)];
  return config;
}
