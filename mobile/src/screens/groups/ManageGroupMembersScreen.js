import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const ManageGroupMembersScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeMembers" navigation={navigation} />
);

export default ManageGroupMembersScreen;
