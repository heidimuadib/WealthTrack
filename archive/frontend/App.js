import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { FeedbackProvider } from './src/components/FeedbackProvider';

const App = () => {
    return (
        <SafeAreaProvider>
            {/* Wraps the navigator so dialogs and the snackbar render above it. */}
            <FeedbackProvider>
                <AppNavigator />
            </FeedbackProvider>
        </SafeAreaProvider>
    );
};

export default App;
