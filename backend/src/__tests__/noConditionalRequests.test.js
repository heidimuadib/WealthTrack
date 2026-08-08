jest.mock('../lib/prisma', () => require('../../test/fakePrisma').createFakePrisma());

const http = require('http');

// A live server, not a mocked res, because the thing under test is an express
// setting rather than anything a controller does. res.json is where the ETag
// would be attached, so the only honest way to prove it is not there is to read
// the bytes off a socket.

let server;
let base;
let logSpy;

beforeAll(async () => {
    // The app logs every request outside production. Useful on the LAN, pure
    // noise in a test runner.
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const app = require('../index');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    logSpy.mockRestore();
});

// Regression guard for the bug that reached production on 2026-08-08.
//
// Express's default weak ETag turned every unchanged refetch into a 304 with an
// empty body. Axios rejects a 304 — its default validateStatus is 200-299 — so
// react-query recorded an error and the group screen rendered "Could not load
// the shared expenses" on top of cached data that was perfectly fine. The save
// had worked; only the refetch looked broken.
describe('conditional requests', () => {
    it('sends no ETag on a JSON response', async () => {
        const res = await fetch(`${base}/health`);

        expect(res.status).toBe(200);
        expect(res.headers.get('etag')).toBeNull();
    });

    it('answers 200 with a body rather than 304, even when asked conditionally', async () => {
        const first = await fetch(`${base}/health`);
        const body = await first.json();
        expect(body.status).toBe('ok');

        // The header the phone's HTTP cache attaches. Without an ETag to match,
        // there is nothing for express to compare and no 304 to return. The
        // value is deliberately one express would have produced itself.
        const second = await fetch(`${base}/health`, {
            headers: { 'If-None-Match': 'W/"1d-l9Fw4VUO7kr8CvBlt4zaMCqXZ0w"' },
        });

        expect(second.status).toBe(200);
        expect(second.status).not.toBe(304);
        expect((await second.json()).status).toBe('ok');
    });

    it('never answers 304 to a repeated unauthenticated request either', async () => {
        const first = await fetch(`${base}/groups`);
        const etag = first.headers.get('etag');
        expect(etag).toBeNull();

        const second = await fetch(`${base}/groups`, {
            headers: { 'If-None-Match': 'W/"any-previous-value"' },
        });
        expect(second.status).toBe(401);
    });

    // The setting is deliberately scoped: express.static builds its ETags
    // through the `send` module, which app.set('etag') does not reach. Browsers
    // handle a 304 correctly, so the public pages keep revalidating.
    it('leaves the express-level setting off', () => {
        expect(require('../index').get('etag')).toBe(false);
    });
});
