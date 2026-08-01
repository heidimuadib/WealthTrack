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
import Card from '../components/Card';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
import { errorMessage } from '../utils/error';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import useAuthStore from '../store/authStore';
import { authService } from '../services/api';

const EditProfileScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const user = useAuthStore((state) => state.user);
    const setUser = useAuthStore((state) => state.setUser);

    const [name, setName] = useState(user?.name || '');
    const [fieldError, setFieldError] = useState('');
    const [saving, setSaving] = useState(false);

    const { alert, notify } = useFeedback();

    const trimmed = name.trim();
    const unchanged = trimmed === (user?.name || '');

    const handleSave = async () => {
        if (!trimmed) {
            setFieldError(t('editProfile.nameRequired'));
            return;
        }

        setSaving(true);
        try {
            const response = await authService.updateProfile({ name: trimmed });
            // The server's copy is canonical — it trims and validates — so the
            // store takes the echoed user rather than the local draft.
            await setUser(response.data.user);
            notify({ message: t('editProfile.saved') });
            navigation.goBack();
        } catch (err) {
            alert({ title: t('editProfile.couldNotSave'), message: errorMessage(err) });
        } finally {
            setSaving(false);
        }
    };

    const initial = trimmed.charAt(0).toUpperCase() || 'U';

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScreenHeader
                title={t('editProfile.title')}
                subtitle={t('editProfile.subtitle')}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Follows what is typed, so the change is visible before it
                    is saved. */}
                <View style={styles.avatarWrap}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initial}</Text>
                    </View>
                </View>

                <Card>
                    <Input
                        label={t('editProfile.nameLabel')}
                        value={name}
                        onChangeText={(next) => {
                            setName(next);
                            setFieldError('');
                        }}
                        placeholder={t('editProfile.namePlaceholder')}
                        autoCapitalize="words"
                        error={fieldError}
                    />

                    <Text style={styles.emailLabel}>{t('editProfile.emailLabel')}</Text>
                    <Text style={styles.email}>{user?.email || ''}</Text>
                    <Text style={styles.emailNote}>{t('editProfile.emailNote')}</Text>

                    <Button
                        title={t('editProfile.save')}
                        onPress={handleSave}
                        loading={saving}
                        disabled={!trimmed || unchanged}
                    />
                </Card>
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
        avatarWrap: {
            alignItems: 'center',
            marginBottom: spacing.xl,
        },
        avatar: {
            width: 72,
            height: 72,
            borderRadius: radius.round,
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
        },
        avatarText: {
            color: colors.onBrand,
            fontSize: 28,
            fontWeight: '700',
        },
        emailLabel: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: spacing.s,
        },
        email: {
            fontSize: 16,
            color: colors.textPrimary,
        },
        emailNote: {
            ...typography.caption,
            fontSize: 12,
            marginTop: spacing.xs,
            marginBottom: spacing.l,
        },
    });

export default EditProfileScreen;
