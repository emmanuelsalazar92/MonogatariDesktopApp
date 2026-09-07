declare module "better-sqlite3" {
  type Statement = { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown };
  class Database {
    constructor(path: string, options?: { readonly?: boolean });
    backup(destination: string): Promise<unknown>;
    prepare(sql: string): Statement;
    close(): void;
  }
  export default Database;
}
