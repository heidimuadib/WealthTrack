import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CloudOff, TriangleAlert } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../theme';
import { isOffline, errorMessage, errorTitle } from '../utils/error';
import Button from './Button';

// The counterpart to EmptyState, for when a screen has nothing to show because
// the request failed rather than because there is genuinely no data. Keeping
// the two visually distinct is the whole point: one says "add something", this
// one says "try again".
const ErrorState = ({ error, onRetry, retrying = false }) => {
    const Icon = isOffline(error) ? CloudOff : TriangleAlert;

    return (
        <View style={styles.container}>
            <View style={styles.iconWrap}>
                <Icon color={colors.danger} size={26} />
            </View>

            <Text style={styles.title}>{errorTitle(error)}</Text>
            <Text style={styles.message}>{errorMessage(error)}</Text>

            {onRetry ? (
                <Button
                    title="Try again"
                    onPress={onRetry}
                    loading={retrying}
                    variant="secondary"
                    size="small"
                    style={styles.action}
                />
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingVertical: spacing.xxxl,
        paddingHorizontal: spacing.xl,
    },
    iconWrap: {
        width: 56,
        height: 56,
        borderRadius: radius.round,
        backgroundColor: colors.dangerTint,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.l,
    },
    title: {
        ...typography.h2,
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    message: {
        ...typography.caption,
        textAlign: 'center',
        lineHeight: 19,
        maxWidth: 280,
    },
    action: {
        marginTop: spacing.l,
    },
});

export default ErrorState;
