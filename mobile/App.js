import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { FeedbackProvider } from './src/components/FeedbackProvider';
import { queryClient } from './src/lib/queryClient';
import { ThemeProvider } from './src/theme';
import { LanguageProvider } from './src/i18n';

const App = () => {
    return (
        // The stack navigator happens to mount one of these internally, so
        // gestures would work today by accident. Declaring it here makes the
        // swipe on the expenses list depend on this app's own tree rather than
        // on an implementation detail of a navigation library.
        <GestureHandlerRootView style={rootStyle}>
        <QueryClientProvider client={queryClient}>
            {/* Language sits above theme: everything below may render text. */}
            <LanguageProvider>
            {/* Outermost of the visual providers: every surface below reads
                colours from it, including the navigator's own transition
                background. */}
            <ThemeProvider>
                <SafeAreaProvider>
                    {/* Below language and theme so the recovery screen it shows
                        is translated and follows the scheme, and above the
                        navigator so a crash on any screen lands here instead of
                        unmounting the app to a white rectangle. */}
                    <ErrorBoundary>
                        {/* Wraps the navigator so dialogs and the snackbar render above it. */}
                        <FeedbackProvider>
                            <AppNavigator />
                        </FeedbackProvider>
                    </ErrorBoundary>
                </SafeAreaProvider>
            </ThemeProvider>
            </LanguageProvider>
        </QueryClientProvider>
        </GestureHandlerRootView>
    );
};

// Module scope so the root view is not handed a fresh object every render.
const rootStyle = { flex: 1 };

export default App;
