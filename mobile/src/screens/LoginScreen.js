import React, { useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import Input from '../components/Input';
import Button from '../components/Button';
import BrandMark from '../components/BrandMark';
import GoogleLogo from '../components/GoogleLogo';
import PasswordStrength from '../components/PasswordStrength';
import { radius, spacing, useTheme } from '../theme';
import { authService } from '../services/api';
import { signInWithGoogle, GOOGLE_CANCELLED } from '../services/googleAuth';
import useAuthStore from '../store/authStore';
import { errorMessage } from '../utils/error';

const LoginScreen = () => {
    const theme = useTheme();
    const { colors } = theme;
    const styles = useMemo(() => createStyles(theme), [theme]);

    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState('');

    // Lets the keyboard's next/go key walk the form instead of making the user
    // dismiss it to reach the field below.
    const emailRef = useRef(null);
    const passwordRef = useRef(null);

    const login = useAuthStore((state) => state.login);

    const switchMode = () => {
        setIsLogin(!isLogin);
        setError('');
        // The password was typed for the other mode's rules, and carrying it
        // across is how a sign-up password ends up submitted as a sign-in.
        setPassword('');
    };

    const handleSubmit = async () => {
        const trimmedEmail = email.trim();

        if (!trimmedEmail || !password || (!isLogin && !name.trim())) {
            setError('Please fill in all fields.');
            return;
        }

        if (!isLogin && password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        setError('');
        setLoading(true);

        try {
            const res = isLogin
                ? await authService.login(trimmedEmail, password)
                : await authService.register(name.trim(), trimmedEmail, password);

            const { user, token } = res.data;
            login(user, token);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    // One button for both modes: Google either matches an existing account or
    // creates one, so asking the user to pick "sign in" or "sign up" first
    // would be asking a question neither they nor we need answered.
    const handleGoogle = async () => {
        setError('');
        setGoogleLoading(true);

        try {
            const idToken = await signInWithGoogle();
            const res = await authService.google(idToken);
            const { user, token } = res.data;
            login(user, token);
        } catch (err) {
            if (err?.code === GOOGLE_CANCELLED) {
                return;
            }
            setError(err?.userMessage || errorMessage(err));
        } finally {
            setGoogleLoading(false);
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
                        <BrandMark color={colors.onBrand} size={30} />
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
                            autoComplete="name"
                            textContentType="name"
                            returnKeyType="next"
                            onSubmitEditing={() => emailRef.current?.focus()}
                            blurOnSubmit={false}
                        />
                    ) : null}

                    <Input
                        inputRef={emailRef}
                        label="Email"
                        placeholder="juan@example.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        blurOnSubmit={false}
                    />

                    <Input
                        inputRef={passwordRef}
                        label="Password"
                        placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete={isLogin ? 'password' : 'password-new'}
                        textContentType={isLogin ? 'password' : 'newPassword'}
                        returnKeyType="go"
                        onSubmitEditing={handleSubmit}
                    />

                    {!isLogin ? <PasswordStrength password={password} /> : null}

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <Button
                        title={isLogin ? 'Log in' : 'Create account'}
                        onPress={handleSubmit}
                        loading={loading}
                        disabled={googleLoading}
                    />

                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    <Button
                        title="Continue with Google"
                        onPress={handleGoogle}
                        variant="secondary"
                        loading={googleLoading}
                        disabled={loading}
                        icon={<GoogleLogo size={18} />}
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

const createStyles = ({ colors, typography, shadows }) =>
    StyleSheet.create({
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
        fontFamily: 'SpaceGrotesk-Bold',
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
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: spacing.l,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    dividerText: {
        marginHorizontal: spacing.m,
        fontSize: 12,
        color: colors.textMuted,
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
