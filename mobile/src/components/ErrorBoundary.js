import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

import Button from './Button';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { reportFatal, isCrashReportingActive } from '../services/crashReporting';

// What the user sees instead of a white screen. Rendered inside the language
// and theme providers, so it is translated and follows the scheme like
// everything else.
//
// No stack trace, no error message, no "TypeError: undefined is not an object".
// A stack is for whoever fixes it, and it is already on its way to them; to the
// person holding the phone it is noise that looks like their money is gone.
// Saying the saved data is safe is the one fact they actually want.
const ErrorFallback = ({ onRetry }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    return (
        <View style={styles.container} accessibilityRole="alert">
            <View style={styles.icon}>
                <AlertTriangle color={colors.danger} size={26} />
            </View>

            <Text style={styles.title}>{t('crash.title')}</Text>
            <Text style={styles.message}>{t('crash.message')}</Text>

            {/* Claimed only when a report was genuinely sent. Telling someone
                their crash was reported when reporting is switched off is a
                small lie that costs the rest of the screen its credibility. */}
            {isCrashReportingActive() ? (
                <Text style={styles.reported}>{t('crash.reported')}</Text>
            ) : null}

            <Button title={t('errors.tryAgain')} onPress={onRetry} style={styles.action} />
        </View>
    );
};

// A constructor rather than class fields. The preset transforms fields fine,
// but this project has been bitten once already by class-field transforms
// reaching React Native's own sources, and an error boundary is the last
// component that should depend on that going right.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
        this.handleRetry = this.handleRetry.bind(this);
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        // The only place in the app that reports anything. Everything else is
        // a handled failure with a message and a retry.
        reportFatal(error, info?.componentStack);
    }

    handleRetry() {
        // Clearing the flag remounts the subtree. If the crash is deterministic
        // it will happen again, which is honest — but a great many render
        // crashes come from one bad piece of state that the remount discards.
        this.setState({ hasError: false });
    }

    render() {
        if (this.state.hasError) {
            return <ErrorFallback onRetry={this.handleRetry} />;
        }

        return this.props.children;
    }
}

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
            backgroundColor: colors.canvas,
        },
        icon: {
            width: 64,
            height: 64,
            borderRadius: radius.round,
            backgroundColor: colors.dangerTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.xl,
        },
        title: {
            ...typography.h1,
            textAlign: 'center',
            marginBottom: spacing.m,
        },
        message: {
            ...typography.caption,
            textAlign: 'center',
            lineHeight: 21,
        },
        reported: {
            ...typography.caption,
            textAlign: 'center',
            marginTop: spacing.m,
            fontSize: 12,
        },
        action: {
            marginTop: spacing.xxl,
            alignSelf: 'stretch',
        },
    });

export { ErrorFallback };
export default ErrorBoundary;
