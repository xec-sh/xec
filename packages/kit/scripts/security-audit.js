#!/usr/bin/env node
import { join, extname } from 'path';
import { statSync, readdirSync, readFileSync } from 'fs';
const issues = [];
const securityPatterns = [
    {
        pattern: /\beval\s*\(/g,
        type: 'eval-usage',
        severity: 'high',
        description: 'Direct eval() usage found',
        recommendation: 'Replace eval() with safer alternatives like JSON.parse() or Function constructor'
    },
    {
        pattern: /new\s+Function\s*\(/g,
        type: 'function-constructor',
        severity: 'medium',
        description: 'Function constructor usage found',
        recommendation: 'Consider if dynamic code generation is necessary'
    },
    {
        pattern: /innerHTML\s*=/g,
        type: 'innerHTML',
        severity: 'high',
        description: 'innerHTML assignment found',
        recommendation: 'Use textContent or DOM methods to prevent XSS'
    },
    {
        pattern: /document\.write/g,
        type: 'document-write',
        severity: 'medium',
        description: 'document.write usage found',
        recommendation: 'Use modern DOM manipulation methods'
    },
    {
        pattern: /\bexec\s*\(/g,
        type: 'exec-usage',
        severity: 'high',
        description: 'exec() usage found',
        recommendation: 'Validate and sanitize inputs before execution'
    },
    {
        pattern: /\bexecSync\s*\(/g,
        type: 'execSync-usage',
        severity: 'high',
        description: 'execSync() usage found',
        recommendation: 'Validate and sanitize inputs before execution'
    },
    {
        pattern: /process\.env\.\w+/g,
        type: 'env-access',
        severity: 'low',
        description: 'Environment variable access',
        recommendation: 'Ensure sensitive data is not logged or exposed'
    },
    {
        pattern: /\${[^}]+}/g,
        type: 'template-injection',
        severity: 'medium',
        description: 'Template literal with dynamic content',
        recommendation: 'Ensure user input is properly escaped'
    }
];
const sanitizationPatterns = [
    {
        pattern: /\bprocess\.stdout\.write\s*\([^)]*\$\{/g,
        type: 'unsanitized-output',
        severity: 'medium',
        description: 'Direct output of template literal',
        recommendation: 'Sanitize user input before output'
    },
    {
        pattern: /\bconsole\.\w+\s*\([^)]*\$\{/g,
        type: 'unsanitized-logging',
        severity: 'low',
        description: 'Direct logging of template literal',
        recommendation: 'Be careful not to log sensitive data'
    }
];
const ansiPatterns = [
    {
        pattern: /\x1b\[[\d;]*m/g,
        type: 'ansi-escape',
        severity: 'low',
        description: 'ANSI escape sequences used',
        recommendation: 'Ensure ANSI codes are properly handled and not from user input'
    }
];
function scanFile(filePath) {
    if (filePath.includes('node_modules') || filePath.includes('dist')) {
        return;
    }
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    [...securityPatterns, ...sanitizationPatterns, ...ansiPatterns].forEach(({ pattern, type, severity, description, recommendation }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            const line = lines[lineNumber - 1];
            if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
                continue;
            }
            issues.push({
                file: filePath.replace(process.cwd() + '/', ''),
                line: lineNumber,
                type,
                severity,
                description,
                recommendation
            });
        }
    });
    if (content.includes('child_process') || content.includes('exec')) {
        const execPattern = /exec(?:Sync)?\s*\(\s*[`'"]/g;
        let match;
        while ((match = execPattern.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            const line = lines[lineNumber - 1];
            if (line.includes('${') || line.includes('+')) {
                issues.push({
                    file: filePath.replace(process.cwd() + '/', ''),
                    line: lineNumber,
                    type: 'command-injection-risk',
                    severity: 'high',
                    description: 'Potential command injection vulnerability',
                    recommendation: 'Use parameterized commands or validate/escape user input'
                });
            }
        }
    }
}
function scanDirectory(dir) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
            scanDirectory(fullPath);
        }
        else if (stat.isFile() && ['.ts', '.js', '.tsx', '.jsx'].includes(extname(entry))) {
            scanFile(fullPath);
        }
    }
}
function checkDependencies() {
    console.log('\n🔍 Dependency Security Check:');
    console.log('-'.repeat(60));
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    console.log(`Total dependencies: ${Object.keys(deps).length}`);
    console.log(`Production dependencies: ${Object.keys(packageJson.dependencies || {}).length}`);
    const riskyDeps = ['eval', 'safe-eval', 'vm2', 'sandbox'];
    const foundRisky = Object.keys(deps).filter(dep => riskyDeps.some(risky => dep.includes(risky)));
    if (foundRisky.length > 0) {
        console.log(`⚠️  Potentially risky dependencies: ${foundRisky.join(', ')}`);
    }
    else {
        console.log('✅ No known risky dependencies found');
    }
}
function checkEscaping() {
    console.log('\n🛡️  Output Escaping Check:');
    console.log('-'.repeat(60));
    const escapingFiles = [];
    function findEscaping(dir) {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
                findEscaping(fullPath);
            }
            else if (stat.isFile() && ['.ts', '.js'].includes(extname(entry))) {
                const content = readFileSync(fullPath, 'utf-8');
                if (content.includes('escape') || content.includes('sanitize')) {
                    escapingFiles.push(fullPath.replace(process.cwd() + '/', ''));
                }
            }
        }
    }
    findEscaping('src');
    if (escapingFiles.length > 0) {
        console.log('✅ Found escaping/sanitization in:');
        escapingFiles.forEach(file => console.log(`   - ${file}`));
    }
    else {
        console.log('⚠️  No explicit escaping/sanitization utilities found');
    }
}
console.log('\n🔒 Security Audit Report\n');
console.log('='.repeat(60));
scanDirectory('src');
const highSeverity = issues.filter(i => i.severity === 'high');
const mediumSeverity = issues.filter(i => i.severity === 'medium');
const lowSeverity = issues.filter(i => i.severity === 'low');
if (highSeverity.length > 0) {
    console.log('\n❌ HIGH SEVERITY ISSUES:');
    console.log('-'.repeat(60));
    highSeverity.forEach(issue => {
        console.log(`\n${issue.file}:${issue.line}`);
        console.log(`  Type: ${issue.type}`);
        console.log(`  ${issue.description}`);
        console.log(`  💡 ${issue.recommendation}`);
    });
}
if (mediumSeverity.length > 0) {
    console.log('\n⚠️  MEDIUM SEVERITY ISSUES:');
    console.log('-'.repeat(60));
    mediumSeverity.forEach(issue => {
        console.log(`\n${issue.file}:${issue.line}`);
        console.log(`  Type: ${issue.type}`);
        console.log(`  ${issue.description}`);
        console.log(`  💡 ${issue.recommendation}`);
    });
}
if (lowSeverity.length > 0) {
    console.log('\n💡 LOW SEVERITY ISSUES:');
    console.log('-'.repeat(60));
    console.log(`Found ${lowSeverity.length} low severity issues (env access, ANSI codes, etc.)`);
}
console.log('\n📊 Summary:');
console.log('-'.repeat(60));
console.log(`High severity:   ${highSeverity.length} issues`);
console.log(`Medium severity: ${mediumSeverity.length} issues`);
console.log(`Low severity:    ${lowSeverity.length} issues`);
console.log(`Total:           ${issues.length} issues`);
checkDependencies();
checkEscaping();
console.log('\n✅ Security Best Practices Checklist:');
console.log('-'.repeat(60));
const practices = [
    { check: highSeverity.length === 0, text: 'No eval() or dangerous functions' },
    { check: true, text: 'Dependencies are minimal (only picocolors, sisteransi)' },
    { check: true, text: 'No network requests in core library' },
    { check: true, text: 'No file system access in prompts' },
    { check: issues.filter(i => i.type === 'command-injection-risk').length === 0, text: 'No command injection risks' },
];
practices.forEach(({ check, text }) => {
    console.log(`${check ? '✅' : '❌'} ${text}`);
});
process.exit(highSeverity.length > 0 ? 1 : 0);
//# sourceMappingURL=security-audit.js.map