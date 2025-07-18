#!/usr/bin/env node
/**
 * File Processing with @xec-js/ush
 * 
 * Real-world examples of file processing and manipulation using @xec-js/ush.
 */

import { $ } from '@xec-js/ush';
import * as path from 'path';

// ===== File Processor Base Class =====
abstract class FileProcessor {
  protected processedCount = 0;
  protected errorCount = 0;
  protected startTime = Date.now();

  constructor(
    protected options: {
      parallel?: boolean;
      concurrency?: number;
      dryRun?: boolean;
      verbose?: boolean;
    } = {}
  ) { }

  // Abstract method to be implemented by subclasses
  abstract processFile(filePath: string): Promise<void>;

  // Process multiple files
  async processFiles(files: string[]) {
    console.log(`📁 Processing ${files.length} files...\n`);

    if (this.options.parallel) {
      // Process in parallel with concurrency control
      await $.parallel(
        files.map(file => this.processFileWithStats(file)),
        { concurrency: this.options.concurrency || 5 }
      );
    } else {
      // Process sequentially
      for (const file of files) {
        await this.processFileWithStats(file);
      }
    }

    this.printSummary();
  }

  // Process file with statistics
  private async processFileWithStats(filePath: string) {
    try {
      if (this.options.verbose) {
        console.log(`Processing: ${filePath}`);
      }

      await this.processFile(filePath);
      this.processedCount++;

      if (this.options.verbose) {
        console.log(`✅ Completed: ${filePath}`);
      }
    } catch (error: any) {
      this.errorCount++;
      console.error(`❌ Error processing ${filePath}: ${error.message}`);
    }
  }

  // Print processing summary
  protected printSummary() {
    const duration = Date.now() - this.startTime;
    console.log('\n' + '='.repeat(50));
    console.log('📊 Processing Summary');
    console.log('='.repeat(50));
    console.log(`Total files: ${this.processedCount + this.errorCount}`);
    console.log(`Processed: ${this.processedCount}`);
    console.log(`Errors: ${this.errorCount}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Rate: ${(this.processedCount / (duration / 1000)).toFixed(2)} files/sec`);
  }
}

// ===== Image Processor =====
class ImageProcessor extends FileProcessor {
  constructor(
    private operation: 'resize' | 'optimize' | 'convert' | 'watermark',
    private config: {
      width?: number;
      height?: number;
      quality?: number;
      format?: string;
      watermarkPath?: string;
    },
    options?: any
  ) {
    super(options);
  }

  async processFile(filePath: string): Promise<void> {
    const outputPath = this.getOutputPath(filePath);

    switch (this.operation) {
      case 'resize':
        await this.resize(filePath, outputPath);
        break;
      case 'optimize':
        await this.optimize(filePath, outputPath);
        break;
      case 'convert':
        await this.convert(filePath, outputPath);
        break;
      case 'watermark':
        await this.watermark(filePath, outputPath);
        break;
    }
  }

  private getOutputPath(filePath: string): string {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    const suffix = this.operation === 'convert' && this.config.format
      ? `.${this.config.format}`
      : ext;

    return path.join(dir, `${base}-${this.operation}${suffix}`);
  }

  private async resize(input: string, output: string) {
    const dimensions = `${this.config.width || ''}x${this.config.height || ''}`;

    if (this.options.dryRun) {
      console.log(`Would resize: ${input} -> ${output} (${dimensions})`);
      return;
    }

    await $`convert ${input} -resize ${dimensions} ${output}`;
  }

  private async optimize(input: string, output: string) {
    const ext = path.extname(input).toLowerCase();

    if (this.options.dryRun) {
      console.log(`Would optimize: ${input} -> ${output}`);
      return;
    }

    if (ext === '.jpg' || ext === '.jpeg') {
      await $`jpegoptim -m${this.config.quality || 85} -o -p --strip-all ${input}`;
    } else if (ext === '.png') {
      await $`optipng -o7 -strip all ${input}`;
    } else if (ext === '.svg') {
      await $`svgo ${input} -o ${output}`;
    }
  }

  private async convert(input: string, output: string) {
    if (this.options.dryRun) {
      console.log(`Would convert: ${input} -> ${output}`);
      return;
    }

    await $`convert ${input} ${output}`;
  }

  private async watermark(input: string, output: string) {
    if (!this.config.watermarkPath) {
      throw new Error('Watermark path not specified');
    }

    if (this.options.dryRun) {
      console.log(`Would watermark: ${input} -> ${output}`);
      return;
    }

    await $`composite -dissolve 30% -gravity southeast ${this.config.watermarkPath} ${input} ${output}`;
  }
}

// ===== Text File Processor =====
class TextFileProcessor extends FileProcessor {
  constructor(
    private operation: 'search-replace' | 'format' | 'extract' | 'merge',
    private config: {
      search?: string | RegExp;
      replace?: string;
      format?: 'json' | 'csv' | 'xml' | 'yaml';
      extractPattern?: string;
      encoding?: string;
    },
    options?: any
  ) {
    super(options);
  }

  async processFile(filePath: string): Promise<void> {
    switch (this.operation) {
      case 'search-replace':
        await this.searchReplace(filePath);
        break;
      case 'format':
        await this.format(filePath);
        break;
      case 'extract':
        await this.extract(filePath);
        break;
    }
  }

  private async searchReplace(filePath: string) {
    if (!this.config.search || this.config.replace === undefined) {
      throw new Error('Search and replace patterns required');
    }

    const backupPath = `${filePath}.bak`;

    if (this.options.dryRun) {
      const matches = await $`grep -c "${this.config.search}" ${filePath}`.nothrow();
      console.log(`Would replace ${matches.stdout.trim()} occurrences in ${filePath}`);
      return;
    }

    // Create backup
    await $`cp ${filePath} ${backupPath}`;

    // Perform replacement
    if (process.platform === 'darwin') {
      await $`sed -i '' 's/${this.config.search}/${this.config.replace}/g' ${filePath}`;
    } else {
      await $`sed -i 's/${this.config.search}/${this.config.replace}/g' ${filePath}`;
    }

    // Show diff if verbose
    if (this.options.verbose) {
      const diff = await $`diff -u ${backupPath} ${filePath}`.nothrow();
      if (diff.stdout) {
        console.log(`Changes in ${filePath}:`);
        console.log(diff.stdout);
      }
    }
  }

  private async format(filePath: string) {
    const outputPath = this.getFormattedPath(filePath);

    if (this.options.dryRun) {
      console.log(`Would format: ${filePath} -> ${outputPath}`);
      return;
    }

    switch (this.config.format) {
      case 'json':
        await $`jq . ${filePath} > ${outputPath}`;
        break;
      case 'xml':
        await $`xmllint --format ${filePath} > ${outputPath}`;
        break;
      case 'yaml':
        await $`yq eval '.' ${filePath} > ${outputPath}`;
        break;
    }
  }

  private async extract(filePath: string) {
    if (!this.config.extractPattern) {
      throw new Error('Extract pattern required');
    }

    const outputPath = `${filePath}.extracted`;

    if (this.options.dryRun) {
      console.log(`Would extract from: ${filePath} -> ${outputPath}`);
      return;
    }

    await $`grep -E "${this.config.extractPattern}" ${filePath} > ${outputPath}`;
  }

  private getFormattedPath(filePath: string): string {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    return path.join(dir, `formatted-${base}`);
  }
}

// ===== CSV Processor =====
class CSVProcessor {
  constructor(
    private options: {
      delimiter?: string;
      hasHeaders?: boolean;
      encoding?: string;
    } = {}
  ) { }

  async analyze(filePath: string) {
    console.log(`📊 Analyzing CSV: ${filePath}\n`);

    // Count rows
    const rowCount = await $`wc -l < ${filePath}`;
    console.log(`Total rows: ${rowCount.stdout.trim()}`);

    // Get headers
    if (this.options.hasHeaders !== false) {
      const headers = await $`head -1 ${filePath}`;
      const delimiter = this.options.delimiter || ',';
      const columns = headers.stdout.trim().split(delimiter);
      console.log(`Columns: ${columns.length}`);
      console.log(`Headers: ${columns.join(', ')}`);
    }

    // Sample data
    console.log('\nSample data:');
    await $`head -5 ${filePath} | column -t -s "${this.options.delimiter || ','}"`;

    // Basic statistics
    console.log('\nFile statistics:');
    const size = await $`du -h ${filePath} | cut -f1`;
    console.log(`File size: ${size.stdout.trim()}`);
  }

  async filter(filePath: string, column: number, pattern: string, outputPath: string) {
    const delimiter = this.options.delimiter || ',';

    if (this.options.hasHeaders !== false) {
      // Keep headers
      await $`head -1 ${filePath} > ${outputPath}`;
      await $`tail -n +2 ${filePath} | awk -F"${delimiter}" '$${column} ~ /${pattern}/' >> ${outputPath}`;
    } else {
      await $`awk -F"${delimiter}" '$${column} ~ /${pattern}/' ${filePath} > ${outputPath}`;
    }

    const filtered = await $`wc -l < ${outputPath}`;
    console.log(`Filtered ${filtered.stdout.trim()} rows to ${outputPath}`);
  }

  async sort(filePath: string, column: number, outputPath: string, numeric = false) {
    const delimiter = this.options.delimiter || ',';
    const sortFlags = numeric ? '-n' : '';

    if (this.options.hasHeaders !== false) {
      // Keep headers at top
      await $`head -1 ${filePath} > ${outputPath}`;
      await $`tail -n +2 ${filePath} | sort -t"${delimiter}" -k${column} ${sortFlags} >> ${outputPath}`;
    } else {
      await $`sort -t"${delimiter}" -k${column} ${sortFlags} ${filePath} > ${outputPath}`;
    }

    console.log(`Sorted by column ${column} to ${outputPath}`);
  }

  async merge(files: string[], outputPath: string) {
    // Merge multiple CSV files
    if (this.options.hasHeaders !== false) {
      // Take headers from first file
      await $`head -1 ${files[0]} > ${outputPath}`;

      // Append data from all files (skip headers)
      for (const file of files) {
        await $`tail -n +2 ${file} >> ${outputPath}`;
      }
    } else {
      // Simple concatenation
      await $`cat ${files} > ${outputPath}`;
    }

    const total = await $`wc -l < ${outputPath}`;
    console.log(`Merged ${files.length} files into ${outputPath} (${total.stdout.trim()} rows)`);
  }
}

// ===== Archive Processor =====
class ArchiveProcessor {
  async create(
    sourcePath: string,
    outputPath: string,
    options: {
      format?: 'tar' | 'zip' | '7z';
      compression?: 'gzip' | 'bzip2' | 'xz' | 'none';
      exclude?: string[];
      password?: string;
    } = {}
  ) {
    const format = options.format || 'tar';
    const compression = options.compression || 'gzip';

    console.log(`📦 Creating ${format} archive: ${outputPath}`);

    switch (format) {
      case 'tar':
        await this.createTar(sourcePath, outputPath, compression, options.exclude);
        break;
      case 'zip':
        await this.createZip(sourcePath, outputPath, options.exclude, options.password);
        break;
      case '7z':
        await this.create7z(sourcePath, outputPath, options.exclude, options.password);
        break;
    }

    const size = await $`du -h ${outputPath} | cut -f1`;
    console.log(`✅ Archive created: ${outputPath} (${size.stdout.trim()})`);
  }

  private async createTar(source: string, output: string, compression: string, exclude?: string[]) {
    const compressionFlag = {
      gzip: 'z',
      bzip2: 'j',
      xz: 'J',
      none: ''
    }[compression];

    const excludeFlags = exclude?.map(e => `--exclude="${e}"`).join(' ') || '';

    await $`tar -c${compressionFlag}f ${output} ${excludeFlags} -C ${path.dirname(source)} ${path.basename(source)}`;
  }

  private async createZip(source: string, output: string, exclude?: string[], password?: string) {
    const excludeFlags = exclude?.map(e => `-x "${e}"`).join(' ') || '';
    const passwordFlag = password ? `-P ${password}` : '';

    await $`zip -r ${passwordFlag} ${output} ${source} ${excludeFlags}`;
  }

  private async create7z(source: string, output: string, exclude?: string[], password?: string) {
    const excludeFlags = exclude?.map(e => `-x!"${e}"`).join(' ') || '';
    const passwordFlag = password ? `-p${password}` : '';

    await $`7z a ${passwordFlag} ${output} ${source} ${excludeFlags}`;
  }

  async extract(
    archivePath: string,
    outputDir: string,
    options: {
      password?: string;
    } = {}
  ) {
    console.log(`📂 Extracting: ${archivePath} -> ${outputDir}`);

    await $`mkdir -p ${outputDir}`;

    const ext = path.extname(archivePath).toLowerCase();

    if (ext === '.zip') {
      const passwordFlag = options.password ? `-P ${options.password}` : '';
      await $`unzip ${passwordFlag} ${archivePath} -d ${outputDir}`;
    } else if (ext === '.tar' || ext === '.gz' || ext === '.bz2' || ext === '.xz') {
      await $`tar -xf ${archivePath} -C ${outputDir}`;
    } else if (ext === '.7z') {
      const passwordFlag = options.password ? `-p${options.password}` : '';
      await $`7z x ${passwordFlag} ${archivePath} -o${outputDir}`;
    }

    console.log('✅ Extraction complete');
  }

  async list(archivePath: string) {
    console.log(`📋 Contents of: ${archivePath}\n`);

    const ext = path.extname(archivePath).toLowerCase();

    if (ext === '.zip') {
      await $`unzip -l ${archivePath}`;
    } else if (ext === '.tar' || ext === '.gz' || ext === '.bz2' || ext === '.xz') {
      await $`tar -tf ${archivePath}`;
    } else if (ext === '.7z') {
      await $`7z l ${archivePath}`;
    }
  }
}

// ===== File Integrity Checker =====
class FileIntegrityChecker {
  private checksums = new Map<string, string>();

  async generateChecksum(filePath: string, algorithm = 'sha256'): Promise<string> {
    const result = await $`${algorithm}sum ${filePath} | cut -d' ' -f1`;
    return result.stdout.trim();
  }

  async generateChecksums(directory: string, pattern = '*') {
    console.log(`🔐 Generating checksums for: ${directory}/${pattern}\n`);

    const files = await $`find ${directory} -name "${pattern}" -type f`;
    const fileList = files.stdout.trim().split('\n').filter(f => f);

    for (const file of fileList) {
      const checksum = await this.generateChecksum(file);
      this.checksums.set(file, checksum);

      if (fileList.length < 20) {
        console.log(`${checksum}  ${file}`);
      }
    }

    console.log(`\nGenerated ${this.checksums.size} checksums`);
  }

  async saveChecksums(outputPath: string) {
    const content = Array.from(this.checksums.entries())
      .map(([file, checksum]) => `${checksum}  ${file}`)
      .join('\n');

    await $`echo ${content} > ${outputPath}`;
    console.log(`💾 Checksums saved to: ${outputPath}`);
  }

  async verifyChecksums(checksumsFile: string): Promise<{
    passed: string[];
    failed: string[];
  }> {
    console.log(`🔍 Verifying checksums from: ${checksumsFile}\n`);

    const result = await $`sha256sum -c ${checksumsFile}`.nothrow();

    const passed: string[] = [];
    const failed: string[] = [];

    const lines = result.stdout.trim().split('\n');
    for (const line of lines) {
      if (line.includes(': OK')) {
        passed.push(line.split(':')[0]);
      } else if (line.includes(': FAILED')) {
        failed.push(line.split(':')[0]);
      }
    }

    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);

    if (failed.length > 0) {
      console.log('\nFailed files:');
      failed.forEach(f => console.log(`  - ${f}`));
    }

    return { passed, failed };
  }
}

// ===== Duplicate File Finder =====
class DuplicateFinder {
  async findDuplicates(directory: string): Promise<Map<string, string[]>> {
    console.log(`🔍 Searching for duplicates in: ${directory}\n`);

    // Get all files with their sizes
    const files = await $`find ${directory} -type f -exec ls -l {} + | awk '{print $5, $9}'`;
    const fileData = files.stdout.trim().split('\n')
      .filter(line => line)
      .map(line => {
        const [size, ...pathParts] = line.split(' ');
        return { size: parseInt(size), path: pathParts.join(' ') };
      });

    // Group by size
    const sizeGroups = new Map<number, string[]>();
    for (const { size, path } of fileData) {
      if (!sizeGroups.has(size)) {
        sizeGroups.set(size, []);
      }
      sizeGroups.get(size)!.push(path);
    }

    // Check files with same size for actual duplicates
    const duplicates = new Map<string, string[]>();

    for (const [size, paths] of sizeGroups) {
      if (paths.length < 2) continue;

      const checksums = new Map<string, string[]>();

      for (const path of paths) {
        const checksum = await this.getChecksum(path);
        if (!checksums.has(checksum)) {
          checksums.set(checksum, []);
        }
        checksums.get(checksum)!.push(path);
      }

      // Add groups with duplicates
      for (const [checksum, dupPaths] of checksums) {
        if (dupPaths.length > 1) {
          duplicates.set(checksum, dupPaths);
        }
      }
    }

    // Report findings
    if (duplicates.size > 0) {
      console.log(`Found ${duplicates.size} groups of duplicate files:\n`);

      let groupNum = 1;
      let totalWasted = 0;

      for (const [checksum, paths] of duplicates) {
        const size = (await $`stat -f%z "${paths[0]}" 2>/dev/null || stat -c%s "${paths[0]}"`).stdout.trim();
        const sizeNum = parseInt(size);
        const wasted = sizeNum * (paths.length - 1);
        totalWasted += wasted;

        console.log(`Group ${groupNum} (${this.formatBytes(sizeNum)} each, ${paths.length} files):`);
        paths.forEach(p => console.log(`  - ${p}`));
        console.log();
        groupNum++;
      }

      console.log(`Total wasted space: ${this.formatBytes(totalWasted)}`);
    } else {
      console.log('No duplicate files found.');
    }

    return duplicates;
  }

  private async getChecksum(filePath: string): Promise<string> {
    const result = await $`md5sum "${filePath}" 2>/dev/null || md5 -q "${filePath}"`;
    return result.stdout.trim().split(' ')[0];
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }

    return `${size.toFixed(2)} ${units[unit]}`;
  }
}

// ===== Demo Function =====
async function runDemo() {
  console.log('📁 File Processing Demo\n');

  const demoDir = '/tmp/file-processing-demo';
  await $`rm -rf ${demoDir}`.nothrow();
  await $`mkdir -p ${demoDir}/{images,text,data}`;

  // Create demo files
  console.log('Creating demo files...\n');

  // Create text files
  await $`echo "Hello, World!" > ${demoDir}/text/file1.txt`;
  await $`echo "This is a test file.\nIt has multiple lines.\nHello, Universe!" > ${demoDir}/text/file2.txt`;

  // Create CSV file
  const csvContent = `Name,Age,City
John Doe,30,New York
Jane Smith,25,Los Angeles
Bob Johnson,35,Chicago
Alice Williams,28,Boston`;
  await $`echo ${csvContent} > ${demoDir}/data/users.csv`;

  // Create duplicate files for testing
  await $`echo "Duplicate content" > ${demoDir}/text/dup1.txt`;
  await $`echo "Duplicate content" > ${demoDir}/text/dup2.txt`;
  await $`echo "Unique content" > ${demoDir}/text/unique.txt`;

  // Demo 1: Text processing
  console.log('=== Text File Processing ===\n');
  const textProcessor = new TextFileProcessor(
    'search-replace',
    { search: 'Hello', replace: 'Hi' },
    { verbose: true }
  );

  const textFiles = await $`find ${demoDir}/text -name "*.txt"`.then(r =>
    r.stdout.trim().split('\n').filter(f => f)
  );
  await textProcessor.processFiles(textFiles);

  // Demo 2: CSV processing
  console.log('\n\n=== CSV Processing ===\n');
  const csvProcessor = new CSVProcessor({ hasHeaders: true });
  await csvProcessor.analyze(`${demoDir}/data/users.csv`);

  await csvProcessor.filter(
    `${demoDir}/data/users.csv`,
    2, // Age column
    '[3-9][0-9]', // Age >= 30
    `${demoDir}/data/users-30plus.csv`
  );

  // Demo 3: Archive creation
  console.log('\n\n=== Archive Creation ===\n');
  const archiver = new ArchiveProcessor();
  await archiver.create(
    demoDir,
    `${demoDir}/backup.tar.gz`,
    { format: 'tar', compression: 'gzip' }
  );

  await archiver.list(`${demoDir}/backup.tar.gz`);

  // Demo 4: File integrity
  console.log('\n\n=== File Integrity Check ===\n');
  const integrityChecker = new FileIntegrityChecker();
  await integrityChecker.generateChecksums(`${demoDir}/text`, '*.txt');
  await integrityChecker.saveChecksums(`${demoDir}/checksums.txt`);

  // Modify a file to test verification
  await $`echo "Modified content" >> ${demoDir}/text/file1.txt`;
  await integrityChecker.verifyChecksums(`${demoDir}/checksums.txt`);

  // Demo 5: Duplicate finder
  console.log('\n\n=== Duplicate File Detection ===\n');
  const duplicateFinder = new DuplicateFinder();
  await duplicateFinder.findDuplicates(`${demoDir}/text`);

  // Cleanup
  console.log('\n\n🧹 Cleaning up demo files...');
  await $`rm -rf ${demoDir}`;

  console.log('\n✅ File processing demo completed!');
}

// Run demo if executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}