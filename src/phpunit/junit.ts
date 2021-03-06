import { decode } from 'he';
import { Detail, FaultNode, Node, Test, Type } from './common';
import { Filesystem, FilesystemContract } from '../filesystem';
import { tap, value, when } from '../helpers';
import { TextlineRange } from './textline-range';

const parse = require('fast-xml-parser').parse;

export class JUnit {
    private pathPattern: RegExp = /(.*):(\d+)$/;

    constructor(
        private files: FilesystemContract = new Filesystem(),
        private textLineRange: TextlineRange = new TextlineRange()
    ) {}

    async parseFile(path: string): Promise<Test[]> {
        return path && (await this.files.exists(path))
            ? tap(await this.parse(await this.files.get(path)), () => {
                  this.files.unlink(path);
              })
            : [];
    }

    async parse(code: string): Promise<Test[]> {
        return tap(
            await this.getTests(
                this.getNodes(
                    parse(code, {
                        attributeNamePrefix: '_',
                        ignoreAttributes: false,
                        ignoreNameSpace: false,
                        parseNodeValue: true,
                        parseAttributeValue: true,
                        trimValues: true,
                        textNodeName: '__text',
                    })
                )
            ),
            () => this.textLineRange.clear()
        );
    }

    private getSuites(node: any): any[] {
        const suite: any = this.getSuite(node);

        return suite instanceof Array
            ? suite.reduce((suites: any[], suite: any) => {
                  return suites.concat(this.getSuites(suite));
              }, [])
            : [suite];
    }

    private getSuite(node: any): any {
        return when(
            node.testsuite,
            (testsuite: any) => {
                while (testsuite.testsuite) {
                    testsuite = testsuite.testsuite;
                }

                return testsuite;
            },
            node
        );
    }

    private getNodes(node: any): Node[] {
        return this.getSuites(node.testsuites).reduce((tests: any[], suite: any) => {
            return tests.concat(suite.testcase);
        }, []);
    }

    private getTests(nodes: Node[]): Promise<Test[]> {
        return Promise.all(nodes.map(this.parseTest.bind(this)) as Promise<Test>[]);
    }

    private async parseTest(node: Node): Promise<Test> {
        return this.parseFault(
            Object.assign(await this.createLocation(node._file, parseInt(node._line, 10) || 1), {
                name: node._name || '',
                class: node._class,
                classname: node._classname || '',
                time: parseFloat(node._time) || 0,
                type: Type.PASSED,
            }),
            node
        );
    }

    private parseFault(test: Test, node: Node): Promise<Test> {
        return when(
            this.getFaultNode(node),
            async (fault: FaultNode) => {
                const details: Detail[] = await this.parseDetails(fault);
                const current: Detail = this.current(details, test);
                const message: string = this.parseMessage(fault);

                return Object.assign(test, current, {
                    type: fault.type,
                    fault: {
                        type: fault._type || '',
                        message: message,
                        details: this.filterDetails(details, current),
                    },
                });
            },
            test
        );
    }

    private getFaultNode(node: Node): FaultNode | undefined {
        const keys: string[] = Object.keys(node);

        if (keys.indexOf('error') !== -1) {
            return tap(node.error, (fault: FaultNode) => (fault.type = this.parseErrorType(fault)));
        }

        if (keys.indexOf('warning') !== -1) {
            return tap(node.warning, (fault: FaultNode) => (fault.type = Type.WARNING));
        }

        if (keys.indexOf('failure') !== -1) {
            return tap(node.failure, (fault: FaultNode) => (fault.type = Type.FAILURE));
        }

        if (keys.indexOf('skipped') !== -1) {
            return {
                type: Type.SKIPPED,
                _type: 'PHPUnit\\Framework\\SkippedTestError',
                __text: 'Skipped Test',
            };
        }

        if (keys.indexOf('incomplete') !== -1) {
            return {
                type: Type.INCOMPLETE,
                _type: 'PHPUnit\\Framework\\IncompleteTestError',
                __text: 'Incomplete Test',
            };
        }

        return;
    }

    private parseErrorType(fault: FaultNode): Type {
        const type = fault._type.toLowerCase();

        return (
            [Type.WARNING, Type.FAILURE, Type.INCOMPLETE, Type.RISKY, Type.SKIPPED, Type.FAILED].find(
                errorType => type.indexOf(errorType) !== -1
            ) || Type.ERROR
        );
    }

    private async parseDetails(fault: FaultNode): Promise<Detail[]> {
        return Promise.all(fault.__text
            .split(/\r?\n/)
            .map((line: string) => line.trim())
            .filter((line: string) => this.pathPattern.test(line))
            .map(async (detail: string) => {
                const [, file, line] = detail.match(this.pathPattern) as string[];

                return this.createLocation(file.trim(), parseInt(line, 10));
            }) as Promise<Detail>[]);
    }

    private current(details: Detail[], test: Test): Detail {
        return (
            details.find(detail => test.uri === detail.uri && test.range.start.line !== detail.range.start.line) || test
        );
    }

    private parseMessage(fault: any) {
        const messages: string[] = fault.__text
            .replace(/\r?\n/g, '\n')
            .replace(/&#13;/g, '')
            .split('\n')
            .map((line: string) => line.replace(this.pathPattern, ''));

        return value(messages.slice(messages.length === 1 ? 0 : 1).join('\n'), (message: string) => {
            const type: string = fault._type || '';

            return (
                decode(
                    /phpunit/i.test(type)
                        ? message.replace(new RegExp(`^${type.replace(/\\/g, '\\\\')}:`), '')
                        : message
                ).trim() || type
            );
        });
    }

    private filterDetails(details: Detail[], current: Detail): Detail[] {
        return details.filter(
            detail => detail.uri !== current.uri && detail.range.start.line !== current.range.start.line
        );
    }

    private async createLocation(file: string, line: number): Promise<Detail> {
        const uri = this.files.uri(file);

        return {
            uri: uri,
            range: await this.textLineRange.create(uri, line - 1),
        };
    }
}
