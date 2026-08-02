/**
 * @format
 */

// Must be the first import in the app. gesture-handler installs its own touch
// dispatcher here, and on Android anything that renders before it does misses
// the wiring — which shows up as a gesture that silently never fires rather
// than as an error.
import 'react-native-gesture-handler';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {initCrashReporting} from './src/services/crashReporting';

// Before the first component renders, so a crash during startup — the ones
// that leave no screen to report from — is still caught. No-ops in development
// and in any build with no DSN configured.
initCrashReporting();

AppRegistry.registerComponent(appName, () => App);
