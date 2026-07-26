// Stub of src/core/remoteFileSystemProvider for unit tests.
// localReplicaSCM only uses `parseUri` at runtime from this module
// (VirtualFileSystem is a type-only import, erased at compile time).
// This mirrors the real implementation in
// src/core/remoteFileSystemProvider.ts (parseUri).
function parseUri(uri) {
    const query = uri.query.split('&').reduce((acc, pair) => {
        const [key, value] = pair.split('=');
        return { ...acc, [key]: value };
    }, {});
    const [userId, projectId] = [query.user, query.project];
    const _pathParts = uri.path.split('/');
    const serverName = uri.authority;
    const projectName = decodeURIComponent(_pathParts[1]);
    const pathParts = _pathParts.splice(2);
    const identifier = `${userId}/${projectId}/${projectName}`;
    return { userId, projectId, serverName, projectName, identifier, pathParts };
}

module.exports = { parseUri };
