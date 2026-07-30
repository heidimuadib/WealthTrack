import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppNavigator from './src/navigation/AppNavigator';
import { FeedbackProvider } from './src/components/FeedbackProvider';
import { queryClient } from './src/lib/queryClient';
import { ThemeProvider } from './src/theme';

const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            {/* Outermost of the three: every surface below reads colours from
                it, including the navigator's own transition background. */}
            <ThemeProvider>
                <SafeAreaProvider>
                    {/* Wraps the navigator so dialogs and the snackbar render above it. */}
                    <FeedbackProvider>
                        <AppNavigator />
                    </FeedbackProvider>
                </SafeAreaProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
};

export default App;
