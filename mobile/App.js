import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppNavigator from './src/navigation/AppNavigator';
import { FeedbackProvider } from './src/components/FeedbackProvider';
import { queryClient } from './src/lib/queryClient';
import { ThemeProvider } from './src/theme';
import { LanguageProvider } from './src/i18n';

const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            {/* Language sits above theme: everything below may render text. */}
            <LanguageProvider>
            {/* Outermost of the visual providers: every surface below reads
                colours from it, including the navigator's own transition
                background. */}
            <ThemeProvider>
                <SafeAreaProvider>
                    {/* Wraps the navigator so dialogs and the snackbar render above it. */}
                    <FeedbackProvider>
                        <AppNavigator />
                    </FeedbackProvider>
                </SafeAreaProvider>
            </ThemeProvider>
            </LanguageProvider>
        </QueryClientProvider>
    );
};

export default App;
