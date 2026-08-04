import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import GroupForm, { MAX_GROUP_NAME, MAX_GROUP_DESCRIPTION } from '../../components/GroupForm';
import ScreenHeader from '../../components/ScreenHeader';
import { useFeedback } from '../../components/FeedbackProvider';
import { errorMessage } from '../../utils/error';
import haptics from '../../services/haptics';
import { useTheme } from '../../theme';
import { useLanguage } from '../../i18n';
import { useCreateGroup } from '../../hooks/useGroups';

// Route params: none

const CreateGroupScreen = ({ navigation }) => {
    const theme = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { t } = useLanguage();
    const { notify, alert } = useFeedback();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState(null);
    const [nameError, setNameError] = useState('');

    const createGroup = useCreateGroup();

    // A ref rather than isPending. Two taps landing in the same batch both read
    // the pending flag before React has re-rendered either of them, so the
    // second gets through and the user ends up with two identical groups. A ref
    // is written the moment the first tap is accepted.
    const submitting = useRef(false);

    const trimmed = name.trim();

    const handleSubmit = async () => {
        // Checked again here rather than only on the button: this is the last
        // point before a request leaves, and a disabled button is a hint, not
        // a guarantee.
        if (!trimmed) {
            setNameError(t('groups.nameRequired'));
            return;
        }
        if (submitting.current || createGroup.isPending) {
            return;
        }

        submitting.current = true;
        setNameError('');

        try {
            // The self-member is the server's to create, in the same
            // transaction as the group. Sending one from here would be the
            // client deciding who the account holder is.
            const group = await createGroup.mutateAsync({
                name: trimmed.slice(0, MAX_GROUP_NAME),
                description: description.trim().slice(0, MAX_GROUP_DESCRIPTION) || null,
                ...(color ? { color } : {}),
            });

            haptics.success();
            notify({ message: t('groups.created') });

            // replace, not navigate: going back from the member list should
            // return to the groups list, not to a create form for a group that
            // now exists.
            navigation.replace('ManageGroupMembers', { groupId: group.id });
        } catch (error) {
            haptics.error();
            alert({ title: t('groups.create'), message: errorMessage(error) });
            // Released only on failure. On success the screen is replaced, and
            // clearing it there would reopen the door for the moment before
            // the navigation lands.
            submitting.current = false;
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={t('groups.routeCreate')}
                onBack={() => navigation.goBack()}
            />

            <GroupForm
                name={name}
                onChangeName={(value) => {
                    setName(value);
                    if (nameError) {
                        setNameError('');
                    }
                }}
                description={description}
                onChangeDescription={setDescription}
                color={color}
                onChangeColor={setColor}
                nameError={nameError}
                submitLabel={t('groups.saveNew')}
                onSubmit={handleSubmit}
                submitting={createGroup.isPending}
                canSubmit={trimmed !== ''}
            />
        </View>
    );
};

const createStyles = ({ colors }) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.canvas,
        },
    });

export default CreateGroupScreen;
