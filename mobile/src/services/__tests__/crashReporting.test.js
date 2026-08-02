import fs from 'fs';
import path from 'path';

// Each case re-imports the module with __DEV__ and the DSN set the way the
// corresponding build would set them, because init() reads both once.
const load = ({ dev, dsn }) => {
    jest.resetModules();
    global.__DEV__ = dev;

    jest.doMock('../../config/crashReporting.config', () => ({
        SENTRY_DSN: dsn,
        APP_VERSION: '1.0',
        APP_BUILD: '1',
    }));

    return {
        module: require('../crashReporting'),
        Sentry: require('@sentry/react-native'),
    };
};

const originalDev = global.__DEV__;

afterEach(() => {
    global.__DEV__ = originalDev;
    jest.clearAllMocks();
});

describe('when reporting stays off', () => {
    it('never starts in development, even with a DSN configured', () => {
        // A development crash is already on screen in red with a working
        // stack; sending it would only spend the quota.
        const { module, Sentry } = load({ dev: true, dsn: 'https://key@o1.ingest.sentry.io/1' });

        expect(module.initCrashReporting()).toBe(false);
        expect(Sentry.init).not.toHaveBeenCalled();
        expect(module.isCrashReportingActive()).toBe(false);
    });

    it('stays off in a release build with no DSN', () => {
        // The shipped default. Blank is a working state, not a broken one.
        const { module, Sentry } = load({ dev: false, dsn: '' });

        expect(module.initCrashReporting()).toBe(false);
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('reports nothing while inactive', () => {
        const { module, Sentry } = load({ dev: true, dsn: 'https://key@o1.ingest.sentry.io/1' });
        module.initCrashReporting();

        expect(module.reportFatal(new Error('boom'), 'in Thing')).toBe(false);
        expect(Sentry.captureException).not.toHaveBeenCalled();
    });
});

describe('when reporting is on', () => {
    const RELEASE = { dev: false, dsn: 'https://key@o1.ingest.sentry.io/1' };

    it('starts for a release build with a DSN', () => {
        const { module, Sentry } = load(RELEASE);

        expect(module.initCrashReporting()).toBe(true);
        expect(Sentry.init).toHaveBeenCalledTimes(1);
        expect(module.isCrashReportingActive()).toBe(true);
    });

    it('names the build so a stack can be tied to a release', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();

        const options = Sentry.init.mock.calls[0][0];
        expect(options.release).toBe('com.wealthtrack@1.0+1');
        expect(options.dist).toBe('1');
        expect(options.environment).toBe('production');
    });

    it('covers native crashes as well as JavaScript ones', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();

        const options = Sentry.init.mock.calls[0][0];
        expect(options.enableNative).toBe(true);
        expect(options.enableNativeCrashHandling).toBe(true);
        expect(options.attachStacktrace).toBe(true);
    });

    it('collects no identity, no screenshot and no view hierarchy', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();

        const options = Sentry.init.mock.calls[0][0];
        // A screenshot of this app is a screenshot of somebody's finances, and
        // the view hierarchy carries the accessibility labels, which are
        // category names.
        expect(options.sendDefaultPii).toBe(false);
        expect(options.attachScreenshot).toBe(false);
        expect(options.attachViewHierarchy).toBe(false);
    });

    it('turns off everything that would make this an analytics SDK', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();

        const options = Sentry.init.mock.calls[0][0];
        expect(options.tracesSampleRate).toBe(0);
        expect(options.enableAutoPerformanceTracing).toBe(false);
        expect(options.enableAutoSessionTracking).toBe(false);
        // Handled API failures already show the user a translated message.
        expect(options.enableCaptureFailedRequests).toBe(false);
    });

    it('routes everything outbound through the scrubbers', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();

        const options = Sentry.init.mock.calls[0][0];
        const scrubbed = options.beforeSend({ user: { email: 'a@b.test' }, request: { url: '/x' } });

        expect(scrubbed.user).toBeUndefined();
        expect(scrubbed.request).toBeUndefined();
        expect(options.beforeBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
    });

    it('captures a render crash as fatal, with the component stack', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();

        const scope = { setLevel: jest.fn(), setTag: jest.fn(), setContext: jest.fn() };
        Sentry.withScope.mockImplementation((callback) => callback(scope));

        const error = new Error('render blew up');
        expect(module.reportFatal(error, '\n    in HomeScreen')).toBe(true);

        expect(scope.setLevel).toHaveBeenCalledWith('fatal');
        expect(scope.setTag).toHaveBeenCalledWith('handler', 'error_boundary');
        expect(scope.setContext).toHaveBeenCalledWith('react', {
            componentStack: '\n    in HomeScreen',
        });
        expect(Sentry.captureException).toHaveBeenCalledWith(error);
    });

    it('never lets a failing reporter break the recovery screen', () => {
        const { module, Sentry } = load(RELEASE);
        module.initCrashReporting();
        Sentry.withScope.mockImplementation(() => {
            throw new Error('transport is down');
        });

        expect(() => module.reportFatal(new Error('boom'))).not.toThrow();
        expect(module.reportFatal(new Error('boom'))).toBe(false);
    });
});

// Read off disk rather than required. Every case above replaces the config
// module with a stub, and requiring it here would quietly assert against that
// stub instead of the file that actually ships — a test that passes by
// comparing a mock to itself.
describe('release metadata, as it will ship', () => {
    const read = (...segments) =>
        fs.readFileSync(path.join(__dirname, '..', '..', ...segments), 'utf8');

    const config = () => read('config', 'crashReporting.config.js');
    const gradle = () => read('..', 'android', 'app', 'build.gradle');

    const constant = (source, name) => source.match(new RegExp(`${name} = '([^']*)'`))?.[1];

    it('matches the version Gradle actually builds', () => {
        // A report attributed to the wrong build is worse than one carrying no
        // version at all, and these two files have no other link between them.
        const version = constant(config(), 'APP_VERSION');
        const build = constant(config(), 'APP_BUILD');

        expect(version).toBeTruthy();
        expect(build).toBeTruthy();
        expect(gradle()).toMatch(new RegExp(`versionName\\s+"${version}"`));
        expect(gradle()).toMatch(new RegExp(`versionCode\\s+${build}\\b`));
    });

    it('ships with no DSN, so nothing reports until one is added deliberately', () => {
        expect(constant(config(), 'SENTRY_DSN')).toBe('');
    });
});
