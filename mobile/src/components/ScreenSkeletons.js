import React from 'react';
import { View, StyleSheet } from 'react-native';
import {
    SkeletonGroup,
    SkeletonBlock,
    SkeletonCard,
    SkeletonCircle,
    SkeletonListRow,
} from './Skeleton';
import { radius, spacing } from '../theme';
import { useLanguage } from '../i18n';

// One composition per screen, kept together here rather than inlined so the
// shapes stay comparable to one another — the whole effect depends on every
// screen resolving into content the same way.
//
// These deliberately show no numbers, not even placeholder zeroes. A skeleton
// that renders ₱0 has told the user something false about their money, and
// they will believe it for the half second before it changes.

// Roughly the run of a month: enough rows to fill the screen without building
// a tree so large that drawing it delays the content it stands in for.
const ROWS = 5;

export const DashboardSkeleton = () => {
    const { t } = useLanguage();

    return (
        <SkeletonGroup label={t('loading.dashboard')} style={styles.screen}>
            {/* MonthSelector */}
            <SkeletonBlock height={44} rounding={radius.round} style={styles.monthRow} />

            {/* SpendSummaryCard — the gradient hero, the tallest thing here */}
            <SkeletonBlock height={186} rounding={radius.l} style={styles.hero} />

            <SkeletonBlock width={140} height={13} style={styles.sectionTitle} />
            <SkeletonCard style={styles.card}>
                <View style={styles.chartWrap}>
                    <SkeletonCircle size={148} />
                </View>
                {Array.from({ length: 3 }).map((_, index) => (
                    <SkeletonListRow key={index} dotSize={10} caption={false} />
                ))}
            </SkeletonCard>

            <SkeletonBlock width={92} height={13} style={styles.sectionTitle} />
            <SkeletonCard style={styles.card} padded={false}>
                <View style={styles.rowsInset}>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <SkeletonListRow key={index} dotSize={10} />
                    ))}
                </View>
            </SkeletonCard>
        </SkeletonGroup>
    );
};

export const ExpenseListSkeleton = () => {
    const { t } = useLanguage();

    // Two day groups, because the real list is sectioned by day and a flat run
    // of rows would resolve into a different shape than the one promised.
    return (
        <SkeletonGroup label={t('loading.expenses')} style={styles.list}>
            {[0, 1].map((group) => (
                <View key={group}>
                    <View style={styles.sectionHeaderRow}>
                        <SkeletonBlock width={86} height={12} />
                        <SkeletonBlock width={58} height={12} />
                    </View>
                    {Array.from({ length: group === 0 ? 3 : 2 }).map((_, index) => (
                        <SkeletonCard key={index} style={styles.expenseRow}>
                            <SkeletonListRow />
                        </SkeletonCard>
                    ))}
                </View>
            ))}
        </SkeletonGroup>
    );
};

export const BudgetSkeleton = () => {
    const { t } = useLanguage();

    return (
        <SkeletonGroup label={t('loading.budget')} style={styles.screen}>
            <SkeletonBlock height={44} rounding={radius.round} style={styles.monthRow} />

            {/* The remaining-figure card, with its progress bar */}
            <SkeletonCard style={styles.card}>
                <SkeletonBlock width={96} height={12} />
                <SkeletonBlock width="62%" height={34} style={styles.figure} />
                <SkeletonBlock height={10} rounding={radius.round} style={styles.progress} />
                <SkeletonBlock width="72%" height={12} style={styles.footnote} />
            </SkeletonCard>

            {/* The set-a-limit form below it */}
            <SkeletonCard style={styles.card}>
                <SkeletonBlock width={104} height={13} />
                <SkeletonBlock height={52} rounding={radius.m} style={styles.field} />
                <SkeletonBlock height={48} rounding={radius.m} style={styles.field} />
            </SkeletonCard>
        </SkeletonGroup>
    );
};

export const ReportsSkeleton = () => {
    const { t } = useLanguage();

    return (
        <SkeletonGroup label={t('loading.reports')} style={styles.screen}>
            <View style={styles.statRow}>
                {[0, 1].map((index) => (
                    <SkeletonCard
                        key={index}
                        style={[styles.statCard, index === 1 && styles.statCardLast]}
                    >
                        <SkeletonBlock width="70%" height={11} />
                        <SkeletonBlock width="86%" height={26} style={styles.figure} />
                    </SkeletonCard>
                ))}
            </View>

            <SkeletonBlock width={88} height={13} style={styles.sectionTitle} />
            <SkeletonCard style={styles.card}>
                {/* Twelve columns of even height: a bar chart at rest. Varying
                    them would be inventing a spending pattern the user has
                    not got. */}
                <View style={styles.chart}>
                    {Array.from({ length: 12 }).map((_, index) => (
                        <View key={index} style={styles.chartColumn}>
                            <SkeletonBlock width={9} height={54} rounding={radius.s} />
                        </View>
                    ))}
                </View>
            </SkeletonCard>

            <SkeletonBlock width={104} height={13} style={styles.sectionTitle} />
            <SkeletonCard style={styles.card}>
                {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonListRow key={index} dotSize={10} caption={false} />
                ))}
            </SkeletonCard>
        </SkeletonGroup>
    );
};

export const CategoryListSkeleton = () => {
    const { t } = useLanguage();

    return (
        <SkeletonGroup label={t('loading.categories')} style={styles.list}>
            {Array.from({ length: ROWS }).map((_, index) => (
                <SkeletonCard key={index} style={styles.categoryRow}>
                    <SkeletonListRow dotSize={12} caption={false} amount={false} />
                </SkeletonCard>
            ))}
        </SkeletonGroup>
    );
};

// The one place a skeleton stands in for a single row rather than a screen.
// Without it the chip row collapses to nothing and the save button jumps up
// the screen the moment categories arrive.
export const CategoryChipsSkeleton = () => {
    const { t } = useLanguage();

    return (
        <SkeletonGroup label={t('loading.categories')} style={styles.chipRow}>
            {[112, 88, 132].map((width, index) => (
                <SkeletonBlock
                    key={width}
                    width={width}
                    height={44}
                    rounding={radius.round}
                    style={index === 0 ? null : styles.chipGap}
                />
            ))}
        </SkeletonGroup>
    );
};

// No colours here — spacing and radius are scheme-independent, and every
// coloured surface comes from the primitives, which read the theme themselves.
const styles = StyleSheet.create({
        screen: {
            paddingHorizontal: spacing.l,
            paddingTop: spacing.s,
        },
        list: {
            paddingHorizontal: spacing.l,
            paddingTop: spacing.s,
        },
        monthRow: {
            marginBottom: spacing.l,
        },
        hero: {
            marginBottom: spacing.xl,
        },
        sectionTitle: {
            marginBottom: spacing.m,
        },
        card: {
            marginBottom: spacing.xl,
        },
        chartWrap: {
            alignItems: 'center',
            paddingVertical: spacing.m,
            marginBottom: spacing.m,
        },
        rowsInset: {
            paddingHorizontal: spacing.l,
        },
        sectionHeaderRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: spacing.l,
            paddingBottom: spacing.s,
        },
        expenseRow: {
            paddingHorizontal: spacing.l,
            paddingVertical: 0,
            marginBottom: spacing.s,
        },
        categoryRow: {
            paddingHorizontal: spacing.l,
            paddingVertical: 0,
            marginBottom: spacing.s,
        },
        figure: {
            marginTop: spacing.m,
        },
        progress: {
            marginTop: spacing.l,
        },
        footnote: {
            marginTop: spacing.m,
        },
        field: {
            marginTop: spacing.m,
        },
        statRow: {
            flexDirection: 'row',
            marginBottom: spacing.xl,
        },
        statCard: {
            flex: 1,
        },
        statCardLast: {
            marginLeft: spacing.m,
        },
        chart: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: 62,
        },
        chartColumn: {
            flex: 1,
            alignItems: 'center',
        },
        chipRow: {
            flexDirection: 'row',
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.xs,
        },
        chipGap: {
            marginLeft: spacing.s,
        },
});
