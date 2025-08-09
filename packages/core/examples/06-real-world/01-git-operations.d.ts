declare function checkGitStatus(): Promise<void>;
declare function simpleCommit(commitType: string, commitMessage: string): Promise<void>;
declare function gitDeploy(branch?: string, autoStash?: boolean): Promise<void>;
declare function cloneMultipleRepos(repos: {
    name: string;
    url: string;
}[]): Promise<void>;
declare function setupGitHooks(): Promise<void>;
declare function analyzeGitHistory(): Promise<void>;
declare function branchManagement(autoDelete?: boolean): Promise<void>;
declare function gitBisectHelper(goodCommit?: string, badCommit?: string, testCommand?: string): Promise<void>;
export { gitDeploy, simpleCommit, setupGitHooks, checkGitStatus, gitBisectHelper, branchManagement, analyzeGitHistory, cloneMultipleRepos };
