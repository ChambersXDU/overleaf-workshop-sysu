require('./bootstrap');
const assert = require('assert');
const http = require('http');
const { BaseAPI } = require('../../out/api/base');

// Regression tests for the upload path: the extension previously combined
// undici's fetch with the npm `form-data` stream, which cannot be serialized
// by undici — every uploadFile call failed, so files with content never
// reached the server (folders and empty docs use JSON and were fine).
describe('BaseAPI uploads (undici FormData)', function () {
    this.timeout(10000);

    let server, port, captured;
    const identity = { csrfToken: 'csrf-token-1', cookies: 'overleaf.sid=abc' };

    before(async () => {
        server = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                captured = { url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks) };
                res.setHeader('content-type', 'application/json');
                if (req.url.includes('/upload')) {
                    res.end(JSON.stringify({ success: true, entity_id: 'file123', entity_type: 'file' }));
                } else if (req.url.endsWith('/doc')) {
                    res.end(JSON.stringify({ _id: 'doc123' }));
                } else if (req.url.endsWith('/folder')) {
                    res.end(JSON.stringify({ _id: 'folder123', name: 'chapters', folders: [], docs: [], fileRefs: [] }));
                } else {
                    res.statusCode = 404;
                    res.end('{}');
                }
            });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    });
    after(() => server.close());

    it('uploadFile sends a well-formed multipart body the server can parse', async () => {
        const api = new BaseAPI(`http://127.0.0.1:${port}/`);
        const content = new TextEncoder().encode('\\section{Intro} 中文内容');
        const res = await api.uploadFile(identity, 'proj1', 'folder1', 'ch1.tex', content);

        assert.strictEqual(res.type, 'success');
        assert.strictEqual(res.entity._id, 'file123');

        const contentType = captured.headers['content-type'] || '';
        assert.match(contentType, /^multipart\/form-data; boundary=/,
            'multipart content-type with boundary must be set');
        const boundary = contentType.split('boundary=')[1];
        const body = captured.body.toString('utf-8');
        assert.ok(body.includes(`--${boundary}`), 'body must use the declared boundary');
        assert.ok(body.includes('name="qqfile"'), 'file field must be present');
        assert.ok(body.includes('filename="ch1.tex"'), 'filename must be present');
        assert.ok(body.includes('\\section{Intro}'), 'file content must be present');
        assert.ok(body.includes('中文内容'), 'utf-8 content must be preserved');
        assert.ok(body.includes('name="targetFolderId"'), 'folder id field must be present');
        assert.strictEqual(captured.headers['x-csrf-token'], 'csrf-token-1');
        assert.ok(captured.url.includes('folder_id=folder1'), 'folder_id query must be present');
    });

    it('uploadFile preserves non-ascii filenames', async () => {
        const api = new BaseAPI(`http://127.0.0.1:${port}/`);
        const res = await api.uploadFile(identity, 'proj1', 'folder1', '章节一.tex', new TextEncoder().encode('x'));
        assert.strictEqual(res.type, 'success');
        assert.ok(captured.body.toString('utf-8').includes('章节一.tex'), 'utf-8 filename must be preserved');
    });

    it('addDoc and addFolder (JSON requests) still work', async () => {
        const api = new BaseAPI(`http://127.0.0.1:${port}/`);

        const doc = await api.addDoc(identity, 'proj1', 'root', 'new.tex');
        assert.strictEqual(doc.type, 'success');
        assert.strictEqual(doc.entity._id, 'doc123');
        assert.strictEqual(captured.headers['content-type'], 'application/json');

        const folder = await api.addFolder(identity, 'proj1', 'chapters', 'root');
        assert.strictEqual(folder.type, 'success');
        assert.strictEqual(folder.entity._id, 'folder123');
    });

    it('uploadProject sends multipart as well', async () => {
        const api = new BaseAPI(`http://127.0.0.1:${port}/`);
        const res = await api.uploadProject(identity, 'proj.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
        assert.strictEqual(res.type, 'success');
        assert.match(captured.headers['content-type'] || '', /^multipart\/form-data; boundary=/);
        assert.ok(captured.body.toString('latin1').includes('PK'), 'zip magic bytes must be present');
    });
});
