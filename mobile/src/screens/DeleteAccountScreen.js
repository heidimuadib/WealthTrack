import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';

import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { authService } from '../services/api';
import useAuthStore from '../store/authStore';
import { canSubmitDeletion } from '../utils/deleteAccount';
import { errorMessage } from '../utils/error';
import haptics from '../services/haptics';

// A screen of its own rather than a dialog. What is about to happen needs more
// room than a dialog gives it, and a destructive action reached by two
// deliberate steps is much harder to take by accident than one reached by a
// stray tap on a list row.
const BULLETS = [
    'delete.bulletExpenses',
    'delete.bulletBudgets',
    'delete.bulletCategories',
    'delete.bulletProfile',
];

const DeleteAccountScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const { confirm, notify } = useFeedback();

    // Whether the account has a password is the server's answer, carried on the
    // user record. Guessing it from the presence of an email would be wrong:
    // a Google account has an email too, and has no password behind it.
    const hasPassword = user?.hasPassword === true;
    const phrase = t('delete.phrase');

    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const canSubmit = canSubmitDeletion({
        hasPassword,
        password,
        confirmation,
        phrase,
        submitting,
    });

    const handleDelete = async () => {
        // Checked again here, not only on the button: this is the last point
        // before an irreversible request leaves the device.
        if (!canSubmit) {
            return;
        }

        const confirmed = await confirm({
            title: t('delete.confirmTitle'),
            message: t('delete.confirmMsg'),
            confirmLabel: t('delete.confirmAction'),
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            await authService.deleteAccount(hasPassword ? password : undefined);

            // Warning, never success. This is the most irreversible thing the
            // app can do, and there is nothing here to congratulate.
            haptics.warning();
            notify({ message: t('delete.done') });

            // The account is gone, so the session standing on it has to go too.
            // logout() drops the token and the cached user from the device and
            // clears the React Query cache, which is what stops the next screen
            // from painting the deleted account's figures on its way out.
            await logout();
        } catch (err) {
            // A rejected password is the one failure worth naming precisely;
            // everything else is already worded for the situation by the API.
            haptics.error();

            const wrongPassword = hasPassword && err?.response?.status === 401;
            setError(wrongPassword ? t('delete.wrongPassword') : errorMessage(err));
            // The session is untouched on failure — nothing was deleted, so the
            // user stays exactly where they were and can try again.
            setSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScreenHeader
                title={t('delete.title')}
                subtitle={t('delete.subtitle')}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Card style={styles.warning}>
                    <View style={styles.warningHead}>
                        <View style={styles.warningIcon}>
                            <AlertTriangle color={colors.danger} size={20} />
                        </View>
                        <Text style={styles.warningTitle}>{t('delete.heading')}</Text>
                    </View>

                    {BULLETS.map((key) => (
                        <View key={key} style={styles.bulletRow}>
                            <View style={styles.bulletDot} />
                            <Text style={styles.bulletText}>{t(key)}</Text>
                        </View>
                    ))}

                    <Text style={styles.irreversible}>{t('delete.irreversible')}</Text>
                </Card>

                {hasPassword ? (
                    <Input
                        label={t('delete.passwordLabel')}
                        value={password}
                        onChangeText={(next) => {
                            setError('');
                            setPassword(next);
                        }}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete="password"
                        textContentType="password"
                        placeholder={t('login.yourPassword')}
                    />
                ) : (
                    <>
                        <Text style={styles.googleNote}>{t('delete.googleNote')}</Text>
                        <Input
                            label={t('delete.phraseLabel', { phrase })}
                            value={confirmation}
                            onChangeText={(next) => {
                                setError('');
                                setConfirmation(next);
                            }}
                            autoCapitalize="characters"
                            placeholder={phrase}
                        />
                    </>
                )}

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <Button
                    title={t('delete.action')}
                    onPress={handleDelete}
                    variant="danger"
                    loading={submitting}
                    disabled={!canSubmit}
                    icon={<AlertTriangle color={colors.danger} size={16} />}
                    style={styles.action}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
        content: {
            padding: spacing.l,
            paddingBottom: spacing.xxxl,
        },
        warning: {
            borderColor: colors.danger,
            marginBottom: spacing.xl,
        },
        warningHead: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing.l,
        },
        warningIcon: {
            width: 38,
            height: 38,
            borderRadius: radius.s,
            backgroundColor: colors.dangerTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        warningTitle: {
            ...typography.h2,
            flex: 1,
        },
        bulletRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            marginBottom: spacing.s,
        },
        bulletDot: {
            width: 5,
            height: 5,
            borderRadius: radius.round,
            backgroundColor: colors.textMuted,
            marginTop: 8,
            marginRight: spacing.m,
        },
        bulletText: {
            flex: 1,
            ...typography.caption,
            lineHeight: 20,
        },
        irreversible: {
            marginTop: spacing.m,
            fontSize: 13,
            fontWeight: '600',
            color: colors.danger,
            lineHeight: 19,
        },
        googleNote: {
            ...typography.caption,
            lineHeight: 19,
            marginBottom: spacing.m,
        },
        errorBox: {
            backgroundColor: colors.dangerTint,
            borderRadius: radius.s,
            paddingVertical: spacing.m,
            paddingHorizontal: spacing.l,
            marginTop: spacing.m,
        },
        errorText: {
            fontSize: 13,
            color: colors.danger,
        },
        action: {
            marginTop: spacing.xl,
        },
    });

export default DeleteAccountScreen;
