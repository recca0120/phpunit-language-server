import { FilesystemContract, files as fileSystem } from '../filesystem';
import { tap } from '../helpers';

export class Parameters {
    private arguments: string[];
    private cwd: string;
    private root: string;
    private jUnitDotXml: string = '';

    constructor(private files: FilesystemContract = fileSystem) {}

    set(args: string[]): Parameters {
        return tap(this, (self: Parameters) => {
            self.arguments = args;
        });
    }

    get(property: string): any {
        const index: number = this.arguments.indexOf(property);

        if (index !== -1) {
            if (index === this.arguments.length - 1) {
                return true;
            }

            const value: string = this.arguments[index + 1];

            return value.indexOf('-') === 0 ? true : value;
        }

        return false;
    }

    exists(property: string): boolean {
        return this.arguments.some((arg: string) => property === arg);
    }

    setCwd(cwd: string): Parameters {
        return tap(this, (self: Parameters) => {
            self.cwd = cwd;
        });
    }

    setRoot(root: string): Parameters {
        return tap(this, (self: Parameters) => {
            self.root = root;
        });
    }

    async all(): Promise<string[]> {
        let phpUnitDotXml: string;

        if (
            this.exists('-c') === false &&
            this.exists('--configuration') === false &&
            (phpUnitDotXml = await this.findPhpUnitDotXml())
        ) {
            this.arguments = this.arguments.concat(['-c', phpUnitDotXml]);
        }

        if (this.exists('--log-junit') === false) {
            this.jUnitDotXml = this.files.tmpfile('xml', 'phpunit-lsp');
            this.arguments = this.arguments.concat(['--log-junit', this.jUnitDotXml]);
        }

        return this.arguments;
    }

    private async findPhpUnitDotXml(): Promise<string> {
        return (
            (await this.files.findUp('phpunit.xml', this.cwd, this.root)) ||
            (await this.files.findUp('phpunit.xml.dist', this.cwd, this.root))
        );
    }
}