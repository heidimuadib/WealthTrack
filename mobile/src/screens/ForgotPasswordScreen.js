import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { MailCheck } from 'lucide-react-native';

import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import ScreenHeader from '../components/ScreenHeader';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { authService } from '../services/api';
import { errorMessage } from '../utils/error';

// Reached from the sign-in screen, so the person using it is by definition
// signed out.
//
// The success state says the same thing whatever happened: address registered,
// address unknown, account that signs in with Google and has no password to
// reset. The server answers identically for all three, and a screen that drew
// any distinction would hand back exactly the disclosure the server refused to
// make.
const ForgotPasswordScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t, language } = useLanguage();

    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    const canSubmit = email.trim().length > 0 && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) {
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            // The language goes with it: the link opens in a browser, which
            // has no idea what the app was set to.
            await authService.forgotPassword(email.trim(), language);
            setSent(true);
        } catch (err) {
            // Only a failure to reach the server lands here — the endpoint
            // answers success for every account state on purpose. Rate
            // limiting is the one refusal a user can actually hit.
            setError(errorMessage(err));
            setSubmitting(false);
        }
    };

    if (sent) {
        return (
            <View style={styles.container}>
                <ScreenHeader
                    title={t('password.forgotTitle')}
                    subtitle={t('password.forgotSubtitle')}
                    onBack={() => navigation.goBack()}
                />

                <View style={styles.content}>
                    <Card style={styles.sentCard}>
                        <View style={styles.sentIcon}>
                            <MailCheck color={colors.brand} size={26} />
                        </View>
                        <Text style={styles.sentTitle}>{t('password.sentTitle')}</Text>
                        <Text style={styles.sentBody}>{t('password.sent')}</Text>
                        <Text style={styles.sentHint}>{t('password.sentHint')}</Text>
                    </Card>

                    <Button
                        title={t('password.backToLogin')}
                        onPress={() => navigation.goBack()}
                        style={styles.action}
                    />
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScreenHeader
                title={t('password.forgotTitle')}
                subtitle={t('password.forgotSubtitle')}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.intro}>{t('password.forgotIntro')}</Text>

                <Input
                    label={t('password.emailLabel')}
                    value={email}
                    onChangeText={(next) => {
                        setError('');
                        setEmail(next);
                    }}
                    placeholder={t('login.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                />

                {error ? (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                <Button
                    title={t('password.send')}
                    onPress={handleSubmit}
                    loading={submitting}
                    disabled={!canSubmit}
                    style={styles.action}
                />

                <Text style={styles.note}>{t('password.googleNote')}</Text>
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
            marginTop: spacing.xl,
            lineHeight: 18,
        },
        sentCard: {
            alignItems: 'center',
        },
        sentIcon: {
            width: 60,
            height: 60,
            borderRadius: radius.round,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.l,
        },
        sentTitle: {
            ...typography.h2,
            textAlign: 'center',
            marginBottom: spacing.s,
        },
        sentBody: {
            ...typography.caption,
            textAlign: 'center',
            lineHeight: 21,
        },
        sentHint: {
            ...typography.caption,
            fontSize: 12,
            textAlign: 'center',
            marginTop: spacing.m,
        },
    });

export default ForgotPasswordScreen;
