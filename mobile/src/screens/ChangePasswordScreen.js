import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import PasswordStrength from '../components/PasswordStrength';
import { useFeedback } from '../components/FeedbackProvider';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { authService } from '../services/api';
import useAuthStore from '../store/authStore';
import { canSubmitPasswordChange, passwordFormProblem } from '../utils/passwordForm';
import { errorMessage } from '../utils/error';

// One screen for two jobs, because they are the same job seen from either side
// of having a password already. An account with one changes it and must prove
// the old one first; an account created through Google sets its first and has
// nothing to prove it against.
//
// Which of the two this is comes from the server's hasPassword, never from
// guessing — an account can have both a Google id and a password, and the only
// thing that decides is whether a hash exists.
const ChangePasswordScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const user = useAuthStore((state) => state.user);
    const login = useAuthStore((state) => state.login);
    const { notify } = useFeedback();

    const hasPassword = user?.hasPassword === true;

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const form = { hasPassword, currentPassword, newPassword, confirmPassword, submitting };
    const canSubmit = canSubmitPasswordChange(form);

    const handleSubmit = async () => {
        if (!canSubmit) {
            return;
        }

        // Answered here, in the reader's own language, rather than after a
        // round trip that would come back in English.
        const problem = passwordFormProblem(form);
        if (problem) {
            setError(t(problem));
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const { data } = await authService.changePassword(
                hasPassword ? currentPassword : undefined,
                newPassword
            );

            // The change ends every session opened before it, this one
            // included, so the server hands back a replacement. Storing it
            // through login() keeps the token, the cached profile and its
            // now-true hasPassword in step.
            await login(data.user, data.token);

            notify({ message: hasPassword ? t('password.changed') : t('password.set') });
            navigation.goBack();
        } catch (err) {
            // Worth naming precisely; everything else is already worded for
            // the situation by the API and translated on the way through.
            const wrongCurrent = hasPassword && err?.response?.status === 401;
            setError(wrongCurrent ? t('password.wrongCurrent') : errorMessage(err));
            setSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScreenHeader
                title={hasPassword ? t('password.changeTitle') : t('password.setTitle')}
                subtitle={hasPassword ? t('password.changeSubtitle') : t('password.setSubtitle')}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {!hasPassword ? <Text style={styles.intro}>{t('password.setIntro')}</Text> : null}

                {hasPassword ? (
                    <Input
                        label={t('password.current')}
                        value={currentPassword}
                        onChangeText={(next) => {
                            setError('');
                            setCurrentPassword(next);
                        }}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete="password"
                        textContentType="password"
                    />
                ) : null}

                <Input
                    label={t('password.new')}
                    value={newPassword}
                    onChangeText={(next) => {
                        setError('');
                        setNewPassword(next);
                    }}
                    placeholder={t('password.newPlaceholder')}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password-new"
                    textContentType="newPassword"
                />

                <PasswordStrength password={newPassword} />

                <Input
                    label={t('password.confirm')}
                    value={confirmPassword}
                    onChangeText={(next) => {
                        setError('');
                        setConfirmPassword(next);
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                />

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <Button
                    title={hasPassword ? t('password.save') : t('password.saveSet')}
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={!canSubmit}
                    style={styles.action}
                />

                <Text style={styles.note}>{t('password.otherSessionsEnded')}</Text>
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
        intro: {
            ...typography.caption,
            lineHeight: 21,
            marginBottom: spacing.xl,
        },
        errorBox: {
            backgroundColor: colors.dangerTint,
            borderRadius: radius.s,
            paddingVertical: spacing.m,
            paddingHorizontal: spacing.l,
            marginTop: spacing.s,
        },
        errorText: {
            fontSize: 13,
            color: colors.danger,
        },
        action: {
            marginTop: spacing.l,
        },
        note: {
            ...typography.caption,
            fontSize: 12,
            textAlign: 'center',
            marginTop: spacing.l,
            lineHeight: 18,
        },
    });

export default ChangePasswordScreen;
