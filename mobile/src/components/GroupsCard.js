import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Users, ChevronRight } from 'lucide-react-native';

import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useGroups } from '../hooks/useGroups';

// A way in, not a summary.
//
// The obvious version of this card would say "You're owed ₱400" — and it cannot,
// honestly. A balance belongs to one group and is derived from its whole ledger,
// so a total across every group would mean fetching every group's expenses and
// repayments from the dashboard: an N+1 on the app's most-loaded screen, to
// render one line. The alternative, a zero while that loads, is worse: a zero
// balance and a settled balance look identical, and the card would be quietly
// telling people they are owed nothing.
//
// So it says how many groups are active and where the balances live. One
// request, and nothing invented.

const GroupsCard = ({ onPress, onCreate, style }) => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();

    const { data, isPending, error } = useGroups();
    const groups = data ?? [];
    const count = groups.length;

    // The subtitle carries the state, so a screen reader hears one sentence
    // rather than a count and a hint it has to join up itself.
    const subtitle = () => {
        if (isPending) {
            return null;
        }
        if (error) {
            return t('groups.cardError');
        }
        if (count === 0) {
            return t('groups.cardEmpty');
        }
        return t('groups.cardHelper');
    };

    const headline = () => {
        if (isPending || error) {
            return t('groups.cardTitle');
        }
        if (count === 0) {
            return t('groups.cardTitle');
        }
        return count === 1 ? t('groups.cardOne') : t('groups.cardMany', { count });
    };

    // An empty account gets the action that starts one; everything else opens
    // the list. Both are the same tap target either way.
    const action = count === 0 && !isPending && !error ? onCreate : onPress;
    const label = [headline(), subtitle()].filter(Boolean).join('. ');

    return (
        <TouchableOpacity
            style={[styles.card, style]}
            onPress={action}
            activeOpacity={0.7}
            // One control, one announcement. The icon and the chevron are
            // decorative — the chevron repeats what the role already says.
            accessible
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={count === 0 ? t('groups.cardEmptyAction') : t('groups.cardOpen')}
        >
            <View style={styles.icon} importantForAccessibility="no-hide-descendants">
                <Users color={colors.brand} size={18} />
            </View>

            <View style={styles.main} importantForAccessibility="no-hide-descendants">
                {isPending ? (
                    // Shaped like the two lines that are coming rather than a
                    // spinner, and carrying no invented figure.
                    <>
                        <View style={[styles.ghost, styles.ghostTitle]} />
                        <View style={[styles.ghost, styles.ghostMeta]} />
                    </>
                ) : (
                    <>
                        <Text style={styles.title} numberOfLines={1}>
                            {headline()}
                        </Text>
                        <Text style={styles.meta} numberOfLines={2}>
                            {subtitle()}
                        </Text>
                    </>
                )}
            </View>

            <ChevronRight
                color={colors.textMuted}
                size={18}
                importantForAccessibility="no-hide-descendants"
            />
        </TouchableOpacity>
    );
};

const createStyles = ({ colors, typography }) =>
    StyleSheet.create({
        card: {
            flexDirection: 'row',
            alignItems: 'center',
            // Comfortably past the 44pt minimum, and the same height as the
            // settings rows this borrows its shape from.
            minHeight: 64,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.l,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.m,
        },
        icon: {
            width: 34,
            height: 34,
            borderRadius: radius.s,
            backgroundColor: colors.brandTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.m,
        },
        main: {
            flex: 1,
        },
        title: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
        },
        meta: {
            ...typography.caption,
            marginTop: 2,
        },
        ghost: {
            backgroundColor: colors.borderStrong,
            borderRadius: radius.s,
            opacity: 0.5,
        },
        ghostTitle: {
            width: '45%',
            height: 13,
        },
        ghostMeta: {
            width: '70%',
            height: 11,
            marginTop: spacing.s,
        },
    });

export default GroupsCard;
