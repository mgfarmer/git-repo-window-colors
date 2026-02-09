import { expect } from 'chai';
import { expandEnvVars, simplifyPath } from '../../pathUtils';
import * as os from 'os';
import * as path from 'path';

describe('Path Utilities', () => {
    describe('expandEnvVars', () => {
        const homeDir = os.homedir();
        const isWindows = process.platform === 'win32';

        it('should expand ~ to home directory', () => {
            const result = expandEnvVars('~/projects/myrepo');
            expect(result).to.equal(path.join(homeDir, 'projects/myrepo'));
        });

        it('should expand ~/ to home directory', () => {
            const result = expandEnvVars('~/Documents');
            expect(result).to.equal(path.join(homeDir, 'Documents'));
        });

        it('should handle ~ as standalone', () => {
            const result = expandEnvVars('~');
            expect(result).to.equal(homeDir);
        });

        it('should expand $HOME variable', () => {
            const result = expandEnvVars('$HOME/projects');
            expect(result).to.equal(path.join(homeDir, 'projects'));
        });

        it('should expand %HOME% variable', () => {
            const result = expandEnvVars('%HOME%/projects');
            expect(result).to.equal(path.join(homeDir, 'projects'));
        });

        it('should expand $USERPROFILE variable', () => {
            const result = expandEnvVars('$USERPROFILE/projects');
            expect(result).to.equal(path.join(homeDir, 'projects'));
        });

        it('should expand %USERPROFILE% variable', () => {
            const result = expandEnvVars('%USERPROFILE%/projects');
            expect(result).to.equal(path.join(homeDir, 'projects'));
        });

        it('should handle case-insensitive variable names', () => {
            const result1 = expandEnvVars('$home/projects');
            const result2 = expandEnvVars('$HOME/projects');
            expect(result1).to.equal(result2);
        });

        it('should handle multiple variables in one path', () => {
            const result = expandEnvVars('$HOME/projects/$USER');
            expect(result).to.include(homeDir);
        });

        it('should handle paths with no variables', () => {
            const path = '/absolute/path/to/folder';
            const result = expandEnvVars(path);
            expect(result).to.equal(path);
        });

        it('should handle Windows-style paths with backslashes', () => {
            const result = expandEnvVars('~\\projects\\myrepo');
            expect(result).to.equal(path.join(homeDir, 'projects\\myrepo'));
        });

        if (isWindows && process.env.APPDATA) {
            it('should expand %APPDATA% on Windows', () => {
                const result = expandEnvVars('%APPDATA%/MyApp');
                expect(result).to.include(process.env.APPDATA);
            });

            it('should expand $APPDATA on Windows', () => {
                const result = expandEnvVars('$APPDATA/MyApp');
                expect(result).to.include(process.env.APPDATA);
            });
        }

        if (isWindows && process.env.LOCALAPPDATA) {
            it('should expand %LOCALAPPDATA% on Windows', () => {
                const result = expandEnvVars('%LOCALAPPDATA%/MyApp');
                expect(result).to.include(process.env.LOCALAPPDATA);
            });
        }

        it('should handle $USER variable', () => {
            const result = expandEnvVars('/home/$USER/projects');
            const username = process.env.USER || process.env.USERNAME || '';
            if (username) {
                expect(result).to.include(username);
            }
        });

        describe('Edge Cases', () => {
            it('should handle empty string', () => {
                const result = expandEnvVars('');
                expect(result).to.equal('');
            });

            it('should handle string with just ~', () => {
                const result = expandEnvVars('~');
                expect(result).to.equal(homeDir);
            });

            it('should not expand ~ in the middle of path', () => {
                const result = expandEnvVars('/some/path/~not/expanded');
                expect(result).to.equal('/some/path/~not/expanded');
            });

            it('should handle mixed separators', () => {
                const result = expandEnvVars('~/projects\\subdir/file');
                expect(result).to.include(homeDir);
            });

            it('should handle variables that do not exist', () => {
                const result = expandEnvVars('$NONEXISTENT_VAR/path');
                // Should leave unknown variables as-is or remove them
                expect(result).to.be.a('string');
            });
        });
    });

    describe('simplifyPath', () => {
        const homeDir = os.homedir();
        const isWindows = process.platform === 'win32';

        it('should replace home directory with ~', () => {
            const fullPath = path.join(homeDir, 'projects', 'myrepo');
            const result = simplifyPath(fullPath);
            expect(result).to.include('~');
            expect(result).to.not.include(homeDir);
        });

        it('should handle paths exactly at home directory', () => {
            const result = simplifyPath(homeDir);
            expect(result).to.equal('~');
        });

        it('should not modify paths outside home directory', () => {
            const testPath = isWindows ? 'C:\\Program Files\\App' : '/usr/local/bin';
            const result = simplifyPath(testPath);
            // Should not contain ~ since it's not in home
            expect(result).to.not.include('~');
        });

        it('should handle normalized paths', () => {
            const fullPath = path.join(homeDir, 'projects', '..', 'documents');
            const result = simplifyPath(fullPath);
            expect(result).to.include('~');
        });

        if (isWindows && process.env.APPDATA) {
            it('should replace APPDATA with %APPDATA% on Windows', () => {
                const appDataPath = path.join(process.env.APPDATA!, 'MyApp', 'config');
                const result = simplifyPath(appDataPath);
                expect(result).to.include('%APPDATA%');
            });
        }

        if (isWindows && process.env.LOCALAPPDATA) {
            it('should replace LOCALAPPDATA with %LOCALAPPDATA% on Windows', () => {
                const localAppDataPath = path.join(process.env.LOCALAPPDATA!, 'MyApp');
                const result = simplifyPath(localAppDataPath);
                expect(result).to.include('%LOCALAPPDATA%');
            });

            it('should prefer LOCALAPPDATA over APPDATA for longer matches', () => {
                // LOCALAPPDATA is typically a subdirectory of APPDATA
                const localAppDataPath = process.env.LOCALAPPDATA!;
                const result = simplifyPath(localAppDataPath);
                expect(result).to.include('%LOCALAPPDATA%');
                expect(result).to.not.include('%APPDATA%');
            });
        }

        describe('Case Sensitivity', () => {
            if (isWindows) {
                it('should handle case-insensitive paths on Windows', () => {
                    const upperHome = homeDir.toUpperCase();
                    const testPath = path.join(upperHome, 'projects');
                    const result = simplifyPath(testPath);
                    expect(result).to.include('~');
                });
            } else {
                it('should handle case-sensitive paths on Unix', () => {
                    const fullPath = path.join(homeDir, 'Projects');
                    const result = simplifyPath(fullPath);
                    expect(result).to.include('~');
                });
            }
        });

        describe('Edge Cases', () => {
            it('should handle empty string', () => {
                const result = simplifyPath('');
                expect(result).to.equal('');
            });

            it('should handle relative paths', () => {
                const result = simplifyPath('./relative/path');
                expect(result).to.equal('./relative/path');
            });

            it('should handle paths with trailing slash', () => {
                const fullPath = path.join(homeDir, 'projects') + path.sep;
                const result = simplifyPath(fullPath);
                expect(result).to.include('~');
            });

            it('should round-trip with expandEnvVars', () => {
                const originalPath = path.join(homeDir, 'projects', 'myrepo');
                const simplified = simplifyPath(originalPath);
                const expanded = expandEnvVars(simplified);
                // Should normalize to same path
                expect(path.normalize(expanded)).to.equal(path.normalize(originalPath));
            });
        });
    });

    describe('Path Utility Integration', () => {
        it('should correctly round-trip expand and simplify', () => {
            const patterns = ['~/projects/myrepo', '$HOME/documents/work', '%USERPROFILE%/Desktop', '~/code/**/src'];

            patterns.forEach((pattern) => {
                const expanded = expandEnvVars(pattern);
                const simplified = simplifyPath(expanded);
                const reExpanded = expandEnvVars(simplified);

                // After round-trip, expanded paths should match
                expect(path.normalize(reExpanded)).to.equal(path.normalize(expanded));
            });
        });

        it('should handle glob patterns through expand/simplify cycle', () => {
            const originalPattern = '~/projects/**/test/*.ts';
            const expanded = expandEnvVars(originalPattern);
            const simplified = simplifyPath(expanded);

            expect(simplified).to.include('~');
            expect(simplified).to.include('**/test/*.ts');
        });

        it('should preserve path separators', () => {
            const isWindows = process.platform === 'win32';
            const pattern = isWindows ? '~\\projects\\myrepo' : '~/projects/myrepo';
            const expanded = expandEnvVars(pattern);
            const simplified = simplifyPath(expanded);

            expect(simplified).to.include('~');
        });
    });
});
