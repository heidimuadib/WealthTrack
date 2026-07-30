import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { spacing, useTheme } from '../theme';

// Headers sit directly on the canvas — no bar, no bottom rule. The type
// hierarchy does the separating.
const ScreenHeader = ({ title, subtitle, onBack, right }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {onBack ? (
                    <TouchableOpacity onPress={onBack} style={styles.back} hitSlop={hitSlop}>
                        <ChevronLeft color={theme.colors.textPrimary} size={24} />
                    </TouchableOpacity>
                ) : null}

                <View style={styles.titles}>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                    <Text style={theme.typography.h1}>{title}</Text>
                </View>

                {right ? <View style={styles.right}>{right}</View> : null}
            </View>
        </View>
    );
};

const hitSlop = { top: 12, bottom: 12, left: 12, right: 12 };

const createStyles = ({ typography }) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: spacing.l,
            paddingTop: spacing.xxl,
            paddingBottom: spacing.l,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        back: {
            marginRight: spacing.s,
            marginLeft: -spacing.xs,
        },
        titles: {
            flex: 1,
        },
        subtitle: {
            ...typography.overline,
            marginBottom: 2,
        },
        right: {
            marginLeft: spacing.m,
        },
    });

export default ScreenHeader;
