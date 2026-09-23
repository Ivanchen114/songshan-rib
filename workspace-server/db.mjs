import postgres from 'postgres';
let shared;
export function database() {
  if (!process.env.RIB_DATABASE_URL) throw new Error('Database is not configured');
  if (!shared) shared = wrap(postgres(process.env.RIB_DATABASE_URL, {
    ssl: 'require', prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10,
    connection: {statement_timeout: 15000},
    // The repository query contract passes JSON text. Do not encode it a second time.
    types: {
      json: {
        to: 114, from: [114, 3802],
        serialize: value => typeof value === 'string' ? value : JSON.stringify(value),
        parse: JSON.parse
      }
    }
  }));
  return shared;
}
function wrap(sql) {
  return {
    query: async (text, values = []) => {
      const missing = values.flatMap((value, index) => value === undefined ? [index] : []);
      if (missing.length) throw new Error(`Missing SQL parameter at ${missing.join(',')} for ${text.slice(0,180)}`);
      return [...await sql.unsafe(text, values)];
    },
    transaction: fn => typeof sql.savepoint === 'function'
      ? sql.savepoint(tx => fn(wrap(tx)))
      : sql.begin(tx => fn(wrap(tx))),
    close: () => sql.end()
  };
}
