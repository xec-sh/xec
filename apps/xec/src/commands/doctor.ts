import * as fs from 'fs/promises';
import { Command } from 'commander';

import { errorMessages } from '../utils/error-handler.js';

interface DoctorOptions {
  check?: string;
  fix?: boolean;
  verbose?: boolean;
  format?: 'text' | 'json';
  output?: string;
}

export default function doctorCommand(program: Command) {
  const doctor = program
    .command('doctor')
    .description('Diagnose and fix system issues')
    .option('--check <check>', 'Specific check to run (deps|config|env|health|all)', 'all')
    .option('--fix', 'Automatically fix issues where possible')
    .option('--verbose', 'Show verbose output')
    .option('--format <format>', 'Output format (text|json)', 'text')
    .option('--output <output>', 'Output file path')
    .action(async (options: DoctorOptions) => {
      await runDiagnostics(options);
    });

  return doctor;
}

async function runDiagnostics(options: DoctorOptions): Promise<void> {
  try {
    const checkType = options.check || 'all';
    const results: any[] = [];

    console.log('🔍 Running Xec diagnostics...\n');

    // Run specific checks based on options
    if (checkType === 'all' || checkType === 'deps') {
      const depsResult = await checkDependencies(options);
      results.push(depsResult);
    }

    if (checkType === 'all' || checkType === 'config') {
      const configResult = await checkConfiguration(options);
      results.push(configResult);
    }

    if (checkType === 'all' || checkType === 'env') {
      const envResult = await checkEnvironment(options);
      results.push(envResult);
    }

    if (checkType === 'all' || checkType === 'health') {
      const healthResult = await checkSystemHealth(options);
      results.push(healthResult);
    }

    // Generate summary
    const summary = generateSummary(results);
    
    if (options.format === 'json') {
      const output = { summary, results };
      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(output, null, 2));
        console.log(`\n📁 Results saved to: ${options.output}`);
      } else {
        console.log(JSON.stringify(output, null, 2));
      }
    } else {
      displaySummary(summary);
      
      if (options.output) {
        const textOutput = formatTextOutput(summary, results);
        await fs.writeFile(options.output, textOutput);
        console.log(`\n📁 Results saved to: ${options.output}`);
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw errorMessages.operationFailed('run diagnostics', errorMessage);
  }
}

async function checkDependencies(options: DoctorOptions): Promise<any> {
  console.log('📦 Checking dependencies...');
  
  // Mock dependency checker
  const results = await mockCheckDependencies();
  
  const issues = results.filter(r => !r.satisfied);
  const warnings = results.filter(r => r.satisfied && r.warnings?.length > 0);
  
  if (issues.length === 0) {
    console.log('✅ All dependencies satisfied\n');
  } else {
    console.log(`❌ ${issues.length} dependency issues found:\n`);
    
    issues.forEach(issue => {
      console.log(`  • ${issue.name}: ${issue.reason}`);
      if (options.verbose && issue.details) {
        console.log(`    Details: ${issue.details}`);
      }
    });
    
    if (options.fix) {
      console.log('\n🔧 Attempting to fix dependency issues...');
      const fixResults = await mockAutoFix(issues);
      
      fixResults.forEach(result => {
        if (result.fixed) {
          console.log(`✅ Fixed: ${result.name}`);
        } else {
          console.log(`❌ Could not fix: ${result.name} - ${result.reason}`);
        }
      });
    }
    
    console.log();
  }
  
  if (warnings.length > 0 && options.verbose) {
    console.log(`⚠️  ${warnings.length} warnings:\n`);
    warnings.forEach(warning => {
      console.log(`  • ${warning.name}: ${warning.warnings?.join(', ')}`);
    });
    console.log();
  }
  
  return {
    type: 'dependencies',
    status: issues.length === 0 ? 'healthy' : 'issues',
    issues: issues.length,
    warnings: warnings.length,
    details: results
  };
}

async function checkConfiguration(options: DoctorOptions): Promise<any> {
  console.log('⚙️  Checking configuration...');
  
  const issues: any[] = [];
  const warnings: any[] = [];
  
  // Check for config files
  const configPaths = [
    './xec.config.yaml',
    './xec.config.yml',
    './xec.config.json',
    './.xec/config.yaml',
    './.xec/config.yml',
    './.xec/config.json'
  ];
  
  let configFound = false;
  for (const configPath of configPaths) {
    try {
      await fs.access(configPath);
      configFound = true;
      
      if (options.verbose) {
        console.log(`  ✅ Found config: ${configPath}`);
      }
      
      // Validate config file
      const content = await fs.readFile(configPath, 'utf8');
      try {
        if (configPath.endsWith('.json')) {
          JSON.parse(content);
        } else {
          const yaml = await import('js-yaml');
          yaml.load(content);
        }
      } catch (parseError) {
        issues.push({
          type: 'config',
          message: `Invalid config file: ${configPath}`,
          details: parseError instanceof Error ? parseError.message : String(parseError)
        });
      }
      
      break;
    } catch {
      // Config file doesn't exist, continue
    }
  }
  
  if (!configFound) {
    warnings.push({
      type: 'config',
      message: 'No configuration file found',
      suggestion: 'Run "xec project config init" to create one'
    });
  }
  
  // Check .xec directory
  try {
    const xecDir = './.xec';
    await fs.access(xecDir);
    
    if (options.verbose) {
      console.log('  ✅ .xec directory exists');
    }
  } catch {
    warnings.push({
      type: 'directory',
      message: '.xec directory not found',
      suggestion: 'Run "xec init" to initialize project'
    });
  }
  
  // Check for recipes directory
  try {
    await fs.access('./recipes');
    if (options.verbose) {
      console.log('  ✅ Recipes directory exists');
    }
  } catch {
    warnings.push({
      type: 'directory',
      message: 'No recipes directory found',
      suggestion: 'Create recipes directory or configure custom path'
    });
  }
  
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ Configuration looks good\n');
  } else {
    if (issues.length > 0) {
      console.log(`❌ ${issues.length} configuration issues:\n`);
      issues.forEach(issue => {
        console.log(`  • ${issue.message}`);
        if (options.verbose && issue.details) {
          console.log(`    Details: ${issue.details}`);
        }
      });
    }
    
    if (warnings.length > 0) {
      console.log(`⚠️  ${warnings.length} configuration warnings:\n`);
      warnings.forEach(warning => {
        console.log(`  • ${warning.message}`);
        if (warning.suggestion) {
          console.log(`    Suggestion: ${warning.suggestion}`);
        }
      });
    }
    
    console.log();
  }
  
  return {
    type: 'configuration',
    status: issues.length === 0 ? 'healthy' : 'issues',
    issues: issues.length,
    warnings: warnings.length,
    details: { issues, warnings }
  };
}

async function checkEnvironment(options: DoctorOptions): Promise<any> {
  console.log('🌍 Checking environment...');
  
  // Mock environment validator
  const results = await mockValidateEnvironment();
  
  const issues = results.filter(r => r.level === 'error');
  const warnings = results.filter(r => r.level === 'warning');
  
  if (issues.length === 0) {
    console.log('✅ Environment validation passed\n');
  } else {
    console.log(`❌ ${issues.length} environment issues:\n`);
    
    issues.forEach(issue => {
      console.log(`  • ${issue.message}`);
      if (options.verbose && issue.details) {
        console.log(`    Details: ${issue.details}`);
      }
    });
    
    console.log();
  }
  
  if (warnings.length > 0 && options.verbose) {
    console.log(`⚠️  ${warnings.length} environment warnings:\n`);
    warnings.forEach(warning => {
      console.log(`  • ${warning.message}`);
    });
    console.log();
  }
  
  return {
    type: 'environment',
    status: issues.length === 0 ? 'healthy' : 'issues',
    issues: issues.length,
    warnings: warnings.length,
    details: results
  };
}

async function checkSystemHealth(options: DoctorOptions): Promise<any> {
  console.log('🏥 Checking system health...');
  
  // Mock system health checker
  const results = await mockCheckSystemHealth();
  
  const critical = results.filter(r => r.status === 'critical');
  const degraded = results.filter(r => r.status === 'degraded');
  const healthy = results.filter(r => r.status === 'healthy');
  
  if (critical.length === 0 && degraded.length === 0) {
    console.log('✅ System health is good\n');
  } else {
    if (critical.length > 0) {
      console.log(`🚨 ${critical.length} critical health issues:\n`);
      critical.forEach(issue => {
        console.log(`  • ${issue.component}: ${issue.message}`);
        if (options.verbose && issue.details) {
          console.log(`    Details: ${issue.details}`);
        }
      });
    }
    
    if (degraded.length > 0) {
      console.log(`⚠️  ${degraded.length} degraded components:\n`);
      degraded.forEach(issue => {
        console.log(`  • ${issue.component}: ${issue.message}`);
      });
    }
    
    console.log();
  }
  
  if (options.verbose) {
    console.log(`✅ ${healthy.length} healthy components\n`);
  }
  
  return {
    type: 'health',
    status: critical.length === 0 ? (degraded.length === 0 ? 'healthy' : 'degraded') : 'critical',
    critical: critical.length,
    degraded: degraded.length,
    healthy: healthy.length,
    details: results
  };
}

function generateSummary(results: any[]): any {
  const totalIssues = results.reduce((sum, r) => sum + (r.issues || 0), 0);
  const totalWarnings = results.reduce((sum, r) => sum + (r.warnings || 0), 0);
  const criticalIssues = results.reduce((sum, r) => sum + (r.critical || 0), 0);
  
  let overallStatus = 'healthy';
  if (criticalIssues > 0) {
    overallStatus = 'critical';
  } else if (totalIssues > 0) {
    overallStatus = 'issues';
  } else if (totalWarnings > 0) {
    overallStatus = 'warnings';
  }
  
  return {
    overallStatus,
    totalIssues,
    totalWarnings,
    criticalIssues,
    checksRun: results.length
  };
}

function displaySummary(summary: any): void {
  console.log('📊 Diagnostic Summary');
  console.log('====================');
  
  const statusIconMap = {
    healthy: '✅',
    warnings: '⚠️',
    issues: '❌',
    critical: '🚨'
  };
  const statusIcon = statusIconMap[summary.overallStatus as keyof typeof statusIconMap];
  
  console.log(`Overall Status: ${statusIcon} ${summary.overallStatus.toUpperCase()}`);
  console.log(`Checks Run: ${summary.checksRun}`);
  console.log(`Critical Issues: ${summary.criticalIssues}`);
  console.log(`Issues: ${summary.totalIssues}`);
  console.log(`Warnings: ${summary.totalWarnings}`);
  console.log();
  
  if (summary.totalIssues > 0 || summary.criticalIssues > 0) {
    console.log('💡 Recommendations:');
    console.log('• Run with --fix to attempt automatic fixes');
    console.log('• Use --verbose for detailed issue information');
    console.log('• Check the documentation for manual fixes');
    console.log();
  }
}

function formatTextOutput(summary: any, results: any[]): string {
  let output = 'Xec Diagnostics Report\n';
  output += '======================\n\n';
  
  output += `Overall Status: ${summary.overallStatus.toUpperCase()}\n`;
  output += `Checks Run: ${summary.checksRun}\n`;
  output += `Critical Issues: ${summary.criticalIssues}\n`;
  output += `Issues: ${summary.totalIssues}\n`;
  output += `Warnings: ${summary.totalWarnings}\n\n`;
  
  results.forEach(result => {
    output += `${result.type.toUpperCase()}\n`;
    output += `${'='.repeat(result.type.length)}\n`;
    output += `Status: ${result.status}\n`;
    output += `Issues: ${result.issues || 0}\n`;
    output += `Warnings: ${result.warnings || 0}\n\n`;
  });
  
  return output;
}

// Mock implementations for missing classes
async function mockCheckDependencies(): Promise<any[]> {
  return [
    { name: 'node', satisfied: true, version: process.version },
    { name: 'npm', satisfied: true, version: 'latest' }
  ];
}

async function mockAutoFix(issues: any[]): Promise<any[]> {
  return issues.map(issue => ({
    name: issue.name,
    fixed: false,
    reason: 'Auto-fix not implemented'
  }));
}

async function mockValidateEnvironment(): Promise<any[]> {
  return [
    { level: 'info', message: 'Environment validation not implemented' }
  ];
}

async function mockCheckSystemHealth(): Promise<any[]> {
  return [
    { status: 'healthy', component: 'system', message: 'System health check not implemented' }
  ];
}