export interface CommandPaletteItem {
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    group?: string;
    shortcut?: string;
    action: () => Promise<void>;
}
export declare class CommandPalette {
    private static recentCommands;
    private static recentFiles;
    private static recentTargets;
    private static commandHistory;
    static registerGlobalShortcuts(): void;
    static show(): Promise<void>;
    private static buildCommandList;
    static showQuickOpen(): Promise<void>;
    static showRecentTasks(): Promise<void>;
    private static loadTasks;
    private static findExecutableFiles;
    private static getFileIcon;
    private static trackCommand;
    private static trackFile;
    static trackTarget(target: string): void;
    private static sortByUsage;
    private static getRecentTasks;
    private static selectScript;
    static initialize(): Promise<void>;
    static saveHistory(): Promise<void>;
}
export declare const showCommandPalette: any;
export declare const showQuickOpen: any;
export declare const showRecentTasks: any;
export declare const initializeCommandPalette: any;
export declare const saveCommandHistory: any;
