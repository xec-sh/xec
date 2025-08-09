declare function databaseBackup(config: BackupConfig): Promise<string>;
declare function databaseRestore(config: RestoreConfig): Promise<any>;
declare function runDatabaseMigrations(config: MigrationConfig): Promise<void>;
declare function monitorDatabasePerformance(config: DatabaseConfig): Promise<void>;
declare function optimizeDatabase(config: DatabaseConfig): Promise<void>;
interface DatabaseConfig {
    type: 'postgresql' | 'mysql' | 'mongodb';
    host: string;
    port?: number;
    username: string;
    password: string;
    database: string;
}
interface BackupConfig extends DatabaseConfig {
    backupPath: string;
    retentionDays: number;
    uploadToCloud?: boolean;
    cloudStorage?: CloudStorageConfig;
    includeRoles?: boolean;
    includeLargeObjects?: boolean;
    notifications?: boolean;
}
interface RestoreConfig extends DatabaseConfig {
    backupFile: string;
    dropExisting?: boolean;
    force?: boolean;
}
interface MigrationConfig extends DatabaseConfig {
    migrationsPath: string;
    backupBeforeMigration?: boolean;
    stopOnError?: boolean;
    rollbackOnError?: boolean;
}
interface CloudStorageConfig {
    provider: 's3' | 'gcs' | 'azure';
    bucket?: string;
    container?: string;
    credentials?: any;
}
export { databaseBackup, databaseRestore, optimizeDatabase, runDatabaseMigrations, monitorDatabasePerformance };
