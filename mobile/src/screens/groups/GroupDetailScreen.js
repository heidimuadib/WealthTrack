import React from 'react';

import GroupRouteShell from './GroupRouteShell';

// Route params: { groupId }
//
// A shell for now. The screen that replaces it keeps this header and this
// title; only the body below the header changes.
const GroupDetailScreen = ({ navigation }) => (
    <GroupRouteShell titleKey="groups.routeDetail" navigation={navigation} />
);

export default GroupDetailScreen;
