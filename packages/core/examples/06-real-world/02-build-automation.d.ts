interface BuildTarget {
    name: string;
    platform: string;
    arch: string;
    outputDir: string;
}
declare function multiPlatformBuild(targets: BuildTarget[]): Promise<void>;
declare function incrementalBuild(srcDir: string, buildDir: string): Promise<void>;
declare function dockerBuild(appName: string, version: string): Promise<void>;
declare function fullBuildPipeline(projectPath: string): Promise<boolean>;
declare function optimizeBuild(distDir: string): Promise<void>;
declare function cicdPipeline(branch: string): Promise<void>;
declare function monorepoBuilder(packages: string[]): Promise<void>;
export { dockerBuild, cicdPipeline, optimizeBuild, monorepoBuilder, incrementalBuild, fullBuildPipeline, multiPlatformBuild };
