#!/usr/bin/env bun
/**
 * Publish script for @xec-sh/aura and native packages
 * Publishes the main library and all platform-specific native packages to npm
 */

import { spawnSync, type SpawnSyncReturns } from "node:child_process"
import { existsSync, readFileSync } from "fs"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import process from "process"

interface PackageJson {
  name: string
  version: string
}

interface Variant {
  platform: string
  arch: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, "..")
const distDir = join(rootDir, "dist")

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const skipNative = args.includes("--skip-native")
const skipLib = args.includes("--skip-lib")
const publishTag = args.find((arg) => arg.startsWith("--tag="))?.split("=")[1] || "latest"

// Define all supported platforms
const variants: Variant[] = [
  { platform: "darwin", arch: "x64" },
  { platform: "darwin", arch: "arm64" },
  { platform: "linux", arch: "x64" },
  { platform: "linux", arch: "arm64" },
  { platform: "win32", arch: "x64" },
  { platform: "win32", arch: "arm64" },
]

const runCommand = (command: string, args: string[], cwd: string): boolean => {
  console.log(`Running: ${command} ${args.join(" ")} in ${cwd}`)
  
  if (dryRun) {
    console.log("  [DRY RUN] Command would be executed")
    return true
  }
  
  const result: SpawnSyncReturns<Buffer> = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  })
  
  if (result.error) {
    console.error(`Error running command: ${result.error.message}`)
    return false
  }
  
  return result.status === 0
}

const checkNpmAuth = (): boolean => {
  console.log("Checking npm authentication...")
  const result = spawnSync("npm", ["whoami"], {
    stdio: "pipe",
  })
  
  if (result.status !== 0) {
    console.error("Error: Not logged in to npm")
    console.error("Please run: npm login")
    return false
  }
  
  const username = result.stdout?.toString().trim()
  console.log(`Logged in as: ${username}`)
  return true
}

const publishPackage = (packageDir: string, packageName: string): boolean => {
  if (!existsSync(packageDir)) {
    console.error(`Error: Package directory not found: ${packageDir}`)
    return false
  }
  
  const packageJsonPath = join(packageDir, "package.json")
  if (!existsSync(packageJsonPath)) {
    console.error(`Error: package.json not found in ${packageDir}`)
    return false
  }
  
  const packageJson: PackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  console.log(`\nPublishing ${packageName} v${packageJson.version}...`)
  
  const npmArgs = ["publish", "--access", "public"]
  if (publishTag !== "latest") {
    npmArgs.push("--tag", publishTag)
  }
  
  return runCommand("npm", npmArgs, packageDir)
}

const main = async () => {
  console.log("🚀 Aura Package Publisher")
  console.log("========================")
  
  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No packages will be published")
  }
  
  // Check npm authentication
  if (!dryRun && !checkNpmAuth()) {
    process.exit(1)
  }
  
  // Build packages first
  console.log("\n📦 Building packages...")
  
  const buildArgs = ["run", join(rootDir, "scripts", "build.ts")]
  if (!skipLib) buildArgs.push("--lib")
  if (!skipNative) buildArgs.push("--native")
  
  const buildResult = spawnSync("bun", buildArgs, {
    cwd: rootDir,
    stdio: "inherit",
  })
  
  if (buildResult.status !== 0) {
    console.error("Error: Build failed")
    process.exit(1)
  }
  
  let publishedCount = 0
  let failedCount = 0
  
  // Publish native packages first
  if (!skipNative) {
    console.log("\n📚 Publishing native packages...")
    
    for (const { platform, arch } of variants) {
      const nativeName = `@xec-sh/aura-native-${platform}-${arch}`
      const nativeDir = join(rootDir, "node_modules", nativeName)
      
      if (existsSync(nativeDir)) {
        if (publishPackage(nativeDir, nativeName)) {
          publishedCount++
          console.log(`✅ Published: ${nativeName}`)
        } else {
          failedCount++
          console.error(`❌ Failed to publish: ${nativeName}`)
        }
      } else {
        console.warn(`⚠️  Skipping ${nativeName}: Not built`)
      }
    }
  }
  
  // Publish main library
  if (!skipLib) {
    console.log("\n📘 Publishing main library...")
    
    if (!existsSync(distDir)) {
      console.error("Error: dist directory not found. Run build first.")
      process.exit(1)
    }
    
    if (publishPackage(distDir, "@xec-sh/aura")) {
      publishedCount++
      console.log("✅ Published: @xec-sh/aura")
    } else {
      failedCount++
      console.error("❌ Failed to publish: @xec-sh/aura")
    }
  }
  
  // Summary
  console.log("\n📊 Summary")
  console.log("==========")
  console.log(`✅ Published: ${publishedCount} packages`)
  if (failedCount > 0) {
    console.log(`❌ Failed: ${failedCount} packages`)
  }
  
  if (publishTag !== "latest") {
    console.log(`📌 Published with tag: ${publishTag}`)
  }
  
  if (dryRun) {
    console.log("\n⚠️  This was a dry run. To publish for real, run without --dry-run")
  } else if (failedCount === 0) {
    console.log("\n🎉 All packages published successfully!")
    
    // Print installation instructions
    console.log("\n📦 Installation:")
    console.log("================")
    console.log("npm install @xec-sh/aura")
    console.log("\nThe appropriate native binary will be automatically installed for your platform.")
    
    // Print version update reminder
    console.log("\n📝 Remember to:")
    console.log("1. Create a git tag: git tag v" + packageJson.version)
    console.log("2. Push the tag: git push origin v" + packageJson.version)
    console.log("3. Create a GitHub release")
  } else {
    console.error("\n⚠️  Some packages failed to publish. Please check the errors above.")
    process.exit(1)
  }
}

// Read package.json for version info
const packageJson: PackageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"))

console.log(`Current version: ${packageJson.version}`)

// Check if all native packages exist with the same version
if (!skipNative) {
  console.log("\nChecking native package versions...")
  let versionMismatch = false
  
  for (const { platform, arch } of variants) {
    const nativeName = `@xec-sh/aura-native-${platform}-${arch}`
    const nativeDir = join(rootDir, "node_modules", nativeName)
    const nativePackageJsonPath = join(nativeDir, "package.json")
    
    if (existsSync(nativePackageJsonPath)) {
      const nativePackageJson: PackageJson = JSON.parse(readFileSync(nativePackageJsonPath, "utf8"))
      if (nativePackageJson.version !== packageJson.version) {
        console.warn(`⚠️  Version mismatch: ${nativeName} is ${nativePackageJson.version}, expected ${packageJson.version}`)
        versionMismatch = true
      }
    }
  }
  
  if (versionMismatch) {
    console.log("\nℹ️  Rebuild native packages to sync versions")
  }
}

// Run main
main().catch((error) => {
  console.error("Unexpected error:", error)
  process.exit(1)
})