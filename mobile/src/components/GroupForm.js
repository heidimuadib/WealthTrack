import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';

import Input from './Input';
import Button from './Button';
import Card from './Card';
import ColorPicker from './ColorPicker';
import { spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// The same three fields on the create screen and the edit screen, so the two
// cannot drift into disagreeing about what a group name is or how long a
// description may be. The screens keep the state and decide what happens on
// save; this only draws the form.

export const MAX_GROUP_NAME = 80;
export const MAX_GROUP_DESCRIPTION = 300;

const GroupForm = ({
    name,
    onChangeName,
    description,
    onChangeDescription,
    color,
    onChangeColor,
    nameError,
    submitLabel,
    onSubmit,
    submitting,
    canSubmit,
    footer,
}) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <Input
                    label={t('groups.nameLabel')}
                    value={name}
                    onChangeText={onChangeName}
                    placeholder={t('groups.namePlaceholder')}
                    error={nameError}
                    autoFocus={!description && !color}
                />

                <Input
                    label={t('groups.descriptionLabel')}
                    value={description}
                    onChangeText={onChangeDescription}
                    placeholder={t('groups.descriptionPlaceholder')}
                />

                <Text style={styles.label}>{t('groups.colourLabel')}</Text>
                <Card style={styles.colourCard}>
                    <ColorPicker value={color} onChange={onChangeColor} />
                </Card>

                {/* The single most common question about this feature, answered
                    before it is asked: nobody else has to install anything. */}
                <Text style={styles.note}>{t('groups.noAccountsNeeded')}</Text>

                {footer}
            </ScrollView>

            <View style={styles.footer}>
                <Button
                    title={submitLabel}
                    onPress={onSubmit}
                    loading={submitting}
                    disabled={!canSubmit || submitting}
                />
            </View>
        </KeyboardAvoidingView>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        content: {
            paddingHorizontal: spacing.l,
            paddingBottom: spacing.xl,
        },
        label: {
            fontSize: 13,
            fontWeight: '600',
            color: colors.textSecondary,
            marginBottom: spacing.s,
        },
        colourCard: {
            marginBottom: spacing.l,
        },
        note: {
            ...typography.caption,
            marginBottom: spacing.l,
        },
        footer: {
            paddingHorizontal: spacing.l,
            paddingTop: spacing.s,
            paddingBottom: spacing.l,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.canvas,
        },
    });

export default GroupForm;
