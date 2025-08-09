declare const _default: {
    preset: string;
    testEnvironment: string;
    setupFilesAfterEnv: string[];
    forceExit: boolean;
    verbose: boolean;
    clearMocks: boolean;
    collectCoverage: boolean;
    collectCoverageFrom: string[];
    coverageDirectory: string;
    moduleFileExtensions: string[];
    testMatch: string[];
    extensionsToTreatAsEsm: string[];
    transform: {
        '^.+\\.ts$': (string | {
            useESM: boolean;
            tsconfig: string;
        })[];
    };
    moduleNameMapper: any;
    transformIgnorePatterns: string[];
};
export default _default;
