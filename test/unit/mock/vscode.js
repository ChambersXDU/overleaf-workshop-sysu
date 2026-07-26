// Minimal in-memory mock of the 'vscode' API surface used by
// out/scm/localReplicaSCM.js and its light dependencies.
const posix = require('path').posix;

class Uri {
    constructor(scheme, authority, path, query) {
        this.scheme = scheme;
        this.authority = authority || '';
        this.path = path;
        this.query = query || '';
    }
    static file(p) { return new Uri('file', '', p, ''); }
    static parse(s) {
        const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?]*)([^?]*)(?:\?(.*))?$/i.exec(s);
        if (!m) { throw new Error(`cannot parse uri: ${s}`); }
        return new Uri(m[1], m[2], m[3] || '/', m[4] || '');
    }
    static joinPath(base, ...parts) {
        return new Uri(base.scheme, base.authority, posix.join(base.path, ...parts), base.query);
    }
    with(change) {
        return new Uri(
            change.scheme !== undefined ? change.scheme : this.scheme,
            change.authority !== undefined ? change.authority : this.authority,
            change.path !== undefined ? change.path : this.path,
            change.query !== undefined ? change.query : this.query,
        );
    }
    toString() {
        const query = this.query ? `?${this.query}` : '';
        return `${this.scheme}://${this.authority}${this.path}${query}`;
    }
}

const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 };

class FileSystemError extends Error {
    constructor(code, message) { super(message || code); this.code = code; }
    static FileNotFound(uri) { return new FileSystemError('FileNotFound', `not found: ${uri}`); }
    static FileExists(uri) { return new FileSystemError('FileExists', `exists: ${uri}`); }
}

/**
 * An in-memory file system backend for one uri scheme.
 * `strictParents: true` mimics the Overleaf remote provider, which refuses to
 * write a file or create a folder whose parent folder does not exist yet.
 */
class MemFS {
    constructor(root, { strictParents = false } = {}) {
        this.strictParents = strictParents;
        this.entries = new Map(); // path -> {type:'file', content:Uint8Array} | {type:'dir'}
        this.entries.set(root, { type: 'dir' });
        this.root = root;
        this.writeCount = new Map(); // path -> number of writeFile calls
        this.failWrites = new Map(); // path -> {error, times}
        this.failReadDirs = new Map(); // path -> {error, times}
    }
    _norm(p) { return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p; }
    _parent(p) { return posix.dirname(p); }
    _ensureParent(p) {
        const parent = this._parent(p);
        if (parent === p) { return; }
        const entry = this.entries.get(parent);
        if (!entry || entry.type !== 'dir') {
            if (this.strictParents) { throw FileSystemError.FileNotFound(parent); }
            this._ensureParent(parent);
            this.entries.set(parent, { type: 'dir' });
        }
    }
    failNextWrite(p, error, times = 1) { this.failWrites.set(this._norm(p), { error, times }); }
    failNextReadDir(p, error, times = 1) { this.failReadDirs.set(this._norm(p), { error, times }); }
    writes(p) { return this.writeCount.get(this._norm(p)) || 0; }
    has(p) { return this.entries.has(this._norm(p)); }
    read(p) {
        const entry = this.entries.get(this._norm(p));
        if (!entry || entry.type !== 'file') { return undefined; }
        return new TextDecoder().decode(entry.content);
    }
    write(p, text) { // direct mutation for test setup (no counters, no failures)
        p = this._norm(p);
        this._ensureParentLenient(p);
        this.entries.set(p, { type: 'file', content: new TextEncoder().encode(text) });
    }
    _ensureParentLenient(p) {
        const parent = this._parent(p);
        if (parent === p) { return; }
        if (!this.entries.has(parent)) { this._ensureParentLenient(parent); this.entries.set(parent, { type: 'dir' }); }
    }
    mkdir(p) { this._ensureParentLenient(this._norm(p)); this.entries.set(this._norm(p), { type: 'dir' }); }

    // --- vscode.workspace.fs facing methods ---
    async stat(p) {
        const entry = this.entries.get(this._norm(p));
        if (!entry) { throw FileSystemError.FileNotFound(p); }
        return { type: entry.type === 'dir' ? FileType.Directory : FileType.File, ctime: 0, mtime: 0, size: 0 };
    }
    async readDirectory(p) {
        p = this._norm(p);
        const fail = this.failReadDirs.get(p);
        if (fail && fail.times > 0) {
            fail.times -= 1;
            if (fail.times === 0) { this.failReadDirs.delete(p); }
            throw fail.error;
        }
        const entry = this.entries.get(p);
        if (!entry || entry.type !== 'dir') { throw FileSystemError.FileNotFound(p); }
        const result = [];
        for (const [key, value] of this.entries) {
            if (key !== p && this._parent(key) === p) {
                result.push([posix.basename(key), value.type === 'dir' ? FileType.Directory : FileType.File]);
            }
        }
        return result;
    }
    async readFile(p) {
        const entry = this.entries.get(this._norm(p));
        if (!entry || entry.type !== 'file') { throw FileSystemError.FileNotFound(p); }
        return entry.content;
    }
    async writeFile(p, content) {
        p = this._norm(p);
        const fail = this.failWrites.get(p);
        if (fail && fail.times > 0) {
            fail.times -= 1;
            if (fail.times === 0) { this.failWrites.delete(p); }
            throw fail.error;
        }
        this._ensureParent(p);
        this.writeCount.set(p, (this.writeCount.get(p) || 0) + 1);
        this.entries.set(p, { type: 'file', content });
    }
    async createDirectory(p) {
        p = this._norm(p);
        if (this.strictParents) { this._ensureParent(p); }
        else { this._ensureParentLenient(p); }
        this.entries.set(p, { type: 'dir' });
    }
    async delete(p, options) {
        p = this._norm(p);
        if (!this.entries.has(p)) { throw FileSystemError.FileNotFound(p); }
        this.entries.delete(p);
        if (options && options.recursive) {
            for (const key of [...this.entries.keys()]) {
                if (key.startsWith(p + '/')) { this.entries.delete(key); }
            }
        }
    }
}

const backends = new Map(); // scheme -> MemFS
function fsFor(uri) {
    const backend = backends.get(uri.scheme);
    if (!backend) { throw new Error(`no mock fs for scheme "${uri.scheme}"`); }
    return backend;
}

const workspaceFs = {
    stat: (uri) => fsFor(uri).stat(uri.path),
    readDirectory: (uri) => fsFor(uri).readDirectory(uri.path),
    readFile: (uri) => fsFor(uri).readFile(uri.path),
    writeFile: (uri, content) => fsFor(uri).writeFile(uri.path, content),
    createDirectory: (uri) => fsFor(uri).createDirectory(uri.path),
    delete: (uri, options) => fsFor(uri).delete(uri.path, options),
};

class RelativePattern {
    constructor(base, pattern) { this.base = base; this.pattern = pattern; }
}

class MockWatcher {
    constructor(pattern) {
        this.pattern = pattern;
        this.handlers = { change: [], create: [], delete: [] };
    }
    onDidChange(handler) { this.handlers.change.push(handler); return { dispose() {} }; }
    onDidCreate(handler) { this.handlers.create.push(handler); return { dispose() {} }; }
    onDidDelete(handler) { this.handlers.delete.push(handler); return { dispose() {} }; }
    dispose() {}
    async fire(kind, uri) {
        for (const handler of this.handlers[kind]) { await handler(uri); }
    }
}

const state = {
    watchers: [],
    saveHandlers: [],
    warnings: [],
    errors: [],
};

class ThemeIcon { constructor(id) { this.id = id; } }
class Disposable {
    constructor(fn) { this._fn = fn; }
    dispose() { this._fn && this._fn(); }
}

module.exports = {
    Uri, FileType, FileSystemError, RelativePattern, ThemeIcon, Disposable,
    ProgressLocation: { Notification: 15 },
    l10n: {
        t: (text, args) => {
            if (!args) { return text; }
            return text.replace(/\{(\w+)\}/g, (_, key) => (args[key] !== undefined ? String(args[key]) : `{${key}}`));
        },
    },
    window: {
        withProgress: async (_options, task) => {
            return task({ report() {} }, { isCancellationRequested: false });
        },
        showWarningMessage: (message) => { state.warnings.push(message); return Promise.resolve(undefined); },
        showErrorMessage: (message) => { state.errors.push(message); return Promise.resolve(undefined); },
        showInformationMessage: () => Promise.resolve(undefined),
        createQuickPick: () => { throw new Error('createQuickPick is not supported in unit tests'); },
    },
    workspace: {
        fs: workspaceFs,
        workspaceFolders: undefined,
        getConfiguration: () => ({ get: (_key, defaultValue) => defaultValue }),
        createFileSystemWatcher: (pattern) => {
            const watcher = new MockWatcher(pattern);
            state.watchers.push(watcher);
            return watcher;
        },
        onDidSaveTextDocument: (handler) => {
            state.saveHandlers.push(handler);
            return { dispose() { const i = state.saveHandlers.indexOf(handler); if (i >= 0) { state.saveHandlers.splice(i, 1); } } };
        },
    },
    commands: { executeCommand: () => Promise.resolve() },

    // --- test control surface ---
    __mock: {
        MemFS,
        state,
        registerFS(scheme, backend) { backends.set(scheme, backend); },
        reset() {
            backends.clear();
            state.watchers.length = 0;
            state.saveHandlers.length = 0;
            state.warnings.length = 0;
            state.errors.length = 0;
        },
        async fireSave(doc) {
            for (const handler of [...state.saveHandlers]) { await handler(doc); }
        },
    },
};
