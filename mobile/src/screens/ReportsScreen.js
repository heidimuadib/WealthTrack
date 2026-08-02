import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
} from 'react-native';
import { BarChart3 } from 'lucide-react-native';

import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { ReportsSkeleton } from '../components/ScreenSkeletons';
import ScreenHeader from '../components/ScreenHeader';
import YearSelector from '../components/YearSelector';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import { useReportSummary } from '../hooks/useReports';
import { formatCompact, formatCurrency, monthName, monthNameShort } from '../utils/format';

const CHART_HEIGHT = 132;

const ReportsScreen = ({ navigation }) => {
    const theme = useTheme();
    const { colors } = theme;
    const { t } = useLanguage();
    const styles = useMemo(() => createStyles(theme), [theme]);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const query = useReportSummary(year);

    const report = query.data;
    const months = report?.months ?? [];
    const total = report?.total ?? 0;
    const maxMonth = months.reduce((max, item) => Math.max(max, item.total), 0);

    // Pace, not calendar: dividing January's total by twelve would call every
    // year underspent until December.
    const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const monthlyAverage = total / monthsElapsed;

    const [selected, setSelected] = useState(null);

    // Reset the selection when the data changes shape: the default highlight
    // is the current month this year, or the year's biggest month otherwise.
    useEffect(() => {
        if (!report) {
            return;
        }
        if (year === now.getFullYear()) {
            setSelected(now.getMonth() + 1);
            return;
        }
        const biggest = report.months.reduce(
            (best, item) => (item.total > best.total ? item : best),
            { month: 12, total: -1 }
        );
        setSelected(biggest.month);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [report, year]);

    const selectedMonth = months.find((item) => item.month === selected);

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={t('reports.title')}
                subtitle={t('reports.subtitle')}
                onBack={() => navigation.goBack()}
            />

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={query.isRefetching}
                        onRefresh={query.refetch}
                        tintColor={colors.brand}
                        colors={[colors.brand]}
                    />
                }
            >
                <View style={styles.yearRow}>
                    <YearSelector value={year} onChange={setYear} />
                </View>

                {query.isPending ? (
                    <ReportsSkeleton />
                ) : query.error ? (
                    <ErrorState error={query.error} onRetry={query.refetch} />
                ) : total === 0 ? (
                    <Card>
                        <EmptyState
                            icon={BarChart3}
                            title={t('reports.emptyTitle', { year })}
                            message={t('reports.emptyMsg')}
                        />
                    </Card>
                ) : (
                    <>
                        <View style={styles.statRow}>
                            <Card style={styles.statCard}>
                                <Text style={styles.statLabel}>{t('reports.spentIn', { year })}</Text>
                                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                                    {formatCompact(total)}
                                </Text>
                            </Card>
                            <Card style={[styles.statCard, styles.statCardLast]}>
                                <Text style={styles.statLabel}>{t('reports.monthlyAverage')}</Text>
                                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                                    {formatCompact(monthlyAverage)}
                                </Text>
                            </Card>
                        </View>

                        <Text style={styles.sectionTitle}>{t('reports.byMonth')}</Text>
                        <Card>
                            <View style={styles.chart}>
                                {months.map((item) => {
                                    const isSelected = item.month === selected;
                                    const barHeight =
                                        maxMonth > 0 && item.total > 0
                                            ? Math.max((item.total / maxMonth) * CHART_HEIGHT, 4)
                                            : 3;

                                    return (
                                        <TouchableOpacity
                                            key={item.month}
                                            style={styles.chartColumn}
                                            onPress={() => setSelected(item.month)}
                                            accessibilityLabel={`${monthName(item.month)}: ${formatCurrency(item.total)}`}
                                        >
                                            <View style={styles.barTrack}>
                                                <View
                                                    style={[
                                                        styles.bar,
                                                        {
                                                            height: barHeight,
                                                            backgroundColor:
                                                                item.total === 0
                                                                    ? colors.surfaceAlt
                                                                    : isSelected
                                                                      ? colors.brand
                                                                      : colors.brandTint,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <Text
                                                style={[
                                                    styles.monthLabel,
                                                    isSelected && styles.monthLabelSelected,
                                                ]}
                                            >
                                                {monthNameShort(item.month).charAt(0)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {selectedMonth ? (
                                <View style={styles.chartCaption}>
                                    <Text style={styles.chartCaptionMonth}>
                                        {monthName(selectedMonth.month)}
                                    </Text>
                                    <Text style={styles.chartCaptionValue}>
                                        {formatCurrency(selectedMonth.total)}
                                    </Text>
                                </View>
                            ) : null}
                        </Card>

                        <Text style={styles.sectionTitle}>{t('reports.byCategory')}</Text>
                        <Card>
                            {report.categories.map((item, index) => (
                                <View
                                    key={item.id}
                                    style={[styles.categoryRow, index > 0 && styles.categoryDivider]}
                                >
                                    <View
                                        style={[
                                            styles.dot,
                                            { backgroundColor: item.color || colors.textMuted },
                                        ]}
                                    />
                                    <Text style={styles.categoryName} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={styles.categoryShare}>
                                        {Math.round(item.share * 100)}%
                                    </Text>
                                    <Text style={styles.categoryValue}>
                                        {formatCurrency(item.total)}
                                    </Text>
                                </View>
                            ))}
                        </Card>
                    </>
                )}
            </ScrollView>
        </View>
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
        yearRow: {
            marginBottom: spacing.l,
        },
        statRow: {
            flexDirection: 'row',
        },
        statCard: {
            flex: 1,
            marginRight: spacing.m,
        },
        statCardLast: {
            marginRight: 0,
        },
        statLabel: {
            ...typography.overline,
            marginBottom: spacing.s,
        },
        statValue: {
            fontSize: 24,
            fontFamily: 'SpaceGrotesk-Bold',
            letterSpacing: -0.6,
            color: colors.textPrimary,
        },
        sectionTitle: {
            ...typography.h2,
            marginTop: spacing.xl,
            marginBottom: spacing.m,
        },
        chart: {
            flexDirection: 'row',
            alignItems: 'flex-end',
            height: CHART_HEIGHT + 26,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingBottom: 0,
        },
        chartColumn: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
        },
        barTrack: {
            justifyContent: 'flex-end',
        },
        bar: {
            width: 14,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
        },
        monthLabel: {
            marginTop: spacing.s,
            marginBottom: spacing.s,
            fontSize: 10,
            fontWeight: '600',
            color: colors.textMuted,
        },
        monthLabelSelected: {
            color: colors.brand,
        },
        chartCaption: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: spacing.m,
        },
        chartCaptionMonth: {
            fontSize: 14,
            fontWeight: '600',
            color: colors.textSecondary,
        },
        chartCaptionValue: {
            ...typography.amount,
        },
        categoryRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: spacing.m,
        },
        categoryDivider: {
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        dot: {
            width: 9,
            height: 9,
            borderRadius: radius.round,
            marginRight: spacing.m,
        },
        categoryName: {
            flex: 1,
            fontSize: 14,
            color: colors.textPrimary,
        },
        categoryShare: {
            fontSize: 12,
            color: colors.textMuted,
            width: 42,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
        },
        categoryValue: {
            ...typography.amount,
            width: 96,
            textAlign: 'right',
        },
    });

export default ReportsScreen;
