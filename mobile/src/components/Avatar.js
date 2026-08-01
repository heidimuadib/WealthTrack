import React, { useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { avatarUri, initialFor } from '../utils/avatar';

// The photo when there is one, the first letter of the name when there is not.
const Avatar = ({ user, size = 44, style }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);

    // Remembered per URL rather than as a bare flag: a photo that failed to
    // load must not poison the next one the user picks.
    const [failedUri, setFailedUri] = useState(null);

    const uri = avatarUri(user);
    const shape = { width: size, height: size, borderRadius: size / 2 };

    // An unreachable server or a file swept from disk shows the letter rather
    // than an empty grey circle.
    if (uri && failedUri !== uri) {
        return (
            <Image
                source={{ uri }}
                style={[styles.image, shape, style]}
                onError={() => setFailedUri(uri)}
                accessibilityIgnoresInvertColors
            />
        );
    }

    return (
        <View style={[styles.fallback, shape, style]}>
            <Text style={[styles.initial, { fontSize: Math.round(size * 0.4) }]}>
                {initialFor(user)}
            </Text>
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        image: {
            backgroundColor: colors.surfaceAlt,
        },
        fallback: {
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
        },
        initial: {
            color: colors.onBrand,
            fontWeight: '700',
        },
    });

export default Avatar;
