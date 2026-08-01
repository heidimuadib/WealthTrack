import React, { useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    TouchableOpacity,
    ActivityIndicator,
    PermissionsAndroid,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Camera, ImageIcon, Trash2 } from 'lucide-react-native';

import Input from '../components/Input';
import Button from '../components/Button';
import Card from '../components/Card';
import Avatar from '../components/Avatar';
import ActionSheet from '../components/ActionSheet';
import ScreenHeader from '../components/ScreenHeader';
import { useFeedback } from '../components/FeedbackProvider';
import { errorMessage } from '../utils/error';
import { radius, spacing, useTheme } from '../theme';
import { useLanguage } from '../i18n';
import useAuthStore from '../store/authStore';
import { authService } from '../services/api';

// The phone does the resizing, not the server: a 12 MP camera shot is four
// megabytes of detail nobody will see inside a 96px circle.
const PICKER_OPTIONS = {
    mediaType: 'photo',
    maxWidth: 720,
    maxHeight: 720,
    quality: 0.8,
    selectionLimit: 1,
    includeBase64: false,
};

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
    const [busyPhoto, setBusyPhoto] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);

    const { alert, confirm, notify } = useFeedback();

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

    const uploadAsset = async (asset) => {
        const form = new FormData();
        // React Native needs all three parts; without a name the field arrives
        // as a plain string and the server sees no file at all.
        form.append('avatar', {
            uri: asset.uri,
            type: asset.type || 'image/jpeg',
            name: asset.fileName || 'avatar.jpg',
        });

        setBusyPhoto(true);
        try {
            const response = await authService.uploadAvatar(form);
            await setUser(response.data.user);
            notify({ message: t('editProfile.photoUpdated') });
        } catch (err) {
            alert({ title: t('editProfile.photoFailed'), message: errorMessage(err) });
        } finally {
            setBusyPhoto(false);
        }
    };

    const handlePickerResult = (result) => {
        if (result.didCancel) {
            return;
        }

        if (result.errorCode) {
            alert({
                title: t('editProfile.photoFailed'),
                message: result.errorMessage || t('editProfile.pickerFailed'),
            });
            return;
        }

        const asset = result.assets?.[0];
        if (asset?.uri) {
            uploadAsset(asset);
        }
    };

    // The system photo picker needs no permission on modern Android; the
    // camera does, and only because the app declares it in the manifest.
    const chooseFromLibrary = async () => {
        setSheetOpen(false);
        handlePickerResult(await launchImageLibrary(PICKER_OPTIONS));
    };

    const takePhoto = async () => {
        setSheetOpen(false);

        if (Platform.OS === 'android') {
            const status = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CAMERA
            );
            if (status !== PermissionsAndroid.RESULTS.GRANTED) {
                alert({
                    title: t('editProfile.cameraBlockedTitle'),
                    message: t('editProfile.cameraBlockedMsg'),
                });
                return;
            }
        }

        handlePickerResult(await launchCamera({ ...PICKER_OPTIONS, saveToPhotos: false }));
    };

    const removePhoto = async () => {
        setSheetOpen(false);

        const confirmed = await confirm({
            title: t('editProfile.removePhotoTitle'),
            message: t('editProfile.removePhotoMsg'),
            confirmLabel: t('editProfile.removePhoto'),
            destructive: true,
        });

        if (!confirmed) {
            return;
        }

        setBusyPhoto(true);
        try {
            const response = await authService.removeAvatar();
            await setUser(response.data.user);
            notify({ message: t('editProfile.photoRemoved') });
        } catch (err) {
            alert({ title: t('editProfile.photoFailed'), message: errorMessage(err) });
        } finally {
            setBusyPhoto(false);
        }
    };

    const photoOptions = [
        {
            key: 'library',
            label: t('editProfile.chooseFromGallery'),
            icon: ImageIcon,
            onPress: chooseFromLibrary,
        },
        {
            key: 'camera',
            label: t('editProfile.takePhoto'),
            icon: Camera,
            onPress: takePhoto,
        },
    ];

    if (user?.avatarUrl) {
        photoOptions.push({
            key: 'remove',
            label: t('editProfile.removePhoto'),
            icon: Trash2,
            destructive: true,
            onPress: removePhoto,
        });
    }

    // The name shown under the photo follows the field, so a rename is visible
    // before it is saved; the photo itself comes from the stored user, which
    // only changes once the server has accepted it.
    const preview = { ...user, name: trimmed || user?.name };

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
                <View style={styles.avatarWrap}>
                    <TouchableOpacity
                        onPress={() => setSheetOpen(true)}
                        activeOpacity={0.8}
                        disabled={busyPhoto}
                        accessibilityRole="button"
                        accessibilityLabel={t('editProfile.changePhoto')}
                    >
                        <Avatar user={preview} size={96} />

                        {busyPhoto ? (
                            <View style={styles.avatarBusy}>
                                <ActivityIndicator color={colors.onBrand} />
                            </View>
                        ) : (
                            <View style={styles.avatarBadge}>
                                <Camera color={colors.onBrand} size={16} />
                            </View>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.changePhoto}>{t('editProfile.changePhoto')}</Text>
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

            <ActionSheet
                visible={sheetOpen}
                title={t('editProfile.photoSheetTitle')}
                options={photoOptions}
                cancelLabel={t('common.cancel')}
                onClose={() => setSheetOpen(false)}
            />
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
        avatarBadge: {
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 32,
            height: 32,
            borderRadius: radius.round,
            backgroundColor: colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
            // Separates the badge from a photo of any colour behind it.
            borderWidth: 3,
            borderColor: colors.canvas,
        },
        avatarBusy: {
            ...StyleSheet.absoluteFillObject,
            borderRadius: 48,
            backgroundColor: colors.scrim,
            alignItems: 'center',
            justifyContent: 'center',
        },
        changePhoto: {
            ...typography.caption,
            marginTop: spacing.m,
            fontWeight: '600',
            color: colors.brand,
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
