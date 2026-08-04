import { prism } from '@xec-sh/kit';

export function customizeHelp(program, dynamicCommandNames) {
    const dynamicSet = new Set(dynamicCommandNames);
    program.configureOutput({
        outputError: (str, write) => write(prism.red(str)),
    });
    program.configureHelp({
        formatHelp: (cmd, helper) => {
            if (cmd.parent !== null) {
                return helper.formatHelp(cmd, helper);
            }
            const indent = '  ';
            let output = '';
            output += `Usage: ${cmd.name()} [options] [command]\n\n`;
            if (cmd.description()) {
                output += `${cmd.description()}\n\n`;
            }
            const options = cmd.options.filter(opt => !opt.hidden);
            if (options.length > 0) {
                output += prism.bold('Options:') + '\n';
                options.forEach(opt => {
                    const flags = opt.flags.padEnd(40);
                    output += `${indent}${flags}${opt.description || ''}\n`;
                });
                output += '\n';
            }
            const builtInCommands = [];
            const dynamicCommands = [];
            cmd.commands.forEach(subcmd => {
                if (subcmd.name() !== 'help') {
                    if (dynamicSet.has(subcmd.name())) {
                        dynamicCommands.push(subcmd);
                    }
                    else {
                        builtInCommands.push(subcmd);
                    }
                }
            });
            if (builtInCommands.length > 0) {
                output += prism.bold('Built-in Commands:') + '\n';
                builtInCommands.forEach(subcmd => {
                    const name = subcmd.name();
                    const aliases = subcmd.aliases().length > 0 ? `|${subcmd.aliases().join('|')}` : '';
                    const nameStr = `${name}${aliases}`.padEnd(40);
                    const desc = subcmd.description() || '';
                    output += `${indent}${nameStr}${desc.split('\n')[0]}\n`;
                });
                output += '\n';
            }
            if (dynamicCommands.length > 0) {
                output += prism.bold('Dynamic Commands:') + '\n';
                dynamicCommands.forEach(subcmd => {
                    const name = subcmd.name();
                    const aliases = subcmd.aliases().length > 0 ? `|${subcmd.aliases().join('|')}` : '';
                    const nameStr = `${name}${aliases}`.padEnd(40);
                    const desc = subcmd.description() || '';
                    output += `${indent}${nameStr}${desc.split('\n')[0]}\n`;
                });
                output += '\n';
            }
            output += prism.bold('Examples:') + '\n';
            output += `${indent}xec echo "Hello World"        ${prism.dim('# Run command locally')}\n`;
            output += `${indent}xec on server "ls -la"        ${prism.dim('# Run on SSH server')}\n`;
            output += `${indent}xec in nginx "cat /etc/nginx" ${prism.dim('# Run in container')}\n`;
            output += `${indent}xec script.js                 ${prism.dim('# Run JavaScript file')}\n`;
            output += '\n';
            output += prism.bold('Learn more:') + '\n';
            output += `${indent}Use "xec <command> --help" for more information about a command\n`;
            output += `${indent}Documentation: https://xec.sh\n`;
            return output;
        }
    });
}
//# sourceMappingURL=help-customizer.js.map