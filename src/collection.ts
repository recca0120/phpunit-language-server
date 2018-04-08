import { Test, Detail } from './phpunit';
import { FilesystemContract, files as fileSystem } from './filesystem';

export class Collection {
    private items: Map<string, Test[]> = new Map<string, Test[]>();

    constructor(private files: FilesystemContract = fileSystem) {}

    put(tests: Test[]): Collection {
        const groups: Map<string, Test[]> = this.groupBy(tests);

        for (const key of groups.keys()) {
            this.items.set(key, this.merge(this.items.get(key) || [], groups.get(key)));
        }

        return this;
    }

    get(uri: string): Test[] {
        return this.items.get(this.files.uri(uri)) || [];
    }

    getGutters(uri: string) {
        uri = this.files.uri(uri);

        const gutters: any[] = [];
        this.forEach((tests: Test[], key: string) => {
            tests.forEach((test: Test) => {
                const message = test.fault ? test.fault.message : null;
                const details = test.fault ? test.fault.details : [];

                if (key === uri) {
                    gutters.push({
                        file: test.file,
                        line: test.line,
                        type: test.type,
                        message: message,
                    });
                }

                details.forEach((detail: Detail) => {
                    if (this.files.uri(detail.file) === uri) {
                        gutters.push({
                            file: detail.file,
                            line: detail.line,
                            type: test.type,
                            message: message,
                        });
                    }
                });
            });
        });

        return gutters;
    }

    map(callback: Function): any[] {
        const items: any[] = [];

        this.forEach((tests: Test[], uri: string) => {
            items.push(callback(tests, uri));
        });

        return items;
    }

    forEach(callback: Function): Collection {
        this.items.forEach((tests: Test[], uri: string) => {
            callback(tests, uri);
        });

        return this;
    }

    all(): Map<string, Test[]> {
        return this.items;
    }

    private groupBy(tests: Test[]): Map<string, Test[]> {
        return tests.reduce((groups: Map<string, Test[]>, test: Test) => {
            const uri: string = this.files.uri(test.file);
            const group: Test[] = groups.get(uri) || [];
            group.push(test);
            groups.set(uri, group);

            return groups;
        }, new Map<string, Test[]>());
    }

    private merge(oldTests: Test[], newTests: Test[]): Test[] {
        const merged: Test[] = oldTests
            .filter((oldTest: Test) => {
                for (const newTest of newTests) {
                    if (oldTest.file === newTest.file && oldTest.name === newTest.name) {
                        return false;
                    }
                }

                return true;
            })
            .concat(newTests);

        merged.sort((a: Test, b: Test) => {
            return a.line > b.line ? 1 : -1;
        });

        return merged;
    }
}
