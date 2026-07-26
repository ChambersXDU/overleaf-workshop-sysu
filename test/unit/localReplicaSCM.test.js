require('./bootstrap');
const assert = require('assert');
const posix = require('path').posix;
const vscode = require('./mock/vscode');
const { LocalReplicaSCMProvider } = require('../../out/scm/localReplicaSCM');

const REMOTE_SCHEME = 'overleaf-workshop';
const REMOTE_ROOT = '/TestProject';
const LOCAL_ROOT = '/local/Proj';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function makeFakeVfs() {
    const origin = new vscode.Uri(REMOTE_SCHEME, 'latex.sysu.example.com', REMOTE_ROOT, 'user=u1&project=p1');
    return {
        origin,
        serverName: 'latex.sysu.example.com',
        projectName: 'TestProject',
        pathToUri(...parts) {
            return origin.with({ path: posix.join(origin.path, ...parts) });
        },
        getProjectSCMPersist() { return { settings: {} }; },
        setProjectSCMPersist() {},
    };
}

/**
 * Boot a provider over fresh in-memory local/remote file systems.
 * `setup(localFS, remoteFS)` may seed files before the initial sync runs.
 */
async function boot(setup) {
    vscode.__mock.reset();
    const localFS = new vscode.__mock.MemFS(posix.dirname(LOCAL_ROOT));
    localFS.mkdir(LOCAL_ROOT);
    const remoteFS = new vscode.__mock.MemFS(REMOTE_ROOT, { strictParents: true });
    vscode.__mock.registerFS('file', localFS);
    vscode.__mock.registerFS(REMOTE_SCHEME, remoteFS);
    if (setup) { setup(localFS, remoteFS); }

    const vfs = makeFakeVfs();
    const provider = new LocalReplicaSCMProvider(vfs, vscode.Uri.file(LOCAL_ROOT));
    const disposables = await provider.triggers; // runs initWatch + initial overwrite
    assert.strictEqual(vscode.__mock.state.watchers.length, 2, 'expected vfs + local watchers');
    const [vfsWatcher, localWatcher] = vscode.__mock.state.watchers;

    return {
        provider, disposables, vfs, localFS, remoteFS,
        localUri: (relPath) => vscode.Uri.file(LOCAL_ROOT + relPath),
        remoteUri: (relPath) => vfs.pathToUri(relPath),
        fireRemote: (kind, relPath) => vfsWatcher.fire(kind, vfs.pathToUri(relPath)),
        fireLocal: (kind, relPath) => localWatcher.fire(kind, vscode.Uri.file(LOCAL_ROOT + relPath)),
        fireSave: (relPath) => vscode.__mock.fireSave({ uri: vscode.Uri.file(LOCAL_ROOT + relPath) }),
    };
}

describe('LocalReplicaSCMProvider sync', function () {
    this.timeout(20000);

    describe('initial sync (overwrite)', () => {
        it('uploads files that only exist locally', async () => {
            const t = await boot((localFS) => {
                localFS.write(`${LOCAL_ROOT}/new.tex`, 'hello sysu');
            });
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/new.tex`), 'hello sysu');
        });

        it('uploads local-only files inside local-only folders (parents created first)', async () => {
            const t = await boot((localFS) => {
                localFS.write(`${LOCAL_ROOT}/chapters/intro/ch1.tex`, 'chapter one');
            });
            assert.ok(t.remoteFS.has(`${REMOTE_ROOT}/chapters`), 'remote folder missing');
            assert.ok(t.remoteFS.has(`${REMOTE_ROOT}/chapters/intro`), 'remote nested folder missing');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/chapters/intro/ch1.tex`), 'chapter one');
        });

        it('pulls files that only exist remotely', async () => {
            const t = await boot((_localFS, remoteFS) => {
                remoteFS.write(`${REMOTE_ROOT}/intro.tex`, 'from server');
            });
            assert.strictEqual(t.localFS.read(`${LOCAL_ROOT}/intro.tex`), 'from server');
        });

        it('does NOT clobber diverged local content with the remote copy (local wins, pushed to server)', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/main.tex`, 'edited offline');
                remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'stale server copy');
            });
            assert.strictEqual(t.localFS.read(`${LOCAL_ROOT}/main.tex`), 'edited offline');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'edited offline');
        });

        it('does not upload ignored files or the .overleaf folder', async () => {
            const t = await boot((localFS) => {
                localFS.write(`${LOCAL_ROOT}/main.aux`, 'junk');
                localFS.write(`${LOCAL_ROOT}/main.log`, 'junk');
            });
            assert.ok(!t.remoteFS.has(`${REMOTE_ROOT}/main.aux`));
            assert.ok(!t.remoteFS.has(`${REMOTE_ROOT}/main.log`));
            assert.ok(!t.remoteFS.has(`${REMOTE_ROOT}/.overleaf`));
        });
    });

    describe('remote pull followed by local edits (regression: saves silently dropped)', () => {
        it('still pushes a local save made >500ms after a remote change was pulled', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/main.tex`, 'v1');
                remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'v1');
            });
            // a change arrives from the server (e.g., web editor / collaborator)
            t.remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'v2 from web');
            await t.fireRemote('change', '/main.tex');
            assert.strictEqual(t.localFS.read(`${LOCAL_ROOT}/main.tex`), 'v2 from web');

            await sleep(600); // beyond the 500ms conflict window

            // now the user edits locally and saves
            t.localFS.write(`${LOCAL_ROOT}/main.tex`, 'v3 local edit');
            await t.fireSave('/main.tex');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'v3 local edit');

            // and keeps editing: every later save must sync as well
            await sleep(600);
            t.localFS.write(`${LOCAL_ROOT}/main.tex`, 'v4 local edit');
            await t.fireSave('/main.tex');
            await t.fireLocal('change', '/main.tex'); // watcher echo of the save
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'v4 local edit');
        });

        it('suppresses the echo of its own push (no ping-pong writes)', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/main.tex`, 'v1');
                remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'v1');
            });
            t.localFS.write(`${LOCAL_ROOT}/main.tex`, 'v2');
            await t.fireSave('/main.tex');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'v2');

            const localWrites = t.localFS.writes(`${LOCAL_ROOT}/main.tex`);
            // server notifies about the change we just pushed
            await t.fireRemote('change', '/main.tex');
            assert.strictEqual(t.localFS.writes(`${LOCAL_ROOT}/main.tex`), localWrites,
                'echo pull must not rewrite the local file');
        });
    });

    describe('failed pushes (regression: same content never retried)', () => {
        it('retries a push of identical content after a transient failure', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/main.tex`, 'base');
                remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'base');
            });
            t.remoteFS.failNextWrite(`${REMOTE_ROOT}/main.tex`, new Error('socket disconnected'));

            t.localFS.write(`${LOCAL_ROOT}/main.tex`, 'important edit');
            await t.fireSave('/main.tex');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'base', 'push should have failed');
            assert.ok(vscode.__mock.state.warnings.length > 0, 'failure must be surfaced to the user');

            // user saves again (same content) — must NOT be treated as already synced
            await t.fireSave('/main.tex');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'important edit');
        });
    });

    describe('new files and folders (regression: files in new folders lost to a race)', () => {
        it('pushes a new file even when its event arrives before the new parent folder event', async () => {
            const t = await boot();
            t.localFS.mkdir(`${LOCAL_ROOT}/chapters`);
            t.localFS.write(`${LOCAL_ROOT}/chapters/ch1.tex`, 'chapter');
            // file event first: previously failed remotely (missing parent) and was never retried
            await t.fireLocal('create', '/chapters/ch1.tex');
            await t.fireLocal('create', '/chapters');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/chapters/ch1.tex`), 'chapter');
        });

        it('pushes a file created empty and filled in later by an external tool', async () => {
            const t = await boot();
            t.localFS.write(`${LOCAL_ROOT}/notes.tex`, '');
            await t.fireLocal('create', '/notes.tex');
            t.localFS.write(`${LOCAL_ROOT}/notes.tex`, 'now with content');
            await t.fireLocal('change', '/notes.tex'); // no editor save involved
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/notes.tex`), 'now with content');
        });
    });

    describe('external modifications (regression: only editor saves were pushed)', () => {
        it('pushes content written to disk by external tools via the watcher', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/main.tex`, 'base');
                remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'base');
            });
            t.localFS.write(`${LOCAL_ROOT}/main.tex`, 'written by a script');
            await t.fireLocal('change', '/main.tex');
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'written by a script');
        });

        it('pushes binary files whose bytes differ only in invalid utf-8 sequences', async () => {
            // decoding maps all invalid sequences to U+FFFD, so a string-based
            // hash saw these as identical and dropped the update
            const bytesA = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x01]);
            const bytesB = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xfe, 0x01]);
            const t = await boot((localFS, remoteFS) => {
                localFS.mkdir(`${LOCAL_ROOT}/figures`);
                localFS.entries.set(`${LOCAL_ROOT}/figures/a.pdf`, { type: 'file', content: bytesA });
                remoteFS.mkdir(`${REMOTE_ROOT}/figures`);
                remoteFS.entries.set(`${REMOTE_ROOT}/figures/a.pdf`, { type: 'file', content: bytesA });
            });
            t.localFS.entries.set(`${LOCAL_ROOT}/figures/a.pdf`, { type: 'file', content: bytesB });
            await t.fireLocal('change', '/figures/a.pdf');
            const remote = t.remoteFS.entries.get(`${REMOTE_ROOT}/figures/a.pdf`).content;
            assert.deepStrictEqual(Array.from(remote), Array.from(bytesB));
        });

        it('ignores changes matching the ignore patterns', async () => {
            const t = await boot();
            t.localFS.write(`${LOCAL_ROOT}/main.aux`, 'junk');
            await t.fireLocal('create', '/main.aux');
            await t.fireLocal('change', '/main.aux');
            assert.ok(!t.remoteFS.has(`${REMOTE_ROOT}/main.aux`));
        });
    });

    describe('deletions', () => {
        it('propagates a local deletion and swallows its echo', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/old.tex`, 'x');
                remoteFS.write(`${REMOTE_ROOT}/old.tex`, 'x');
            });
            t.localFS.entries.delete(`${LOCAL_ROOT}/old.tex`);
            await t.fireLocal('delete', '/old.tex');
            assert.ok(!t.remoteFS.has(`${REMOTE_ROOT}/old.tex`));
            // server echoes the deletion back — must not throw or resurrect anything
            await t.fireRemote('delete', '/old.tex');
            assert.ok(!t.localFS.has(`${LOCAL_ROOT}/old.tex`));
        });
    });

    describe('save listener scoping', () => {
        it('ignores saves outside the replica folder and on other schemes', async () => {
            const t = await boot((localFS, remoteFS) => {
                localFS.write(`${LOCAL_ROOT}/main.tex`, 'base');
                remoteFS.write(`${REMOTE_ROOT}/main.tex`, 'base');
            });
            await vscode.__mock.fireSave({ uri: vscode.Uri.file('/somewhere/else.tex') });
            await vscode.__mock.fireSave({ uri: new vscode.Uri('untitled', '', `${LOCAL_ROOT}/main.tex`, '') });
            assert.strictEqual(t.remoteFS.read(`${REMOTE_ROOT}/main.tex`), 'base');
        });
    });
});
