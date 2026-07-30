import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AppNavigator from './src/navigation/AppNavigator';
import { FeedbackProvider } from './src/components/FeedbackProvider';
import { queryClient } from './src/lib/queryClient';

const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <SafeAreaProvider>
                {/* Wraps the navigator so dialogs and the snackbar render above it. */}
                <FeedbackProvider>
                    <AppNavigator />
                </FeedbackProvider>
            </SafeAreaProvider>
        </QueryClientProvider>
    );
};

export default App;
