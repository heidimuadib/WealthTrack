import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { Wallet } from 'lucide-react-native';
import Input from '../components/Input';
import Button from '../components/Button';
import { colors, radius, spacing, typography, shadows } from '../theme';
import { authService } from '../services/api';
import useAuthStore from '../store/authStore';

const LoginScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const login = useAuthStore((state) => state.login);

    const switchMode = () => {
        setIsLogin(!isLogin);
        setError('');
    };

    const handleSubmit = async () => {
        if (!email || !password || (!isLogin && !name)) {
            setError('Please fill in all fields.');
            return;
        }

        // The API enforces this too; catching it here avoids a round trip.
        if (!isLogin && password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        setError('');
        setLoading(true);
        try {
            const res = isLogin
                ? await authService.login(email, password)
                : await authService.register(name, email, password);

            const { user, token } = res.data;
            login(user, token);
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView
                contentContainerStyle={styles.scroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.brand}>
                    <View style={styles.mark}>
                        <Wallet color={colors.onBrand} size={26} />
                    </View>
                    <Text style={styles.wordmark}>WealthTrack</Text>
                    <Text style={styles.tagline}>
                        {isLogin
                            ? 'Welcome back. Let’s check your spending.'
                            : 'Start tracking where your money goes.'}
                    </Text>
                </View>

                <View style={styles.card}>
                    {!isLogin ? (
                        <Input
                            label="Name"
                            placeholder="Juan Dela Cruz"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                        />
                    ) : null}

                    <Input
                        label="Email"
                        placeholder="juan@example.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <Input
                        label="Password"
                        placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                    />

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <Button
                        title={isLogin ? 'Log in' : 'Create account'}
                        onPress={handleSubmit}
                        loading={loading}
                    />

                    <TouchableOpacity onPress={switchMode} style={styles.switch}>
                        <Text style={styles.switchText}>
                            {isLogin ? 'New here? ' : 'Already have an account? '}
                            <Text style={styles.switchLink}>
                                {isLogin ? 'Create an account' : 'Log in'}
                            </Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.canvas,
    },
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: spacing.xl,
    },
    brand: {
        alignItems: 'center',
        marginBottom: spacing.xxl,
    },
    mark: {
        width: 60,
        height: 60,
        borderRadius: radius.l,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.l,
        ...shadows.raised,
    },
    wordmark: {
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: -0.6,
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    tagline: {
        ...typography.caption,
        textAlign: 'center',
        maxWidth: 260,
        lineHeight: 19,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.xl,
        ...shadows.card,
    },
    errorBox: {
        backgroundColor: colors.dangerTint,
        borderRadius: radius.s,
        paddingVertical: spacing.m,
        paddingHorizontal: spacing.l,
        marginBottom: spacing.l,
    },
    errorText: {
        fontSize: 13,
        color: colors.danger,
        lineHeight: 18,
    },
    switch: {
        marginTop: spacing.xl,
        alignItems: 'center',
    },
    switchText: {
        ...typography.caption,
    },
    switchLink: {
        color: colors.brand,
        fontWeight: '600',
    },
});

export default LoginScreen;
