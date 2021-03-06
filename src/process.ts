import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { Command } from 'vscode-languageserver-types';

export class Process {
    spawn(command: Command, options?: SpawnOptions): Promise<string> {
        return new Promise(resolve => {
            const process: ChildProcess = spawn(command.command, command.arguments as string[], options);
            const output: Buffer[] = [];

            process.stdout.on('data', (buffer: Buffer) => {
                output.push(buffer);
            });

            process.stderr.on('data', (buffer: Buffer) => {
                output.push(buffer);
            });

            process.on('exit', () => {
                resolve(
                    output
                        .map(buffer => buffer.toString())
                        .join('')
                        .replace(/\r?\n$/, '')
                );
            });
        });
    }
}
