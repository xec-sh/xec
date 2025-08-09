import { expect } from '@jest/globals';
export function expectSuccessResult(result, expectedStdout) {
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    if (expectedStdout instanceof RegExp) {
        expect(result.stdout).toMatch(expectedStdout);
    }
    else if (expectedStdout !== undefined) {
        expect(result.stdout).toBe(expectedStdout);
    }
}
export function expectFailureResult(result, expectedExitCode = 1, expectedStderr) {
    expect(result.exitCode).toBe(expectedExitCode);
    if (expectedStderr instanceof RegExp) {
        expect(result.stderr).toMatch(expectedStderr);
    }
    else if (expectedStderr !== undefined) {
        expect(result.stderr).toBe(expectedStderr);
    }
}
export function expectCommandToMatch(command, expected) {
    for (const [key, value] of Object.entries(expected)) {
        if (value !== undefined) {
            expect(command[key]).toEqual(value);
        }
    }
}
export function expectTimeoutError(error, commandName, timeout) {
    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('TIMEOUT');
    if (commandName) {
        expect(error.command).toBe(commandName);
    }
    if (timeout) {
        expect(error.timeout).toBe(timeout);
    }
}
export function expectConnectionError(error, host) {
    expect(error.name).toBe('ConnectionError');
    expect(error.code).toBe('CONNECTION_FAILED');
    if (host) {
        expect(error.host).toBe(host);
    }
}
export function expectCommandError(error, exitCode) {
    expect(error.name).toBe('CommandError');
    expect(error.code).toBe('COMMAND_FAILED');
    if (exitCode !== undefined) {
        expect(error.exitCode).toBe(exitCode);
    }
}
export function expectStreamContent(stream, expected) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => {
            const content = Buffer.concat(chunks).toString();
            if (expected instanceof RegExp) {
                expect(content).toMatch(expected);
            }
            else {
                expect(content).toBe(expected);
            }
            resolve();
        });
        stream.on('error', reject);
    });
}
export async function expectAsyncError(promise, errorType, message) {
    await expect(promise).rejects.toThrow(errorType);
    if (message) {
        try {
            await promise;
        }
        catch (error) {
            if (message instanceof RegExp) {
                expect(error.message).toMatch(message);
            }
            else {
                expect(error.message).toBe(message);
            }
        }
    }
}
export function expectEnvVariables(env, expected) {
    for (const [key, value] of Object.entries(expected)) {
        expect(env[key]).toBe(value);
    }
}
export function expectDuration(result, minMs, maxMs) {
    expect(result.duration).toBeGreaterThanOrEqual(minMs);
    expect(result.duration).toBeLessThanOrEqual(maxMs);
}
//# sourceMappingURL=assertions.js.map