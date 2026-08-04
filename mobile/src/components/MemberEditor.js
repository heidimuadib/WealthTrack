import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Input from './Input';
import Button from './Button';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';

// Adding and renaming a member, in a sheet rather than a route.
//
// Two fields and a save button do not need a screen of their own, and pushing
// one would put a member's name into the navigation stack — where the crash
// reporter keeps breadcrumbs. This stays in front of the list it edits, so the
// list is still visible behind it and nothing has to be navigated back from.

export const MAX_MEMBER_NAME = 80;
export const MAX_CONTACT_NOTE = 200;

const MemberEditor = ({ visible, member, onSubmit, onClose, submitting }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const insets = useSafeAreaInsets();

    const [name, setName] = useState('');
    const [note, setNote] = useState('');
    const [nameError, setNameError] = useState('');

    // Reset every time the sheet opens, so yesterday's draft never appears
    // over today's member.
    useEffect(() => {
        if (!visible) {
            return;
        }
        setName(member?.name ?? '');
        setNote(member?.contactNote ?? '');
        setNameError('');
    }, [visible, member?.id, member?.name, member?.contactNote]);

    const trimmed = name.trim();
    const editing = Boolean(member);

    const handleSubmit = () => {
        if (!trimmed) {
            setNameError(t('members.nameRequired'));
            return;
        }
        if (submitting) {
            return;
        }

        onSubmit({
            name: trimmed.slice(0, MAX_MEMBER_NAME),
            contactNote: note.trim().slice(0, MAX_CONTACT_NOTE) || null,
        });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                style={styles.backdrop}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

                <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.m }]}>
                    <View style={styles.grabber} />

                    <Text style={styles.title} accessibilityRole="header">
                        {editing ? t('members.edit') : t('members.add')}
                    </Text>

                    <Input
                        label={t('members.nameLabel')}
                        value={name}
                        onChangeText={(value) => {
                            setName(value);
                            if (nameError) {
                                setNameError('');
                            }
                        }}
                        placeholder={t('members.namePlaceholder')}
                        error={nameError}
                        autoFocus
                    />

                    {/* Free text the user writes for themselves — never dialled,
                        never parsed, never sent anywhere. */}
                    <Input
                        label={t('members.noteLabel')}
                        value={note}
                        onChangeText={setNote}
                        placeholder={t('members.notePlaceholder')}
                    />

                    <Button
                        title={editing ? t('members.saved') : t('members.add')}
                        onPress={handleSubmit}
                        loading={submitting}
                        disabled={trimmed === '' || submitting}
                    />
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: colors.scrim,
        },
        sheet: {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: spacing.l,
            paddingTop: spacing.m,
        },
        grabber: {
            alignSelf: 'center',
            width: 36,
            height: 4,
            borderRadius: radius.round,
            backgroundColor: colors.borderStrong,
            marginBottom: spacing.l,
        },
        title: {
            ...typography.h2,
            marginBottom: spacing.l,
        },
    });

export default MemberEditor;
