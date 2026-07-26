// Redirect module resolution so the compiled extension code under out/
// can be unit-tested in plain Node without a running VS Code instance:
//  - 'vscode'                              -> our in-memory mock
//  - '../core/remoteFileSystemProvider'    -> a light stub (only parseUri is
//    used at runtime by localReplicaSCM; the real module drags in socket.io,
//    global state, webviews, ...)
const path = require('path');
const Module = require('module');

if (!Module.__overleafTestHookInstalled) {
    Module.__overleafTestHookInstalled = true;
    const originalResolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...args) {
        if (request === 'vscode') {
            return path.resolve(__dirname, 'mock', 'vscode.js');
        }
        if (request === '../core/remoteFileSystemProvider') {
            return path.resolve(__dirname, 'mock', 'remoteFileSystemProvider.js');
        }
        return originalResolve.call(this, request, ...args);
    };
}
