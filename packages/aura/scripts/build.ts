#!/usr/bin/env bun
/**
 * Build script for @xec-sh/aura native packages
 * Compiles Rust code for all supported platforms and creates native packages
 */

import process from "process"
import { fileURLToPath } from "url"
import path, { join, dirname, resolve } from "path"
import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { rmSync, mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from "fs"

interface Variant {
  platform: string
  arch: string
  rustTarget: string
  libName: string
  libExt: string
}

interface PackageJson {
  name: string
  version: string
  license?: string
  repository?: any
  description?: string
  homepage?: string
  author?: string
  bugs?: any
  keywords?: string[]
  module?: string
  main?: string
  types?: string
  type?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

interface TsconfigBuild {
  extends: string
  compilerOptions: {
    declaration: boolean
    emitDeclarationOnly: boolean
    outDir: string
    noEmit: boolean
    rootDir: string
    types: string[]
    skipLibCheck: boolean
  }
  include: string[]
  exclude: string[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, "..")
const licensePath = path.resolve(__dirname, "../../../LICENSE")
const packageJson: PackageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))

const args = process.argv.slice(2)
const buildLib = args.includes("--lib")
const buildNative = args.includes("--native")
const isDev = args.includes("--dev")
const buildCurrent = args.includes("--current") // Build only for current platform
const platforms = args.filter(arg => arg.startsWith("--platform=")).map(arg => arg.split("=")[1])

// Define all supported platforms with their Rust targets
const variants: Variant[] = [
  {
    platform: "darwin",
    arch: "x64",
    rustTarget: "x86_64-apple-darwin",
    libName: "libaura",
    libExt: ".dylib"
  },
  {
    platform: "darwin",
    arch: "arm64",
    rustTarget: "aarch64-apple-darwin",
    libName: "libaura",
    libExt: ".dylib"
  },
  {
    platform: "linux",
    arch: "x64",
    rustTarget: "x86_64-unknown-linux-gnu",
    libName: "libaura",
    libExt: ".so"
  },
  {
    platform: "linux",
    arch: "arm64",
    rustTarget: "aarch64-unknown-linux-gnu",
    libName: "libaura",
    libExt: ".so"
  },
  {
    platform: "win32",
    arch: "x64",
    rustTarget: "x86_64-pc-windows-msvc",
    libName: "aura",
    libExt: ".dll"
  },
  {
    platform: "win32",
    arch: "arm64",
    rustTarget: "aarch64-pc-windows-msvc",
    libName: "aura",
    libExt: ".dll"
  },
]

if (!buildLib && !buildNative) {
  console.error("Error: Please specify --lib, --native, or both")
  console.error("Options:")
  console.error("  --lib         Build TypeScript library")
  console.error("  --native      Build native binaries for all platforms")
  console.error("  --current     Build native binary for current platform only")
  console.error("  --dev         Build in development mode")
  console.error("  --platform=X  Build for specific platform (darwin|linux|win32)")
  process.exit(1)
}

const replaceLinks = (text: string): string => packageJson.homepage
  ? text.replace(
    /(\[.*?\]\()(\.\/.*?\))/g,
    (_, p1: string, p2: string) => `${p1}${packageJson.homepage}/blob/HEAD/${p2.replace("./", "")}`,
  )
  : text

const requiredFields: (keyof PackageJson)[] = ["name", "version", "license", "repository", "description"]
const missingRequired = requiredFields.filter((field) => !packageJson[field])
if (missingRequired.length > 0) {
  console.error(`Error: Missing required fields in package.json: ${missingRequired.join(", ")}`)
  process.exit(1)
}

// Install Rust targets if needed
const installRustTarget = (target: string): boolean => {
  console.log(`Checking Rust target: ${target}`)
  const checkResult = spawnSync("rustup", ["target", "list", "--installed"], {
    stdio: "pipe",
  })

  if (checkResult.error) {
    console.error("Error: rustup is not installed or not in PATH")
    return false
  }

  const installedTargets = checkResult.stdout?.toString() || ""
  if (!installedTargets.includes(target)) {
    console.log(`Installing Rust target: ${target}`)
    const installResult = spawnSync("rustup", ["target", "add", target], {
      stdio: "inherit",
    })

    if (installResult.status !== 0) {
      console.error(`Failed to install Rust target: ${target}`)
      return false
    }
  }
  return true
}

// Get current platform info
const getCurrentPlatform = (): Variant | undefined => {
  const platform = process.platform === "darwin" ? "darwin" :
    process.platform === "linux" ? "linux" :
      process.platform === "win32" ? "win32" : null

  const arch = process.arch === "x64" ? "x64" :
    process.arch === "arm64" ? "arm64" : null

  if (!platform || !arch) return undefined

  return variants.find(v => v.platform === platform && v.arch === arch)
}

if (buildNative) {
  console.log(`Building native ${isDev ? "dev" : "release"} binaries...`)

  // Determine which platforms to build
  let targetVariants = variants

  if (buildCurrent) {
    const current = getCurrentPlatform()
    if (!current) {
      console.error("Error: Could not detect current platform")
      process.exit(1)
    }
    targetVariants = [current]
    console.log(`Building for current platform: ${current.platform}-${current.arch}`)
  } else if (platforms.length > 0) {
    targetVariants = variants.filter(v => platforms.includes(v.platform))
    if (targetVariants.length === 0) {
      console.error(`Error: No valid platforms specified. Available: ${variants.map(v => v.platform).join(", ")}`)
      process.exit(1)
    }
  }

  const rustDir = join(rootDir, "rust")
  const targetDir = join(rustDir, "target")

  // Build for each target platform
  for (const variant of targetVariants) {
    const { platform, arch, rustTarget, libName, libExt } = variant

    console.log(`\nBuilding for ${platform}-${arch} (${rustTarget})...`)

    // Install target if needed (skip for current platform)
    if (!buildCurrent && !installRustTarget(rustTarget)) {
      console.error(`Skipping ${platform}-${arch}: Could not install Rust target`)
      continue
    }

    // Build the Rust library
    const cargoArgs = [
      "build",
      isDev ? "" : "--release",
      buildCurrent ? "" : `--target=${rustTarget}`,
    ].filter(Boolean)

    const buildResult: SpawnSyncReturns<Buffer> = spawnSync("cargo", cargoArgs, {
      cwd: rustDir,
      stdio: "inherit",
      env: {
        ...process.env,
        CARGO_TARGET_DIR: targetDir,
      }
    })

    if (buildResult.error) {
      console.error("Error: Cargo is not installed or not in PATH")
      process.exit(1)
    }

    if (buildResult.status !== 0) {
      console.error(`Error: Rust build failed for ${platform}-${arch}`)
      continue
    }

    // Create native package
    const nativeName = `@xec-sh/aura-native-${platform}-${arch}`
    const nativeDir = join(rootDir, "node_modules", nativeName)

    // Clean and create directory
    rmSync(nativeDir, { recursive: true, force: true })
    mkdirSync(nativeDir, { recursive: true })

    // Copy the built library
    const buildMode = isDev ? "debug" : "release"
    const sourceLibPath = buildCurrent
      ? join(targetDir, buildMode, `${libName}${libExt}`)
      : join(targetDir, rustTarget, buildMode, `${libName}${libExt}`)

    if (!existsSync(sourceLibPath)) {
      console.error(`Error: Library not found at ${sourceLibPath}`)
      console.error(`Expected to find: ${libName}${libExt}`)

      // List directory contents for debugging
      const libDir = dirname(sourceLibPath)
      if (existsSync(libDir)) {
        console.error(`Files in ${libDir}:`)
        const files = spawnSync("ls", ["-la", libDir], { stdio: "pipe" })
        if (files.stdout) console.error(files.stdout.toString())
      }
      continue
    }

    const destLibName = `${libName}${libExt}`
    const destLibPath = join(nativeDir, destLibName)
    copyFileSync(sourceLibPath, destLibPath)
    console.log(`Copied ${sourceLibPath} to ${destLibPath}`)

    // Create index files for the native package that work with both Node.js and Bun
    
    // Create index.cjs for CommonJS/Node.js support
    const indexCjsContent = `// Native bindings for ${platform}-${arch} (CommonJS)
const path = require('path');
const nativePath = path.join(__dirname, '${destLibName}');
module.exports = nativePath;
`
    writeFileSync(join(nativeDir, "index.cjs"), indexCjsContent)
    
    // Create index.mjs for ESM support (both Node.js and Bun)
    const indexMjsContent = `// Native bindings for ${platform}-${arch} (ESM)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const destLibName = '${destLibName}';

let nativePath;

if (typeof Bun !== 'undefined') {
  // Bun runtime - use import with file type for better performance
  try {
    const module = await import("./${destLibName}", { with: { type: "file" } });
    nativePath = module.default;
  } catch (e) {
    // Fallback to path resolution
    nativePath = join(__dirname, destLibName);
  }
} else {
  // Node.js runtime - use direct path resolution
  nativePath = join(__dirname, destLibName);
}

export default nativePath;
`
    writeFileSync(join(nativeDir, "index.mjs"), indexMjsContent)
    
    // Create index.js that re-exports based on the environment
    const indexJsContent = `// Native bindings for ${platform}-${arch}
// Auto-detect module system and export accordingly

if (typeof module !== 'undefined' && module.exports) {
  // CommonJS
  module.exports = require('./index.cjs');
} else {
  // ESM
  export { default } from './index.mjs';
}
`
    writeFileSync(join(nativeDir, "index.js"), indexJsContent)
    
    // Create index.d.ts for TypeScript support
    const indexDtsContent = `// Type definitions for ${platform}-${arch} native bindings
declare const nativePath: string;
export default nativePath;
`
    writeFileSync(join(nativeDir, "index.d.ts"), indexDtsContent)

    // Create package.json for the native package
    const nativePackageJson = {
      name: nativeName,
      version: packageJson.version,
      description: `Native ${platform}-${arch} bindings for @xec-sh/aura`,
      main: "index.cjs",
      module: "index.mjs",
      types: "index.d.ts",
      exports: {
        ".": {
          "require": "./index.cjs",
          "import": "./index.mjs",
          "types": "./index.d.ts"
        }
      },
      license: packageJson.license,
      author: packageJson.author,
      homepage: packageJson.homepage,
      repository: {
        ...packageJson.repository,
        directory: `packages/aura/native/${platform}-${arch}`
      },
      bugs: packageJson.bugs,
      keywords: [
        ...(packageJson.keywords ?? []),
        "native",
        "rust",
        "terminal",
        "renderer",
        platform,
        arch,
      ],
      os: [platform],
      cpu: [arch],
      engines: {
        node: ">=18.0.0",
        bun: ">=1.2.0"
      }
    }

    writeFileSync(
      join(nativeDir, "package.json"),
      JSON.stringify(nativePackageJson, null, 2)
    )

    // Create README
    const readmeContent = `# ${nativeName}

Native ${platform}-${arch} bindings for [@xec-sh/aura](https://github.com/xec-sh/xec/tree/main/packages/aura).

## Installation

This package is automatically installed as an optional dependency of \`@xec-sh/aura\`.

\`\`\`bash
npm install @xec-sh/aura
\`\`\`

## Platform Support

- **OS**: ${platform}
- **Architecture**: ${arch}
- **Rust Target**: ${rustTarget}

## License

${packageJson.license}
`
    writeFileSync(join(nativeDir, "README.md"), readmeContent)

    // Copy LICENSE if exists
    if (existsSync(licensePath)) {
      copyFileSync(licensePath, join(nativeDir, "LICENSE"))
    }

    console.log(`✅ Built: ${nativeName}`)
  }
}

if (buildLib) {
  console.log("\nBuilding TypeScript library...")

  const distDir = join(rootDir, "dist")
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })

  // Add native packages as optional dependencies
  const nativeDeps: Record<string, string> = {}
  for (const { platform, arch } of variants) {
    const packageName = `@xec-sh/aura-native-${platform}-${arch}`
    nativeDeps[packageName] = packageJson.version
  }

  // Create tsconfig.build.json for TypeScript compilation
  const tsconfigBuild: TsconfigBuild = {
    extends: "./tsconfig.json",
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      outDir: "./dist",
      noEmit: false,
      rootDir: "./src",
      types: ["bun", "node"],
      skipLibCheck: true,
    },
    include: ["src/**/*"],
    exclude: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "src/examples/**/*",
      "rust/**/*"
    ],
  }

  const tsconfigBuildPath = join(rootDir, "tsconfig.build.json")
  writeFileSync(tsconfigBuildPath, JSON.stringify(tsconfigBuild, null, 2))

  // Generate TypeScript declarations
  console.log("Generating TypeScript declarations...")
  const tscResult = spawnSync("npx", ["tsc", "-p", tsconfigBuildPath], {
    cwd: rootDir,
    stdio: "inherit",
  })

  rmSync(tsconfigBuildPath, { force: true })

  if (tscResult.status !== 0) {
    console.warn("Warning: TypeScript declaration generation failed")
  }

  // Bundle with Bun
  console.log("Bundling with Bun...")
  const entryPoint = join(rootDir, "src", "index.ts")

  const externalDeps = [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
    ...Object.keys(nativeDeps),
    "yoga-layout",
  ]

  const bundleResult = spawnSync(
    "bun",
    [
      "build",
      entryPoint,
      "--target=bun",
      "--outdir=dist",
      "--sourcemap",
      ...externalDeps.flatMap(dep => ["--external", dep]),
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    }
  )

  if (bundleResult.status !== 0) {
    console.error("Error: Bundling failed")
    process.exit(1)
  }

  // Create dist/package.json
  const distPackageJson = {
    ...packageJson,
    main: "index.js",
    module: "index.js",
    types: "index.d.ts",
    optionalDependencies: {
      ...packageJson.optionalDependencies,
      ...nativeDeps,
    }
  }

  // Remove scripts and devDependencies for published package
  delete distPackageJson.scripts
  delete distPackageJson.devDependencies

  writeFileSync(
    join(distDir, "package.json"),
    JSON.stringify(distPackageJson, null, 2)
  )

  // Copy README and LICENSE
  const readmePath = join(rootDir, "README.md")
  if (existsSync(readmePath)) {
    writeFileSync(join(distDir, "README.md"), replaceLinks(readFileSync(readmePath, "utf8")))
  }

  if (existsSync(licensePath)) {
    copyFileSync(licensePath, join(distDir, "LICENSE"))
  }

  console.log(`✅ Library built at: ${distDir}`)
}